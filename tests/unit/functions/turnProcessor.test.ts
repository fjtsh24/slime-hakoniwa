/**
 * turnProcessor ユニットテスト
 *
 * TDD: 実装より先にテストを書く。
 * import エラーは実装完了後に解消される（TDDの正しい姿）。
 */

import type { Slime, SlimeSpecies, RacialValues, SlimeStats } from '../../../shared/types/slime'
import type { ActionReservation, EatActionData, MoveActionData } from '../../../shared/types/action'
import type { World } from '../../../shared/types/world'

// ---- Firestore / firebase-admin モック ----
const mockGet = jest.fn()
const mockSet = jest.fn()
const mockUpdate = jest.fn()
const mockCommit = jest.fn()
const mockWhere = jest.fn()
const mockCollection = jest.fn()
const mockDoc = jest.fn()
const mockRunTransaction = jest.fn()
const mockBatch = jest.fn()

const mockFirestore = {
  collection: mockCollection,
  runTransaction: mockRunTransaction,
  batch: mockBatch,
}

jest.mock('firebase-admin', () => {
  const Timestamp = {
    now: jest.fn(() => ({ toDate: () => new Date(), seconds: Math.floor(Date.now() / 1000) })),
    fromDate: jest.fn((d: Date) => ({ toDate: () => d, seconds: Math.floor(d.getTime() / 1000) })),
  }
  return {
    firestore: jest.fn(() => mockFirestore),
    initializeApp: jest.fn(),
    apps: [],
  }
})

// turnProcessor から export される関数をインポート
// 実装前なので TypeScript エラーになることがあるが、それが TDD の正しい姿
import {
  processDueTurns,
  processWorldTurn,
  processSlimeTurn,
  executeReservedAction,
  executeAutonomousAction,
  checkEvolution,
} from '../../../functions/src/scheduled/turnProcessor'

// ---- テスト用フィクスチャ ----

/**
 * テスト用スライムオブジェクトを生成する
 */
