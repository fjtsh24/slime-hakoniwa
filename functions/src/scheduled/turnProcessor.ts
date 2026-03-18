/**
 * ターン進行のメインロジック
 */
import { randomUUID } from 'crypto'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { Slime, SlimeStats, RacialValues, SlimeSpecies } from '../../../shared/types/slime'
import type { ActionReservation } from '../../../shared/types/action'
import type { Food } from '../../../shared/types/food'
import type { Tile } from '../../../shared/types/map'
import type { TurnLog, TurnEventType } from '../../../shared/types/turnLog'
import { slimeSpecies } from '../../../shared/data/slimeSpecies'

// ----------------------------------------------------------------
// 型定義
// ----------------------------------------------------------------

export interface SlimeUpdate {
  stats: SlimeStats
  racialValues: RacialValues
  tileX: number
  tileY: number
  speciesId: string
}

export interface ActionResult {
  updatedSlime: Slime
  events: Array<{ eventType: TurnEventType; eventData: Record<string, unknown> }>
}

export interface TurnResult {
  updatedSlime: Slime
  updatedReservations: ActionReservation[]
  events: Array<{ eventType: TurnEventType; eventData: Record<string, unknown> }>
}

export interface EvolutionResult {
  evolved: boolean
  updatedSlime: Slime
}

// ----------------------------------------------------------------
// 内部ヘルパー
// ----------------------------------------------------------------

// Netlify Functions から import された場合など、Admin SDK が未初期化の場合に備えて初期化する。
// Firebase Cloud Functions 環境では既に初期化済みのため、このガードは何もしない。
if (admin.apps.length === 0) {
  admin.initializeApp()
}

const db = () => admin.firestore()

/**
 * Firestore Timestamp を取得する。
 * テストモック環境では admin.firestore.Timestamp が存在しない場合があるため、
 * フォールバックとして Date オブジェクトをそのまま使う。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getTimestamp = (): any => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ts = (admin.firestore as any).Timestamp
  if (ts) return ts
  // フォールバック: Date を Timestamp-like オブジェクトに変換するシム
  return {
    now: () => {
      const d = new Date()
      return { toDate: () => d, seconds: Math.floor(d.getTime() / 1000) }
    },
    fromDate: (d: Date) => ({ toDate: () => d, seconds: Math.floor(d.getTime() / 1000) }),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// ----------------------------------------------------------------
// processDueTurns
// ----------------------------------------------------------------

/**
 * nextTurnAt <= now() のワールドを全て取得してターン処理を実行する
 */
export async function processDueTurns(): Promise<void> {
  const Timestamp = getTimestamp()
  const now = Timestamp.now()
  const worldsSnap = await db()
    .collection('worlds')
    .where('nextTurnAt', '<=', now)
    .get()

  if (worldsSnap.empty) return

  await Promise.all(worldsSnap.docs.map((doc) => processWorldTurn(doc.id)))
}

// ----------------------------------------------------------------
// processWorldTurn
// ----------------------------------------------------------------

/**
 * 指定ワールドのターンを1つ進める
 */
