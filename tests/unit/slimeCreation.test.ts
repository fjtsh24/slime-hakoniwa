/**
 * スライム生成 ユニットテスト（Phase 3 TDD スケルトン）
 *
 * テスト対象（未実装）:
 *   functions/src/triggers/slimeCreation.ts — createInitialSlime
 *   または
 *   functions/src/scheduled/turnProcessor.ts — createInitialSlime（関数として追加予定）
 *
 * 実行方法:
 *   cd functions && npx jest tests/unit/slimeCreation.test.ts --verbose
 *
 * TDD 手順:
 *   1. このスケルトンの各 it() が Red（失敗）になることを確認する
 *   2. createInitialSlime を実装し Green にする
 *   3. リファクタリングして Green を維持する
 *
 * 機能要件:
 *   - ワールド開始時（または初回ゲームアクセス時）にプレイヤーへ初期スライムを付与する
 *   - 初期スライムの種族は speciesId='slime-001'（基本種スライム）固定
 *   - ownerUid はリクエストユーザーの UID
 *   - mapId は users/{uid}.mapId と一致する
 *   - 既にスライムが存在する場合は生成しない（冪等性）
 *
 * モック方針:
 *   - firebase-admin は jest.mock() で完全にモックする
 *   - Firestore への読み書きはモック関数でシミュレートする
 *   - 冪等性テストでは既存スライムが存在するケースを mockResolvedValueOnce で制御する
 */

// ================================================================
// firebase-admin モック
// ================================================================

const mockGet = jest.fn()
const mockSet = jest.fn()
const mockCommit = jest.fn()
const mockBatch = jest.fn()
const mockCollection = jest.fn()
const mockDoc = jest.fn()

const mockDocRef: any = {
  set: mockSet,
  get: mockGet,
  id: 'mock-slime-doc-id',
  collection: jest.fn(() => ({ doc: jest.fn(() => mockDocRef) })),
}

const mockCollectionRef = {
  doc: mockDoc.mockReturnValue(mockDocRef),
  where: jest.fn().mockReturnThis(),
  get: mockGet,
}

const mockBatchInstance = {
  set: jest.fn().mockReturnValue(undefined),
  commit: mockCommit.mockResolvedValue(undefined),
}

const mockRunTransaction = jest.fn()

const mockFirestore = {
  collection: mockCollection.mockReturnValue(mockCollectionRef),
  batch: mockBatch.mockReturnValue(mockBatchInstance),
  runTransaction: mockRunTransaction,
}

jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => mockFirestore),
  initializeApp: jest.fn(),
  apps: [],
  app: jest.fn(),
}))

// ================================================================
// テスト対象のインポート
// ================================================================

import { createInitialSlime } from '../../functions/src/scheduled/turnProcessor'
import type { Slime } from '../../shared/types/slime'
import { slimeSpecies } from '../../shared/data/slimeSpecies'

// ================================================================
// テスト用フィクスチャ
// ================================================================

/**
 * createInitialSlime へのリクエストを模したオブジェクト
 * Phase 3 での実際のシグネチャに合わせて調整すること
 */
interface CreateInitialSlimeRequest {
  /** スライムオーナーのUID */
  ownerUid: string
  /** オーナーのマップID（users/{uid}.mapId から取得） */
  mapId: string
  /** 所属ワールドID */
  worldId: string
}

function makeCreateRequest(overrides?: Partial<CreateInitialSlimeRequest>): CreateInitialSlimeRequest {
  return {
    ownerUid: 'user-slime-creation-001',
    mapId: 'map-slime-creation-001',
    worldId: 'world-default',
    ...overrides,
  }
}

// ================================================================
// テストスイート
// ================================================================

describe('createInitialSlime', () => {
  const mockTx = {
    get: jest.fn(),
    set: jest.fn(),
    update: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()

    // モックの再設定
    mockDoc.mockReturnValue(mockDocRef)
    mockCollection.mockReturnValue(mockCollectionRef)
    mockBatch.mockReturnValue(mockBatchInstance)

    // デフォルト: スライムが存在しない状態
    mockGet.mockResolvedValue({ empty: true, docs: [], exists: false, data: () => undefined })
    mockSet.mockResolvedValue(undefined)
    mockCommit.mockResolvedValue(undefined)

    // runTransaction: コールバックをモックトランザクションで実行する（デフォルト: スライムなし）
    mockTx.get.mockResolvedValue({ exists: false, data: () => ({ hasSlime: false }) })
    mockRunTransaction.mockImplementation((callback: (tx: typeof mockTx) => Promise<unknown>) =>
      callback(mockTx)
    )
  })

  // ----------------------------------------------------------------
  // テスト 1: speciesId=slime-001 のスライムが生成される
  // ----------------------------------------------------------------
  it('speciesId=slime-001 のスライムが生成される', async () => {
    const request = makeCreateRequest()
    const result = await createInitialSlime(request)

    expect(result).not.toBeNull()
    expect(result!.speciesId).toBe('slime-001')
    expect(mockTx.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ speciesId: 'slime-001' })
    )
  })

  // ----------------------------------------------------------------
  // テスト 2: ownerUid がリクエストユーザーのUIDになる
  // ----------------------------------------------------------------
  it('ownerUid がリクエストユーザーのUIDになる', async () => {
    const request = makeCreateRequest({ ownerUid: 'user-specific-001' })
    const result = await createInitialSlime(request)

    expect(result).not.toBeNull()
    expect(result!.ownerUid).toBe('user-specific-001')
    expect(mockTx.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ownerUid: 'user-specific-001' })
    )
  })

  // ----------------------------------------------------------------
  // テスト 3: 既にスライムが存在する場合は生成されない（冪等性）
  // ----------------------------------------------------------------
  it('既にスライムが存在する場合は生成されない（冪等性）', async () => {
    // tx.get でユーザーに hasSlime: true が返るケースをシミュレート
    mockTx.get.mockResolvedValueOnce({ exists: true, data: () => ({ hasSlime: true }) })

    const request = makeCreateRequest()
    const result = await createInitialSlime(request)

    expect(result).toBeNull()
    expect(mockTx.set).not.toHaveBeenCalled()
  })

  // ----------------------------------------------------------------
  // テスト 4: mapId が users/{uid}.mapId と一致する
  // ----------------------------------------------------------------
  it('mapId が リクエストの mapId と一致する', async () => {
    const request = makeCreateRequest({
      ownerUid: 'user-map-check-001',
      mapId: 'map-specific-001',
    })
    const result = await createInitialSlime(request)

    expect(result).not.toBeNull()
    expect(result!.mapId).toBe('map-specific-001')
    expect(mockTx.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ mapId: 'map-specific-001' })
    )
  })

  // ----------------------------------------------------------------
  // テスト 5: 生成されたスライムが SlimeSpecies の baseStats を持つ
  // ----------------------------------------------------------------
  it('生成されたスライムが slime-001 の baseStats を初期値として持つ', async () => {
    const baseSpecies = slimeSpecies.find((s) => s.id === 'slime-001')!

    const request = makeCreateRequest()
    const result = await createInitialSlime(request)

    expect(result).not.toBeNull()
    expect(result!.stats.hp).toBe(baseSpecies.baseStats.hp)
    expect(result!.stats.atk).toBe(baseSpecies.baseStats.atk)
    expect(result!.stats.def).toBe(baseSpecies.baseStats.def)
    expect(result!.stats.spd).toBe(baseSpecies.baseStats.spd)
    expect(result!.stats.hunger).toBe(baseSpecies.baseStats.hunger)
  })
})
