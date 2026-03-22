/**
 * ターン進行のメインロジック
 */
import { randomUUID } from 'crypto'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { Slime, SlimeStats, RacialValues, SlimeSpecies, InventorySlot } from '../../../shared/types/slime'
import type { ActionReservation } from '../../../shared/types/action'
import type { World } from '../../../shared/types/world'
import type { Food } from '../../../shared/types/food'
import type { Tile, TileAttributes } from '../../../shared/types/map'
import type { TurnLog, TurnEventType } from '../../../shared/types/turnLog'
import { slimeSpecies } from '../../../shared/data/slimeSpecies'
import { foods as staticFoods } from '../../../shared/data/foods'
import { dropTables } from '../../../shared/data/dropTable'
import { wildMonsters } from '../../../shared/data/wildMonsters'
import { skillDefinitions } from '../../../shared/data/skillDefinitions'
import type { DropEntry } from '../../../shared/types/dropTable'
import type { SkillDefinition } from '../../../shared/types/skill'
import { INVENTORY_MAX_SLOTS, RACIAL_VALUE_MAX } from '../../../shared/constants/game'
import { logger } from '../../../shared/lib/logger'

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
  /** battle 敗北で HP=0 になったとき 2 を返す。processSlimeTurn が incapacitatedUntilTurn を設定する。 */
  incapacitatedTurns?: number
  /** 融合（merge）で削除すべきスライムID一覧 */
  slimesToDelete?: string[]
}