export async function processWorldTurn(worldId: string): Promise<void> {
  let newTurn = 0
  let turnIntervalSec = 300
  let shouldProcess = false

  // トランザクションで world ドキュメントを更新
  await db().runTransaction(async (transaction) => {
    const worldRef = db().collection('worlds').doc(worldId)
    const worldSnap = await transaction.get(worldRef)

    if (!worldSnap.exists) {
      throw new Error(`World not found: ${worldId}`)
    }

    const worldData = worldSnap.data()!

    // 二重処理防止: 既に処理中なら早期リターン
    if (worldData['status'] === 'processing') {
      return
    }

    const nextTurnAt: Date =
      worldData['nextTurnAt'] && typeof worldData['nextTurnAt'].toDate === 'function'
        ? worldData['nextTurnAt'].toDate()
        : new Date(worldData['nextTurnAt'])

    const now = new Date()
    if (nextTurnAt > now) {
      // 二重処理防止: まだターンの時間ではない
      return
    }

    const currentTurn: number = worldData['currentTurn'] ?? 0
    newTurn = currentTurn + 1
    turnIntervalSec = worldData['turnIntervalSec'] ?? 300

    const nextTurnAtMs = Date.now() + turnIntervalSec * 1000
    const nextTurnAtDate = new Date(nextTurnAtMs)
    const Timestamp = getTimestamp()
    const nextTurnAtTimestamp = Timestamp.fromDate(nextTurnAtDate)

    transaction.update(worldRef, {
      currentTurn: newTurn,
      nextTurnAt: nextTurnAtTimestamp,
      status: 'processing',
    })

    shouldProcess = true
  })

  // processing にならなかった場合（二重処理や時間未到達）はスキップ
  if (!shouldProcess) return

  // スライム処理完了後に status を 'idle' に戻す（try/finally で確実に実行）
  try {
    // スライムを取得（まずスライムの有無を確認）
    const slimesSnap = await db().collection('slimes').where('worldId', '==', worldId).get()

    // docs が存在しない場合や empty の場合はリターン
    const slimeDocs = Array.isArray(slimesSnap?.docs) ? slimesSnap.docs : []
    if (slimeDocs.length === 0) return

    // 予約と食料を並列取得
    const [reservationsSnap, foodsSnap] = await Promise.all([
      db()
        .collection('actionReservations')
        .where('worldId', '==', worldId)
        .where('turnNumber', '==', newTurn)
        .where('status', '==', 'pending')
        .get(),
      db().collection('foods').get(),
    ])

    const foods: Food[] = Array.isArray(foodsSnap?.docs)
      ? foodsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Food))
      : []

    // 予約をスライムID別にグループ化
    const reservationsBySlime = new Map<string, ActionReservation[]>()
    if (Array.isArray(reservationsSnap?.docs)) {
      for (const doc of reservationsSnap.docs) {
        const reservation = { id: doc.id, ...doc.data() } as ActionReservation
        const existing = reservationsBySlime.get(reservation.slimeId) ?? []
        existing.push(reservation)
        reservationsBySlime.set(reservation.slimeId, existing)
      }
    }

    const BATCH_SIZE = 500
    let batch = db().batch()
    let batchCount = 0
    const turnLogs: Array<{ log: TurnLog }> = []

    for (const slimeDoc of slimeDocs) {
      const slime = { id: slimeDoc.id, ...slimeDoc.data() } as Slime
      const reservations = reservationsBySlime.get(slime.id) ?? []

      const result = await processSlimeTurn(slime, reservations, newTurn, batch, foods)

      // スライム更新
      const slimeRef = db().collection('slimes').doc(slime.id)
      batch.update(slimeRef, {
        stats: result.updatedSlime.stats,
        racialValues: result.updatedSlime.racialValues,
        tileX: result.updatedSlime.tileX,
        tileY: result.updatedSlime.tileY,
        speciesId: result.updatedSlime.speciesId,
        updatedAt: admin.firestore.Timestamp.now(),
      })
      batchCount++

      // 予約ステータス更新
      for (const updatedReservation of result.updatedReservations) {
        const reservationRef = db().collection('actionReservations').doc(updatedReservation.id)
        batch.update(reservationRef, {
          status: updatedReservation.status,
          executedAt: updatedReservation.executedAt
            ? admin.firestore.Timestamp.fromDate(updatedReservation.executedAt)
            : null,
        })
        batchCount++
      }

      // ターンログを収集
      for (const event of result.events) {
        const slimeId = slime.id
        const logId = `${worldId}_${newTurn}_${slimeId}_${randomUUID().slice(0, 8)}`
        turnLogs.push({
          log: {
            id: logId,
            worldId,
            slimeId,
            turnNumber: newTurn,
            eventType: event.eventType,
            eventData: event.eventData,
            processedAt: new Date(),
          },
        })
      }

      // 500件ごとにコミット
      if (batchCount >= BATCH_SIZE) {
        await batch.commit()
        batch = db().batch()
        batchCount = 0
      }
    }

    // 残りのバッチをコミット
    if (batchCount > 0) {
      await batch.commit()
    }

    // ターンログを別バッチで書き込む
    if (turnLogs.length > 0) {
      let logBatch = db().batch()
      let logBatchCount = 0

      for (const { log } of turnLogs) {
        const logRef = db().collection('turnLogs').doc(log.id)
        logBatch.set(logRef, {
          ...log,
          processedAt: admin.firestore.Timestamp.fromDate(log.processedAt),
        })
        logBatchCount++

        if (logBatchCount >= BATCH_SIZE) {
          await logBatch.commit()
          logBatch = db().batch()
          logBatchCount = 0
        }
      }

      if (logBatchCount > 0) {
        await logBatch.commit()
      }
    }
  } finally {
    // 処理完了後（エラー時も含む）に status を 'idle' に戻す
    try {
      const worldRef = db().collection('worlds').doc(worldId)
      await worldRef.update({ status: 'idle' })
    } catch {
      // status リセット失敗は無視（次回の処理で上書きされる）
    }
  }
}