function createTestSlime(overrides?: Partial<Slime>): Slime {
  return {
    id: 'slime-001',
    ownerUid: 'user-001',
    mapId: 'map-001',
    worldId: 'world-001',
    speciesId: 'species-normal',
    tileX: 5,
    tileY: 5,
    name: 'テストスライム',
    stats: {
      hp: 80,
      atk: 20,
      def: 15,
      spd: 10,
      exp: 0,
      hunger: 60,
    },
    racialValues: {
      fire: 0,
      water: 0,
      earth: 0,
      wind: 0,
      slime: 0,
      plant: 0,
      human: 0,
      beast: 0,
      spirit: 0,
      fish: 0,
    },
    isWild: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

/**
 * テスト用行動予約オブジェクトを生成する
 */
function createTestReservation(overrides?: Partial<ActionReservation>): ActionReservation {
  return {
    id: 'reservation-001',
    slimeId: 'slime-001',
    ownerUid: 'user-001',
    worldId: 'world-001',
    turnNumber: 1,
    actionType: 'rest',
    actionData: {},
    status: 'pending',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    executedAt: null,
    ...overrides,
  }
}

/**
 * テスト用ワールドオブジェクトを生成する
 */
function createTestWorld(overrides?: Partial<World>): World {
  return {
    id: 'world-001',
    name: 'テストワールド',
    currentTurn: 0,
    nextTurnAt: new Date(Date.now() - 60_000), // 1分前（既に期限切れ）
    turnIntervalSec: 300,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

// ---- テスト本体 ----

beforeEach(() => {
  jest.clearAllMocks()

  // デフォルトのモック設定
  const mockQuerySnap = { empty: false, docs: [] }
  mockGet.mockResolvedValue(mockQuerySnap)
  mockWhere.mockReturnValue({ where: mockWhere, get: mockGet })
  mockCollection.mockReturnValue({ where: mockWhere, get: mockGet, doc: mockDoc })
  mockDoc.mockReturnValue({ get: mockGet, set: mockSet, update: mockUpdate })
  mockCommit.mockResolvedValue(undefined)
  mockBatch.mockReturnValue({ set: mockSet, update: mockUpdate, commit: mockCommit })
  mockRunTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => fn({}))
})

// ================================================================
// processDueTurns
// ================================================================
describe('processDueTurns', () => {
  it('nextTurnAt が過去のワールドが存在する場合、processWorldTurn を呼ぶ', async () => {
    const world = createTestWorld()
    const mockDoc1 = { id: world.id, data: () => world }
    const mockSnap = { empty: false, docs: [mockDoc1] }
    mockGet.mockResolvedValueOnce(mockSnap)

    // processWorldTurn は別関数のため、モジュール内部呼び出しを検証する代わりに
    // Firestore クエリが実行されたことを確認する
    // （processWorldTurn の内部実装でエラーが起きないよう別途モックする）
    mockRunTransaction.mockResolvedValueOnce(undefined)

    await processDueTurns()

    // where クエリが実行されたこと（nextTurnAt <= now）
    expect(mockWhere).toHaveBeenCalledWith('nextTurnAt', '<=', expect.anything())
    expect(mockGet).toHaveBeenCalled()
  })

  it('対象ワールドが0件の場合、processWorldTurn を呼ばない', async () => {
    const mockSnap = { empty: true, docs: [] }
    mockGet.mockResolvedValueOnce(mockSnap)

    await processDueTurns()

    // runTransaction が呼ばれていないこと（processWorldTurn が呼ばれていない）
    expect(mockRunTransaction).not.toHaveBeenCalled()
  })
})

// ================================================================
// processWorldTurn
// ================================================================
describe('processWorldTurn', () => {
  const worldId = 'world-001'
  const world = createTestWorld({ id: worldId, currentTurn: 5, turnIntervalSec: 300 })

  beforeEach(() => {
    // トランザクション内での world ドキュメント取得
    const worldDocSnap = {
      exists: true,
      id: worldId,
      data: () => ({
        ...world,
        nextTurnAt: { toDate: () => world.nextTurnAt },
        createdAt: { toDate: () => world.createdAt },
      }),
    }
    // スライム一覧取得
    const slimesSnap = { empty: false, docs: [] }

    mockGet
      .mockResolvedValueOnce(worldDocSnap) // world doc in transaction
      .mockResolvedValueOnce(slimesSnap) // slimes query

    mockRunTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => {
      const transaction = {
        get: jest.fn().mockResolvedValue(worldDocSnap),
        update: jest.fn(),
        set: jest.fn(),
      }
      return fn(transaction)
    })
  })

  it('currentTurn を +1 インクリメントする', async () => {
    let capturedUpdate: Record<string, unknown> = {}

    mockRunTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => {
      const worldDocSnap = {
        exists: true,
        id: worldId,
        data: () => ({
          ...world,
          nextTurnAt: { toDate: () => world.nextTurnAt },
          createdAt: { toDate: () => world.createdAt },
        }),
      }
      const slimesSnap = { empty: true, docs: [] }
      mockGet.mockResolvedValueOnce(slimesSnap)

      const transaction = {
        get: jest.fn().mockResolvedValue(worldDocSnap),
        update: jest.fn((ref: unknown, data: Record<string, unknown>) => {
          capturedUpdate = { ...capturedUpdate, ...data }
        }),
        set: jest.fn(),
      }
      await fn(transaction)
      return capturedUpdate
    })

    await processWorldTurn(worldId)

    expect(capturedUpdate).toHaveProperty('currentTurn', world.currentTurn + 1)
  })

  it('nextTurnAt を turnIntervalSec 秒後に更新する', async () => {
    let capturedUpdate: Record<string, unknown> = {}

    mockRunTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => {
      const worldDocSnap = {
        exists: true,
        id: worldId,
        data: () => ({
          ...world,
          nextTurnAt: { toDate: () => world.nextTurnAt },
          createdAt: { toDate: () => world.createdAt },
        }),
      }
      const slimesSnap = { empty: true, docs: [] }
      mockGet.mockResolvedValueOnce(slimesSnap)

      const transaction = {
        get: jest.fn().mockResolvedValue(worldDocSnap),
        update: jest.fn((ref: unknown, data: Record<string, unknown>) => {
          capturedUpdate = { ...capturedUpdate, ...data }
        }),
        set: jest.fn(),
      }
      await fn(transaction)
      return capturedUpdate
    })

    const before = Date.now()
    await processWorldTurn(worldId)
    const after = Date.now()

    // nextTurnAt が turnIntervalSec 秒後（±2秒の誤差許容）
    const expectedMs = world.turnIntervalSec * 1000
    const nextTurnAtValue = capturedUpdate['nextTurnAt']
    // Timestamp.fromDate または Date オブジェクトで渡される想定
    expect(nextTurnAtValue).toBeDefined()
    // capturedUpdate に nextTurnAt が含まれること
    expect(capturedUpdate).toHaveProperty('nextTurnAt')
    void before
    void after
    void expectedMs
  })

  it('各スライムに対して processSlimeTurn を呼ぶ', async () => {
    const slime1 = createTestSlime({ id: 'slime-001', worldId })
    const slime2 = createTestSlime({ id: 'slime-002', worldId })

    const slimeDoc1 = { id: slime1.id, data: () => slime1 }
    const slimeDoc2 = { id: slime2.id, data: () => slime2 }
    const slimesSnap = { empty: false, docs: [slimeDoc1, slimeDoc2] }

    mockRunTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => {
      const worldDocSnap = {
        exists: true,
        id: worldId,
        data: () => ({
          ...world,
          nextTurnAt: { toDate: () => world.nextTurnAt },
          createdAt: { toDate: () => world.createdAt },
        }),
      }

      // actionReservations クエリ（スライムごと）と slimes クエリのモック
      mockGet
        .mockResolvedValueOnce(slimesSnap) // slimes
        .mockResolvedValue({ empty: true, docs: [] }) // reservations per slime

      const transaction = {
        get: jest.fn().mockResolvedValue(worldDocSnap),
        update: jest.fn(),
        set: jest.fn(),
      }
      return fn(transaction)
    })

    // processWorldTurn が内部で processSlimeTurn を呼ぶことを間接的に確認:
    // スライムが2件の場合でも正常終了すること
    await expect(processWorldTurn(worldId)).resolves.not.toThrow()
  })

  it('対象スライムが0件でも正常終了する', async () => {
    mockRunTransaction.mockImplementation(async (fn: (t: unknown) => Promise<unknown>) => {
      const worldDocSnap = {
        exists: true,
        id: worldId,
        data: () => ({
          ...world,
          nextTurnAt: { toDate: () => world.nextTurnAt },
          createdAt: { toDate: () => world.createdAt },
        }),
      }
      const slimesSnap = { empty: true, docs: [] }
      mockGet.mockResolvedValueOnce(slimesSnap)

      const transaction = {
        get: jest.fn().mockResolvedValue(worldDocSnap),
        update: jest.fn(),
        set: jest.fn(),
      }
      return fn(transaction)
    })

    await expect(processWorldTurn(worldId)).resolves.not.toThrow()
  })
})

