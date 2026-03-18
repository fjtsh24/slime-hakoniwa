import type { Handler } from '@netlify/functions'
import * as admin from 'firebase-admin'
import { verifyIdToken } from './helpers/auth'
import {
  createReservationSchema,
  deleteReservationSchema,
} from './helpers/validation'
import { createInitialSlime } from '../../functions/src/scheduled/turnProcessor'

// Firebase Admin SDK の初期化（二重初期化を防ぐ）
if (admin.apps.length === 0) {
  admin.initializeApp()
}

const db = admin.firestore()

/** JSON レスポンスを生成するユーティリティ */
function jsonResponse(
  statusCode: number,
  body: unknown
): ReturnType<Handler> {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

const handler: Handler = async (event) => {
  try {
  // /.netlify/functions/api プレフィックスを除去し、さらに /api プレフィックスも正規化する
  // リダイレクト経由: /api/reservations → /.netlify/functions/api/reservations → path=/reservations
  // 直接呼び出し:   /.netlify/functions/api/api/reservations → path=/api/reservations → /reservations
  const funcPath = event.path.replace(/^\/.netlify\/functions\/[^/]+/, '')
  const path = funcPath.replace(/^\/api/, '') || '/'
  const method = event.httpMethod

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
      console.error('[API] 認証エラー:', authError)
      return jsonResponse(401, { error: '認証に失敗しました' })
    }

    // 2. リクエストボディを JSON パース
    let body: unknown
    try {
      body = JSON.parse(event.body ?? '{}')
    } catch (parseError) {
      console.error('[API] JSON パースエラー:', parseError)
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

    // 5-c. 1スライムあたりの pending 予約数が上限（10件）に達していないか確認
    const pendingCount = await db
      .collection('actionReservations')
      .where('slimeId', '==', slimeId)
      .where('status', '==', 'pending')
      .count()
      .get()
    if (pendingCount.data().count >= 10) {
      return jsonResponse(400, {
        error: '1スライムあたりの予約は最大10件までです',
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
      console.error('[API] 認証エラー:', authError)
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
      console.error('[API/slimes/initial] 認証エラー:', authError)
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
      return jsonResponse(201, {
        ...newSlime,
        createdAt: newSlime.createdAt instanceof Date ? newSlime.createdAt.toISOString() : String(newSlime.createdAt),
        updatedAt: newSlime.updatedAt instanceof Date ? newSlime.updatedAt.toISOString() : String(newSlime.updatedAt),
      })
    } catch (slimeError) {
      console.error('[API/slimes/initial] エラー:', slimeError)
      return jsonResponse(500, { error: 'サーバーエラーが発生しました' })
    }
  }

  // =========================================================
  // 404 フォールバック
  // =========================================================
  return jsonResponse(404, { error: `Not found: ${method} ${path}` })

  } catch (error) {
    console.error('[API] 予期しないエラー:', error)
    return jsonResponse(500, { error: 'サーバーエラーが発生しました' })
  }
}

export { handler }
