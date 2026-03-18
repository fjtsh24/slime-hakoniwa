// 実行前提: Firebase Emulatorが起動していること
// FIRESTORE_EMULATOR_HOST=localhost:8080 npx jest tests/integration/slimeInitial

/**
 * POST /api/slimes/initial 統合テスト
 *
 * Netlify Functions ハンドラー（netlify/functions/api.ts）を直接呼び出して
 * スライム初回作成エンドポイントの動作を Firestore Emulator で検証する。
 *
 * 検証シナリオ:
 *   1. 認証ヘッダーなし → 401
 *   2. 正常系（初回） → 201 + Firestore にスライムが作成される
 *   3. 既存スライムあり → 409
 *   4. 並行リクエスト → スライムは1体のみ作成される（TOCTTOU 対策確認）
 *
 * 実行方法:
 *   1. firebase emulators:start --only firestore --project slime-hakoniwa-test
 *   2. FIRESTORE_EMULATOR_HOST=localhost:8080 npx jest tests/integration/slimeInitial --forceExit --verbose
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

const VALID_UID = 'integration-test-user-001'
const VALID_TOKEN = 'valid-test-token'
const INVALID_TOKEN = 'invalid-token'

jest.mock('../../netlify/functions/helpers/auth', () => ({
  verifyIdToken: jest.fn(async (authHeader: string | undefined) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new Error('Authorization header missing or invalid format')
    }
    const token = authHeader.slice(7)
    if (token !== VALID_TOKEN) {
      throw new Error('Invalid token')
    }
    return { uid: VALID_UID }
  }),
}))

// ================================================================
// Emulator 接続設定
// ================================================================

import * as admin from 'firebase-admin'

const PROJECT_ID = 'slime-hakoniwa-test'

function initTestApp(): admin.app.App {
  try {
    return admin.app('slime-initial-integration-test')
  } catch {
    return admin.initializeApp(
      {
        projectId: PROJECT_ID,
        credential: admin.credential.applicationDefault(),
      },
      'slime-initial-integration-test'
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
// ヘルパー
// ================================================================

function makeEvent(overrides: Partial<HandlerEvent> = {}): HandlerEvent {
  return {
    httpMethod: 'POST',
    path: '/.netlify/functions/api/api/slimes/initial',
    headers: { Authorization: `Bearer ${VALID_TOKEN}` },
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    body: null,
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

// ================================================================
// セットアップ / ティアダウン
// ================================================================

beforeAll(() => {
  app = initTestApp()
  db = app.firestore()
  db.settings({ host: 'localhost:8080', ssl: false })
})

beforeEach(async () => {
  await clearCollection('slimes')
  await clearCollection('users')
})

afterAll(async () => {
  await app.delete()
})

// ================================================================
// テストスイート
// ================================================================

describe('POST /api/slimes/initial', () => {
  // ----------------------------------------------------------------
  // テスト 1: 認証ヘッダーなし → 401
  // ----------------------------------------------------------------
  it('認証ヘッダーがない場合は 401 を返す', async () => {
    const event = makeEvent({ headers: {} })
    const response = await handler(event, {} as never)

    expect(response?.statusCode).toBe(401)
    const body = JSON.parse(response?.body ?? '{}')
    expect(body.error).toBeDefined()
  })

  // ----------------------------------------------------------------
  // テスト 2: 不正なトークン → 401
  // ----------------------------------------------------------------
  it('不正なトークンの場合は 401 を返す', async () => {
    const event = makeEvent({ headers: { Authorization: `Bearer ${INVALID_TOKEN}` } })
    const response = await handler(event, {} as never)

    expect(response?.statusCode).toBe(401)
  })

  // ----------------------------------------------------------------
  // テスト 3: 正常系（初回作成） → 201
  // ----------------------------------------------------------------
  it('初回スライム作成が成功すると 201 を返し Firestore にスライムが存在する', async () => {
    const event = makeEvent()
    const response = await handler(event, {} as never)

    expect(response?.statusCode).toBe(201)

    const body = JSON.parse(response?.body ?? '{}')
    expect(body.ownerUid).toBe(VALID_UID)
    expect(body.speciesId).toBe('slime-001')
    expect(body.id).toBeDefined()

    // Firestore にスライムが作成されていることを確認
    const slimeSnap = await db.collection('slimes').where('ownerUid', '==', VALID_UID).get()
    expect(slimeSnap.size).toBe(1)
    expect(slimeSnap.docs[0].data().speciesId).toBe('slime-001')
  })

  // ----------------------------------------------------------------
  // テスト 4: 既存スライムあり → 409
  // ----------------------------------------------------------------
  it('既にスライムがいる場合は 409 を返す', async () => {
    // 1回目：スライム作成
    const first = await handler(makeEvent(), {} as never)
    expect(first?.statusCode).toBe(201)

    // 2回目：同じユーザーで再度リクエスト
    const second = await handler(makeEvent(), {} as never)
    expect(second?.statusCode).toBe(409)

    // Firestore のスライムは1体のみ
    const slimeSnap = await db.collection('slimes').where('ownerUid', '==', VALID_UID).get()
    expect(slimeSnap.size).toBe(1)
  })

  // ----------------------------------------------------------------
  // テスト 5: 並行リクエスト → スライムは1体のみ（TOCTTOU 対策）
  // ----------------------------------------------------------------
  it('並行リクエストでもスライムは1体のみ作成される', async () => {
    const requests = Array.from({ length: 5 }, () => handler(makeEvent(), {} as never))
    const responses = await Promise.all(requests)

    const created = responses.filter((r) => r?.statusCode === 201)
    const conflict = responses.filter((r) => r?.statusCode === 409)

    expect(created.length).toBe(1)
    expect(conflict.length).toBe(4)

    // Firestore のスライムは1体のみ
    const slimeSnap = await db.collection('slimes').where('ownerUid', '==', VALID_UID).get()
    expect(slimeSnap.size).toBe(1)
  })
})