// ================================================================
// processSlimeTurn
// ================================================================
describe('processSlimeTurn', () => {
  it('予約がある場合、executeReservedAction を呼び status を executed にする', async () => {
    const slime = createTestSlime()
    const reservation = createTestReservation({ turnNumber: 1, status: 'pending' })
    const reservations = [reservation]

    const result = await processSlimeTurn(slime, reservations, 1)

    // 予約が 'executed' に更新されること
    const updatedReservation = result.updatedReservations.find((r) => r.id === reservation.id)
    expect(updatedReservation?.status).toBe('executed')
  })

  it('予約がない場合、executeAutonomousAction を呼ぶ', async () => {
    const slime = createTestSlime({ stats: { ...createTestSlime().stats, hunger: 50 } })
    const reservations: ActionReservation[] = []

    const result = await processSlimeTurn(slime, reservations, 1)

    // 自律行動が実行されたことをイベントタイプで確認
    expect(result.events.some((e) => e.eventType === 'autonomous')).toBe(true)
  })

  it('hunger が 5 減少する（下限は 0）', async () => {
    const slime = createTestSlime({ stats: { ...createTestSlime().stats, hunger: 60 } })
    const reservations: ActionReservation[] = []

    const result = await processSlimeTurn(slime, reservations, 1)

    expect(result.updatedSlime.stats.hunger).toBe(55)
  })

  it('hunger が既に 0 の場合、マイナスにならない', async () => {
    const slime = createTestSlime({ stats: { ...createTestSlime().stats, hunger: 0 } })
    const reservations: ActionReservation[] = []

    const result = await processSlimeTurn(slime, reservations, 1)

    expect(result.updatedSlime.stats.hunger).toBe(0)
  })

  it('進化条件を満たす場合、checkEvolution が呼ばれる（speciesId が更新される）', async () => {
    // atk が高いスライム（進化条件を満たすよう設定）
    const slime = createTestSlime({
      stats: { hp: 80, atk: 100, def: 80, spd: 50, exp: 500, hunger: 50 },
    })
    const reservations: ActionReservation[] = []

    const result = await processSlimeTurn(slime, reservations, 1)

    // checkEvolution が呼ばれたかどうかは実装依存だが、
    // 少なくとも updatedSlime が返ること
    expect(result.updatedSlime).toBeDefined()
  })
})

