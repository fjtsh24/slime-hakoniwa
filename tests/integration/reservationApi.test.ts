// 実行前提: Firebase Emulatorが起動していること
// FIRESTORE_EMULATOR_HOST=localhost:8080 npx jest tests/integration/reservationApi --forceExit --verbose

/**
 * POST /api/reservations 統合テスト
 *
 * Netlify Functions ハンドラー（netlify/functions/api.ts）を直接呼び出して
 * 行動予約作成エンドポイントの動作を Firestore Emulator で検証する。
 *
 * 検証シナリオ:
 *   1. 同一スライム・同一ターンへの2件目の予約作成は 409 を返す（現時点でRED）
 *   2. 異なるターンへの予約は複数作成できる（201×2）
 *   3. 異なるスライムなら同一ターンへの予約はそれぞれ作成できる（201×2）
 *   4. 認証ヘッダーなしで予約作成は 401 を返す
 *   5. 過去のターンへの予約は 400 を返す（turnNumber <= currentTurn）
 *
 * 実行方法:
 *   1. firebase emulators:start --only firestore --project slime-hakoniwa-test
 *   2. FIRESTORE_EMULATOR_HOST=localhost:8080 npx jest tests/integration/reservationApi --forceExit --verbose
 */

// ================================================================
// firebase-functions モック（turnProcessor が functions を使う場合に備えて）
// ================================================================

jest.mock('firebase-functions', () => ({
  region: jest.fn(() => ({
    auth: jest.fn(() => ({
      user: jest.fn(() => ({
        onCreate: jest.fn((h: unknown) => h),
      })),
    })),
    pubsub: {
      schedule: jest.fn(() => ({
        onRun: jest.fn((h: unknown) => h),
      })),
    },
  })),
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}))

// ================================================================
// netlify/functions/helpers/auth をモック
// verifyIdToken の実装を置き換えてテスト用 uid を返す
// ================================================================

const VALID_UID = 'reservation-test-user-001'
const VALID_UID_2 = 'reservation-test-user-002'
const VALID_TOKEN = 'valid-reservation-test-token'
const VALID_TOKEN_2 = 'valid-reservation-test-token-2'

jest.mock('../../netlify/functions/helpers/auth', () => ({
  verifyIdToken: jest.fn(async (authHeader: string | undefined) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Authorization header missing or invalid format')
    }
    const token = authHeader.slice(7)
    if (token === 'valid-reservation-test-token') {
      return { uid: 'reservation-test-user-001' }
    }
    if (token === 'valid-reservation-test-token-2') {
      return { uid: 'reservation-test-user-002' }
    }
    throw new Error('Invalid token')
  }),
}))

// ================================================================
// Emulator 接続設定
// ================================================================

import * as admin from 'firebase-admin'

const PROJECT_ID = 'slime-hakoniwa-test'

function initTestApp(): admin.app.App {
  try {
    return admin.app('reservation-api-integration-test')
  } catch {
    return admin.initializeApp(
      {
        projectId: PROJECT_ID,
        credential: admin.credential.applicationDefault(),
      },
      'reservation-api-integration-test'
    )
  }
}

let app: admin.app.App
let db: admin.firestore.Firestore

// ================================================================
// テスト対象のインポート（admin 初期化後に必要）
// ================================================================

import { handler } from '../../netlify/functions/api'
import type { HandlerEvent } from '@netlify/functions'

// ================================================================
// テスト用定数
// ================================================================

const WORLD_ID = 'world-reservation-test'
const SLIME_ID_1 = 'slime-res-test-001'
const SLIME_ID_2 = 'slime-res-test-002'
const CURRENT_TURN = 5

// ================================================================
// ヘルパー
// ================================================================

function makeReservationEvent(
  overrides: Partial<HandlerEvent> = {},
  body: Record<string, unknown> = {}
): HandlerEvent {
  const defaultBody = {
    slimeId: SLIME_ID_1,
    worldId: WORLD_ID,
    turnNumber: CURRENT_TURN + 1,
    actionType: 'rest',
    actionData: {},
  }
  return {
    httpMethod: 'POST',
    path: '/.netlify/functions/api/api/reservations',
    headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    body: JSON.stringify({ ...defaultBody, ...body }),
    isBase64Encoded: false,
    rawUrl: '',
    rawQuery: '',
    ...overrides,
  }
}

