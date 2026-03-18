/**
 * authTrigger ユニットテスト
 *
 * TDD: 実装より先にテストを書く。
 * Auth Trigger（Firebase Authentication の onCreate イベント）を対象とし、
 * 新規ユーザー登録時の Firestore 初期化ロジックを検証する。
 *
 * 実装対象ファイル（未実装）:
 *   functions/src/triggers/authTrigger.ts
 *
 * テスト実行方法:
 *   cd functions && npm test tests/unit/authTrigger.test.ts
 */

import type { Tile } from '../../shared/types/map'

// ================================================================
// firebase-functions モック
// ================================================================

// firebase-functions の auth.user().onCreate(handler) が handler を直接返すようにモックする。
// これにより、テスト内で onUserCreate(userRecord) を呼び出したとき、
// Cloud Functions のラッパーを介さずにハンドラー関数が直接実行される。
jest.mock('firebase-functions', () => {
  const onCreateFn = jest.fn((handler: (user: unknown) => Promise<void>) => handler)
  const authUserFn = jest.fn(() => ({ onCreate: onCreateFn }))
  const regionFn = jest.fn(() => ({
    auth: { user: authUserFn },
    pubsub: {
      schedule: jest.fn(() => ({
        onRun: jest.fn((handler: () => Promise<void>) => handler),
      })),
    },
  }))
  return {
    region: regionFn,
    logger: {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    },
  }
})

// ================================================================
// Firestore / firebase-admin モック
// ================================================================

const mockGet = jest.fn()
const mockSet = jest.fn()
const mockUpdate = jest.fn()
const mockCommit = jest.fn()
const mockBatch = jest.fn()
const mockCollection = jest.fn()
const mockDoc = jest.fn()
const mockRunTransaction = jest.fn()

/**
 * モック設計方針:
 *
 * 1. firebase-admin 全体を jest.mock() でモックし、Firestore への実際のアクセスを遮断する。
 * 2. db.batch() はモックの WriteBatch を返す。
 *    - batch.set() はバッファリングをシミュレートするために呼び出しを記録する。
 *    - batch.commit() は即座に解決する Promise を返す。
 * 3. db.collection().doc().set() はドキュメント作成をシミュレートする。
 * 4. authTrigger.ts 内で呼び出される admin.auth().getUser() もモックして
 *    UserRecord を返せるようにする。
 * 5. 冪等性テストでは、db.collection().doc().get() が既存ドキュメントを返すよう
 *    mockResolvedValueOnce() でコントロールする。
 */

// バッチへの set() 呼び出し回数を追跡するためのコレクタ
const batchSetCalls: Array<{ ref: unknown; data: unknown }> = []

const mockBatchInstance = {
  set: jest.fn((ref: unknown, data: unknown) => {
    batchSetCalls.push({ ref, data })
  }),
  commit: jest.fn().mockResolvedValue(undefined),
}

const mockDocRef: any = {
  set: mockSet,
  get: mockGet,
  id: 'mock-doc-id',
}
// サブコレクション（tiles など）へのチェーンアクセスをサポート
// db.collection('maps').doc(mapId).collection('tiles').doc(tileId) のような呼び出しに対応
mockDocRef.collection = jest.fn(() => ({
  doc: jest.fn(() => mockDocRef),
}))

const mockCollectionRef = {
  doc: mockDoc.mockReturnValue(mockDocRef),
}

const mockFirestore = {
  collection: mockCollection.mockReturnValue(mockCollectionRef),
  runTransaction: mockRunTransaction,
  batch: mockBatch.mockReturnValue(mockBatchInstance),
}

jest.mock('firebase-admin', () => {
  const Timestamp = {
    now: jest.fn(() => ({
      toDate: () => new Date(),
      seconds: Math.floor(Date.now() / 1000),
    })),
    fromDate: jest.fn((d: Date) => ({
      toDate: () => d,
      seconds: Math.floor(d.getTime() / 1000),
    })),
  }
  return {
    firestore: jest.fn(() => mockFirestore),
    initializeApp: jest.fn(),
    apps: [],
    app: jest.fn(),
  }
})

// ================================================================
// テスト対象のインポート（実装前なので import エラーになる場合がある — TDD の正しい姿）
// ================================================================

import { onUserCreate } from '../../functions/src/triggers/authTrigger'

// ----------------------------------------------------------------
// テスト用フィクスチャ
// ----------------------------------------------------------------

/**
 * Firebase Auth の UserRecord を模したテスト用オブジェクト
 */
