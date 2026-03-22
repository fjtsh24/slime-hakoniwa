import type { Handler, HandlerResponse } from '@netlify/functions'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { Slime, SlimeStats, RacialValues } from '../../shared/types/slime'
import { slimeSpecies } from '../../shared/data/slimeSpecies'
import { verifyIdToken } from './helpers/auth'
import {
  createReservationSchema,
  deleteReservationSchema,
  registerHandleSchema,
  publicHandleParamSchema,
} from './helpers/validation'
import { logger } from '../../shared/lib/logger'
import {
  MAX_PENDING_RESERVATIONS,
  MAX_RESERVATION_TURN_DISTANCE,
} from '../../shared/constants/game'

const SLIME_COLORS = [
  '#ef4444', // red
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#14b8a6', // teal
]

interface CreateInitialSlimeRequest {
  ownerUid: string
  mapId: string
  worldId: string
}

async function createInitialSlime(
  request: CreateInitialSlimeRequest
): Promise<Slime | null> {
  const { ownerUid, mapId, worldId } = request
  const initialSpecies = slimeSpecies.find((s) => s.id === 'slime-001')
  if (!initialSpecies) {
    throw new Error('slime-001 の種族データが見つかりません')
  }

  const userRef = admin.firestore().collection('users').doc(ownerUid)
  const slimeRef = admin.firestore().collection('slimes').doc()
  const slimeId = slimeRef.id
  const now = FieldValue.serverTimestamp()

  const racialValues: RacialValues = {
    fire: 0, water: 0, earth: 0, wind: 0,
    slime: 0, plant: 0, human: 0, beast: 0, spirit: 0, fish: 0,
  }
  const stats: SlimeStats = { ...initialSpecies.baseStats }

  const color = SLIME_COLORS[Math.floor(Math.random() * SLIME_COLORS.length)]

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
    color,
    stats,
    racialValues,
    inventory: [],
    createdAt: now,
    updatedAt: now,
  }

  const created = await admin.firestore().runTransaction(async (tx) => {
    const userDoc = await tx.get(userRef)
    if (userDoc.exists && (userDoc.data() as Record<string, unknown>)['hasSlime'] === true) {
      return false
    }
    tx.set(slimeRef, slimeData)
    tx.set(userRef, { hasSlime: true }, { merge: true })
    return true
  })

  if (!created) return null

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
    color,
    stats,
    racialValues,
    inventory: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

// Firebase Admin SDK の初期化（二重初期化を防ぐ）
if (admin.apps.length === 0) {
  const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_SERVICE_ACCOUNT_KEY
  if (serviceAccountKey) {
    // 本番 Netlify: 環境変数からサービスアカウントキーを読み込む
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(serviceAccountKey)),
    })
  } else {
    // ローカル開発: Application Default Credentials（firebase emulators等）
    admin.initializeApp()
  }
}

const db = admin.firestore()

/** JSON レスポンスを生成するユーティリティ */
function jsonResponse(
  statusCode: number,
  body: unknown
): HandlerResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

