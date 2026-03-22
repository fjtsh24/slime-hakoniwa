/**
 * Dev-only チートAPI
 *
 * 開発環境（FIRESTORE_EMULATOR_HOST が設定されている場合）のみ有効。
 * 本番環境では全リクエストに 403 を返す。
 *
 * エンドポイント:
 *   GET  /dev-cheat/status          — dev モード確認
 *   GET  /dev-cheat/slimes?worldId= — ワールド内スライム一覧
 *   POST /dev-cheat/set-slime       — スライムのステータス・種族値・スキルを上書き
 *   POST /dev-cheat/force-turn      — 指定ワールドのターン処理を即時実行
 *   POST /dev-cheat/set-world       — ワールドの季節・天候を直接書き換え
 */

import type { Handler, HandlerResponse } from '@netlify/functions'
import * as admin from 'firebase-admin'
import { processWorldTurn } from '../../functions/src/scheduled/turnProcessor'
import { logger } from '../../shared/lib/logger'

// ----------------------------------------------------------------
// 本番ガード: エミュレータ接続でなければ 403 を返す
// ----------------------------------------------------------------
function isDevMode(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST)
}

// Firebase Admin SDK 初期化
if (admin.apps.length === 0) {
  const serviceAccountKey = process.env.FIREBASE_ADMIN_SDK_SERVICE_ACCOUNT_KEY
  if (serviceAccountKey) {
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountKey)) })
  } else {
    admin.initializeApp()
  }
}

const db = admin.firestore()

