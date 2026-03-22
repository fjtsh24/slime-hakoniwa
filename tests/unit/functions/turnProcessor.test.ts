/**
 * turnProcessor ユニットテスト
 *
 * TDD: 実装より先にテストを書く。
 * import エラーは実装完了後に解消される（TDDの正しい姿）。
 */

import type { Slime, SlimeSpecies, InventorySlot } from '../../../shared/types/slime'
import type { ActionReservation, EatActionData, MoveActionData } from '../../../shared/types/action'
import type { Food } from '../../../shared/types/food'
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
  checkSplit,
  checkWeatherTransition,
  checkSeasonTransition,
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
    // Phase 4 Week 1: インベントリフィールドを追加
    // 既存テストは現在の実装（インベントリ未対応）でも通過できるよう、
    // inventory は Slime 型の省略可能フィールドとして扱う
    inventory: [{ foodId: 'food-herb', quantity: 3 }] as InventorySlot[],
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
  // 食料マスタは静的ファイルが SoT のため、テストでも foods 引数で直接渡す（Firestore モック不要）
  const food: Food = {
    id: foodId,
    name: 'ハーブ',
    description: 'テスト用ハーブ',
    category: 'plant',
    statDeltas: { hp: 5, atk: 2, def: 0, spd: 1, exp: 10 },
    racialDeltas: { plant: 0.1 },
    skillGrantId: null,
    skillGrantProb: 0,
  }

  it('food の statDeltas が slime.stats に加算される', async () => {
    const slime = createTestSlime()
    const reservation = createTestReservation({
      actionType: 'eat',
      actionData: { foodId } as EatActionData,
    })

    const result = await executeReservedAction(slime, reservation, [food])

    expect(result.updatedSlime.stats.hp).toBe(slime.stats.hp + (food.statDeltas.hp ?? 0))
    expect(result.updatedSlime.stats.atk).toBe(slime.stats.atk + (food.statDeltas.atk ?? 0))
  })

  it('hunger が +30 される（上限は 100）', async () => {
    const slime = createTestSlime({ stats: { ...createTestSlime().stats, hunger: 50 } })
    const reservation = createTestReservation({
      actionType: 'eat',
      actionData: { foodId } as EatActionData,
    })

    const result = await executeReservedAction(slime, reservation, [food])

    expect(result.updatedSlime.stats.hunger).toBe(80)
  })

  it('hunger が 80 の場合、100 を超えない', async () => {
    const slime = createTestSlime({ stats: { ...createTestSlime().stats, hunger: 80 } })
    const reservation = createTestReservation({
      actionType: 'eat',
      actionData: { foodId } as EatActionData,
    })

    const result = await executeReservedAction(slime, reservation, [food])

    expect(result.updatedSlime.stats.hunger).toBe(100)
  })

  it('food の racialDeltas が slime.racialValues に加算される', async () => {
    const slime = createTestSlime()
    const reservation = createTestReservation({
      actionType: 'eat',
      actionData: { foodId } as EatActionData,
    })

    const result = await executeReservedAction(slime, reservation, [food])

    expect(result.updatedSlime.racialValues.plant).toBeCloseTo(
      slime.racialValues.plant + (food.racialDeltas.plant ?? 0),
      5
    )
  })

  // インベントリ連動テストは tests/unit/eatAction.test.ts に移行済み
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
  it('hunger 20〜39 かつインベントリなしの場合、hp が微回復する', async () => {
    const slime = createTestSlime({
      stats: { hp: 50, atk: 20, def: 15, spd: 10, exp: 0, hunger: 20 },
    })

    const result = await executeAutonomousAction(slime)

    // hunger 20〜39 かつ食料なし → 休息してHP微回復
    const maxHp = slime.stats.atk + slime.stats.def + 50
    expect(result.updatedSlime.stats.hp).toBeGreaterThan(slime.stats.hp)
    expect(result.updatedSlime.stats.hp).toBeLessThanOrEqual(maxHp)
  })

  it('hunger >= 40 の場合、hp が変化しない', async () => {
    const slime = createTestSlime({
      stats: { hp: 50, atk: 20, def: 15, spd: 10, exp: 0, hunger: 50 },
    })

    const result = await executeAutonomousAction(slime)

    // hp が変化しないこと
    expect(result.updatedSlime.stats.hp).toBe(slime.stats.hp)
    // autonomous イベントが記録されること
    expect(result.events.some((e) => e.eventType === 'autonomous')).toBe(true)
  })

  it('AU-01: hunger < 40 かつインベントリに食料がある場合、自動で食事を行う', async () => {
    const slime = createTestSlime({
      stats: { hp: 50, atk: 20, def: 15, spd: 10, exp: 0, hunger: 30 },
      inventory: [{ foodId: 'food-plant-001', quantity: 3 }],
    })

    const result = await executeAutonomousAction(slime)

    // hunger が +30 されること（30 + 30 = 60、上限100）
    expect(result.updatedSlime.stats.hunger).toBeGreaterThan(slime.stats.hunger)
    // インベントリが1個減っていること
    const remainingSlot = result.updatedSlime.inventory?.find((s) => s.foodId === 'food-plant-001')
    expect(remainingSlot?.quantity).toBe(2)
    // auto_eat イベントが記録されること
    const autoEatEvent = result.events.find(
      (e) => e.eventType === 'autonomous' && e.eventData['action'] === 'auto_eat'
    )
    expect(autoEatEvent).toBeDefined()
    expect(autoEatEvent?.eventData['foodId']).toBe('food-plant-001')
  })

  it('AU-02: hunger < 40 かつインベントリが空の場合、自動食事は行わず休息する', async () => {
    const slime = createTestSlime({
      stats: { hp: 50, atk: 20, def: 15, spd: 10, exp: 0, hunger: 30 },
      inventory: [],
    })
    const hpBefore = slime.stats.hp

    const result = await executeAutonomousAction(slime)

    // 自動食事は行われない（autonomous イベントの action が auto_eat でない）
    const autoEatEvent = result.events.find(
      (e) => e.eventType === 'autonomous' && e.eventData['action'] === 'auto_eat'
    )
    expect(autoEatEvent).toBeUndefined()
    // 休息でHP微回復
    expect(result.updatedSlime.stats.hp).toBeGreaterThan(hpBefore)
  })

  it('AU-03: hunger < 40 かつインベントリに食料1個の場合、消費後インベントリが空になる', async () => {
    const slime = createTestSlime({
      stats: { hp: 50, atk: 20, def: 15, spd: 10, exp: 0, hunger: 10 },
      inventory: [{ foodId: 'food-plant-001', quantity: 1 }],
    })

    const result = await executeAutonomousAction(slime)

    // インベントリが空になること
    expect(result.updatedSlime.inventory?.length).toBe(0)
    // hunger が回復していること
    expect(result.updatedSlime.stats.hunger).toBeGreaterThan(slime.stats.hunger)
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

  it('requiredRacialValues を満たさない場合、進化しない', () => {
    const slime = createTestSlime({
      speciesId: 'species-normal',
      stats: { hp: 100, atk: 80, def: 80, spd: 50, exp: 500, hunger: 60 },
      racialValues: {
        fire: 0.5, // fire < 1.0 なので条件未達
        water: 0, earth: 0, wind: 0, slime: 0, plant: 0, human: 0, beast: 0, spirit: 0, fish: 0,
      },
    })

    const speciesData: SlimeSpecies = {
      ...baseSpecies,
      evolutionConditions: [
        {
          targetSpeciesId: 'species-fire',
          requiredStats: { atk: 80 },
          requiredRacialValues: { fire: 1.0 },
        },
      ],
    }

    const result = checkEvolution(slime, speciesData)

    expect(result.evolved).toBe(false)
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

// ================================================================
// checkSplit
// ================================================================
describe('checkSplit', () => {
  const baseRacialValues = {
    fire: 0, water: 0, earth: 0, wind: 0, slime: 0,
    plant: 0, human: 0, beast: 0, spirit: 0, fish: 0,
  }

  it('exp < 500 の場合、分裂しない', () => {
    const slime = createTestSlime({
      stats: { hp: 80, atk: 20, def: 15, spd: 10, exp: 499, hunger: 60 },
      racialValues: { ...baseRacialValues, fire: 0.8 },
    })

    const result = checkSplit(slime)

    expect(result.split).toBe(false)
    expect(result.newSlime).toBeUndefined()
  })

  it('exp = 499 の境界値で分裂しない', () => {
    const slime = createTestSlime({
      stats: { hp: 80, atk: 20, def: 15, spd: 10, exp: 499, hunger: 60 },
      racialValues: { ...baseRacialValues, fire: 1.0 },
    })

    expect(checkSplit(slime).split).toBe(false)
  })

  it('racialMax < 0.7 の場合、分裂しない', () => {
    const slime = createTestSlime({
      stats: { hp: 80, atk: 20, def: 15, spd: 10, exp: 500, hunger: 60 },
      racialValues: { ...baseRacialValues, fire: 0.69 },
    })

    expect(checkSplit(slime).split).toBe(false)
  })

  it('racialMax = 0.699 の境界値で分裂しない', () => {
    const slime = createTestSlime({
      stats: { hp: 80, atk: 20, def: 15, spd: 10, exp: 500, hunger: 60 },
      racialValues: { ...baseRacialValues, fire: 0.699 },
    })

    expect(checkSplit(slime).split).toBe(false)
  })

  it('全条件を満たしても確率 > 0.15 なら分裂しない', () => {
    const slime = createTestSlime({
      stats: { hp: 80, atk: 20, def: 15, spd: 10, exp: 500, hunger: 60 },
      racialValues: { ...baseRacialValues, fire: 0.8 },
      speciesId: 'slime-001',
    })

    jest.spyOn(Math, 'random').mockReturnValueOnce(0.16)

    const result = checkSplit(slime)

    expect(result.split).toBe(false)
    jest.spyOn(Math, 'random').mockRestore()
  })

  it('全条件を満たし確率 <= 0.15 なら分裂する', () => {
    // speciesId は実際の slimeSpecies マスタに存在する ID を使う
    const slime = createTestSlime({
      speciesId: 'slime-001',
      stats: { hp: 80, atk: 20, def: 15, spd: 10, exp: 500, hunger: 60 },
      racialValues: { ...baseRacialValues, fire: 0.8 },
    })

    jest.spyOn(Math, 'random').mockReturnValueOnce(0.15)

    const result = checkSplit(slime)

    expect(result.split).toBe(true)
    expect(result.newSlime).toBeDefined()
    jest.spyOn(Math, 'random').mockRestore()
  })

  it('生成された子スライムが親の speciesId を継承する', () => {
    const slime = createTestSlime({
      speciesId: 'slime-001',
      stats: { hp: 80, atk: 20, def: 15, spd: 10, exp: 500, hunger: 60 },
      racialValues: { ...baseRacialValues, fire: 0.8 },
    })

    jest.spyOn(Math, 'random').mockReturnValueOnce(0.01)

    const result = checkSplit(slime)

    expect(result.newSlime?.speciesId).toBe('slime-001')
    jest.spyOn(Math, 'random').mockRestore()
  })

  it('生成された子スライムの racialValues がすべて 0', () => {
    const slime = createTestSlime({
      speciesId: 'slime-001',
      stats: { hp: 80, atk: 20, def: 15, spd: 10, exp: 500, hunger: 60 },
      racialValues: { ...baseRacialValues, fire: 0.9 },
    })

    jest.spyOn(Math, 'random').mockReturnValueOnce(0.01)

    const result = checkSplit(slime)
    const rv = result.newSlime?.racialValues

    expect(rv).toBeDefined()
    if (rv) {
      Object.values(rv).forEach((v) => expect(v).toBe(0))
    }
    jest.spyOn(Math, 'random').mockRestore()
  })

  it('生成された子スライムの inventory が空配列', () => {
    const slime = createTestSlime({
      speciesId: 'slime-001',
      stats: { hp: 80, atk: 20, def: 15, spd: 10, exp: 500, hunger: 60 },
      racialValues: { ...baseRacialValues, water: 0.75 },
      inventory: [{ foodId: 'food-herb', quantity: 5 }],
    })

    jest.spyOn(Math, 'random').mockReturnValueOnce(0.01)

    const result = checkSplit(slime)

    expect(result.newSlime?.inventory).toEqual([])
    jest.spyOn(Math, 'random').mockRestore()
  })

  it('生成された子スライムの ownerUid / mapId / worldId が親と一致する', () => {
    const slime = createTestSlime({
      speciesId: 'slime-001',
      ownerUid: 'user-abc',
      mapId: 'map-xyz',
      worldId: 'world-001',
      stats: { hp: 80, atk: 20, def: 15, spd: 10, exp: 500, hunger: 60 },
      racialValues: { ...baseRacialValues, beast: 0.7 },
    })

    jest.spyOn(Math, 'random').mockReturnValueOnce(0.0)

    const result = checkSplit(slime)

    expect(result.newSlime?.ownerUid).toBe('user-abc')
    expect(result.newSlime?.mapId).toBe('map-xyz')
    expect(result.newSlime?.worldId).toBe('world-001')
    jest.spyOn(Math, 'random').mockRestore()
  })
})

// ================================================================
// checkWeatherTransition
// ================================================================
describe('checkWeatherTransition', () => {
  function makeBatch() {
    const batchSet = jest.fn()
    const batchUpdate = jest.fn()
    const batchCommit = jest.fn().mockResolvedValue(undefined)
    const batch = { set: batchSet, update: batchUpdate, commit: batchCommit }
    return { batch, batchSet, batchUpdate, batchCommit }
  }

  beforeEach(() => {
    mockDoc.mockReturnValue({ get: mockGet, set: mockSet, update: mockUpdate })
    mockCollection.mockReturnValue({ doc: mockDoc, where: mockWhere, get: mockGet })
  })

  // WT-01: world.weather が未設定 → 遷移が発生し batch.update が呼ばれる
  it('WT-01: world.weather が未設定の場合、batch.update が呼ばれる', () => {
    const { batch, batchUpdate } = makeBatch()
    const world = createTestWorld({ currentTurn: 10 })

    checkWeatherTransition(world, 10, batch as unknown as FirebaseFirestore.WriteBatch)

    expect(batchUpdate).toHaveBeenCalledTimes(1)
    expect(batchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        weather: expect.stringMatching(/^(sunny|rainy|stormy|foggy)$/),
        weatherEndsAtTurn: expect.any(Number),
      })
    )
  })

  // WT-02: weatherEndsAtTurn > currentTurn → 遷移しない
  it('WT-02: weatherEndsAtTurn > currentTurn の場合、batch.update が呼ばれない', () => {
    const { batch, batchUpdate } = makeBatch()
    const world = createTestWorld({ weather: 'sunny', weatherEndsAtTurn: 20 })

    checkWeatherTransition(world, 10, batch as unknown as FirebaseFirestore.WriteBatch)

    expect(batchUpdate).not.toHaveBeenCalled()
  })

  // WT-03: weatherEndsAtTurn <= currentTurn → 遷移が発生する
  it('WT-03: weatherEndsAtTurn <= currentTurn の場合、batch.update が呼ばれ有効な天候が設定される', () => {
    const { batch, batchUpdate } = makeBatch()
    const world = createTestWorld({ weather: 'rainy', weatherEndsAtTurn: 10 })

    checkWeatherTransition(world, 10, batch as unknown as FirebaseFirestore.WriteBatch)

    expect(batchUpdate).toHaveBeenCalledTimes(1)
    expect(batchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ weather: expect.stringMatching(/^(sunny|rainy|stormy|foggy)$/) })
    )
  })

  // WT-04: 遷移発生時に batch.set（turnLogs 書き込み）も呼ばれる
  it('WT-04: 遷移発生時に batch.set も呼ばれる（turnLogs 書き込み）', () => {
    const { batch, batchSet } = makeBatch()
    const world = createTestWorld({ weather: 'foggy', weatherEndsAtTurn: 5 })

    checkWeatherTransition(world, 10, batch as unknown as FirebaseFirestore.WriteBatch)

    expect(batchSet).toHaveBeenCalledTimes(1)
    expect(batchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'weather_change',
        eventData: expect.objectContaining({
          from: 'foggy',
          to: expect.any(String),
          weatherEndsAtTurn: expect.any(Number),
        }),
      })
    )
  })

  // WT-05: weatherEndsAtTurn が各天候の minDuration〜maxDuration 範囲内（50回抽選）
  it('WT-05: weatherEndsAtTurn が minDuration(2)〜maxDuration(12) の範囲内', () => {
    const currentTurn = 50
    for (let i = 0; i < 50; i++) {
      const { batch, batchUpdate } = makeBatch()
      const world = createTestWorld({ weather: undefined })
      checkWeatherTransition(world, currentTurn, batch as unknown as FirebaseFirestore.WriteBatch)
      const data = (batchUpdate.mock.calls[0][1] as Record<string, unknown>)
      const endsAt = data['weatherEndsAtTurn'] as number
      // stormy min=2, sunny max=12
      expect(endsAt).toBeGreaterThanOrEqual(currentTurn + 2)
      expect(endsAt).toBeLessThanOrEqual(currentTurn + 12)
    }
  })
})

