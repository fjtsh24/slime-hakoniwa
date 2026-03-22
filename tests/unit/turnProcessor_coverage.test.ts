/**
 * turnProcessor カバレッジ補完テスト（A7/QA Phase 7 最終確認）
 *
 * 目的:
 *   既存テストで未カバーだった分岐・境界値を補完し、コアロジックの
 *   カバレッジ 80% 達成を確実にする。
 *
 * 補完対象:
 *   1. executeAutonomousAction — hunger < 20 (weak) パス（HP 変化なし）
 *   2. processSlimeTurn — 季節補正（summer +2, winter +1）による hunger 減少量
 *   3. checkEvolution — evolutionConditions が空配列のケース
 *   4. checkEvolution — requiredStats / requiredRacialValues の両方が空のケース（条件即達成）
 *   5. rest アクション — healAmount 計算と hunger +10
 *   6. executeAutonomousAction — hunger = 40 境界値（walk パス）
 *   7. executeAutonomousAction — hunger = 39 境界値（rest パスへ移行）
 *   8. addToInventory — 既存スロットへの加算（スロット数増加なし）
 *   9. addToInventory — INVENTORY_MAX_SLOTS を超える場合の失敗
 *  10. removeFromInventory — 数量不足の場合の失敗
 *
 * 実行方法:
 *   cd functions && npx jest tests/unit/turnProcessor_coverage.test.ts --verbose
 */

// ================================================================
// firebase-admin モック（Firestore アクセスを遮断）
// ================================================================

jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
          })),
        })),
      })),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    })),
  })),
  initializeApp: jest.fn(),
  apps: [],
  app: jest.fn(),
}))

// ================================================================
// テスト対象のインポート
// ================================================================

import {
  executeAutonomousAction,
  checkEvolution,
  processSlimeTurn,
  addToInventory,
  removeFromInventory,
  executeReservedAction,
} from '../../functions/src/scheduled/turnProcessor'
import type { Slime, SlimeStats, RacialValues, SlimeSpecies, InventorySlot } from '../../shared/types/slime'
import type { ActionReservation } from '../../shared/types/action'
import { INVENTORY_MAX_SLOTS } from '../../shared/constants/game'

// ================================================================
// テスト用フィクスチャ
// ================================================================

function makeStats(overrides?: Partial<SlimeStats>): SlimeStats {
  return {
    hp: 50,
    atk: 10,
    def: 10,
    spd: 10,
    exp: 0,
    hunger: 50,
    ...overrides,
  }
}

function makeRacialValues(overrides?: Partial<RacialValues>): RacialValues {
  return {
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
    ...overrides,
  }
}