async function clearCollection(collectionName: string): Promise<void> {
  const snap = await db.collection(collectionName).get()
  if (snap.empty) return
  const batch = db.batch()
  snap.docs.forEach((doc) => batch.delete(doc.ref))
  await batch.commit()
}

async function setupWorld(): Promise<void> {
  const now = new Date()
  const oneHourLater = new Date(now.getTime() + 3600 * 1000)
  await db.collection('worlds').doc(WORLD_ID).set({
    id: WORLD_ID,
    name: '予約テスト用ワールド',
    currentTurn: CURRENT_TURN,
    nextTurnAt: admin.firestore.Timestamp.fromDate(oneHourLater),
    turnIntervalSec: 3600,
    createdAt: admin.firestore.Timestamp.fromDate(now),
  })
}

async function setupSlime(
  slimeId: string,
  ownerUid: string
): Promise<void> {
  const now = new Date()
  await db.collection('slimes').doc(slimeId).set({
    id: slimeId,
    ownerUid,
    mapId: 'map-001',
    worldId: WORLD_ID,
    speciesId: 'slime-001',
    tileX: 0,
    tileY: 0,
    name: `テストスライム-${slimeId}`,
    stats: { hp: 50, atk: 10, def: 10, spd: 10, exp: 0, hunger: 80 },
    racialValues: {
      fire: 0, water: 0, earth: 0, wind: 0,
      slime: 0, plant: 0, human: 0, beast: 0, spirit: 0, fish: 0,
    },
    isWild: false,
    createdAt: admin.firestore.Timestamp.fromDate(now),
    updatedAt: admin.firestore.Timestamp.fromDate(now),
  })
}

// ================================================================
// セットアップ / ティアダウン
// ================================================================

beforeAll(() => {
  app = initTestApp()
  db = app.firestore()
  db.settings({ host: 'localhost:8080', ssl: false })
})

beforeEach(async () => {
  await clearCollection('actionReservations')
  await clearCollection('worlds')
  await clearCollection('slimes')

  // 各テストで共通して使うワールドとスライムをセットアップ
  await setupWorld()
  await setupSlime(SLIME_ID_1, VALID_UID)
  await setupSlime(SLIME_ID_2, VALID_UID_2)
})

afterAll(async () => {
  await app.delete()
})

// ================================================================
// テストスイート
// ================================================================