// ----------------------------------------------------------------
// processSlimeTurn
// ----------------------------------------------------------------

/**
 * 1スライムの1ターン処理
 */
export async function processSlimeTurn(
  slime: Slime,
  reservations: ActionReservation[],
  currentTurn: number,
  _batch?: FirebaseFirestore.WriteBatch,
  foods?: Food[]
): Promise<TurnResult> {
  void _batch
  void currentTurn

  // 使用する食料リスト（引数がなければFirestoreから取得）
  let foodList: Food[] = foods ?? []
  if (!foods) {
    try {
      const foodsSnap = await db().collection('foods').get()
      foodList = foodsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Food))
    } catch {
      foodList = []
    }
  }

  const events: TurnResult['events'] = []
  const updatedReservations: ActionReservation[] = []
  let currentSlime: Slime = { ...slime, stats: { ...slime.stats }, racialValues: { ...slime.racialValues } }

  // 予約アクションの実行
  const pendingReservations = reservations.filter((r) => r.status === 'pending')

  if (pendingReservations.length > 0) {
    // 最初の予約を実行
    const reservation = pendingReservations[0]
    const actionResult = await executeReservedAction(currentSlime, reservation, foodList, [])
    currentSlime = actionResult.updatedSlime
    events.push(...actionResult.events)

    // 予約ステータスを executed に更新
    const executedReservation: ActionReservation = {
      ...reservation,
      status: 'executed',
      executedAt: new Date(),
    }
    updatedReservations.push(executedReservation)

    // 残りの予約はそのまま
    for (const r of pendingReservations.slice(1)) {
      updatedReservations.push(r)
    }
  } else {
    // 自律行動
    const autonomousResult = await executeAutonomousAction(currentSlime)
    currentSlime = autonomousResult.updatedSlime
    events.push(...autonomousResult.events)
  }

  // hunger を -5 (下限0)
  const newHunger = Math.max(0, currentSlime.stats.hunger - 5)
  currentSlime = {
    ...currentSlime,
    stats: {
      ...currentSlime.stats,
      hunger: newHunger,
    },
  }
  events.push({ eventType: 'hunger_decrease', eventData: { before: slime.stats.hunger, after: newHunger } })

  // 進化チェック（Firestoreからspeciesデータを取得して確認）
  try {
    const speciesSnap = await db().collection('slimeSpecies').doc(currentSlime.speciesId).get()
    if (speciesSnap.exists) {
      const speciesData = { id: speciesSnap.id, ...speciesSnap.data() } as SlimeSpecies
      const evolutionResult = checkEvolution(currentSlime, speciesData)
      if (evolutionResult.evolved) {
        currentSlime = evolutionResult.updatedSlime
        events.push({ eventType: 'evolve', eventData: { newSpeciesId: currentSlime.speciesId } })
      }
    }
  } catch {
    // 進化チェック失敗は無視（Firestoreモック環境など）
  }

  return {
    updatedSlime: currentSlime,
    updatedReservations,
    events,
  }
}

// ----------------------------------------------------------------
// executeReservedAction
// ----------------------------------------------------------------