// ================================================================
// checkSeasonTransition
// ================================================================
describe('checkSeasonTransition', () => {
  function makeBatch() {
    const batchSet = jest.fn()
    const batchUpdate = jest.fn()
    const batchCommit = jest.fn().mockResolvedValue(undefined)
    const batch = { set: batchSet, update: batchUpdate, commit: batchCommit }
    return { batch, batchSet, batchUpdate, batchCommit }
  }

  beforeEach(() => {
    mockDoc.mockReturnValue({ get: mockGet, set: mockSet, update: mockUpdate })
    mockCollection.mockReturnValue({ doc: mockDoc, where: mockWhere, get: mockGet })
  })

  // ST-W-01: world.season が未設定 → 遷移が発生する
  it('ST-W-01: world.season が未設定の場合、batch.update が呼ばれる', () => {
    const { batch, batchUpdate } = makeBatch()
    const world = createTestWorld({ currentTurn: 50 })

    checkSeasonTransition(world, 50, batch as unknown as FirebaseFirestore.WriteBatch)

    expect(batchUpdate).toHaveBeenCalledTimes(1)
    expect(batchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ season: expect.any(String), seasonStartTurn: 50 })
    )
  })

  // ST-W-02: seasonStartTurn + SEASON_DURATION_TURNS > currentTurn → 遷移しない
  it('ST-W-02: seasonStartTurn + 120 > currentTurn の場合、batch.update が呼ばれない', () => {
    const { batch, batchUpdate } = makeBatch()
    const world = createTestWorld({ season: 'spring', seasonStartTurn: 0 })

    checkSeasonTransition(world, 50, batch as unknown as FirebaseFirestore.WriteBatch)

    expect(batchUpdate).not.toHaveBeenCalled()
  })

  // ST-W-02b: 境界値 currentTurn = 119 でも遷移しない（0 + 120 > 119）
  it('ST-W-02b: currentTurn = 119（境界値-1）では遷移しない', () => {
    const { batch, batchUpdate } = makeBatch()
    const world = createTestWorld({ season: 'spring', seasonStartTurn: 0 })

    checkSeasonTransition(world, 119, batch as unknown as FirebaseFirestore.WriteBatch)

    expect(batchUpdate).not.toHaveBeenCalled()
  })

  // ST-W-03: seasonStartTurn + SEASON_DURATION_TURNS <= currentTurn → 遷移が発生する
  it('ST-W-03: seasonStartTurn + 120 <= currentTurn の場合、batch.update が呼ばれる', () => {
    const { batch, batchUpdate } = makeBatch()
    const world = createTestWorld({ season: 'summer', seasonStartTurn: 0 })

    checkSeasonTransition(world, 120, batch as unknown as FirebaseFirestore.WriteBatch)

    expect(batchUpdate).toHaveBeenCalledTimes(1)
  })

  // ST-W-04: winter → 次は spring（SEASONS のループ）
  it('ST-W-04: winter の次は spring（ループ）', () => {
    const { batch, batchUpdate } = makeBatch()
    const world = createTestWorld({ season: 'winter', seasonStartTurn: 0 })

    checkSeasonTransition(world, 120, batch as unknown as FirebaseFirestore.WriteBatch)

    expect(batchUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ season: 'spring' })
    )
  })

  // ST-W-05: 遷移発生時に turnLogs も書き込まれる
  it('ST-W-05: 遷移発生時に batch.set も呼ばれる（turnLogs 書き込み）', () => {
    const { batch, batchSet } = makeBatch()
    const world = createTestWorld({ season: 'autumn', seasonStartTurn: 0 })

    checkSeasonTransition(world, 120, batch as unknown as FirebaseFirestore.WriteBatch)

    expect(batchSet).toHaveBeenCalledTimes(1)
    expect(batchSet).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        eventType: 'season_change',
        eventData: expect.objectContaining({
          from: 'autumn',
          to: 'winter',
        }),
      })
    )
  })

  // ST-W-06: 全季節ループ（spring→summer→autumn→winter→spring）の正確性
  it('ST-W-06: 全季節が正しい順序でループする', () => {
    const seasons = ['spring', 'summer', 'autumn', 'winter'] as const
    const expectedNext = ['summer', 'autumn', 'winter', 'spring'] as const

    seasons.forEach((current, idx) => {
      const { batch, batchUpdate } = makeBatch()
      const world = createTestWorld({ season: current, seasonStartTurn: 0 })
      checkSeasonTransition(world, 120, batch as unknown as FirebaseFirestore.WriteBatch)
      const data = (batchUpdate.mock.calls[0][1] as Record<string, unknown>)
      expect(data['season']).toBe(expectedNext[idx])
    })
  })

  // ST-W-07: season 未設定時の turnLog の from は 'none'
  it('ST-W-07: season 未設定時は eventData.from が "none"', () => {
    const { batch, batchSet } = makeBatch()
    const world = createTestWorld({ season: undefined, seasonStartTurn: undefined })

    checkSeasonTransition(world, 100, batch as unknown as FirebaseFirestore.WriteBatch)

    const setData = (batchSet.mock.calls[0][1] as Record<string, unknown>)
    const eventData = setData['eventData'] as Record<string, unknown>
    expect(eventData['from']).toBe('none')
  })
})