function json(statusCode: number, body: unknown): HandlerResponse {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

// ----------------------------------------------------------------
// ハンドラ
// ----------------------------------------------------------------
const handler: Handler = async (event): Promise<HandlerResponse> => {
  if (!isDevMode()) {
    return json(403, { error: 'dev-cheat は開発環境専用です' })
  }

  const rawPath = event.path.replace(/^\/.netlify\/functions\/[^/]+/, '')
  const path = rawPath.replace(/^\/dev-cheat/, '') || '/'
  const method = event.httpMethod

  logger.info('[dev-cheat]', { method, path })

  try {
    // GET /dev-cheat/status
    if (method === 'GET' && path === '/status') {
      return json(200, {
        devMode: true,
        emulatorHost: process.env.FIRESTORE_EMULATOR_HOST,
        message: 'dev-cheat API は有効です',
      })
    }

    // GET /dev-cheat/slimes?worldId=xxx
    if (method === 'GET' && path === '/slimes') {
      const worldId = event.queryStringParameters?.worldId
      if (!worldId) return json(400, { error: 'worldId が必要です' })

      const snap = await db
        .collection('slimes')
        .where('worldId', '==', worldId)
        .get()

      const slimes = snap.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          name: data.name,
          speciesId: data.speciesId,
          ownerUid: data.ownerUid,
          stats: data.stats,
          racialValues: data.racialValues,
          skillIds: data.skillIds ?? [],
        }
      })
      return json(200, { slimes })
    }

    // POST /dev-cheat/set-slime
    if (method === 'POST' && path === '/set-slime') {
      const body = JSON.parse(event.body ?? '{}') as {
        slimeId?: string
        stats?: Partial<{
          hp: number; atk: number; def: number
          spd: number; exp: number; hunger: number
        }>
        racialValues?: Partial<{
          fire: number; water: number; earth: number; wind: number
          slime: number; plant: number; human: number
          beast: number; spirit: number; fish: number
        }>
        skillIds?: string[]
        speciesId?: string
      }

      if (!body.slimeId) return json(400, { error: 'slimeId が必要です' })

      const ref = db.collection('slimes').doc(body.slimeId)
      const snap = await ref.get()
      if (!snap.exists) return json(404, { error: 'スライムが見つかりません' })

      const current = snap.data()!
      const updates: Record<string, unknown> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }

      if (body.stats) {
        updates['stats'] = { ...current['stats'], ...body.stats }
      }
      if (body.racialValues) {
        updates['racialValues'] = { ...current['racialValues'], ...body.racialValues }
      }
      if (body.skillIds !== undefined) {
        updates['skillIds'] = body.skillIds
      }
      if (body.speciesId !== undefined) {
        updates['speciesId'] = body.speciesId
      }

      await ref.update(updates)

      const updated = (await ref.get()).data()
      return json(200, {
        message: 'スライムを更新しました',
        slimeId: body.slimeId,
        stats: updated?.['stats'],
        racialValues: updated?.['racialValues'],
        skillIds: updated?.['skillIds'],
        speciesId: updated?.['speciesId'],
      })
    }

    // POST /dev-cheat/force-turn
    if (method === 'POST' && path === '/force-turn') {
      const body = JSON.parse(event.body ?? '{}') as { worldId?: string }
      if (!body.worldId) return json(400, { error: 'worldId が必要です' })

      const worldRef = db.collection('worlds').doc(body.worldId)
      const worldSnap = await worldRef.get()
      if (!worldSnap.exists) return json(404, { error: 'ワールドが見つかりません' })

      const before = worldSnap.data()!['currentTurn'] as number

      // nextTurnAt を過去に書き換えて「時間未到達」ガードを回避する
      await worldRef.update({ nextTurnAt: new Date(0) })

      logger.info('[dev-cheat] force-turn 開始', { worldId: body.worldId, currentTurn: before })
      await processWorldTurn(body.worldId)

      const after = (await db.collection('worlds').doc(body.worldId).get()).data()!['currentTurn'] as number

      return json(200, {
        message: `ターン処理を実行しました (Turn ${before} → ${after})`,
        worldId: body.worldId,
        turnBefore: before,
        turnAfter: after,
      })
    }

    // POST /dev-cheat/set-world
    if (method === 'POST' && path === '/set-world') {
      const body = JSON.parse(event.body ?? '{}') as {
        worldId?: string
        season?: 'spring' | 'summer' | 'autumn' | 'winter'
        weather?: 'sunny' | 'rainy' | 'stormy' | 'foggy'
        weatherEndsAtTurn?: number
      }

      if (!body.worldId) return json(400, { error: 'worldId が必要です' })

      const worldRef = db.collection('worlds').doc(body.worldId)
      const worldSnap = await worldRef.get()
      if (!worldSnap.exists) return json(404, { error: 'ワールドが見つかりません' })

      const currentTurn = worldSnap.data()!['currentTurn'] as number
      const updates: Record<string, unknown> = {}

      if (body.season !== undefined) {
        updates['season'] = body.season
        updates['seasonStartTurn'] = currentTurn
      }
      if (body.weather !== undefined) {
        updates['weather'] = body.weather
        // weatherEndsAtTurn が未指定の場合は currentTurn + 10 をデフォルトとする
        updates['weatherEndsAtTurn'] = body.weatherEndsAtTurn ?? currentTurn + 10
      }

      if (Object.keys(updates).length === 0) {
        return json(400, { error: 'season または weather のいずれかを指定してください' })
      }

      await worldRef.update(updates)

      return json(200, {
        message: 'ワールドを更新しました',
        worldId: body.worldId,
        currentTurn,
        ...updates,
      })
    }

    // POST /dev-cheat/set-inventory
    if (method === 'POST' && path === '/set-inventory') {
      const body = JSON.parse(event.body ?? '{}') as {
        slimeId?: string
        addItems?: { foodId: string; quantity: number }[]
        inventory?: { foodId: string; quantity: number }[]
      }

      if (!body.slimeId) return json(400, { error: 'slimeId が必要です' })
      if (!body.addItems && !body.inventory) return json(400, { error: 'addItems または inventory が必要です' })

      const ref = db.collection('slimes').doc(body.slimeId)
      const snap = await ref.get()
      if (!snap.exists) return json(404, { error: 'スライムが見つかりません' })

      let newInventory: { foodId: string; quantity: number }[]

      if (body.inventory !== undefined) {
        newInventory = body.inventory
      } else {
        const current = (snap.data()!['inventory'] ?? []) as { foodId: string; quantity: number }[]
        const map = new Map<string, number>(current.map((s) => [s.foodId, s.quantity]))
        for (const item of body.addItems!) {
          map.set(item.foodId, (map.get(item.foodId) ?? 0) + item.quantity)
        }
        newInventory = Array.from(map.entries())
          .filter(([, qty]) => qty > 0)
          .map(([foodId, quantity]) => ({ foodId, quantity }))
      }

      await ref.update({
        inventory: newInventory,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      return json(200, {
        message: `インベントリを更新しました（${newInventory.length}種）`,
        slimeId: body.slimeId,
        inventory: newInventory,
      })
    }

    return json(404, { error: `不明なパス: ${path}` })
  } catch (err) {
    logger.error('[dev-cheat] エラー', { err })
    return json(500, { error: String(err) })
  }
}

export { handler }