/**
 * 予約された行動を実行する
 */
export async function executeReservedAction(
  slime: Slime,
  reservation: ActionReservation,
  foods?: Food[],
  _tiles?: Tile[]
): Promise<ActionResult> {
  const updatedSlime: Slime = {
    ...slime,
    stats: { ...slime.stats },
    racialValues: { ...slime.racialValues },
  }
  const events: ActionResult['events'] = []

  switch (reservation.actionType) {
    case 'eat': {
      const eatData = reservation.actionData as { foodId?: string }
      const foodId = eatData.foodId

      if (!foodId) break

      // 食料リストから検索
      let food: Food | undefined
      if (foods && foods.length > 0) {
        food = foods.find((f) => f.id === foodId)
      }

      // Firestoreから取得（引数がない場合）
      if (!food) {
        try {
          const foodDoc = await db().collection('foods').doc(foodId).get()
          if (foodDoc.exists) {
            food = { id: foodDoc.id, ...foodDoc.data() } as Food
          }
        } catch {
          // フォールバック: 食料が見つからない
        }
      }

      if (!food) break

      // statDeltas を適用
      const statDeltas = food.statDeltas
      if (statDeltas.hp !== undefined) updatedSlime.stats.hp = Math.max(0, updatedSlime.stats.hp + statDeltas.hp)
      if (statDeltas.atk !== undefined) updatedSlime.stats.atk = Math.max(0, updatedSlime.stats.atk + statDeltas.atk)
      if (statDeltas.def !== undefined) updatedSlime.stats.def = Math.max(0, updatedSlime.stats.def + statDeltas.def)
      if (statDeltas.spd !== undefined) updatedSlime.stats.spd = Math.max(0, updatedSlime.stats.spd + statDeltas.spd)
      if (statDeltas.exp !== undefined) updatedSlime.stats.exp = Math.max(0, updatedSlime.stats.exp + statDeltas.exp)

      // hunger +30 (上限100)
      updatedSlime.stats.hunger = clamp(updatedSlime.stats.hunger + 30, 0, 100)

      // racialDeltas を適用
      const racialDeltas = food.racialDeltas
      if (racialDeltas.fire !== undefined) updatedSlime.racialValues.fire = Math.max(0, updatedSlime.racialValues.fire + racialDeltas.fire)
      if (racialDeltas.water !== undefined) updatedSlime.racialValues.water = Math.max(0, updatedSlime.racialValues.water + racialDeltas.water)
      if (racialDeltas.earth !== undefined) updatedSlime.racialValues.earth = Math.max(0, updatedSlime.racialValues.earth + racialDeltas.earth)
      if (racialDeltas.wind !== undefined) updatedSlime.racialValues.wind = Math.max(0, updatedSlime.racialValues.wind + racialDeltas.wind)
      if (racialDeltas.slime !== undefined) updatedSlime.racialValues.slime = Math.max(0, updatedSlime.racialValues.slime + racialDeltas.slime)
      if (racialDeltas.plant !== undefined) updatedSlime.racialValues.plant = Math.max(0, updatedSlime.racialValues.plant + racialDeltas.plant)
      if (racialDeltas.human !== undefined) updatedSlime.racialValues.human = Math.max(0, updatedSlime.racialValues.human + racialDeltas.human)
      if (racialDeltas.beast !== undefined) updatedSlime.racialValues.beast = Math.max(0, updatedSlime.racialValues.beast + racialDeltas.beast)
      if (racialDeltas.spirit !== undefined) updatedSlime.racialValues.spirit = Math.max(0, updatedSlime.racialValues.spirit + racialDeltas.spirit)
      if (racialDeltas.fish !== undefined) updatedSlime.racialValues.fish = Math.max(0, updatedSlime.racialValues.fish + racialDeltas.fish)

      // スキル付与チェック
      if (food.skillGrantId && food.skillGrantProb > 0 && Math.random() < food.skillGrantProb) {
        try {
          const skillDocRef = db()
            .collection('slimes')
            .doc(slime.id)
            .collection('skills')
            .doc(food.skillGrantId)
          const batch = db().batch()
          batch.set(skillDocRef, {
            id: food.skillGrantId,
            slimeId: slime.id,
            skillDefinitionId: food.skillGrantId,
            acquiredAt: FieldValue.serverTimestamp(),
          })
          await batch.commit()
        } catch (skillError) {
          // スキル付与失敗は無視（ログ記録のみ）
          console.warn(`[turnProcessor] スキル付与失敗: slimeId=${slime.id}, skillId=${food.skillGrantId}`, skillError)
        }
        events.push({ eventType: 'skill_grant', eventData: { skillId: food.skillGrantId, foodId } })
      }

      events.push({ eventType: 'eat', eventData: { foodId, food: food.name } })
      break
    }

    case 'move': {
      const moveData = reservation.actionData as { targetX?: number; targetY?: number }
      const targetX = moveData.targetX
      const targetY = moveData.targetY

      if (targetX === undefined || targetY === undefined) break

      updatedSlime.tileX = targetX
      updatedSlime.tileY = targetY

      // タイル属性を反映
      let tile: Tile | undefined
      if (_tiles && _tiles.length > 0) {
        tile = _tiles.find((t) => t.x === targetX && t.y === targetY)
      }

      if (!tile) {
        // Firestoreから取得を試みる
        try {
          const tilesSnap = await db()
            .collection('tiles')
            .where('x', '==', targetX)
            .where('y', '==', targetY)
            .get()
          if (!tilesSnap.empty) {
            tile = { id: tilesSnap.docs[0].id, ...tilesSnap.docs[0].data() } as Tile
          }
        } catch {
          // タイルが見つからない
        }
      }

      if (tile) {
        updatedSlime.racialValues.fire = Math.max(0, updatedSlime.racialValues.fire + tile.attributes.fire * 0.1)
        updatedSlime.racialValues.water = Math.max(0, updatedSlime.racialValues.water + tile.attributes.water * 0.1)
        updatedSlime.racialValues.earth = Math.max(0, updatedSlime.racialValues.earth + tile.attributes.earth * 0.1)
        updatedSlime.racialValues.wind = Math.max(0, updatedSlime.racialValues.wind + tile.attributes.wind * 0.1)
      }

      events.push({ eventType: 'move', eventData: { targetX, targetY } })
      break
    }

    case 'rest': {
      const maxHp = updatedSlime.stats.atk + updatedSlime.stats.def + 50
      const healAmount = Math.floor(maxHp * 0.2)
      updatedSlime.stats.hp = Math.min(updatedSlime.stats.hp + healAmount, maxHp)

      // 休息すると少し食欲が出る
      updatedSlime.stats.hunger = clamp(updatedSlime.stats.hunger + 10, 0, 100)

      events.push({ eventType: 'rest', eventData: { healAmount } })
      break
    }

    default:
      break
  }

  return { updatedSlime, events }
}