export interface TurnResult {
  updatedSlime: Slime
  updatedReservations: ActionReservation[]
  events: Array<{ eventType: TurnEventType; eventData: Record<string, unknown> }>
  /** 分裂時に生成する新スライム一覧 */
  newSlimesToCreate?: Slime[]
  /** 融合時に削除するスライムID一覧 */
  slimesToDelete?: string[]
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

/**
 * スライムの習得済みスキル定義リストを返す。
 * `slime.skillIds` が未定義の場合は空配列を返す。
 */
function getSlimeSkills(slime: Slime): SkillDefinition[] {
  const ids = slime.skillIds ?? []
  return ids
    .map((id) => skillDefinitions.find((s) => s.id === id))
    .filter((s): s is SkillDefinition => s !== undefined)
}

/**
 * スライムの action_bonus スキルを targetAction でフィルタして返す。
 */
function getActionBonusSkills(slime: Slime, targetAction: string): SkillDefinition[] {
  return getSlimeSkills(slime).filter(
    (s) =>
      s.effectType === 'action_bonus' &&
      (s.effectData as Record<string, unknown>)['targetAction'] === targetAction
  )
}

// ----------------------------------------------------------------
// processDueTurns
// ----------------------------------------------------------------

/**
 * nextTurnAt <= now() のワールドを全て取得してターン処理を実行する
 * （Firestoreへの直接アクセスが必要なため統合テスト対象、単体テストから除外）
 */
/* istanbul ignore next */
export async function processDueTurns(): Promise<void> {
  const Timestamp = getTimestamp()
  const now = Timestamp.now()
  const worldsSnap = await db()
    .collection('worlds')
    .where('nextTurnAt', '<=', now)
    .get()

  logger.debug('[processDueTurns] 処理対象ワールド確認', {
    timestamp: now.toDate ? now.toDate().toISOString() : new Date().toISOString(),
    worldCount: worldsSnap.docs.length,
    worldIds: worldsSnap.docs.map((d) => d.id),
  })

  if (worldsSnap.empty) return

  await Promise.all(worldsSnap.docs.map((doc) => processWorldTurn(doc.id)))
}

// ----------------------------------------------------------------
// processWorldTurn
// ----------------------------------------------------------------

/**
 * 指定ワールドのターンを1つ進める
 * （Firestoreへの直接アクセスが必要なため統合テスト対象、単体テストから除外）
 */
/* istanbul ignore next */
export async function processWorldTurn(worldId: string): Promise<void> {
  const startMs = Date.now()
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

  logger.info('[turnProcessor] ターン開始', { worldId, turn: newTurn })

  // スライム処理完了後に status を 'idle' に戻す（try/finally で確実に実行）
  try {
    // スライムを取得（まずスライムの有無を確認）
    const slimesSnap = await db().collection('slimes').where('worldId', '==', worldId).get()

    // docs が存在しない場合や empty の場合はリターン
    const slimeDocs = Array.isArray(slimesSnap?.docs) ? slimesSnap.docs : []
    if (slimeDocs.length === 0) return

    // 予約を取得
    logger.debug('[processWorldTurn] スライム取得完了', { worldId, turn: newTurn, slimeCount: slimeDocs.length })
    // 食料マスタは静的ファイル（shared/data/foods.ts）を唯一の参照元とする。
    // Firestore の foods コレクションは使用しない（設計方針: マスタデータは静的バンドル）。
    // 将来イベント食料が必要になった場合は Phase 5-6 で staticFoods ∪ firestoreEventFoods に移行する。
    const reservationsSnap = await db()
      .collection('actionReservations')
      .where('worldId', '==', worldId)
      .where('turnNumber', '==', newTurn)
      .where('status', '==', 'pending')
      .get()

    const foods: Food[] = staticFoods

    logger.debug('[processWorldTurn] 予約取得完了', {
      worldId,
      turn: newTurn,
      reservationCount: Array.isArray(reservationsSnap?.docs) ? reservationsSnap.docs.length : 0,
    })

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

    // gather/fish 予約を持つスライムのタイルをバルク取得（N+1 解消）
    const mapIdToCoords = new Map<string, Set<string>>()
    for (const slimeDoc of slimeDocs) {
      const slime = { id: slimeDoc.id, ...slimeDoc.data() } as Slime
      const slimeReservations = reservationsBySlime.get(slime.id) ?? []
      const needsTile = slimeReservations.some(
        (r) => r.status === 'pending' && (r.actionType === 'gather' || r.actionType === 'fish')
      )
      if (needsTile) {
        const coords = mapIdToCoords.get(slime.mapId) ?? new Set<string>()
        coords.add(`${slime.tileX},${slime.tileY}`)
        mapIdToCoords.set(slime.mapId, coords)
      }
    }

    const worldTiles: Tile[] = []
    for (const [mapId, coordSet] of mapIdToCoords.entries()) {
      try {
        const tilesSnap = await db().collection('tiles').where('mapId', '==', mapId).get()
        const filtered = tilesSnap.docs
          .map((d) => ({ id: d.id, ...d.data() } as Tile))
          .filter((t) => coordSet.has(`${t.x},${t.y}`))
        worldTiles.push(...filtered)
      } catch {
        // タイル取得失敗は無視（gather/fish は tile なし扱いになる）
      }
    }

    logger.debug('[processWorldTurn] タイルプリフェッチ完了', {
      worldId,
      turn: newTurn,
      tilesLoaded: worldTiles.length,
      mapCount: mapIdToCoords.size,
    })

    // ===== ワールドイベント（天候・季節）遷移チェック =====
    const worldDocForEvent = await db().collection('worlds').doc(worldId).get()
    const worldDataForEvent = { id: worldId, ...worldDocForEvent.data() } as World
    const eventBatch = db().batch()
    checkWeatherTransition(worldDataForEvent, newTurn, eventBatch)
    checkSeasonTransition(worldDataForEvent, newTurn, eventBatch)
    try {
      await eventBatch.commit()
    } catch (e) {
      logger.warn('[turnProcessor] ワールドイベント更新失敗', { worldId, error: String(e) })
    }
    // 最新のworld状態を再取得
    const latestWorldSnap = await db().collection('worlds').doc(worldId).get()
    const latestWorldData = { id: worldId, ...latestWorldSnap.data() } as World
    const currentWeather = latestWorldData.weather ?? 'sunny'
    const currentSeason = latestWorldData.season ?? 'spring'
    // ===== ワールドイベント終了 =====

    const BATCH_SIZE = 500
    let batch = db().batch()
    let batchCount = 0
    const turnLogs: Array<{ log: TurnLog }> = []
    const allNewSlimes: Slime[] = []
    const allSlimesToDelete: string[] = []

    for (const slimeDoc of slimeDocs) {
      const slime = { id: slimeDoc.id, ...slimeDoc.data() } as Slime
      const reservations = reservationsBySlime.get(slime.id) ?? []
      const reservation = reservations.find((r) => r.status === 'pending')

      logger.debug('[turnProcessor] スライム処理', {
        worldId,
        turn: newTurn,
        slimeId: slime.id,
        slimeName: slime.name,
        actionType: reservation?.actionType ?? 'autonomous',
        hunger: slime.stats.hunger,
        hp: slime.stats.hp,
      })

      let result: Awaited<ReturnType<typeof processSlimeTurn>>
      try {
        result = await processSlimeTurn(slime, reservations, newTurn, batch, foods, worldTiles, {
          weather: currentWeather,
          season: currentSeason,
        })
      } catch (slimeError) {
        logger.error('[turnProcessor] スライム処理エラー', {
          worldId,
          turn: newTurn,
          slimeId: slime.id,
          slimeName: slime.name,
          actionType: reservation?.actionType,
          error: slimeError instanceof Error ? slimeError.message : String(slimeError),
          stack: slimeError instanceof Error ? slimeError.stack : undefined,
        })
        continue
      }

      const errorEvents = result.events.filter((e) =>
        e.eventType.endsWith('_fail') || e.eventType === 'inventory_not_found'
      )
      if (errorEvents.length > 0) {
        logger.warn('[turnProcessor] アクション失敗イベント', {
          worldId,
          turn: newTurn,
          slimeId: slime.id,
          slimeName: slime.name,
          events: errorEvents.map((e) => ({ type: e.eventType, data: e.eventData })),
        })
      }

      // スライム更新（inventory フィールドも含めて書き込む）
      const slimeRef = db().collection('slimes').doc(slime.id)
      const slimeUpdate: Record<string, unknown> = {
        stats: result.updatedSlime.stats,
        racialValues: result.updatedSlime.racialValues,
        tileX: result.updatedSlime.tileX,
        tileY: result.updatedSlime.tileY,
        speciesId: result.updatedSlime.speciesId,
        updatedAt: admin.firestore.Timestamp.now(),
      }
      if (result.updatedSlime.inventory !== undefined) {
        slimeUpdate['inventory'] = result.updatedSlime.inventory
      }
      if (result.updatedSlime.incapacitatedUntilTurn !== undefined) {
        slimeUpdate['incapacitatedUntilTurn'] = result.updatedSlime.incapacitatedUntilTurn
      }
      batch.update(slimeRef, slimeUpdate)
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

      // 分裂・融合データを収集
      if (result.newSlimesToCreate) allNewSlimes.push(...result.newSlimesToCreate)
      if (result.slimesToDelete) allSlimesToDelete.push(...result.slimesToDelete)

      // ターンログを収集
      for (const event of result.events) {
        const slimeId = slime.id
        const logId = `${worldId}_${newTurn}_${slimeId}_${randomUUID().slice(0, 8)}`
        turnLogs.push({
          log: {
            id: logId,
            worldId,
            slimeId,
            actorType: 'slime' as const,
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

    // 分裂・融合の後処理（メインバッチ後に実行）
    for (const newSlime of allNewSlimes) {
      try {
        const newSlimeRef = db().collection('slimes').doc(newSlime.id)
        const Timestamp = getTimestamp()
        await newSlimeRef.set({
          ...newSlime,
          createdAt: Timestamp.fromDate(newSlime.createdAt),
          updatedAt: Timestamp.fromDate(newSlime.updatedAt),
        })
        logger.info('[turnProcessor] 分裂スライム生成', { worldId, newSlimeId: newSlime.id })
      } catch (e) {
        logger.error('[turnProcessor] 分裂スライム生成失敗', { worldId, error: String(e) })
      }
    }
    for (const deleteId of allSlimesToDelete) {
      try {
        await db().collection('slimes').doc(deleteId).delete()
        logger.info('[turnProcessor] 融合スライム削除', { worldId, deletedSlimeId: deleteId })
      } catch (e) {
        logger.error('[turnProcessor] 融合スライム削除失敗', { worldId, error: String(e) })
      }
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
    logger.info('[turnProcessor] ターン完了', {
      worldId,
      turn: newTurn,
      slimeCount: slimeDocs.length,
      durationMs: Date.now() - startMs,
    })
  } catch (turnError) {
    logger.error('[turnProcessor] ターン処理エラー', {
      worldId,
      turn: newTurn,
      durationMs: Date.now() - startMs,
      error: turnError instanceof Error ? turnError.message : String(turnError),
      stack: turnError instanceof Error ? turnError.stack : undefined,
    })
    throw turnError
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
  foods?: Food[],
  tiles?: Tile[],
  worldContext?: { weather?: string; season?: string }
): Promise<TurnResult> {
  void _batch

  // 食料マスタは静的ファイルを SoT とする（Firestore は使用しない）
  const foodList: Food[] = foods ?? staticFoods
  const tileList: Tile[] = tiles ?? []

  const events: TurnResult['events'] = []
  const updatedReservations: ActionReservation[] = []
  const newSlimesToCreate: Slime[] = []
  const slimesToDelete: string[] = []
  let currentSlime: Slime = {
    ...slime,
    stats: { ...slime.stats },
    racialValues: { ...slime.racialValues },
    inventory: slime.inventory ? slime.inventory.map((s) => ({ ...s })) : undefined,
  }

  // 戦闘不能チェック: incapacitatedUntilTurn が現在ターン以上なら行動不能
  const isIncapacitated =
    slime.incapacitatedUntilTurn !== undefined && currentTurn <= slime.incapacitatedUntilTurn

  // 予約アクションの実行
  const pendingReservations = reservations.filter((r) => r.status === 'pending')

  logger.debug('[processSlimeTurn] 開始', {
    slimeId: slime.id,
    slimeName: slime.name,
    speciesId: slime.speciesId,
    turn: currentTurn,
    stats: slime.stats,
    racialValues: slime.racialValues,
    isIncapacitated,
    incapacitatedUntilTurn: slime.incapacitatedUntilTurn,
    inventoryCount: slime.inventory?.length ?? 0,
    pendingReservationCount: pendingReservations.length,
    nextAction: pendingReservations[0]?.actionType ?? 'autonomous',
  })

  if (isIncapacitated) {
    // 戦闘不能: 予約はスキップ（consumed 扱い）、行動不能イベントを記録
    logger.debug('[processSlimeTurn] 戦闘不能スキップ', {
      slimeId: slime.id,
      incapacitatedUntilTurn: slime.incapacitatedUntilTurn,
      currentTurn,
      skippedReservationCount: pendingReservations.length,
    })
    events.push({
      eventType: 'battle_incapacitated',
      eventData: { incapacitatedUntilTurn: slime.incapacitatedUntilTurn },
    })
    for (const r of pendingReservations) {
      updatedReservations.push({ ...r, status: 'executed', executedAt: new Date() })
    }
  } else if (pendingReservations.length > 0) {
    // 最初の予約を実行
    const reservation = pendingReservations[0]
    logger.debug('[processSlimeTurn] 予約アクション実行', {
      slimeId: slime.id,
      actionType: reservation.actionType,
      actionData: reservation.actionData,
      reservationId: reservation.id,
    })
    const actionResult = await executeReservedAction(currentSlime, reservation, foodList, tileList)
    currentSlime = actionResult.updatedSlime
    events.push(...actionResult.events)

    // battle 敗北で HP=0 → 戦闘不能フラグ設定
    if (actionResult.incapacitatedTurns) {
      currentSlime = {
        ...currentSlime,
        incapacitatedUntilTurn: currentTurn + actionResult.incapacitatedTurns,
      }
    }

    // 融合で削除すべきスライムを引き継ぐ
    if (actionResult.slimesToDelete?.length) {
      slimesToDelete.push(...actionResult.slimesToDelete)
    }

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
    logger.debug('[processSlimeTurn] 自律行動（予約なし）', {
      slimeId: slime.id,
      hunger: slime.stats.hunger,
    })
    const autonomousResult = await executeAutonomousAction(currentSlime)
    currentSlime = autonomousResult.updatedSlime
    events.push(...autonomousResult.events)
  }

  // hunger を減少（下限0）。季節により補正: 夏+2, 冬+1
  const seasonHungerBonus: Record<string, number> = { spring: 0, summer: 2, autumn: 0, winter: 1 }
  const hungerDecrement = 5 + (seasonHungerBonus[worldContext?.season ?? 'spring'] ?? 0)
  const newHunger = Math.max(0, currentSlime.stats.hunger - hungerDecrement)
  currentSlime = {
    ...currentSlime,
    stats: {
      ...currentSlime.stats,
      hunger: newHunger,
    },
  }
  logger.debug('[processSlimeTurn] 空腹度減少', {
    slimeId: slime.id,
    hungerBefore: slime.stats.hunger,
    hungerAfter: newHunger,
  })
  events.push({ eventType: 'hunger_decrease', eventData: { before: slime.stats.hunger, after: newHunger } })

  // 進化チェック（静的マスタデータを唯一の参照元とする。foods/dropTables/wildMonstersと同方針）
  const speciesData = slimeSpecies.find((s) => s.id === currentSlime.speciesId)
  if (speciesData) {
    const evolutionResult = checkEvolution(currentSlime, speciesData)
    if (evolutionResult.evolved) {
      logger.debug('[processSlimeTurn] 進化発生', {
        slimeId: slime.id,
        fromSpeciesId: slime.speciesId,
        toSpeciesId: evolutionResult.updatedSlime.speciesId,
      })
      currentSlime = evolutionResult.updatedSlime
      const toSpecies = slimeSpecies.find((s) => s.id === currentSlime.speciesId)
      events.push({
        eventType: 'evolve',
        eventData: {
          newSpeciesId: currentSlime.speciesId,
          newSpeciesName: toSpecies?.name ?? currentSlime.speciesId,
        },
      })
    }
  }

  // 分裂チェック（条件: exp>=500 かつ 任意の種族値>=0.7 かつ 15%確率）
  const splitResult = checkSplit(currentSlime)
  if (splitResult.split && splitResult.newSlime) {
    logger.debug('[processSlimeTurn] 分裂発生', {
      slimeId: slime.id,
      newSlimeId: splitResult.newSlime.id,
      speciesId: splitResult.newSlime.speciesId,
    })
    newSlimesToCreate.push(splitResult.newSlime)
    events.push({
      eventType: 'split',
      eventData: { newSlimeId: splitResult.newSlime.id, speciesId: splitResult.newSlime.speciesId },
    })
  }

  logger.debug('[processSlimeTurn] 完了', {
    slimeId: slime.id,
    finalStats: currentSlime.stats,
    finalSpeciesId: currentSlime.speciesId,
    events: events.map((e) => e.eventType),
  })

  return {
    updatedSlime: currentSlime,
    updatedReservations,
    events,
    newSlimesToCreate: newSlimesToCreate.length > 0 ? newSlimesToCreate : undefined,
    slimesToDelete: slimesToDelete.length > 0 ? slimesToDelete : undefined,
  }
}

// ----------------------------------------------------------------
// アクション共通ヘルパー
// ----------------------------------------------------------------

/** 食料の statDeltas を slime.stats に適用する（eat/hunt 共通） */
function applyFoodEffects(slime: Slime, food: Food): Slime {
  const s = { ...slime, stats: { ...slime.stats }, racialValues: { ...slime.racialValues } }
  const d = food.statDeltas
  if (d.hp !== undefined) s.stats.hp = Math.max(0, s.stats.hp + d.hp)
  if (d.atk !== undefined) s.stats.atk = Math.max(0, s.stats.atk + d.atk)
  if (d.def !== undefined) s.stats.def = Math.max(0, s.stats.def + d.def)
  if (d.spd !== undefined) s.stats.spd = Math.max(0, s.stats.spd + d.spd)
  if (d.exp !== undefined) s.stats.exp = Math.max(0, s.stats.exp + d.exp)
  return s
}

/** 食料の racialDeltas を slime.racialValues に適用する（RACIAL_VALUE_MAX でクランプ） */
function applyRacialDeltas(slime: Slime, racialDeltas: Food['racialDeltas']): Slime {
  const s = { ...slime, racialValues: { ...slime.racialValues } }
  const r = racialDeltas
  const cap = (v: number, d: number | undefined) =>
    d !== undefined ? Math.min(Math.max(0, v + d), RACIAL_VALUE_MAX) : v
  s.racialValues.fire = cap(s.racialValues.fire, r.fire)
  s.racialValues.water = cap(s.racialValues.water, r.water)
  s.racialValues.earth = cap(s.racialValues.earth, r.earth)
  s.racialValues.wind = cap(s.racialValues.wind, r.wind)
  s.racialValues.slime = cap(s.racialValues.slime, r.slime)
  s.racialValues.plant = cap(s.racialValues.plant, r.plant)
  s.racialValues.human = cap(s.racialValues.human, r.human)
  s.racialValues.beast = cap(s.racialValues.beast, r.beast)
  s.racialValues.spirit = cap(s.racialValues.spirit, r.spirit)
  s.racialValues.fish = cap(s.racialValues.fish, r.fish)
  return s
}

/**
 * 重み付きランダムドロップ
 * @returns { foodId, quantity } または null（drops が空の場合）
 */
function weightedDrop(drops: DropEntry[]): { foodId: string; quantity: number } | null {
  if (drops.length === 0) return null
  const totalWeight = drops.reduce((sum, d) => sum + d.weight, 0)
  let rand = Math.random() * totalWeight
  for (const drop of drops) {
    rand -= drop.weight
    if (rand <= 0) {
      const quantity = drop.minQty + Math.floor(Math.random() * (drop.maxQty - drop.minQty + 1))
      return { foodId: drop.foodId, quantity }
    }
  }
  // フォールバック（浮動小数点誤差対策）
  const last = drops[drops.length - 1]
  const quantity = last.minQty + Math.floor(Math.random() * (last.maxQty - last.minQty + 1))
  return { foodId: last.foodId, quantity }
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
  let updatedSlime: Slime = {
    ...slime,
    stats: { ...slime.stats },
    racialValues: { ...slime.racialValues },
    inventory: slime.inventory ? slime.inventory.map((s) => ({ ...s })) : undefined,
  }
  const events: ActionResult['events'] = []

  logger.debug('[executeReservedAction] 開始', {
    slimeId: slime.id,
    actionType: reservation.actionType,
    actionData: reservation.actionData,
    stats: { hp: slime.stats.hp, atk: slime.stats.atk, def: slime.stats.def, hunger: slime.stats.hunger, exp: slime.stats.exp },
    inventoryCount: slime.inventory?.length ?? 0,
  })

  switch (reservation.actionType) {
    case 'eat': {
      const eatData = reservation.actionData as { foodId?: string }
      const foodId = eatData.foodId

      if (!foodId) break

      // 食料マスタを先に検索（alwaysAvailable チェックのため）
      let food: Food | undefined
      if (foods && foods.length > 0) {
        food = foods.find((f) => f.id === foodId)
      }
      if (!food) {
        food = staticFoods.find((f) => f.id === foodId)
      }
      if (!food) break

      // インベントリが定義されており、かつ alwaysAvailable でない場合のみ消費する
      if (updatedSlime.inventory !== undefined && !food.alwaysAvailable) {
        const removeResult = removeFromInventory(updatedSlime.inventory, foodId, 1)
        if (!removeResult.success) {
          // インベントリに食料がない → スキップ
          events.push({ eventType: 'inventory_not_found', eventData: { foodId } })
          break
        }
        updatedSlime = { ...updatedSlime, inventory: removeResult.inventory }
      }

      // 食料効果を適用
      updatedSlime = applyFoodEffects(updatedSlime, food)
      updatedSlime = applyRacialDeltas(updatedSlime, food.racialDeltas)

      // cooking スキル効果の計算（hunger ボーナス・EXP 倍率）
      const cookingSkills = getSlimeSkills(updatedSlime).filter((s) => s.effectType === 'cooking')
      let cookingHungerBonus = 0
      let cookingExpMultiplier = 1.0
      for (const skill of cookingSkills) {
        const d = skill.effectData as Record<string, unknown>
        cookingHungerBonus += (d['eatHungerBonus'] as number | undefined) ?? 0
        // categoryBonus: food.category と一致する場合はカテゴリ倍率で上書き
        const categoryBonus = d['categoryBonus'] as { category?: string; eatExpMultiplier?: number } | undefined
        if (categoryBonus && categoryBonus.category === food.category && categoryBonus.eatExpMultiplier) {
          cookingExpMultiplier = Math.max(cookingExpMultiplier, categoryBonus.eatExpMultiplier)
        } else {
          cookingExpMultiplier *= (d['eatExpMultiplier'] as number | undefined) ?? 1.0
        }
      }
      // EXP に倍率を適用（statDeltas.exp が既に加算済みのため差分を計算）
      if (cookingExpMultiplier > 1.0 && food.statDeltas.exp) {
        const expBonus = Math.floor(food.statDeltas.exp * (cookingExpMultiplier - 1.0))
        updatedSlime.stats.exp = Math.max(0, updatedSlime.stats.exp + expBonus)
      }

      // hunger +30 + cooking ボーナス (上限100)
      updatedSlime.stats.hunger = clamp(updatedSlime.stats.hunger + 30 + cookingHungerBonus, 0, 100)

      // スキル付与チェック
      if (food.skillGrantId && food.skillGrantProb > 0 && Math.random() < food.skillGrantProb) {
        const newSkillId = food.skillGrantId
        // 未習得の場合のみ付与
        const alreadyHas = (updatedSlime.skillIds ?? []).includes(newSkillId)
        if (!alreadyHas) {
          try {
            const skillDocRef = db()
              .collection('slimes')
              .doc(slime.id)
              .collection('skills')
              .doc(newSkillId)
            const skillBatch = db().batch()
            skillBatch.set(skillDocRef, {
              id: newSkillId,
              slimeId: slime.id,
              skillDefinitionId: newSkillId,
              acquiredAt: FieldValue.serverTimestamp(),
            })
            // skillIds に追加（デノーマライズ）
            const slimeRef = db().collection('slimes').doc(slime.id)
            skillBatch.update(slimeRef, {
              skillIds: admin.firestore.FieldValue.arrayUnion(newSkillId),
            })
            await skillBatch.commit()
            updatedSlime = {
              ...updatedSlime,
              skillIds: [...(updatedSlime.skillIds ?? []), newSkillId],
            }
          } catch (skillError) {
            logger.warn('[turnProcessor] スキル付与失敗', {
              slimeId: slime.id,
              skillId: newSkillId,
              error: skillError instanceof Error ? skillError.message : String(skillError),
            })
          }
          events.push({ eventType: 'skill_grant', eventData: { skillId: newSkillId, foodId } })
        }
      }

      logger.debug('[executeReservedAction] eat', {
        slimeId: slime.id,
        foodId,
        foodName: food.name,
        alwaysAvailable: food.alwaysAvailable,
        hungerBefore: slime.stats.hunger,
        hungerAfter: updatedSlime.stats.hunger,
        expBefore: slime.stats.exp,
        expAfter: updatedSlime.stats.exp,
        cookingHungerBonus,
        cookingExpMultiplier,
        inventoryAfter: updatedSlime.inventory?.length ?? 0,
      })
      events.push({ eventType: 'eat', eventData: { foodId, food: food.name } })
      break
    }

    case 'gather': {
      // タイル情報を取得
      const gatherTile = (_tiles ?? []).find((t) => t.x === slime.tileX && t.y === slime.tileY)

      // タイル属性条件に合致する gather テーブルを選択（属性値が高い順に優先）
      const gatherTables = dropTables.filter((dt) => dt.actionType === 'gather')
      const attributes = (gatherTile?.attributes ?? {}) as TileAttributes
      const attrOrder: Array<keyof TileAttributes> = ['earth', 'water', 'fire', 'wind']
      let chosenTable = gatherTables.find((dt) => dt.tileCondition === null) // default fallback

      for (const attr of attrOrder) {
        const val = (attributes[attr] as number | undefined) ?? 0
        const match = gatherTables.find(
          (dt) => dt.tileCondition !== null && dt.tileCondition.attribute === attr && val >= dt.tileCondition.minValue
        )
        if (match) { chosenTable = match; break }
      }

      if (!chosenTable || chosenTable.drops.length === 0) {
        events.push({ eventType: 'gather_fail', eventData: { tileX: slime.tileX, tileY: slime.tileY } })
        break
      }

      const dropped = weightedDrop(chosenTable.drops)
      if (!dropped) {
        events.push({ eventType: 'gather_fail', eventData: { tileX: slime.tileX, tileY: slime.tileY } })
        break
      }

      // action_bonus スキル（gather）: ドロップ量倍率を適用
      const gatherBonusSkills = getActionBonusSkills(updatedSlime, 'gather')
      let gatherQty = dropped.quantity
      for (const skill of gatherBonusSkills) {
        const mult = (skill.effectData as Record<string, unknown>)['dropQuantityMultiplier'] as number | undefined
        if (mult) gatherQty = Math.max(1, Math.floor(gatherQty * mult))
      }

      const gatherInv = updatedSlime.inventory ?? []
      const addResult = addToInventory(gatherInv, dropped.foodId, gatherQty)
      if (!addResult.success) {
        events.push({ eventType: 'inventory_full', eventData: { foodId: dropped.foodId } })
        break
      }
      updatedSlime = { ...updatedSlime, inventory: addResult.inventory }
      logger.debug('[executeReservedAction] gather成功', {
        slimeId: slime.id,
        tileX: slime.tileX,
        tileY: slime.tileY,
        tileFound: !!gatherTile,
        tableId: chosenTable.id,
        droppedFoodId: dropped.foodId,
        quantity: gatherQty,
        hasBonusSkill: gatherBonusSkills.length > 0,
      })
      events.push({ eventType: 'gather_success', eventData: { foodId: dropped.foodId, quantity: gatherQty, tableId: chosenTable.id } })
      break
    }

    case 'fish': {
      // タイル情報を取得して water 属性を確認
      const fishTile = (_tiles ?? []).find((t) => t.x === slime.tileX && t.y === slime.tileY)
      const waterVal = (fishTile?.attributes?.water as number | undefined) ?? 0

      // action_bonus スキル（fish）: waterThresholdReduction で閾値を下げる
      const fishBonusSkills = getActionBonusSkills(updatedSlime, 'fish')
      let fishWaterThreshold = 0.3
      for (const skill of fishBonusSkills) {
        const reduction = (skill.effectData as Record<string, unknown>)['waterThresholdReduction'] as number | undefined
        if (reduction) fishWaterThreshold = Math.max(0, fishWaterThreshold - reduction)
      }

      if (waterVal < fishWaterThreshold) {
        events.push({ eventType: 'fish_fail', eventData: { tileX: slime.tileX, tileY: slime.tileY, reason: 'water_too_low' } })
        break
      }

      const fishTable = dropTables.find((dt) => dt.actionType === 'fish' && dt.tileCondition?.attribute === 'water')
      if (!fishTable || fishTable.drops.length === 0) {
        events.push({ eventType: 'fish_fail', eventData: { tileX: slime.tileX, tileY: slime.tileY, reason: 'no_table' } })
        break
      }

      const fishDropped = weightedDrop(fishTable.drops)
      if (!fishDropped) {
        events.push({ eventType: 'fish_fail', eventData: { tileX: slime.tileX, tileY: slime.tileY, reason: 'no_drop' } })
        break
      }

      // action_bonus スキル（fish）: ドロップ量倍率を適用
      let fishQty = fishDropped.quantity
      for (const skill of fishBonusSkills) {
        const mult = (skill.effectData as Record<string, unknown>)['dropQuantityMultiplier'] as number | undefined
        if (mult) fishQty = Math.max(1, Math.floor(fishQty * mult))
      }

      const fishInv = updatedSlime.inventory ?? []
      const fishAddResult = addToInventory(fishInv, fishDropped.foodId, fishQty)
      if (!fishAddResult.success) {
        events.push({ eventType: 'inventory_full', eventData: { foodId: fishDropped.foodId } })
        break
      }
      updatedSlime = { ...updatedSlime, inventory: fishAddResult.inventory }
      logger.debug('[executeReservedAction] fish成功', {
        slimeId: slime.id,
        tileX: slime.tileX,
        tileY: slime.tileY,
        waterVal,
        fishWaterThreshold,
        droppedFoodId: fishDropped.foodId,
        quantity: fishQty,
        hasBonusSkill: fishBonusSkills.length > 0,
      })
      events.push({ eventType: 'fish_success', eventData: { foodId: fishDropped.foodId, quantity: fishQty } })
      break
    }

    case 'hunt': {
      const huntData = reservation.actionData as { targetCategory?: string; targetStrength?: string }
      const targetCategory = huntData.targetCategory
      const targetStrength = huntData.targetStrength

      if (!targetCategory || !targetStrength) break

      // マスタからモンスターを取得（ランダムに1体選択）
      const candidates = wildMonsters.filter(
        (m) => m.category === targetCategory && m.strength === targetStrength
      )
      if (candidates.length === 0) break
      const monster = candidates[Math.floor(Math.random() * candidates.length)]

      // action_bonus スキル（hunt）: atkBonus を加算
      const huntBonusSkills = getActionBonusSkills(updatedSlime, 'hunt')
      let huntAtkBonus = 0
      for (const skill of huntBonusSkills) {
        huntAtkBonus += (skill.effectData as Record<string, unknown>)['atkBonus'] as number ?? 0
      }

      // 勝敗判定: atk + atkBonus + floor(random * spd * 0.75) > monster.power
      const attackRoll = updatedSlime.stats.atk + huntAtkBonus + Math.floor(Math.random() * updatedSlime.stats.spd * 0.75)
      const huntSuccess = attackRoll > monster.power

      logger.debug('[executeReservedAction] hunt 勝敗判定', {
        slimeId: slime.id,
        monsterName: monster.name,
        monsterPower: monster.power,
        slimeAtk: updatedSlime.stats.atk,
        slimeSpd: updatedSlime.stats.spd,
        atkBonus: huntAtkBonus,
        attackRoll,
        huntSuccess,
        hasBonusSkill: huntBonusSkills.length > 0,
      })

      if (!huntSuccess) {
        // 敗北: HP 減少
        const damage = Math.ceil(monster.power * 0.5)
        updatedSlime.stats.hp = Math.max(0, updatedSlime.stats.hp - damage)
        logger.debug('[executeReservedAction] hunt敗北', {
          slimeId: slime.id,
          monsterName: monster.name,
          damage,
          hpAfter: updatedSlime.stats.hp,
        })
        events.push({ eventType: 'hunt_fail', eventData: { monsterName: monster.name, damage, monsterId: monster.id } })
        break
      }

      // 勝利: ドロップアイテム取得 + 種族値加算
      const huntTable = dropTables.find((dt) => dt.id === monster.dropTableId)
      let huntFoodId: string | null = null

      if (huntTable && huntTable.drops.length > 0) {
        const huntDropped = weightedDrop(huntTable.drops)
        if (huntDropped) {
          huntFoodId = huntDropped.foodId
          // 種族値加算（食料の racialDeltas を参照）
          const huntFood = staticFoods.find((f) => f.id === huntDropped.foodId)
          if (huntFood) {
            updatedSlime = applyRacialDeltas(updatedSlime, huntFood.racialDeltas)
          }
          // インベントリに追加（満杯でも hunt_success は記録する）
          const huntInv = updatedSlime.inventory ?? []
          const huntAddResult = addToInventory(huntInv, huntDropped.foodId, huntDropped.quantity)
          if (huntAddResult.success) {
            updatedSlime = { ...updatedSlime, inventory: huntAddResult.inventory }
          } else {
            events.push({ eventType: 'inventory_full', eventData: { foodId: huntDropped.foodId } })
          }
        }
      }

      logger.debug('[executeReservedAction] hunt成功', {
        slimeId: slime.id,
        monsterName: monster.name,
        dropFoodId: huntFoodId,
      })
      events.push({ eventType: 'hunt_success', eventData: { monsterName: monster.name, monsterId: monster.id, dropFoodId: huntFoodId } })
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
        const capRacial = (v: number, delta: number) =>
          Math.min(Math.max(0, v + delta), RACIAL_VALUE_MAX)
        updatedSlime.racialValues.fire = capRacial(updatedSlime.racialValues.fire, tile.attributes.fire * 0.1)
        updatedSlime.racialValues.water = capRacial(updatedSlime.racialValues.water, tile.attributes.water * 0.1)
        updatedSlime.racialValues.earth = capRacial(updatedSlime.racialValues.earth, tile.attributes.earth * 0.1)
        updatedSlime.racialValues.wind = capRacial(updatedSlime.racialValues.wind, tile.attributes.wind * 0.1)
      }

      logger.debug('[executeReservedAction] move', {
        slimeId: slime.id,
        fromX: slime.tileX,
        fromY: slime.tileY,
        toX: targetX,
        toY: targetY,
        tileFound: !!tile,
        racialUpdated: !!tile,
      })
      events.push({ eventType: 'move', eventData: { targetX, targetY } })
      break
    }

    case 'battle': {
      const battleData = reservation.actionData as { targetCategory?: string; targetStrength?: string }
      const bTargetCategory = battleData.targetCategory
      const bTargetStrength = battleData.targetStrength

      if (!bTargetCategory || !bTargetStrength) break

      // マスタからモンスターを取得（ランダムに1体選択）
      const bCandidates = wildMonsters.filter(
        (m) => m.category === bTargetCategory && m.strength === bTargetStrength
      )
      if (bCandidates.length === 0) break
      const bMonster = bCandidates[Math.floor(Math.random() * bCandidates.length)]

      // 勝敗判定: atk + random * spd * 0.5 > monster.power（仕様通り float）
      const bAttackRoll = updatedSlime.stats.atk + Math.random() * updatedSlime.stats.spd * 0.5
      const battleSuccess = bAttackRoll > bMonster.power

      logger.debug('[executeReservedAction] battle 勝敗判定', {
        slimeId: slime.id,
        monsterName: bMonster.name,
        monsterPower: bMonster.power,
        slimeAtk: updatedSlime.stats.atk,
        slimeSpd: updatedSlime.stats.spd,
        attackRoll: bAttackRoll,
        battleSuccess,
      })

      if (!battleSuccess) {
        // 敗北: HP 大ダメージ（hunt の倍: power そのもの）
        const bDamage = bMonster.power
        const hpBefore = updatedSlime.stats.hp
        updatedSlime.stats.hp = Math.max(0, updatedSlime.stats.hp - bDamage)
        const incapacitated = hpBefore > 0 && updatedSlime.stats.hp === 0
        logger.debug('[executeReservedAction] battle敗北', {
          slimeId: slime.id,
          monsterName: bMonster.name,
          damage: bDamage,
          hpBefore,
          hpAfter: updatedSlime.stats.hp,
          incapacitated,
        })
        events.push({
          eventType: 'battle_lose',
          eventData: { monsterName: bMonster.name, damage: bDamage, monsterId: bMonster.id },
        })
        // HP=0 → 戦闘不能フラグ（incapacitatedTurns を ActionResult に返す）
        if (incapacitated) {
          return { updatedSlime, events, incapacitatedTurns: 2 }
        }
        break
      }

      // 勝利: 食料ドロップ + 種族値加算 + EXP ボーナス
      const bTableId = `drop-battle-${bTargetCategory}-${bTargetStrength}`
      const bTable = dropTables.find((dt) => dt.id === bTableId)
      let bFoodId: string | null = null

      if (bTable && bTable.drops.length > 0) {
        const bDropped = weightedDrop(bTable.drops)
        if (bDropped) {
          bFoodId = bDropped.foodId
          // ドロップした食料の種族値加算
          const bFood = staticFoods.find((f) => f.id === bDropped.foodId)
          if (bFood) {
            updatedSlime = applyRacialDeltas(updatedSlime, bFood.racialDeltas)
          }
          // インベントリに追加（満杯でも battle_success は記録する）
          const bInv = updatedSlime.inventory ?? []
          const bAddResult = addToInventory(bInv, bDropped.foodId, bDropped.quantity)
          if (bAddResult.success) {
            updatedSlime = { ...updatedSlime, inventory: bAddResult.inventory }
          } else {
            events.push({ eventType: 'inventory_full', eventData: { foodId: bDropped.foodId } })
          }
        }
      }

      // EXP ボーナス: monster.power × (1.5〜2)
      const bExpBonus = Math.floor(bMonster.power * (1.5 + Math.random() * 0.5))
      updatedSlime.stats.exp = Math.max(0, updatedSlime.stats.exp + bExpBonus)

      logger.debug('[executeReservedAction] battle勝利', {
        slimeId: slime.id,
        monsterName: bMonster.name,
        dropFoodId: bFoodId,
        expBonus: bExpBonus,
        expAfter: updatedSlime.stats.exp,
      })
      events.push({
        eventType: 'battle_win',
        eventData: { monsterName: bMonster.name, monsterId: bMonster.id, dropFoodId: bFoodId, expBonus: bExpBonus },
      })
      break
    }

    case 'rest': {
      const maxHp = updatedSlime.stats.atk + updatedSlime.stats.def + 50
      const healAmount = Math.floor(maxHp * 0.2)
      const hpBeforeRest = updatedSlime.stats.hp
      updatedSlime.stats.hp = Math.min(updatedSlime.stats.hp + healAmount, maxHp)

      // 休息すると少し食欲が出る
      updatedSlime.stats.hunger = clamp(updatedSlime.stats.hunger + 10, 0, 100)

      logger.debug('[executeReservedAction] rest', {
        slimeId: slime.id,
        maxHp,
        healAmount,
        hpBefore: hpBeforeRest,
        hpAfter: updatedSlime.stats.hp,
        hungerAfter: updatedSlime.stats.hunger,
      })
      events.push({ eventType: 'rest', eventData: { healAmount } })
      break
    }

    case 'merge': {
      // 融合アクション（Phase 4 追加）
      // 同オーナーの別スライムを吸収し、ATK・DEF の 30% を引き継ぐ
      const targetSlimeId = (reservation.actionData as { targetSlimeId?: string }).targetSlimeId
      if (!targetSlimeId) break

      // 自己融合は禁止
      if (targetSlimeId === updatedSlime.id) break

      try {
        const targetSnap = await db().collection('slimes').doc(targetSlimeId).get()
        if (!targetSnap.exists) break

        const targetSlime = { id: targetSnap.id, ...targetSnap.data() } as Slime

        // 同オーナーのみ融合可能
        if (targetSlime.ownerUid !== updatedSlime.ownerUid) break

        const atkAbsorb = Math.floor(targetSlime.stats.atk * 0.3)
        const defAbsorb = Math.floor(targetSlime.stats.def * 0.3)
        updatedSlime.stats.atk = updatedSlime.stats.atk + atkAbsorb
        updatedSlime.stats.def = updatedSlime.stats.def + defAbsorb

        logger.debug('[executeReservedAction] merge', {
          slimeId: slime.id,
          targetSlimeId,
          targetSlimeName: targetSlime.name,
          atkAbsorb,
          defAbsorb,
          atkAfter: updatedSlime.stats.atk,
          defAfter: updatedSlime.stats.def,
        })

        events.push({
          eventType: 'merge',
          eventData: { targetSlimeId, atkAbsorb, defAbsorb },
        })

        return { updatedSlime, events, slimesToDelete: [targetSlimeId] }
      } catch {
        // 融合失敗は無視（ターゲット取得失敗など）
      }
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

  const autonomousPath =
    slime.stats.hunger >= 50 ? 'walk' : slime.stats.hunger >= 20 ? 'rest' : 'weak'

  logger.debug('[executeAutonomousAction] 開始', {
    slimeId: slime.id,
    hunger: slime.stats.hunger,
    hp: slime.stats.hp,
    path: autonomousPath,
  })

  if (slime.stats.hunger >= 50) {
    // hunger >= 50: 自律的に近くを歩き回る（HP変化なし）
  } else if (slime.stats.hunger >= 20) {
    // hunger < 50 かつ hunger >= 20: 自律的に休息してHP微回復（maxHP × 5%）
    const maxHp = updatedSlime.stats.atk + updatedSlime.stats.def + 50
    const healAmount = Math.floor(maxHp * 0.05)
    const hpBefore = updatedSlime.stats.hp
    updatedSlime.stats.hp = Math.min(updatedSlime.stats.hp + healAmount, maxHp)
    logger.debug('[executeAutonomousAction] 自律休息', {
      slimeId: slime.id,
      maxHp,
      healAmount,
      hpBefore,
      hpAfter: updatedSlime.stats.hp,
    })
  }
  // hunger < 20: 弱っていて動けない（HP回復なし）

  events.push({ eventType: 'autonomous', eventData: { action: autonomousPath, hunger: slime.stats.hunger } })

  return { updatedSlime, events }
}

// ----------------------------------------------------------------
// checkSplit
// ----------------------------------------------------------------

/**
 * 分裂条件を確認する（Phase 4 追加）
 * 条件: exp>=500 かつ 任意の種族値>=0.7 かつ 15%確率
 * 成立時: 同種族・初期ステータスの子スライムを生成して返す
 */
export function checkSplit(slime: Slime): { split: boolean; newSlime?: Slime } {
  if (slime.stats.exp < 500) {
    logger.debug('[checkSplit] 分裂なし: EXP不足', { slimeId: slime.id, exp: slime.stats.exp, required: 500 })
    return { split: false }
  }

  const racialMax = Math.max(...Object.values(slime.racialValues))
  if (racialMax < 0.7) {
    logger.debug('[checkSplit] 分裂なし: 種族値不足', { slimeId: slime.id, exp: slime.stats.exp, racialMax, required: 0.7 })
    return { split: false }
  }

  const rand = Math.random()
  if (rand > 0.15) {
    logger.debug('[checkSplit] 分裂なし: 確率外れ', { slimeId: slime.id, exp: slime.stats.exp, racialMax, rand: rand.toFixed(4), threshold: 0.15 })
    return { split: false }
  }

  const parentSpecies = slimeSpecies.find((s) => s.id === slime.speciesId)
  if (!parentSpecies) return { split: false }

  const now = new Date()
  const newSlime: Slime = {
    id: randomUUID(),
    ownerUid: slime.ownerUid,
    mapId: slime.mapId,
    worldId: slime.worldId,
    speciesId: slime.speciesId,
    tileX: slime.tileX,
    tileY: slime.tileY,
    name: `${parentSpecies.name}の子`,
    stats: { ...parentSpecies.baseStats },
    racialValues: { fire: 0, water: 0, earth: 0, wind: 0, slime: 0, plant: 0, human: 0, beast: 0, spirit: 0, fish: 0 },
    inventory: [],
    isWild: slime.isWild,
    createdAt: now,
    updatedAt: now,
  }

  logger.debug('[checkSplit] 分裂発生', {
    slimeId: slime.id,
    exp: slime.stats.exp,
    racialMax,
    newSlimeId: newSlime.id,
    speciesId: newSlime.speciesId,
  })
  return { split: true, newSlime }
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

  logger.debug('[checkEvolution] 開始', {
    slimeId: slime.id,
    speciesId: speciesData.id,
    conditionCount: speciesData.evolutionConditions.length,
    stats: slime.stats,
    racialValues: slime.racialValues,
  })

  for (const condition of speciesData.evolutionConditions) {
    let meetsStats = true
    let meetsRacialValues = true

    // requiredStats チェック
    for (const [key, required] of Object.entries(condition.requiredStats)) {
      const actual = slime.stats[key as keyof typeof slime.stats]
      if (actual === undefined || actual < (required as number)) {
        meetsStats = false
        logger.debug('[checkEvolution] stats条件不足', {
          slimeId: slime.id,
          targetSpeciesId: condition.targetSpeciesId,
          failedKey: key,
          required,
          actual,
        })
        break
      }
    }

    if (!meetsStats) continue

    // requiredRacialValues チェック
    for (const [key, required] of Object.entries(condition.requiredRacialValues)) {
      const actual = slime.racialValues[key as keyof typeof slime.racialValues]
      if (actual === undefined || actual < (required as number)) {
        meetsRacialValues = false
        logger.debug('[checkEvolution] 種族値条件不足', {
          slimeId: slime.id,
          targetSpeciesId: condition.targetSpeciesId,
          failedKey: key,
          required,
          actual,
        })
        break
      }
    }

    if (!meetsRacialValues) continue

    // 全条件を満たした
    logger.debug('[checkEvolution] 進化条件達成', {
      slimeId: slime.id,
      fromSpeciesId: slime.speciesId,
      toSpeciesId: condition.targetSpeciesId,
    })
    updatedSlime.speciesId = condition.targetSpeciesId
    return { evolved: true, updatedSlime }
  }

  logger.debug('[checkEvolution] 進化なし', { slimeId: slime.id, speciesId: slime.speciesId })
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

// ----------------------------------------------------------------
// インベントリ操作ヘルパー（export: テスト・外部利用向け）
// ----------------------------------------------------------------

/**
 * インベントリにアイテムを追加する。
 * - 既存スロットがあれば数量を加算する。
 * - 新規スロットが必要で INVENTORY_MAX_SLOTS を超える場合は失敗する。
 */
export function addToInventory(
  inventory: InventorySlot[],
  foodId: string,
  qty: number
): { success: boolean; inventory?: InventorySlot[]; event?: 'inventory_full' } {
  const existingIdx = inventory.findIndex((s) => s.foodId === foodId)
  if (existingIdx >= 0) {
    // 既存スロットに加算（スロット数は変わらない）
    const updated = inventory.map((s, i) =>
      i === existingIdx ? { ...s, quantity: s.quantity + qty } : { ...s }
    )
    return { success: true, inventory: updated }
  }
  // 新規スロット追加
  if (inventory.length >= INVENTORY_MAX_SLOTS) {
    return { success: false, event: 'inventory_full' }
  }
  return { success: true, inventory: [...inventory.map((s) => ({ ...s })), { foodId, quantity: qty }] }
}

/**
 * インベントリからアイテムを消費する。
 * - 数量が 0 になったスロットは削除する。
 * - 存在しない foodId または数量不足の場合は失敗する。
 */
export function removeFromInventory(
  inventory: InventorySlot[],
  foodId: string,
  qty: number
): { success: boolean; inventory?: InventorySlot[]; error?: string } {
  const slot = inventory.find((s) => s.foodId === foodId)
  if (!slot) {
    return { success: false, error: `食料が見つかりません: ${foodId}` }
  }
  if (slot.quantity < qty) {
    return { success: false, error: `在庫不足: ${foodId} (在庫=${slot.quantity}, 要求=${qty})` }
  }
  const updated = inventory
    .map((s) => (s.foodId === foodId ? { ...s, quantity: s.quantity - qty } : { ...s }))
    .filter((s) => s.quantity > 0)
  return { success: true, inventory: updated }
}

// ----------------------------------------------------------------
// ワールドイベントシステム（Phase 6 W2）
// ----------------------------------------------------------------

const WEATHER_DEFINITIONS: Array<{ id: string; durationTurns: number; weight: number }> = [
  { id: 'sunny',  durationTurns: 8, weight: 50 },
  { id: 'rainy',  durationTurns: 4, weight: 25 },
  { id: 'stormy', durationTurns: 2, weight: 10 },
  { id: 'foggy',  durationTurns: 3, weight: 15 },
]

/**
 * 天候遷移チェック
 * weather が未設定 or weatherEndsAtTurn <= currentTurn の場合に次の天候を抽選して batch に書き込む
 */
export function checkWeatherTransition(
  world: World,
  currentTurn: number,
  batch: FirebaseFirestore.WriteBatch
): void {
  const shouldTransition =
    !world.weather ||
    world.weatherEndsAtTurn === undefined ||
    currentTurn >= world.weatherEndsAtTurn

  if (!shouldTransition) return

  const totalWeight = WEATHER_DEFINITIONS.reduce((s, w) => s + w.weight, 0)
  let rand = Math.random() * totalWeight
  let nextWeather = WEATHER_DEFINITIONS[0]
  for (const w of WEATHER_DEFINITIONS) {
    rand -= w.weight
    if (rand <= 0) { nextWeather = w; break }
  }

  const weatherEndsAtTurn = currentTurn + nextWeather.durationTurns
  const worldRef = db().collection('worlds').doc(world.id)
  batch.update(worldRef, { weather: nextWeather.id, weatherEndsAtTurn })

  // turnLogs に記録（WorldLogPanel で表示される）
  const logRef = db().collection('turnLogs').doc(randomUUID())
  batch.set(logRef, {
    worldId: world.id,
    slimeId: null,
    actorType: 'world',
    turnNumber: currentTurn,
    eventType: 'weather_change',
    eventData: {
      from: world.weather ?? 'none',
      to: nextWeather.id,
      weatherEndsAtTurn,
    },
    processedAt: FieldValue.serverTimestamp(),
  })

  logger.info('[turnProcessor] 天候遷移', {
    worldId: world.id,
    prevWeather: world.weather ?? 'none',
    nextWeather: nextWeather.id,
    weatherEndsAtTurn,
    currentTurn,
  })
}

const SEASONS: Array<'spring' | 'summer' | 'autumn' | 'winter'> = ['spring', 'summer', 'autumn', 'winter']
const SEASON_DURATION_TURNS = 120 // 約5日（1時間/ターン）

/**
 * 季節遷移チェック
 * season が未設定 or seasonStartTurn + SEASON_DURATION_TURNS <= currentTurn の場合に次の季節へ進む
 */
export function checkSeasonTransition(
  world: World,
  currentTurn: number,
  batch: FirebaseFirestore.WriteBatch
): void {
  const shouldTransition =
    !world.season ||
    world.seasonStartTurn === undefined ||
    currentTurn >= world.seasonStartTurn + SEASON_DURATION_TURNS

  if (!shouldTransition) return

  const currentSeasonIdx = world.season ? SEASONS.indexOf(world.season) : -1
  const nextSeason = SEASONS[(currentSeasonIdx + 1) % SEASONS.length]

  const worldRef = db().collection('worlds').doc(world.id)
  batch.update(worldRef, { season: nextSeason, seasonStartTurn: currentTurn })

  // turnLogs に記録（WorldLogPanel で表示される）
  const logRef = db().collection('turnLogs').doc(randomUUID())
  batch.set(logRef, {
    worldId: world.id,
    slimeId: null,
    actorType: 'world',
    turnNumber: currentTurn,
    eventType: 'season_change',
    eventData: {
      from: world.season ?? 'none',
      to: nextSeason,
    },
    processedAt: FieldValue.serverTimestamp(),
  })

  logger.info('[turnProcessor] 季節遷移', {
    worldId: world.id,
    prevSeason: world.season ?? 'none',
    nextSeason,
    currentTurn,
  })
}