function makeSlime(overrides?: Partial<Slime>): Slime {
  return {
    id: 'slime-coverage-test-001',
    ownerUid: 'user-test-001',
    mapId: 'map-test-001',
    worldId: 'world-test-001',
    speciesId: 'slime-001',
    tileX: 5,
    tileY: 5,
    name: 'カバレッジテストスライム',
    stats: makeStats(),
    racialValues: makeRacialValues(),
    inventory: [],
    isWild: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeReservation(overrides?: Partial<ActionReservation>): ActionReservation {
  return {
    id: 'reservation-coverage-001',
    slimeId: 'slime-coverage-test-001',
    ownerUid: 'user-test-001',
    worldId: 'world-test-001',
    turnNumber: 1,
    actionType: 'rest',
    actionData: {},
    status: 'pending',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    executedAt: null,
    ...overrides,
  }
}

// ================================================================
// 1. executeAutonomousAction — hunger < 20 (weak) パス
// ================================================================

describe('executeAutonomousAction — hunger < 20 (weak パス)', () => {
  it('COV-AU-01: hunger < 20 かつインベントリが空の場合、HP が変化せず "weak" イベントが記録される', async () => {
    const slime = makeSlime({
      stats: makeStats({ hunger: 10, hp: 50 }),
      inventory: [],
    })

    const result = await executeAutonomousAction(slime)

    // HP は変化しない（弱って動けない）
    expect(result.updatedSlime.stats.hp).toBe(50)
    // autonomous イベントの action が "weak" であること
    const weakEvent = result.events.find(
      (e) => e.eventType === 'autonomous' && e.eventData['action'] === 'weak'
    )
    expect(weakEvent).toBeDefined()
  })

  it('COV-AU-02: hunger = 0 でもインベントリが空なら weak パスを通る', async () => {
    const slime = makeSlime({
      stats: makeStats({ hunger: 0, hp: 30 }),
      inventory: [],
    })

    const result = await executeAutonomousAction(slime)

    expect(result.updatedSlime.stats.hp).toBe(30)
    const weakEvent = result.events.find(
      (e) => e.eventType === 'autonomous' && e.eventData['action'] === 'weak'
    )
    expect(weakEvent).toBeDefined()
  })

  it('COV-AU-03: hunger = 19 は weak パス（hunger < 20 の上限境界値）', async () => {
    const slime = makeSlime({
      stats: makeStats({ hunger: 19, hp: 40 }),
      inventory: [],
    })

    const result = await executeAutonomousAction(slime)

    const weakEvent = result.events.find(
      (e) => e.eventType === 'autonomous' && e.eventData['action'] === 'weak'
    )
    expect(weakEvent).toBeDefined()
    expect(result.updatedSlime.stats.hp).toBe(40) // HP 変化なし
  })
})

// ================================================================
// 2. executeAutonomousAction — hunger 境界値（walk と rest の境界）
// ================================================================

describe('executeAutonomousAction — hunger 境界値（walk vs rest）', () => {
  it('COV-AU-04: hunger = 40 は walk パス（HP変化なし）', async () => {
    const slime = makeSlime({
      stats: makeStats({ hunger: 40, hp: 50 }),
      inventory: [],
    })

    const result = await executeAutonomousAction(slime)

    expect(result.updatedSlime.stats.hp).toBe(50)
    const walkEvent = result.events.find(
      (e) => e.eventType === 'autonomous' && e.eventData['action'] === 'walk'
    )
    expect(walkEvent).toBeDefined()
  })

  it('COV-AU-05: hunger = 39 は rest パス（HP微回復）', async () => {
    const slime = makeSlime({
      stats: makeStats({ hunger: 39, hp: 50, atk: 10, def: 10 }),
      inventory: [],
    })

    const result = await executeAutonomousAction(slime)

    // maxHp = 10 + 10 + 50 = 70、healAmount = floor(70 * 0.05) = 3
    expect(result.updatedSlime.stats.hp).toBeGreaterThan(50)
    const restEvent = result.events.find(
      (e) => e.eventType === 'autonomous' && e.eventData['action'] === 'rest'
    )
    expect(restEvent).toBeDefined()
  })

  it('COV-AU-06: hunger = 20 は rest パス（hunger >= 20 の下限境界値）', async () => {
    const slime = makeSlime({
      stats: makeStats({ hunger: 20, hp: 50 }),
      inventory: [],
    })

    const result = await executeAutonomousAction(slime)

    const restEvent = result.events.find(
      (e) => e.eventType === 'autonomous' && e.eventData['action'] === 'rest'
    )
    expect(restEvent).toBeDefined()
    expect(result.updatedSlime.stats.hp).toBeGreaterThanOrEqual(50)
  })
})

// ================================================================
// 3. processSlimeTurn — 季節補正による hunger 減少量
// ================================================================

describe('processSlimeTurn — 季節補正 hungerDecrement', () => {
  it('COV-ST-01: summer では hungerDecrement が +2 加算されてhungerが余分に減る', async () => {
    const slime = makeSlime({
      stats: makeStats({ hunger: 60, hp: 50 }),
      inventory: [],
    })

    const result = await processSlimeTurn(slime, [], 1, undefined, undefined, undefined, {
      weather: 'sunny',
      season: 'summer',
    })

    // summer: hungerDecrement = 5 + 2 = 7
    // hunger = 60 - 7 = 53
    const hungerEvent = result.events.find((e) => e.eventType === 'hunger_decrease')
    expect(hungerEvent).toBeDefined()
    const after = hungerEvent!.eventData['after'] as number
    expect(after).toBe(53)
  })

  it('COV-ST-02: winter では hungerDecrement が +1 加算されてhungerが余分に減る', async () => {
    const slime = makeSlime({
      stats: makeStats({ hunger: 60, hp: 50 }),
      inventory: [],
    })

    const result = await processSlimeTurn(slime, [], 1, undefined, undefined, undefined, {
      weather: 'sunny',
      season: 'winter',
    })

    // winter: hungerDecrement = 5 + 1 = 6
    // hunger = 60 - 6 = 54
    const hungerEvent = result.events.find((e) => e.eventType === 'hunger_decrease')
    expect(hungerEvent).toBeDefined()
    const after = hungerEvent!.eventData['after'] as number
    expect(after).toBe(54)
  })

  it('COV-ST-03: spring では hungerDecrement が標準 5 のみ', async () => {
    const slime = makeSlime({
      stats: makeStats({ hunger: 60, hp: 50 }),
      inventory: [],
    })

    const result = await processSlimeTurn(slime, [], 1, undefined, undefined, undefined, {
      weather: 'sunny',
      season: 'spring',
    })

    // spring: hungerDecrement = 5 + 0 = 5
    // hunger = 60 - 5 = 55
    const hungerEvent = result.events.find((e) => e.eventType === 'hunger_decrease')
    expect(hungerEvent).toBeDefined()
    const after = hungerEvent!.eventData['after'] as number
    expect(after).toBe(55)
  })

  it('COV-ST-04: autumn では hungerDecrement が標準 5 のみ（summer/winter と異なる）', async () => {
    const slime = makeSlime({
      stats: makeStats({ hunger: 60, hp: 50 }),
      inventory: [],
    })

    const result = await processSlimeTurn(slime, [], 1, undefined, undefined, undefined, {
      weather: 'sunny',
      season: 'autumn',
    })

    // autumn: hungerDecrement = 5 + 0 = 5
    // hunger = 60 - 5 = 55
    const hungerEvent = result.events.find((e) => e.eventType === 'hunger_decrease')
    expect(hungerEvent).toBeDefined()
    const after = hungerEvent!.eventData['after'] as number
    expect(after).toBe(55)
  })

  it('COV-ST-05: worldContext が未指定の場合は spring 相当（補正なし）', async () => {
    const slime = makeSlime({
      stats: makeStats({ hunger: 60, hp: 50 }),
      inventory: [],
    })

    const result = await processSlimeTurn(slime, [], 1)

    // デフォルト: hungerDecrement = 5
    const hungerEvent = result.events.find((e) => e.eventType === 'hunger_decrease')
    expect(hungerEvent).toBeDefined()
    const after = hungerEvent!.eventData['after'] as number
    expect(after).toBe(55)
  })

  it('COV-ST-06: hunger が hungerDecrement 以下の場合、0 にクランプされる', async () => {
    const slime = makeSlime({
      stats: makeStats({ hunger: 3, hp: 50 }),
      inventory: [],
    })

    const result = await processSlimeTurn(slime, [], 1, undefined, undefined, undefined, {
      season: 'summer', // decrement = 7
    })

    // 3 - 7 = -4 → clamp → 0
    const hungerEvent = result.events.find((e) => e.eventType === 'hunger_decrease')
    expect(hungerEvent).toBeDefined()
    const after = hungerEvent!.eventData['after'] as number
    expect(after).toBe(0)
  })
})

// ================================================================
// 4. checkEvolution — 進化条件が空配列のケース
// ================================================================

describe('checkEvolution — evolutionConditions が空配列', () => {
  it('COV-EVO-01: evolutionConditions が空配列の場合、進化しない', () => {
    const slime = makeSlime({
      stats: makeStats({ atk: 100, exp: 999 }),
      racialValues: makeRacialValues({ fire: 1.0 }),
    })
    const speciesData: SlimeSpecies = {
      id: 'slime-001',
      name: 'スライム',
      description: '普通のスライム',
      baseStats: makeStats(),
      evolutionConditions: [],
    }

    const result = checkEvolution(slime, speciesData)

    expect(result.evolved).toBe(false)
    expect(result.updatedSlime.speciesId).toBe(slime.speciesId)
  })

  it('COV-EVO-02: requiredStats も requiredRacialValues も空のオブジェクト（条件なし = 即進化）', () => {
    const slime = makeSlime()
    const speciesData: SlimeSpecies = {
      id: 'slime-001',
      name: 'スライム',
      description: '普通のスライム',
      baseStats: makeStats(),
      evolutionConditions: [
        {
          targetSpeciesId: 'slime-fire-001',
          requiredStats: {},
          requiredRacialValues: {},
        },
      ],
    }

    const result = checkEvolution(slime, speciesData)

    // 条件が空 = 常に満たす → 進化する
    expect(result.evolved).toBe(true)
    expect(result.updatedSlime.speciesId).toBe('slime-fire-001')
  })

  it('COV-EVO-03: 複数条件のうち最初は失敗、2番目は成功する場合、2番目で進化', () => {
    const slime = makeSlime({
      stats: makeStats({ atk: 5 }), // atk < 50 → 最初の条件は失敗
      racialValues: makeRacialValues({ water: 1.0 }),
    })
    const speciesData: SlimeSpecies = {
      id: 'slime-001',
      name: 'スライム',
      description: '普通のスライム',
      baseStats: makeStats(),
      evolutionConditions: [
        {
          targetSpeciesId: 'slime-fire-001',
          requiredStats: { atk: 50 }, // 失敗（atk=5）
          requiredRacialValues: {},
        },
        {
          targetSpeciesId: 'slime-water-001',
          requiredStats: {},
          requiredRacialValues: { water: 1.0 }, // 成功（water=1.0）
        },
      ],
    }

    const result = checkEvolution(slime, speciesData)

    expect(result.evolved).toBe(true)
    expect(result.updatedSlime.speciesId).toBe('slime-water-001')
  })
})

// ================================================================
// 5. rest アクション — healAmount 計算と hunger +10
// ================================================================

describe('executeReservedAction — rest アクション', () => {
  it('COV-REST-01: rest アクションで HP が maxHp × 20% 回復する', async () => {
    const slime = makeSlime({
      stats: makeStats({ hp: 30, atk: 10, def: 10, spd: 10, hunger: 60 }),
    })
    const reservation = makeReservation({ actionType: 'rest', actionData: {} })

    const result = await executeReservedAction(slime, reservation)

    // maxHp = 10 + 10 + 50 = 70、healAmount = floor(70 * 0.2) = 14
    // hp = min(30 + 14, 70) = 44
    expect(result.updatedSlime.stats.hp).toBe(44)
    expect(result.events.some((e) => e.eventType === 'rest')).toBe(true)
  })

  it('COV-REST-02: rest アクションで hunger が +10 回復する', async () => {
    const slime = makeSlime({
      stats: makeStats({ hp: 30, hunger: 60 }),
    })
    const reservation = makeReservation({ actionType: 'rest', actionData: {} })

    const result = await executeReservedAction(slime, reservation)

    // hunger = min(60 + 10, 100) = 70
    expect(result.updatedSlime.stats.hunger).toBe(70)
  })

  it('COV-REST-03: HP が maxHp 以上の場合はクランプされる', async () => {
    const slime = makeSlime({
      stats: makeStats({ hp: 68, atk: 10, def: 10 }),
    })
    const reservation = makeReservation({ actionType: 'rest', actionData: {} })

    const result = await executeReservedAction(slime, reservation)

    // maxHp = 70、healAmount = 14
    // hp = min(68 + 14, 70) = 70（クランプ）
    expect(result.updatedSlime.stats.hp).toBe(70)
  })

  it('COV-REST-04: hunger が 90 のとき rest 後は 100 にクランプされる', async () => {
    const slime = makeSlime({
      stats: makeStats({ hunger: 90 }),
    })
    const reservation = makeReservation({ actionType: 'rest', actionData: {} })

    const result = await executeReservedAction(slime, reservation)

    // hunger = clamp(90 + 10, 0, 100) = 100
    expect(result.updatedSlime.stats.hunger).toBe(100)
  })
})

// ================================================================
// 6. addToInventory — 既存スロット加算と満杯チェック
// ================================================================

describe('addToInventory — 境界値テスト', () => {
  it('COV-INV-01: 既存スロットに同じfoodIdを追加すると数量が加算される（スロット数変化なし）', () => {
    const inventory: InventorySlot[] = [{ foodId: 'food-test', quantity: 5 }]

    const result = addToInventory(inventory, 'food-test', 3)

    expect(result.success).toBe(true)
    expect(result.inventory).toHaveLength(1) // スロット数変化なし
    expect(result.inventory![0].quantity).toBe(8) // 5 + 3 = 8
  })

  it('COV-INV-02: INVENTORY_MAX_SLOTS 個のスロットが埋まっている場合、新規追加は失敗する', () => {
    const inventory: InventorySlot[] = Array.from({ length: INVENTORY_MAX_SLOTS }, (_, i) => ({
      foodId: `food-${i}`,
      quantity: 1,
    }))

    const result = addToInventory(inventory, 'food-new', 1)

    expect(result.success).toBe(false)
    expect(result.event).toBe('inventory_full')
  })

  it('COV-INV-03: INVENTORY_MAX_SLOTS - 1 個の場合、新規追加は成功する', () => {
    const inventory: InventorySlot[] = Array.from({ length: INVENTORY_MAX_SLOTS - 1 }, (_, i) => ({
      foodId: `food-${i}`,
      quantity: 1,
    }))

    const result = addToInventory(inventory, 'food-new', 1)

    expect(result.success).toBe(true)
    expect(result.inventory).toHaveLength(INVENTORY_MAX_SLOTS)
  })
})

// ================================================================
// 7. removeFromInventory — 数量不足・存在しないfoodId
// ================================================================

describe('removeFromInventory — エラーケース', () => {
  it('COV-REM-01: 存在しない foodId を指定した場合は失敗する', () => {
    const inventory: InventorySlot[] = [{ foodId: 'food-a', quantity: 3 }]

    const result = removeFromInventory(inventory, 'food-nonexistent', 1)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('COV-REM-02: quantity が在庫より多い場合は失敗する', () => {
    const inventory: InventorySlot[] = [{ foodId: 'food-a', quantity: 2 }]

    const result = removeFromInventory(inventory, 'food-a', 3)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('COV-REM-03: quantity がちょうど在庫と同じ場合はスロットが削除される', () => {
    const inventory: InventorySlot[] = [{ foodId: 'food-a', quantity: 2 }]

    const result = removeFromInventory(inventory, 'food-a', 2)

    expect(result.success).toBe(true)
    expect(result.inventory).toHaveLength(0) // quantity=0 になったスロットは削除
  })

  it('COV-REM-04: 空のインベントリから削除しようとすると失敗する', () => {
    const result = removeFromInventory([], 'food-a', 1)

    expect(result.success).toBe(false)
  })
})
