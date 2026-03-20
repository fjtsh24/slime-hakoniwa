import type { Handler, HandlerResponse } from '@netlify/functions'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import type { Slime, SlimeStats, RacialValues } from '../../shared/types/slime'
import { slimeSpecies } from '../../shared/data/slimeSpecies'
import { verifyIdToken } from './helpers/auth'
import {
  createReservationSchema,
  deleteReservationSchema,
} from './helpers/validation'
import { logger } from '../../shared/lib/logger'

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
    stats,
    racialValues,
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
    if (turnNumber > worldData.currentTurn + 50) {
      return jsonResponse(400, {
        error: '50ターン先までしか予約できません',
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
    if (pendingCount.data().count >= 50) {
      return jsonResponse(400, {
        error: '1スライムあたりの予約は最大50件までです',
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