const handler: Handler = async (event): Promise<HandlerResponse> => {
  const startMs = Date.now()
  const funcPath = event.path.replace(/^\/.netlify\/functions\/[^/]+/, '')
  const path = funcPath.replace(/^\/api/, '') || '/'
  const method = event.httpMethod

  try {

  logger.info('[API] リクエスト受信', { method, path })

  // =========================================================
  // POST /reservations — 行動予約作成
  // =========================================================
  if (method === 'POST' && path === '/reservations') {
    // 1. IDトークン検証
    let uid: string
    try {
      const result = await verifyIdToken(
        event.headers['authorization'] ?? event.headers['Authorization']
      )
      uid = result.uid
    } catch (authError) {
      logger.error('[API] 認証エラー', { method, path, error: String(authError) })
      return jsonResponse(401, { error: '認証に失敗しました' })
    }

    // 2. リクエストボディを JSON パース
    let body: unknown
    try {
      body = JSON.parse(event.body ?? '{}')
    } catch (parseError) {
      logger.error('[API] JSON パースエラー', { method, path, error: String(parseError) })
      return jsonResponse(400, { error: 'リクエストボディが不正な JSON です' })
    }

    // 3. zod でバリデーション
    const parseResult = createReservationSchema.safeParse(body)
    if (!parseResult.success) {
      return jsonResponse(400, {
        error: 'バリデーションエラー',
        details: parseResult.error.flatten(),
      })
    }
    const { slimeId, worldId, turnNumber, actionType, actionData } =
      parseResult.data

    // 4. Firestore から slime ドキュメントを取得し ownerUid == uid を確認
    const slimeDoc = await db.collection('slimes').doc(slimeId).get()
    if (!slimeDoc.exists) {
      return jsonResponse(404, { error: 'スライムが見つかりません' })
    }
    const slimeData = slimeDoc.data()!
    if (slimeData.ownerUid !== uid) {
      return jsonResponse(403, {
        error: 'このスライムを操作する権限がありません',
      })
    }

    // 5. Firestore から world ドキュメントを取得し turnNumber > currentTurn を確認
    const worldDoc = await db.collection('worlds').doc(worldId).get()
    if (!worldDoc.exists) {
      return jsonResponse(404, { error: 'ワールドが見つかりません' })
    }
    const worldData = worldDoc.data()!
    if (turnNumber <= worldData.currentTurn) {
      return jsonResponse(400, {
        error: '過去のターンには予約できません',
      })
    }
    if (turnNumber > worldData.currentTurn + MAX_RESERVATION_TURN_DISTANCE) {
      return jsonResponse(400, {
        error: `${MAX_RESERVATION_TURN_DISTANCE}ターン先までしか予約できません`,
      })
    }

    // 5-b. 同一スライム・同一ターンへの pending 予約が既に存在しないか確認（1ターン1行動制約）
    const duplicateSnap = await db
      .collection('actionReservations')
      .where('slimeId', '==', slimeId)
      .where('turnNumber', '==', turnNumber)
      .where('status', '==', 'pending')
      .limit(1)
      .get()
    if (!duplicateSnap.empty) {
      return jsonResponse(409, {
        error: '同一ターンへの予約が既に存在します',
      })
    }

    // 5-c. 1スライムあたりの pending 予約数が上限（50件）に達していないか確認
    const pendingCount = await db
      .collection('actionReservations')
      .where('slimeId', '==', slimeId)
      .where('status', '==', 'pending')
      .count()
      .get()
    if (pendingCount.data().count >= MAX_PENDING_RESERVATIONS) {
      return jsonResponse(400, {
        error: `1スライムあたりの予約は最大${MAX_PENDING_RESERVATIONS}件までです`,
      })
    }

    // 6. actionReservations に status='pending' で追加
    const now = admin.firestore.Timestamp.now()
    const reservationRef = db.collection('actionReservations').doc()
    const reservation = {
      id: reservationRef.id,
      slimeId,
      ownerUid: uid,
      worldId,
      turnNumber,
      actionType,
      actionData,
      status: 'pending',
      createdAt: now,
      executedAt: null,
    }
    await reservationRef.set(reservation)

    // 7. 作成した予約を返す（201）
    logger.info('[API] 予約作成完了', { method, path, uid, slimeId, worldId, turnNumber, actionType, durationMs: Date.now() - startMs })
    return jsonResponse(201, {
      ...reservation,
      createdAt: now.toDate().toISOString(),
    })
  }

  // =========================================================
  // DELETE /reservations/:id — 予約キャンセル
  // =========================================================
  const deleteMatch = path.match(/^\/reservations\/(.+)$/)
  if (method === 'DELETE' && deleteMatch) {
    // 1. IDトークン検証
    let uid: string
    try {
      const result = await verifyIdToken(
        event.headers['authorization'] ?? event.headers['Authorization']
      )
      uid = result.uid
    } catch (authError) {
      logger.error('[API] 認証エラー', { method, path, error: String(authError) })
      return jsonResponse(401, { error: '認証に失敗しました' })
    }

    // パスパラメータのバリデーション
    const paramResult = deleteReservationSchema.safeParse({
      id: deleteMatch[1],
    })
    if (!paramResult.success) {
      return jsonResponse(400, {
        error: 'パラメータが不正です',
        details: paramResult.error.flatten(),
      })
    }
    const { id } = paramResult.data

    // 2. Firestore から actionReservation を取得
    const reservationDoc = await db
      .collection('actionReservations')
      .doc(id)
      .get()
    if (!reservationDoc.exists) {
      return jsonResponse(404, { error: '予約が見つかりません' })
    }
    const reservationData = reservationDoc.data()!

    // 3. ownerUid == uid を確認
    if (reservationData.ownerUid !== uid) {
      return jsonResponse(403, {
        error: 'この予約を操作する権限がありません',
      })
    }

    // 4. status == 'pending' のみキャンセル可能
    if (reservationData.status !== 'pending') {
      return jsonResponse(409, {
        error: '実行済みまたはキャンセル済みの予約はキャンセルできません',
      })
    }

    // 5. status を 'cancelled' に更新
    await reservationDoc.ref.update({ status: 'cancelled' })

    // 6. 204 を返す
    logger.info('[API] 予約キャンセル完了', { method, path, uid, reservationId: id, durationMs: Date.now() - startMs })
    return {
      statusCode: 204,
      headers: { 'Content-Type': 'application/json' },
      body: '',
    }
  }

  // =========================================================
  // GET /worlds/:worldId/status — ターン状態取得
  // =========================================================
  const worldStatusMatch = path.match(/^\/worlds\/([^/]+)\/status$/)
  if (method === 'GET' && worldStatusMatch) {
    // 1. 認証不要（公開エンドポイント）
    const worldId = worldStatusMatch[1]

    // 2. Firestore から world ドキュメントを取得
    const worldDoc = await db.collection('worlds').doc(worldId).get()
    if (!worldDoc.exists) {
      return jsonResponse(404, { error: 'ワールドが見つかりません' })
    }
    const worldData = worldDoc.data()!

    // nextTurnAt を Date に変換（Firestore Timestamp または Date）
    const nextTurnAt: Date =
      worldData.nextTurnAt instanceof admin.firestore.Timestamp
        ? worldData.nextTurnAt.toDate()
        : new Date(worldData.nextTurnAt)

    const secondsUntilNextTurn = Math.max(
      0,
      Math.floor((nextTurnAt.getTime() - Date.now()) / 1000)
    )

    // 3. WorldStatus を返す（200）
    logger.info('[API] ワールド状態取得', { method, path, worldId, currentTurn: worldData.currentTurn, durationMs: Date.now() - startMs })
    return jsonResponse(200, {
      worldId,
      currentTurn: worldData.currentTurn,
      nextTurnAt: nextTurnAt.toISOString(),
      secondsUntilNextTurn,
    })
  }

  // =========================================================
  // POST /slimes/initial — 初期スライム作成（冪等）
  // =========================================================
  if (method === 'POST' && path === '/slimes/initial') {
    // 1. IDトークン検証
    let uid: string
    try {
      const result = await verifyIdToken(
        event.headers['authorization'] ?? event.headers['Authorization']
      )
      uid = result.uid
    } catch (authError) {
      logger.error('[API] 認証エラー', { method, path, error: String(authError) })
      return jsonResponse(401, { error: '認証に失敗しました' })
    }

    try {
      // 2〜4. createInitialSlime でスライム作成（冪等性・マスタデータ参照はここで処理）
      // users/{uid}.mapId を取得
      const userDoc = await db.collection('users').doc(uid).get()
      const mapId: string = userDoc.exists ? (userDoc.data()!['mapId'] as string) ?? 'world-001' : 'world-001'

      const newSlime = await createInitialSlime({ ownerUid: uid, mapId, worldId: 'world-001' })

      if (newSlime === null) {
        return jsonResponse(409, { error: 'すでにスライムを所持しています' })
      }

      // 5. 作成したスライムデータを返す（201）
      logger.info('[API] 初期スライム作成完了', { method, path, uid, slimeId: newSlime.id, durationMs: Date.now() - startMs })
      return jsonResponse(201, {
        ...newSlime,
        createdAt: newSlime.createdAt instanceof Date ? newSlime.createdAt.toISOString() : String(newSlime.createdAt),
        updatedAt: newSlime.updatedAt instanceof Date ? newSlime.updatedAt.toISOString() : String(newSlime.updatedAt),
      })
    } catch (slimeError) {
      logger.error('[API] 初期スライム作成エラー', { method, path, uid, error: String(slimeError) })
      return jsonResponse(500, { error: 'サーバーエラーが発生しました' })
    }
  }

  // =========================================================
  // GET /public/encyclopedia — スライム図鑑（認証不要）
  // =========================================================
  if (method === 'GET' && path === '/public/encyclopedia') {
    const publicSpecies = slimeSpecies.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      baseStats: {
        hp: s.baseStats.hp,
        atk: s.baseStats.atk,
        def: s.baseStats.def,
        spd: s.baseStats.spd,
      },
      evolutionConditions: s.evolutionConditions.map((ec) => ({
        targetSpeciesId: ec.targetSpeciesId,
      })),
    }))
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, s-maxage=3600',
      },
      body: JSON.stringify({ species: publicSpecies }),
    }
  }

  // =========================================================
  // GET /public/players/:handle — プレイヤー公開プロフィール（認証不要）
  // =========================================================
  const publicPlayerMatch = path.match(/^\/public\/players\/(.+)$/)
  if (method === 'GET' && publicPlayerMatch) {
    const paramResult = publicHandleParamSchema.safeParse({ handle: publicPlayerMatch[1] })
    if (!paramResult.success) {
      return jsonResponse(400, { error: 'ハンドルの形式が不正です' })
    }
    const { handle } = paramResult.data

    // publicHandles/{handle} から uid を逆引き
    const handleDoc = await db.collection('publicHandles').doc(handle).get()
    if (!handleDoc.exists) {
      return jsonResponse(404, { error: 'プレイヤーが見つかりません' })
    }
    const uid = (handleDoc.data() as { uid: string }).uid

    // publicProfiles/{uid} を取得
    const profileDoc = await db.collection('publicProfiles').doc(uid).get()
    if (!profileDoc.exists) {
      return jsonResponse(404, { error: 'プロフィールが見つかりません' })
    }
    const profileData = profileDoc.data()!

    // ホワイトリスト方式でフィルタリング（MUST-1: uid を含めない・MUST-2）
    const publicProfile = {
      publicHandle: profileData['publicHandle'] as string,
      displayName: profileData['displayName'] as string,
      slimeSummaries: (profileData['slimeSummaries'] as unknown[] ?? []).map((s) => {
        const sl = s as Record<string, unknown>
        const stats = sl['stats'] as Record<string, number> | null | undefined
        return {
          id: sl['id'],
          name: sl['name'],
          speciesId: sl['speciesId'],
          stats: {
            hp: stats?.['hp'] ?? 0,
            atk: stats?.['atk'] ?? 0,
            def: stats?.['def'] ?? 0,
            spd: stats?.['spd'] ?? 0,
          },
          color: sl['color'] ?? null,
        }
      }),
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, s-maxage=300',
      },
      body: JSON.stringify(publicProfile),
    }
  }

  // =========================================================
  // GET /public/live — ライブ観戦フィード（認証不要）
  // =========================================================
  if (method === 'GET' && path === '/public/live') {
    const PUBLIC_EVENT_TYPES = ['evolve', 'split', 'merge', 'battle_win']

    const logsSnap = await db
      .collection('turnLogs')
      .where('actorType', '==', 'slime')
      .where('eventType', 'in', PUBLIC_EVENT_TYPES)
      .orderBy('processedAt', 'desc')
      .limit(20)
      .get()

    // slimeId → スライム公開情報のバルク取得
    const slimeIds = [...new Set(
      logsSnap.docs
        .map((d) => d.data()['slimeId'] as string | null)
        .filter((id): id is string => id != null)
    )]
    const slimeDocs: Record<string, admin.firestore.DocumentData> = {}
    if (slimeIds.length > 0) {
      const slimeSnaps = await Promise.all(
        slimeIds.map((id) => db.collection('slimes').doc(id).get())
      )
      for (const snap of slimeSnaps) {
        if (snap.exists) slimeDocs[snap.id] = snap.data()!
      }
    }

    // MUST-5: eventData をホワイトリスト方式でフィルタリング
    const PUBLIC_EVENT_DATA_KEYS: Record<string, string[]> = {
      evolve: ['previousSpeciesId', 'newSpeciesId'],
      split: [],
      merge: [],
      battle_win: [],
    }

    const PUBLIC_EVENT_TYPES_SET = new Set(PUBLIC_EVENT_TYPES)

    const events = logsSnap.docs.map((d) => {
      const data = d.data()
      const eventType = data['eventType'] as string
      // 深層防御: DBクエリフィルタをすり抜けた非公開 eventType を除去（A7/QA TC-5-09）
      if (!PUBLIC_EVENT_TYPES_SET.has(eventType)) return null
      const rawEventData = (data['eventData'] ?? {}) as Record<string, unknown>
      const allowedKeys = PUBLIC_EVENT_DATA_KEYS[eventType] ?? []
      const filteredEventData: Record<string, unknown> = {}
      for (const key of allowedKeys) {
        if (key in rawEventData) filteredEventData[key] = rawEventData[key]
      }

      const slimeId = data['slimeId'] as string | null
      const slimeData = slimeId ? slimeDocs[slimeId] : null
      const slimeSummary = slimeData
        ? {
            slimeId,
            name: slimeData['name'] as string,
            speciesId: slimeData['speciesId'] as string,
            color: (slimeData['color'] as string | undefined) ?? null,
          }
        : null

      const rawProcessedAt = data['processedAt']
      const processedAt = rawProcessedAt && typeof rawProcessedAt.toDate === 'function'
        ? rawProcessedAt.toDate().toISOString()
        : String(rawProcessedAt ?? '')

      return {
        id: d.id,
        worldId: data['worldId'] as string,
        turnNumber: data['turnNumber'] as number,
        eventType,
        eventData: filteredEventData,
        slimeSummary,
        processedAt,
      }
    }).filter((e): e is NonNullable<typeof e> => e !== null)

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=60, s-maxage=300',
      },
      body: JSON.stringify({ events }),
    }
  }

  // =========================================================
  // POST /users/handle — publicHandle 登録・変更（認証必須）
  // =========================================================
  if (method === 'POST' && path === '/users/handle') {
    // 1. IDトークン検証
    let uid: string
    try {
      const result = await verifyIdToken(
        event.headers['authorization'] ?? event.headers['Authorization']
      )
      uid = result.uid
    } catch (authError) {
      logger.error('[API] 認証エラー', { method, path, error: String(authError) })
      return jsonResponse(401, { error: '認証に失敗しました' })
    }

    // 2. バリデーション
    let body: unknown
    try {
      body = JSON.parse(event.body ?? '{}')
    } catch {
      return jsonResponse(400, { error: 'リクエストボディが不正な JSON です' })
    }
    const parseResult = registerHandleSchema.safeParse(body)
    if (!parseResult.success) {
      return jsonResponse(400, {
        error: 'バリデーションエラー',
        details: parseResult.error.flatten(),
      })
    }
    const { handle: normalizedHandle } = parseResult.data

    // 3. トランザクション: 重複チェック・30日制限・登録
    const handleRef = db.collection('publicHandles').doc(normalizedHandle)
    const profileRef = db.collection('publicProfiles').doc(uid)
    const now = admin.firestore.Timestamp.now()
    const HANDLE_CHANGE_INTERVAL_DAYS = 30

    try {
      await db.runTransaction(async (tx) => {
        const [handleDoc, profileDoc] = await Promise.all([
          tx.get(handleRef),
          tx.get(profileRef),
        ])

        // 重複チェック（自分が既に持っているhandleと同じ場合はOK）
        if (handleDoc.exists) {
          const owner = (handleDoc.data() as { uid: string }).uid
          if (owner !== uid) {
            throw Object.assign(new Error('このハンドルは既に使用されています'), { code: 409 })
          }
          // 同じhandleへの再登録は変更扱いしない（30日制限対象外）
          return
        }

        // 30日変更制限チェック
        if (profileDoc.exists) {
          const lastChanged = profileDoc.data()!['lastHandleChangedAt']
          if (lastChanged != null) {
            const lastChangedDate = lastChanged && typeof lastChanged.toDate === 'function'
              ? lastChanged.toDate()
              : new Date(lastChanged)
            const daysSince = (Date.now() - lastChangedDate.getTime()) / (1000 * 60 * 60 * 24)
            if (daysSince < HANDLE_CHANGE_INTERVAL_DAYS) {
              const nextAllowed = new Date(
                lastChangedDate.getTime() + HANDLE_CHANGE_INTERVAL_DAYS * 24 * 60 * 60 * 1000
              )
              throw Object.assign(
                new Error(`ハンドルの変更は30日に1回までです（次回変更可能日時: ${nextAllowed.toISOString()}）`),
                { code: 429, nextAllowed: nextAllowed.toISOString() }
              )
            }
          }

          // 旧ハンドルの削除
          const oldHandle = profileDoc.data()!['publicHandle'] as string | undefined
          if (oldHandle && oldHandle !== normalizedHandle) {
            tx.delete(db.collection('publicHandles').doc(oldHandle))
          }
        }

        // 新ハンドルの登録
        tx.set(handleRef, { uid, registeredAt: now })
        tx.set(profileRef, {
          publicHandle: normalizedHandle,
          displayName: profileDoc.exists
            ? (profileDoc.data()!['displayName'] ?? '')
            : '',
          slimeSummaries: profileDoc.exists
            ? (profileDoc.data()!['slimeSummaries'] ?? [])
            : [],
          lastHandleChangedAt: now,
          updatedAt: now,
        }, { merge: true })
      })
    } catch (txError) {
      const err = txError as Error & { code?: number; nextAllowed?: string }
      if (err.code === 409) return jsonResponse(409, { error: err.message })
      if (err.code === 429) {
        return jsonResponse(429, { error: err.message, nextAllowed: err.nextAllowed })
      }
      logger.error('[API] handle登録エラー', { method, path, uid, error: String(txError) })
      return jsonResponse(500, { error: 'サーバーエラーが発生しました' })
    }

    logger.info('[API] handle登録完了', { method, path, uid, handle: normalizedHandle, durationMs: Date.now() - startMs })
    return jsonResponse(200, { publicHandle: normalizedHandle })
  }

  // =========================================================
  // 404 フォールバック
  // =========================================================
  logger.warn('[API] 404 Not Found', { method, path, durationMs: Date.now() - startMs })
  return jsonResponse(404, { error: `Not found: ${method} ${path}` })

  } catch (error) {
    logger.error('[API] 予期しないエラー', { method, path, error: String(error), durationMs: Date.now() - startMs })
    return jsonResponse(500, { error: 'サーバーエラーが発生しました' })
  }
}

export { handler }