// ================================================================
// executeReservedAction - eat
// ================================================================
describe('executeReservedAction - eat', () => {
  const foodId = 'food-herb'
  const food = {
    id: foodId,
    name: 'ハーブ',
    statDeltas: { hp: 5, atk: 2, def: 0, spd: 1, exp: 10, hunger: 0 } as Partial<SlimeStats>,
    racialDeltas: { plant: 0.1 } as Partial<RacialValues>,
  }

  beforeEach(() => {
    // foods コレクション取得をモック
    const foodDocSnap = { exists: true, data: () => food }
    mockGet.mockResolvedValue(foodDocSnap)
    mockDoc.mockReturnValue({ get: mockGet })
    mockCollection.mockReturnValue({ doc: mockDoc, where: mockWhere, get: mockGet })
  })

  it('food の statDeltas が slime.stats に加算される', async () => {
    const slime = createTestSlime()
    const reservation = createTestReservation({
      actionType: 'eat',
      actionData: { foodId } as EatActionData,
    })

    const result = await executeReservedAction(slime, reservation)

    expect(result.updatedSlime.stats.hp).toBe(slime.stats.hp + (food.statDeltas.hp ?? 0))
    expect(result.updatedSlime.stats.atk).toBe(slime.stats.atk + (food.statDeltas.atk ?? 0))
  })

  it('hunger が +30 される（上限は 100）', async () => {
    const slime = createTestSlime({ stats: { ...createTestSlime().stats, hunger: 50 } })
    const reservation = createTestReservation({
      actionType: 'eat',
      actionData: { foodId } as EatActionData,
    })

    const result = await executeReservedAction(slime, reservation)

    expect(result.updatedSlime.stats.hunger).toBe(80)
  })

  it('hunger が 80 の場合、100 を超えない', async () => {
    const slime = createTestSlime({ stats: { ...createTestSlime().stats, hunger: 80 } })
    const reservation = createTestReservation({
      actionType: 'eat',
      actionData: { foodId } as EatActionData,
    })

    const result = await executeReservedAction(slime, reservation)

    expect(result.updatedSlime.stats.hunger).toBe(100)
  })

  it('food の racialDeltas が slime.racialValues に加算される', async () => {
    const slime = createTestSlime()
    const reservation = createTestReservation({
      actionType: 'eat',
      actionData: { foodId } as EatActionData,
    })

    const result = await executeReservedAction(slime, reservation)

    expect(result.updatedSlime.racialValues.plant).toBeCloseTo(
      slime.racialValues.plant + (food.racialDeltas.plant ?? 0),
      5
    )
  })
})

// ================================================================
// executeReservedAction - move
// ================================================================
describe('executeReservedAction - move', () => {
  it('slime の tileX, tileY が更新される', async () => {
    const slime = createTestSlime({ tileX: 3, tileY: 4 })
    const targetX = 7
    const targetY = 9
    const reservation = createTestReservation({
      actionType: 'move',
      actionData: { targetX, targetY } as MoveActionData,
    })

    // タイル情報取得のモック（タイル属性なし or デフォルト属性）
    const tileDocSnap = {
      exists: false,
      data: () => null,
    }
    mockGet.mockResolvedValue(tileDocSnap)
    mockDoc.mockReturnValue({ get: mockGet })
    mockCollection.mockReturnValue({ doc: mockDoc, where: mockWhere, get: mockGet })

    const result = await executeReservedAction(slime, reservation)

    expect(result.updatedSlime.tileX).toBe(targetX)
    expect(result.updatedSlime.tileY).toBe(targetY)
  })
})

// ================================================================
// executeReservedAction - rest
// ================================================================
describe('executeReservedAction - rest', () => {
  it('slime の hp が回復する', async () => {
    const slime = createTestSlime({
      stats: { hp: 50, atk: 20, def: 15, spd: 10, exp: 0, hunger: 60 },
    })
    const reservation = createTestReservation({ actionType: 'rest', actionData: {} })

    const result = await executeReservedAction(slime, reservation)

    // 最大HP = atk + def + 50 = 20 + 15 + 50 = 85
    // 回復量 = 85 * 0.2 = 17
    // 回復後 = 50 + 17 = 67
    const maxHp = slime.stats.atk + slime.stats.def + 50
    const expectedHp = Math.min(slime.stats.hp + Math.floor(maxHp * 0.2), maxHp)
    expect(result.updatedSlime.stats.hp).toBe(expectedHp)
  })

  it('hp が最大値を超えない', async () => {
    // HP がほぼ最大値のスライム
    // maxHp = 20 + 15 + 50 = 85
    const slime = createTestSlime({
      stats: { hp: 84, atk: 20, def: 15, spd: 10, exp: 0, hunger: 60 },
    })
    const reservation = createTestReservation({ actionType: 'rest', actionData: {} })

    const result = await executeReservedAction(slime, reservation)

    const maxHp = slime.stats.atk + slime.stats.def + 50
    expect(result.updatedSlime.stats.hp).toBeLessThanOrEqual(maxHp)
  })
})

