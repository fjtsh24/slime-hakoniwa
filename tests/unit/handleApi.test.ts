/**
 * POST /api/users/handle ユニットテスト（Phase 6 Week 1）
 *
 * テスト観点:
 *   - バリデーション（文字数・文字種）
 *   - 大文字→小文字正規化
 *   - 認証なしの401
 *   - 既存ハンドル（他ユーザー）→ 409
 *   - 30日変更制限 → 429
 *   - 新規登録成功 → 200
 */

// ================================================================
// firebase-admin モック
// ================================================================

const mockHandleDocGet = jest.fn()
const mockProfileDocGet = jest.fn()
const mockTxGet = jest.fn()
const mockTxSet = jest.fn()
const mockTxDelete = jest.fn()
const mockRunTransaction = jest.fn()

jest.mock('firebase-admin', () => {
  const firestoreInst = {
    collection: jest.fn((name: string) => {
      if (name === 'publicHandles') {
        return { doc: jest.fn(() => ({ get: mockHandleDocGet })) }
      }
      if (name === 'publicProfiles') {
        return { doc: jest.fn(() => ({ get: mockProfileDocGet })) }
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ exists: false }) })) }
    }),
    runTransaction: mockRunTransaction,
    batch: jest.fn(() => ({ set: jest.fn(), update: jest.fn(), delete: jest.fn(), commit: jest.fn() })),
  }
  return {
    firestore: Object.assign(jest.fn(() => firestoreInst), {
      Timestamp: { now: jest.fn(() => ({ toDate: () => new Date(), seconds: 0 })) },
    }),
    initializeApp: jest.fn(),
    apps: ['mock'],
    credential: { cert: jest.fn() },
  }
})

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: jest.fn() },
}))

jest.mock('../../netlify/functions/helpers/auth', () => ({
  verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-uid' }),
}))

jest.mock('../../shared/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// ================================================================
// ハンドラーのインポート（モック設定後）
// ================================================================

import { handler } from '../../netlify/functions/api'
import { verifyIdToken } from '../../netlify/functions/helpers/auth'
import type { HandlerEvent, HandlerResponse } from '@netlify/functions'

async function callHandler(event: HandlerEvent): Promise<HandlerResponse> {
  return (await handler(event, {} as never)) as HandlerResponse
}

function makeHandleEvent(body: Record<string, unknown>, withAuth = true): HandlerEvent {
  return {
    httpMethod: 'POST',
    path: '/api/users/handle',
    headers: withAuth ? { authorization: 'Bearer mock-token' } : {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    body: JSON.stringify(body),
    isBase64Encoded: false,
    rawUrl: 'http://localhost',
    rawQuery: '',
  }
}

/** 新規登録が成功するトランザクションモック（handleDoc・profileDoc どちらも存在しない） */
function setupSuccessTransaction() {
  mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
    const tx = {
      get: mockTxGet,
      set: mockTxSet,
      delete: mockTxDelete,
    }
    // handleDoc.exists=false, profileDoc.exists=false の順で返す
    mockTxGet
      .mockResolvedValueOnce({ exists: false })
      .mockResolvedValueOnce({ exists: false, data: () => ({}) })
    return fn(tx)
  })
}

// ================================================================
// テスト
// ================================================================

describe('POST /api/users/handle', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(verifyIdToken as jest.Mock).mockResolvedValue({ uid: 'test-uid' })
  })

  // ── バリデーション ──────────────────────────────────────────

  it('HA-01: 認証なし（Authorization ヘッダーなし）→ 401', async () => {
    ;(verifyIdToken as jest.Mock).mockRejectedValue(new Error('unauthorized'))
    const res = await callHandler(makeHandleEvent({ handle: 'validhandle' }))
    expect(res.statusCode).toBe(401)
  })

  it('HA-02: 2文字以下のハンドル → 400', async () => {
    const res = await callHandler(makeHandleEvent({ handle: 'ab' }))
    expect(res.statusCode).toBe(400)
  })

  it('HA-03: 33文字以上のハンドル → 400', async () => {
    const res = await callHandler(makeHandleEvent({ handle: 'a'.repeat(33) }))
    expect(res.statusCode).toBe(400)
  })

  it('HA-04: 特殊文字を含むハンドル（@）→ 400', async () => {
    const res = await callHandler(makeHandleEvent({ handle: 'hello@world' }))
    expect(res.statusCode).toBe(400)
  })

  it('HA-05: 大文字を含む場合、lowercase 正規化して登録される', async () => {
    setupSuccessTransaction()
    const res = await callHandler(makeHandleEvent({ handle: 'MyHandle' }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!) as { publicHandle: string }
    expect(body.publicHandle).toBe('myhandle')
  })

  // ── トランザクション結果 ────────────────────────────────────

  it('HA-06: 既存ハンドル（他ユーザー所有）→ 409', async () => {
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        get: mockTxGet,
        set: mockTxSet,
        delete: mockTxDelete,
      }
      // handleDoc は存在し、別ユーザーが所有
      mockTxGet
        .mockResolvedValueOnce({ exists: true, data: () => ({ uid: 'other-uid' }) })
        .mockResolvedValueOnce({ exists: false, data: () => ({}) })
      return fn(tx)
    })
    const res = await callHandler(makeHandleEvent({ handle: 'taken-handle' }))
    expect(res.statusCode).toBe(409)
  })

  it('HA-07: 30日以内に変更済み → 429（nextAllowed が返る）', async () => {
    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        get: mockTxGet,
        set: mockTxSet,
        delete: mockTxDelete,
      }
      const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) // 5日前
      mockTxGet
        .mockResolvedValueOnce({ exists: false }) // handleDoc なし
        .mockResolvedValueOnce({
          exists: true,
          data: () => ({
            publicHandle: 'old-handle',
            lastHandleChangedAt: {
              toDate: () => recentDate,
              instanceof: () => true,
            },
          }),
        })
      return fn(tx)
    })
    const res = await callHandler(makeHandleEvent({ handle: 'new-handle' }))
    expect(res.statusCode).toBe(429)
    const body = JSON.parse(res.body!) as { nextAllowed: string }
    expect(body).toHaveProperty('nextAllowed')
  })

  it('HA-08: 正常な新規ハンドル登録 → 200 + publicHandle 返却', async () => {
    setupSuccessTransaction()
    const res = await callHandler(makeHandleEvent({ handle: 'my-handle-01' }))
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!) as { publicHandle: string }
    expect(body.publicHandle).toBe('my-handle-01')
    expect(mockTxSet).toHaveBeenCalled()
  })
})