function createTestUserRecord(overrides?: {
  uid?: string
  email?: string
  displayName?: string
}): { uid: string; email: string | undefined; displayName: string | undefined } {
  return {
    uid: overrides?.uid ?? 'user-test-001',
    email: overrides?.email ?? 'test@example.com',
    displayName: overrides?.displayName ?? 'テストユーザー',
  }
}

// ================================================================
// テストスイート
// ================================================================

describe('onUserCreate', () => {
  beforeEach(() => {
    // 各テスト前にモックの呼び出し履歴をリセット
    jest.clearAllMocks()
    batchSetCalls.length = 0

    // clearAllMocks でリセットされる mockReturnValue / 実装を再設定する
    mockDoc.mockReturnValue(mockDocRef)
    mockCollection.mockReturnValue(mockCollectionRef)
    mockBatch.mockReturnValue(mockBatchInstance)
    // サブコレクションチェーンの再設定（tiles などのサブコレクションアクセスに対応）
    mockDocRef.collection = jest.fn(() => ({
      doc: jest.fn(() => mockDocRef),
    }))
    mockBatchInstance.set.mockImplementation((ref: unknown, data: unknown) => {
      batchSetCalls.push({ ref, data })
    })
    mockBatchInstance.commit.mockResolvedValue(undefined)

    // デフォルトのモック設定:
    //   ドキュメントが存在しない（新規登録）状態を返す
    mockGet.mockResolvedValue({ exists: false, data: () => undefined })
    mockSet.mockResolvedValue(undefined)
  })

  // ----------------------------------------------------------------
  // テスト 1: users ドキュメントが作成される
  // ----------------------------------------------------------------
  it('新規ユーザー登録時にusersドキュメントが作成される', async () => {
    const userRecord = createTestUserRecord()
    await onUserCreate(userRecord as any)

    expect(mockCollection).toHaveBeenCalledWith('users')
    expect(mockDoc).toHaveBeenCalledWith(userRecord.uid)
    expect(mockBatchInstance.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        uid: userRecord.uid,
        email: userRecord.email,
      })
    )
  })

  // ----------------------------------------------------------------
  // テスト 2: maps ドキュメントが作成される
  // ----------------------------------------------------------------
  it('新規ユーザー登録時にmapsドキュメントが作成される', async () => {
    const userRecord = createTestUserRecord()
    await onUserCreate(userRecord as any)

    expect(mockCollection).toHaveBeenCalledWith('maps')
    expect(mockBatchInstance.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        ownerUid: userRecord.uid,
        width: 10,
        height: 10,
      })
    )
  })

  // ----------------------------------------------------------------
  // テスト 3: 10x10 = 100 件の tiles ドキュメントが作成される
  // ----------------------------------------------------------------
  it('新規ユーザー登録時に10x10=100件のtilesドキュメントが作成される', async () => {
    const userRecord = createTestUserRecord()
    await onUserCreate(userRecord as any)

    // users(1) + maps(1) + tiles(100) = 102回のbatch.set()が呼ばれること
    expect(mockBatchInstance.set).toHaveBeenCalledTimes(102)

    // tilesデータのみフィルタリング（attributesフィールドを持つものがtile）
    const tileSetCalls = batchSetCalls.filter(
      ({ data }) => (data as Tile).attributes !== undefined
    )
    expect(tileSetCalls).toHaveLength(100)

    // 全座標が (0,0)〜(9,9) を網羅しているか確認
    const coords = tileSetCalls.map(({ data }) => ({
      x: (data as Tile).x,
      y: (data as Tile).y,
    }))
    for (let x = 0; x < 10; x++) {
      for (let y = 0; y < 10; y++) {
        expect(coords).toContainEqual({ x, y })
      }
    }

    // 各タイルのattributesフィールド検証
    tileSetCalls.forEach(({ data }) => {
      const tile = data as Tile
      expect(tile.attributes).toMatchObject({ fire: 0, water: 0, earth: 0, wind: 0 })
    })
  })

  // ----------------------------------------------------------------
  // テスト 4: 同一ユーザーの二重登録は冪等に処理される
  // ----------------------------------------------------------------
  it('同一ユーザーの二重登録は冪等に処理される', async () => {
    mockGet.mockResolvedValueOnce({ exists: true, data: () => ({ uid: 'user-test-001' }) })

    const userRecord = createTestUserRecord()
    await onUserCreate(userRecord as any)

    // 既存ユーザーの場合、バッチコミットは呼ばれない
    expect(mockBatchInstance.commit).not.toHaveBeenCalled()
    expect(mockBatchInstance.set).not.toHaveBeenCalled()
  })
})