describe('POST /api/reservations', () => {
  // ----------------------------------------------------------------
  // テスト 1: 同一スライム・同一ターンへの2件目の予約は 409 を返す
  // ※ このテストは現時点でREDになることが期待される（APIが未修正のため）
  // ----------------------------------------------------------------
  it('同一スライム・同一ターンへの2件目の予約作成は 409 を返す', async () => {
    const body = {
      slimeId: SLIME_ID_1,
      worldId: WORLD_ID,
      turnNumber: CURRENT_TURN + 1,
      actionType: 'rest',
      actionData: {},
    }

    // 1件目：正常に作成される
    const first = await handler(makeReservationEvent({}, body), {} as never)
    expect(first?.statusCode).toBe(201)

    // 2件目：同一スライム・同一ターンへの予約は 409 を返すべき
    const second = await handler(makeReservationEvent({}, body), {} as never)
    expect(second?.statusCode).toBe(409)

    // Firestore の予約は1件のみ
    const reservations = await db
      .collection('actionReservations')
      .where('slimeId', '==', SLIME_ID_1)
      .where('turnNumber', '==', CURRENT_TURN + 1)
      .get()
    expect(reservations.size).toBe(1)
  })

  // ----------------------------------------------------------------
  // テスト 2: 異なるターンへの予約は複数作成できる
  // ----------------------------------------------------------------
  it('異なるターンへの予約は複数作成できる（同一スライムでターンが違えば 201×2）', async () => {
    const bodyTurn1 = {
      slimeId: SLIME_ID_1,
      worldId: WORLD_ID,
      turnNumber: CURRENT_TURN + 1,
      actionType: 'rest',
      actionData: {},
    }
    const bodyTurn2 = {
      slimeId: SLIME_ID_1,
      worldId: WORLD_ID,
      turnNumber: CURRENT_TURN + 2,
      actionType: 'rest',
      actionData: {},
    }

    const first = await handler(makeReservationEvent({}, bodyTurn1), {} as never)
    expect(first?.statusCode).toBe(201)

    const second = await handler(makeReservationEvent({}, bodyTurn2), {} as never)
    expect(second?.statusCode).toBe(201)

    // Firestore に2件の予約が存在する
    const reservations = await db
      .collection('actionReservations')
      .where('slimeId', '==', SLIME_ID_1)
      .where('status', '==', 'pending')
      .get()
    expect(reservations.size).toBe(2)
  })

  // ----------------------------------------------------------------
  // テスト 3: 異なるスライムなら同一ターンへの予約はそれぞれ作成できる
  // ----------------------------------------------------------------
  it('異なるスライムなら同一ターンへの予約はそれぞれ作成できる（slimeId が違えば 201×2）', async () => {
    const turnNumber = CURRENT_TURN + 1

    // スライム1（ユーザー1）の予約
    const bodySlime1 = {
      slimeId: SLIME_ID_1,
      worldId: WORLD_ID,
      turnNumber,
      actionType: 'rest',
      actionData: {},
    }
    const first = await handler(makeReservationEvent({}, bodySlime1), {} as never)
    expect(first?.statusCode).toBe(201)

    // スライム2（ユーザー2）の予約 — 別トークンで認証
    const bodySlime2 = {
      slimeId: SLIME_ID_2,
      worldId: WORLD_ID,
      turnNumber,
      actionType: 'rest',
      actionData: {},
    }
    const second = await handler(
      makeReservationEvent(
        { headers: { Authorization: `Bearer ${VALID_TOKEN_2}` } },
        bodySlime2
      ),
      {} as never
    )
    expect(second?.statusCode).toBe(201)

    // Firestore に2件の予約（slimeId がそれぞれ異なる）
    const snap = await db
      .collection('actionReservations')
      .where('turnNumber', '==', turnNumber)
      .where('status', '==', 'pending')
      .get()
    expect(snap.size).toBe(2)
    const slimeIds = snap.docs.map((d) => d.data().slimeId)
    expect(slimeIds).toContain(SLIME_ID_1)
    expect(slimeIds).toContain(SLIME_ID_2)
  })

  // ----------------------------------------------------------------
  // テスト 4: 認証ヘッダーなしで予約作成は 401 を返す
  // ----------------------------------------------------------------
  it('認証ヘッダーがない場合は 401 を返す', async () => {
    const event = makeReservationEvent({ headers: {} })
    const response = await handler(event, {} as never)

    expect(response?.statusCode).toBe(401)
    const body = JSON.parse(response?.body ?? '{}')
    expect(body.error).toBeDefined()
  })

  // ----------------------------------------------------------------
  // テスト 5: 過去のターンへの予約は 400 を返す
  // ----------------------------------------------------------------
  it('過去のターン（turnNumber <= currentTurn）への予約は 400 を返す', async () => {
    // currentTurn と同じターン番号（境界値）
    const bodyCurrentTurn = {
      slimeId: SLIME_ID_1,
      worldId: WORLD_ID,
      turnNumber: CURRENT_TURN, // <= currentTurn なので400
      actionType: 'rest',
      actionData: {},
    }
    const responseCurrentTurn = await handler(
      makeReservationEvent({}, bodyCurrentTurn),
      {} as never
    )
    expect(responseCurrentTurn?.statusCode).toBe(400)
    const bodyCurrentTurnParsed = JSON.parse(responseCurrentTurn?.body ?? '{}')
    expect(bodyCurrentTurnParsed.error).toBeDefined()

    // currentTurn より前のターン番号
    const bodyPastTurn = {
      slimeId: SLIME_ID_1,
      worldId: WORLD_ID,
      turnNumber: CURRENT_TURN - 1,
      actionType: 'rest',
      actionData: {},
    }
    const responsePastTurn = await handler(
      makeReservationEvent({}, bodyPastTurn),
      {} as never
    )
    expect(responsePastTurn?.statusCode).toBe(400)

    // Firestore に予約が作成されていないことを確認
    const reservations = await db.collection('actionReservations').get()
    expect(reservations.empty).toBe(true)
  })
})