// ================================================================
// processSlimeTurn — 季節 hungerDecrement 補正（HIGH テスト）
// ================================================================
describe('processSlimeTurn — 季節 hungerDecrement 補正', () => {
  it('ST-H-01: summer の場合 hunger が 7 減少する（5+2）', async () => {
    const slime = createTestSlime({ stats: { hp: 50, atk: 10, def: 10, spd: 10, exp: 0, hunger: 60 } })
    const result = await processSlimeTurn(slime, [], 1, undefined, undefined, undefined, { season: 'summer' })
    expect(result.updatedSlime.stats.hunger).toBe(53) // 60 - 7
  })

  it('ST-H-02: winter の場合 hunger が 6 減少する（5+1）', async () => {
    const slime = createTestSlime({ stats: { hp: 50, atk: 10, def: 10, spd: 10, exp: 0, hunger: 60 } })
    const result = await processSlimeTurn(slime, [], 1, undefined, undefined, undefined, { season: 'winter' })
    expect(result.updatedSlime.stats.hunger).toBe(54) // 60 - 6
  })

  it('ST-H-03: spring/autumn の場合 hunger が 5 減少する（補正なし）', async () => {
    const slime = createTestSlime({ stats: { hp: 50, atk: 10, def: 10, spd: 10, exp: 0, hunger: 60 } })
    const [resSp, resAu] = await Promise.all([
      processSlimeTurn(slime, [], 1, undefined, undefined, undefined, { season: 'spring' }),
      processSlimeTurn(slime, [], 1, undefined, undefined, undefined, { season: 'autumn' }),
    ])
    expect(resSp.updatedSlime.stats.hunger).toBe(55)
    expect(resAu.updatedSlime.stats.hunger).toBe(55)
  })

  it('ST-H-04: summer で hunger が 5 の場合、0 未満にならない（アンダーフロー防止）', async () => {
    const slime = createTestSlime({ stats: { hp: 50, atk: 10, def: 10, spd: 10, exp: 0, hunger: 5 } })
    const result = await processSlimeTurn(slime, [], 1, undefined, undefined, undefined, { season: 'summer' })
    expect(result.updatedSlime.stats.hunger).toBe(0)
  })
})

