/**
 * slimeTrigger ユニットテスト（Phase 6 Week 1）
 *
 * テスト観点:
 *   - ownerUid 取得できない場合のスキップ
 *   - publicProfile 未登録ユーザーのスキップ
 *   - スライム作成・更新・削除時の slimeSummaries 再構築
 *   - isWild=true スライムの除外
 *   - stats=null 破損データのデフォルト値処理
 *   - ホワイトリスト: exp/hunger/racialValues 等が slimeSummaries に含まれないこと
 */

// ================================================================
// firebase-admin モック
// ================================================================

const mockProfileGet = jest.fn()
const mockProfileUpdate = jest.fn()
const mockSlimesQuery = {
  where: jest.fn().mockReturnThis(),
  get: jest.fn(),
}

jest.mock('firebase-admin', () => {
  const firestoreInst = {
    collection: jest.fn((name: string) => {
      if (name === 'publicProfiles') {
        return {
          doc: jest.fn(() => ({ get: mockProfileGet, update: mockProfileUpdate })),
        }
      }
      if (name === 'slimes') {
        return mockSlimesQuery
      }
      return {}
    }),
  }
  return {
    firestore: jest.fn(() => firestoreInst),
    initializeApp: jest.fn(),
    apps: ['mock'],
    credential: { cert: jest.fn() },
  }
})

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: jest.fn(() => 'mock-timestamp') },
}))

jest.mock('firebase-functions', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  region: jest.fn(() => ({
    firestore: {
      document: jest.fn(() => ({ onWrite: jest.fn() })),
    },
  })),
}))

// ================================================================
// ハンドラーのインポート（モック設定後）
// ================================================================

import { syncSlimeToPublicProfile } from '../../functions/src/triggers/slimeTrigger'

// ================================================================
// テスト用ユーティリティ
// ================================================================

function makeChange(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
) {
  return {
    before: {
      exists: before !== null,
      id: 'slime-test-id',
      data: () => before ?? undefined,
    },
    after: {
      exists: after !== null,
      id: 'slime-test-id',
      data: () => after ?? undefined,
    },
  }
}

function makeSlimeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'slime-001',
    data: () => ({
      ownerUid: 'uid-test-001',
      name: 'テストスライム',
      speciesId: 'slime-001',
      isWild: false,
      stats: { hp: 100, atk: 20, def: 15, spd: 10, exp: 500, hunger: 80 },
      racialValues: { fire: 0.5, water: 0.0, earth: 0.0, wind: 0.0, slime: 0.3, plant: 0.0, human: 0.0, beast: 0.0, spirit: 0.0, fish: 0.0 },
      skillIds: ['skill-fire-001'],
      incapacitatedUntilTurn: 0,
      color: '#ef4444',
      ...overrides,
    }),
  }
}

// ================================================================
// テスト
// ================================================================