// ----------------------------------------------------------------
// executeAutonomousAction
// ----------------------------------------------------------------

/**
 * 自律行動を実行する
 */
export async function executeAutonomousAction(slime: Slime): Promise<ActionResult> {
  const updatedSlime: Slime = {
    ...slime,
    stats: { ...slime.stats },
    racialValues: { ...slime.racialValues },
  }
  const events: ActionResult['events'] = []

  if (slime.stats.hunger >= 50) {
    // hunger >= 50: 自律的に近くを歩き回る（HP変化なし）
  } else if (slime.stats.hunger >= 20) {
    // hunger < 50 かつ hunger >= 20: 自律的に休息してHP微回復（maxHP × 5%）
    const maxHp = updatedSlime.stats.atk + updatedSlime.stats.def + 50
    const healAmount = Math.floor(maxHp * 0.05)
    updatedSlime.stats.hp = Math.min(updatedSlime.stats.hp + healAmount, maxHp)
  }
  // hunger < 20: 弱っていて動けない（HP回復なし）

  events.push({ eventType: 'autonomous', eventData: { hunger: slime.stats.hunger } })

  return { updatedSlime, events }
}

// ----------------------------------------------------------------
// checkEvolution
// ----------------------------------------------------------------

/**
 * 進化条件を確認する
 * @param slime 対象スライム
 * @param speciesData スライムの種族データ（単一のSlimeSpecies）
 * @returns { evolved: boolean, updatedSlime: Slime }
 */