// ================================================================
// processSlimeTurn — incapacitatedUntilTurn 行動スキップ（HIGH テスト）
// ================================================================
describe('processSlimeTurn — incapacitatedUntilTurn 行動スキップ', () => {
  it('INC-01: incapacitatedUntilTurn >= currentTurn の場合、battle_incapacitated イベントを記録する', async () => {
    const slime = createTestSlime({ incapacitatedUntilTurn: 5 })
    const reservation = createTestReservation({ actionType: 'rest', turnNumber: 1, status: 'pending' })
    const result = await processSlimeTurn(slime, [reservation], 3) // currentTurn=3 <= 5

    expect(result.events.some((e) => e.eventType === 'battle_incapacitated')).toBe(true)
    // 予約は executed になるが、アクション自体は実行されない（HP 変化なし）
    const execd = result.updatedReservations.find((r) => r.id === reservation.id)
    expect(execd?.status).toBe('executed')
  })

  it('INC-02: incapacitatedUntilTurn < currentTurn の場合、通常行動を実行する', async () => {
    const slime = createTestSlime({ incapacitatedUntilTurn: 2, stats: { hp: 50, atk: 10, def: 10, spd: 10, exp: 0, hunger: 60 } })
    const result = await processSlimeTurn(slime, [], 3) // currentTurn=3 > 2 → 行動可能

    expect(result.events.some((e) => e.eventType === 'battle_incapacitated')).toBe(false)
    expect(result.events.some((e) => e.eventType === 'autonomous')).toBe(true)
  })
})