describe('syncSlimeToPublicProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // デフォルト: publicProfile 存在
    mockProfileGet.mockResolvedValue({ exists: true })
    // デフォルト: スライム1体
    mockSlimesQuery.get.mockResolvedValue({ docs: [makeSlimeDoc()] })
  })

  it('ST-01: before/after ともに ownerUid がない場合、update を呼ばずにスキップする', async () => {
    const change = makeChange(null, null)
    await syncSlimeToPublicProfile(change)
    expect(mockProfileGet).not.toHaveBeenCalled()
    expect(mockProfileUpdate).not.toHaveBeenCalled()
  })

  it('ST-02: publicProfile が存在しないユーザーはスキップする（エラーにならない）', async () => {
    mockProfileGet.mockResolvedValue({ exists: false })
    const change = makeChange(null, { ownerUid: 'uid-no-profile', isWild: false, name: 'S', speciesId: 'slime-001', stats: {} })
    await syncSlimeToPublicProfile(change)
    expect(mockSlimesQuery.get).not.toHaveBeenCalled()
    expect(mockProfileUpdate).not.toHaveBeenCalled()
  })

  it('ST-03: スライム作成時に slimeSummaries が更新される', async () => {
    const change = makeChange(null, { ownerUid: 'uid-test-001', name: 'テストスライム', speciesId: 'slime-001', isWild: false, stats: { hp: 100, atk: 20, def: 15, spd: 10 }, color: '#ef4444' })
    await syncSlimeToPublicProfile(change)
    expect(mockProfileUpdate).toHaveBeenCalledTimes(1)
    const updateArg = mockProfileUpdate.mock.calls[0][0] as Record<string, unknown>
    expect(updateArg).toHaveProperty('slimeSummaries')
    expect(Array.isArray(updateArg['slimeSummaries'])).toBe(true)
  })

  it('ST-04: slimeSummaries にホワイトリスト外フィールド（exp/hunger/racialValues/skillIds）が含まれない', async () => {
    const change = makeChange(null, { ownerUid: 'uid-test-001', isWild: false, name: 'S', speciesId: 'slime-001', stats: {} })
    await syncSlimeToPublicProfile(change)
    const updateArg = mockProfileUpdate.mock.calls[0][0] as { slimeSummaries: Record<string, unknown>[] }
    const summary = updateArg.slimeSummaries[0]
    expect(summary).not.toHaveProperty('exp')
    expect(summary).not.toHaveProperty('hunger')
    expect(summary).not.toHaveProperty('racialValues')
    expect(summary).not.toHaveProperty('skillIds')
    expect(summary).not.toHaveProperty('incapacitatedUntilTurn')
    // UID も含まれないこと
    expect(summary).not.toHaveProperty('ownerUid')
  })

  it('ST-05: スライム削除時に beforeData の ownerUid を使い、削除されたスライムが除外された slimeSummaries で更新する', async () => {
    // スライム削除後は ownerUid のスライムが0件になった想定
    mockSlimesQuery.get.mockResolvedValue({ docs: [] })
    const change = makeChange(
      { ownerUid: 'uid-test-001', name: '削除されるスライム', speciesId: 'slime-001', isWild: false },
      null
    )
    await syncSlimeToPublicProfile(change)
    expect(mockProfileUpdate).toHaveBeenCalledTimes(1)
    const updateArg = mockProfileUpdate.mock.calls[0][0] as { slimeSummaries: unknown[] }
    expect(updateArg.slimeSummaries).toHaveLength(0)
  })

  it('ST-06: isWild=true のスライムは slimeSummaries に含まれない（Firestore クエリで除外）', async () => {
    // クエリで isWild=false のみ取得するため、where が正しいパラメータで呼ばれることを確認
    const change = makeChange(null, { ownerUid: 'uid-test-001', isWild: false, name: 'S', speciesId: 'slime-001', stats: {} })
    await syncSlimeToPublicProfile(change)
    const whereCalls = mockSlimesQuery.where.mock.calls as [string, string, unknown][]
    const hasWildFilter = whereCalls.some(
      ([field, op, val]) => field === 'isWild' && op === '==' && val === false
    )
    expect(hasWildFilter).toBe(true)
  })

  it('ST-07: stats が null の破損データはデフォルト値（hp:0 等）で処理されエラーにならない', async () => {
    mockSlimesQuery.get.mockResolvedValue({
      docs: [{ id: 'broken-slime', data: () => ({ name: '壊れたスライム', speciesId: 'slime-001', stats: null, color: null }) }],
    })
    const change = makeChange(null, { ownerUid: 'uid-test-001', isWild: false, name: 'S', speciesId: 'slime-001', stats: null })
    await syncSlimeToPublicProfile(change)
    const updateArg = mockProfileUpdate.mock.calls[0][0] as { slimeSummaries: { stats: { hp: number } }[] }
    expect(updateArg.slimeSummaries[0].stats).toEqual({ hp: 0, atk: 0, def: 0, spd: 0 })
  })
})