export function checkEvolution(slime: Slime, speciesData: SlimeSpecies): EvolutionResult {
  const updatedSlime: Slime = {
    ...slime,
    stats: { ...slime.stats },
    racialValues: { ...slime.racialValues },
  }

  for (const condition of speciesData.evolutionConditions) {
    let meetsStats = true
    let meetsRacialValues = true

    // requiredStats チェック
    for (const [key, required] of Object.entries(condition.requiredStats)) {
      const actual = slime.stats[key as keyof typeof slime.stats]
      if (actual === undefined || actual < (required as number)) {
        meetsStats = false
        break
      }
    }

    if (!meetsStats) continue

    // requiredRacialValues チェック
    for (const [key, required] of Object.entries(condition.requiredRacialValues)) {
      const actual = slime.racialValues[key as keyof typeof slime.racialValues]
      if (actual === undefined || actual < (required as number)) {
        meetsRacialValues = false
        break
      }
    }

    if (!meetsRacialValues) continue

    // 全条件を満たした
    updatedSlime.speciesId = condition.targetSpeciesId
    return { evolved: true, updatedSlime }
  }

  return { evolved: false, updatedSlime }
}

// ----------------------------------------------------------------
// createInitialSlime
// ----------------------------------------------------------------

export interface CreateInitialSlimeRequest {
  /** スライムオーナーのUID */
  ownerUid: string
  /** オーナーのマップID（users/{uid}.mapId から取得済みの値） */
  mapId: string
  /** 所属ワールドID */
  worldId: string
}

/**
 * 初期スライムを生成してFirestoreに書き込む。
 * 既にスライムが存在する場合は null を返す（冪等性）。
 *
 * @returns 生成したSlimeオブジェクト、または既存スライムがある場合は null
 */
export async function createInitialSlime(
  request: CreateInitialSlimeRequest
): Promise<Slime | null> {
  const { ownerUid, mapId, worldId } = request

  // slime-001 のベーススタッツを取得
  const initialSpecies = slimeSpecies.find((s) => s.id === 'slime-001')
  if (!initialSpecies) {
    throw new Error('slime-001 の種族データが見つかりません')
  }

  const userRef = db().collection('users').doc(ownerUid)
  const slimeRef = db().collection('slimes').doc()
  const slimeId = slimeRef.id
  const now = FieldValue.serverTimestamp()

  const racialValues: RacialValues = {
    fire: 0,
    water: 0,
    earth: 0,
    wind: 0,
    slime: 0,
    plant: 0,
    human: 0,
    beast: 0,
    spirit: 0,
    fish: 0,
  }

  const stats: SlimeStats = { ...initialSpecies.baseStats }

  const slimeData = {
    id: slimeId,
    ownerUid,
    mapId,
    worldId,
    speciesId: 'slime-001',
    name: 'はじめてのスライム',
    tileX: 0,
    tileY: 0,
    isWild: false,
    stats,
    racialValues,
    createdAt: now,
    updatedAt: now,
  }

  // TOCTTOU 対策: users/{uid}.hasSlime フラグを使ったアトミックな存在確認と作成
  const created = await db().runTransaction(async (tx) => {
    const userDoc = await tx.get(userRef)
    if (userDoc.exists && (userDoc.data() as Record<string, unknown>)['hasSlime'] === true) {
      return false
    }
    tx.set(slimeRef, slimeData)
    tx.set(userRef, { hasSlime: true }, { merge: true })
    return true
  })

  if (!created) {
    return null
  }

  return {
    id: slimeId,
    ownerUid,
    mapId,
    worldId,
    speciesId: 'slime-001',
    name: 'はじめてのスライム',
    tileX: 0,
    tileY: 0,
    isWild: false,
    stats,
    racialValues,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}