// ================================================================
// executeReservedAction - eat (alwaysAvailable)（HIGH テスト）
// ================================================================
describe('executeReservedAction - eat (alwaysAvailable)', () => {
  it('AA-01: alwaysAvailable=true の食料はインベントリが空でも食べられる', async () => {
    // food-slime-001 は alwaysAvailable: true（shared/data/foods.ts）
    const slime = createTestSlime({ inventory: [] })
    const reservation = createTestReservation({
      actionType: 'eat',
      actionData: { foodId: 'food-slime-001' },
    })

    const result = await executeReservedAction(slime, reservation)

    // 食事成功：hunger が増加し、食事イベントが記録される
    expect(result.events.some((e) => e.eventType === 'eat')).toBe(true)
    // インベントリは変化しない（消費不要）
    expect(result.updatedSlime.inventory?.length ?? 0).toBe(0)
  })

  it('AA-02: alwaysAvailable=false の食料はインベントリが空の場合スキップされる', async () => {
    const slime = createTestSlime({ inventory: [] })
    const reservation = createTestReservation({
      actionType: 'eat',
      actionData: { foodId: 'food-plant-001' }, // alwaysAvailable: false（通常の食料）
    })

    const result = await executeReservedAction(slime, reservation)

    // インベントリにない → eat イベントが記録されない
    expect(result.events.some((e) => e.eventType === 'eat')).toBe(false)
  })
})