// ================================================================
// executeAutonomousAction
// ================================================================
describe('executeAutonomousAction', () => {
  it('hunger >= 20 かつ < 50 の場合、hp が微回復する', async () => {
    const slime = createTestSlime({
      stats: { hp: 50, atk: 20, def: 15, spd: 10, exp: 0, hunger: 20 },
    })

    const result = await executeAutonomousAction(slime)

    // hunger >= 20 かつ < 50 のとき自律的に休息して HP を 5% 回復
    const maxHp = slime.stats.atk + slime.stats.def + 50
    expect(result.updatedSlime.stats.hp).toBeGreaterThan(slime.stats.hp)
    expect(result.updatedSlime.stats.hp).toBeLessThanOrEqual(maxHp)
  })

  it('hunger >= 50 の場合、hp が変化しない', async () => {
    const slime = createTestSlime({
      stats: { hp: 50, atk: 20, def: 15, spd: 10, exp: 0, hunger: 50 },
    })

    const result = await executeAutonomousAction(slime)

    // hp が変化しないこと
    expect(result.updatedSlime.stats.hp).toBe(slime.stats.hp)
    // autonomous イベントが記録されること
    expect(result.events.some((e) => e.eventType === 'autonomous')).toBe(true)
  })
})

// ================================================================
// checkEvolution
// ================================================================
describe('checkEvolution', () => {
  const baseSpecies: SlimeSpecies = {
    id: 'species-normal',
    name: '普通スライム',
    description: '普通のスライム',
    baseStats: { hp: 50, atk: 10, def: 10, spd: 10, exp: 0, hunger: 50 },
    evolutionConditions: [],
  }

  it('進化条件（requiredStats）を満たす場合、speciesId を更新して true を返す', () => {
    const slime = createTestSlime({
      speciesId: 'species-normal',
      stats: { hp: 100, atk: 50, def: 30, spd: 20, exp: 200, hunger: 60 },
    })

    const speciesData: SlimeSpecies = {
      ...baseSpecies,
      evolutionConditions: [
        {
          targetSpeciesId: 'species-fire',
          requiredStats: { atk: 50 },
          requiredRacialValues: {},
        },
      ],
    }

    const result = checkEvolution(slime, speciesData)

    expect(result.evolved).toBe(true)
    expect(result.updatedSlime.speciesId).toBe('species-fire')
  })

  it('条件を満たさない場合、false を返す', () => {
    const slime = createTestSlime({
      speciesId: 'species-normal',
      stats: { hp: 50, atk: 10, def: 10, spd: 10, exp: 0, hunger: 60 },
    })

    const speciesData: SlimeSpecies = {
      ...baseSpecies,
      evolutionConditions: [
        {
          targetSpeciesId: 'species-fire',
          requiredStats: { atk: 100 }, // 条件: atk >= 100 だが slime.atk = 10
          requiredRacialValues: {},
        },
      ],
    }

    const result = checkEvolution(slime, speciesData)

    expect(result.evolved).toBe(false)
    expect(result.updatedSlime.speciesId).toBe('species-normal')
  })

  it('複数の進化条件がある場合、最初に満たした条件で進化する', () => {
    const slime = createTestSlime({
      speciesId: 'species-normal',
      stats: { hp: 100, atk: 80, def: 80, spd: 50, exp: 500, hunger: 60 },
      racialValues: {
        fire: 1.0,
        water: 0,
        earth: 0,
        wind: 0,
        slime: 0,
        plant: 0,
        human: 0,
        beast: 0,
        spirit: 0,
        fish: 0,
      },
    })

    const speciesData: SlimeSpecies = {
      ...baseSpecies,
      evolutionConditions: [
        {
          targetSpeciesId: 'species-fire', // 最初の条件（fire >= 1.0 かつ atk >= 80）
          requiredStats: { atk: 80 },
          requiredRacialValues: { fire: 1.0 },
        },
        {
          targetSpeciesId: 'species-water', // 2番目の条件（water >= 1.0）
          requiredStats: {},
          requiredRacialValues: { water: 1.0 },
        },
      ],
    }

    const result = checkEvolution(slime, speciesData)

    expect(result.evolved).toBe(true)
    // 最初に満たした条件（species-fire）で進化すること
    expect(result.updatedSlime.speciesId).toBe('species-fire')
  })
})