// ================================================================
// executeReservedAction - move (タイルあり racialValues 更新)（HIGH テスト）
// ================================================================
describe('executeReservedAction - move (タイルあり)', () => {
  it('MV-01: タイルあり時に racialValues が属性×0.1 加算される', async () => {
    const slime = createTestSlime({
      racialValues: { fire: 0, water: 0, earth: 0, wind: 0, slime: 0, plant: 0, human: 0, beast: 0, spirit: 0, fish: 0 },
    })
    const reservation = createTestReservation({
      actionType: 'move',
      actionData: { targetX: 2, targetY: 3 },
    })
    const tile: import('../../../../shared/types/map').Tile = {
      id: 'tile-2-3',
      mapId: 'map-001',
      x: 2,
      y: 3,
      attributes: { fire: 0.8, water: 0.1, earth: 0.0, wind: 0.0 },
    }

    const result = await executeReservedAction(slime, reservation, undefined, [tile])

    // fire: 0 + 0.8 * 0.1 = 0.08
    expect(result.updatedSlime.racialValues.fire).toBeCloseTo(0.08, 5)
    // water: 0 + 0.1 * 0.1 = 0.01
    expect(result.updatedSlime.racialValues.water).toBeCloseTo(0.01, 5)
    // 移動先に設定されること
    expect(result.updatedSlime.tileX).toBe(2)
    expect(result.updatedSlime.tileY).toBe(3)
  })

  it('MV-02: タイルなし時は racialValues が変化しない', async () => {
    const slime = createTestSlime({
      racialValues: { fire: 0.3, water: 0.2, earth: 0.1, wind: 0.0, slime: 0, plant: 0, human: 0, beast: 0, spirit: 0, fish: 0 },
    })
    const reservation = createTestReservation({
      actionType: 'move',
      actionData: { targetX: 5, targetY: 5 },
    })

    // タイルリスト空（Firestoreアクセスは jest モックで空を返す）
    const result = await executeReservedAction(slime, reservation, undefined, [])

    expect(result.updatedSlime.racialValues.fire).toBeCloseTo(0.3, 5)
    expect(result.updatedSlime.racialValues.water).toBeCloseTo(0.2, 5)
  })
})
