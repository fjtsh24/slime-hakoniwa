/**
 * 釣りアクション ユニットテスト（Phase 4 Week 2）
 *
 * テスト対象:
 *   functions/src/scheduled/turnProcessor.ts — executeReservedAction (fish)
 *
 * 実行方法:
 *   cd functions && npx jest tests/unit/fishAction.test.ts --verbose
 */

jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
      })),
    })),
  })),
  initializeApp: jest.fn(),
  apps: [],
  app: jest.fn(),
}))

import { executeReservedAction } from '../../functions/src/scheduled/turnProcessor'
import type { Slime, SlimeStats, RacialValues, InventorySlot } from '../../shared/types/slime'
import type { ActionReservation } from '../../shared/types/action'
import type { Tile } from '../../shared/types/map'
import { foods } from '../../shared/data/foods'

// ================================================================
// テスト用フィクスチャ
// ================================================================

function makeStats(overrides?: Partial<SlimeStats>): SlimeStats {
  return { hp: 50, atk: 10, def: 10, spd: 10, exp: 0, hunger: 50, ...overrides }
}

function makeRacialValues(): RacialValues {
  return { fire: 0, water: 0, earth: 0, wind: 0, slime: 0, plant: 0, human: 0, beast: 0, spirit: 0, fish: 0 }
}

function makeSlime(overrides?: Partial<Slime>): Slime {
  return {
    id: 'slime-fish-test-001',
    ownerUid: 'user-test-001',
    mapId: 'map-test-001',
    worldId: 'world-test-001',
    speciesId: 'slime-001',
    tileX: 5,
    tileY: 5,
    name: '釣りテストスライム',
    stats: makeStats(),
    racialValues: makeRacialValues(),
    inventory: [],
    isWild: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeFishReservation(overrides?: Partial<ActionReservation>): ActionReservation {
  return {
    id: 'reservation-fish-test-001',
    slimeId: 'slime-fish-test-001',
    ownerUid: 'user-test-001',
    worldId: 'world-test-001',
    turnNumber: 1,
    actionType: 'fish',
    actionData: {},
    status: 'pending',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    executedAt: null,
    ...overrides,
  }
}

function makeTile(x: number, y: number, attrs: Partial<{ fire: number; water: number; earth: number; wind: number }> = {}): Tile {
  const baseAttrs = { fire: 0, water: 0, earth: 0, wind: 0, ...attrs }
  return {
    id: `tile-${x}-${y}`,
    mapId: 'map-test-001',
    x,
    y,
    attributes: baseAttrs,
    baseAttributes: baseAttrs,
  }
}

// ================================================================
// テストスイート
// ================================================================

describe('executeFishAction', () => {
  // ----------------------------------------------------------------
  // テスト 1: water >= 0.3 のタイルで fish_success が発生する
  // ----------------------------------------------------------------
  it('water >= 0.3 のタイルで fish_success イベントが記録される', async () => {
    const slime = makeSlime({ tileX: 4, tileY: 4 })
    const tiles = [makeTile(4, 4, { water: 0.5 })]
    const reservation = makeFishReservation()

    const result = await executeReservedAction(slime, reservation, foods, tiles)

    const successEvent = result.events.find((e) => e.eventType === 'fish_success')
    expect(successEvent).toBeDefined()
    expect(successEvent?.eventData['foodId']).toBeDefined()
  })

  // ----------------------------------------------------------------
  // テスト 2: water < 0.3 のタイルでは fish_fail（reason: water_too_low）
  // ----------------------------------------------------------------
  it('water < 0.3 のタイルで fish_fail（water_too_low）イベントが発生する', async () => {
    const slime = makeSlime({ tileX: 4, tileY: 4 })
    const tiles = [makeTile(4, 4, { water: 0.1 })]
    const reservation = makeFishReservation()

    const result = await executeReservedAction(slime, reservation, foods, tiles)

    const failEvent = result.events.find((e) => e.eventType === 'fish_fail')
    expect(failEvent).toBeDefined()
    expect(failEvent?.eventData['reason']).toBe('water_too_low')
    // ステータスは変化しない
    expect(result.updatedSlime.stats.hp).toBe(slime.stats.hp)
  })

  // ----------------------------------------------------------------
  // テスト 3: タイル情報なし（water = 0）のとき fish_fail
  // ----------------------------------------------------------------
  it('タイル情報なし（tiles 空）のとき water = 0 として fish_fail になる', async () => {
    const slime = makeSlime({ tileX: 5, tileY: 5 })
    const reservation = makeFishReservation()

    const result = await executeReservedAction(slime, reservation, foods, [])

    const failEvent = result.events.find((e) => e.eventType === 'fish_fail')
    expect(failEvent).toBeDefined()
    expect(failEvent?.eventData['reason']).toBe('water_too_low')
  })

  // ----------------------------------------------------------------
  // テスト 4: fish 成功時にインベントリに魚系食料が追加される
  // ----------------------------------------------------------------
  it('fish 成功後にインベントリに食料が追加される', async () => {
    const slime = makeSlime({ tileX: 4, tileY: 4, inventory: [] })
    const tiles = [makeTile(4, 4, { water: 0.5 })]
    const reservation = makeFishReservation()

    const result = await executeReservedAction(slime, reservation, foods, tiles)

    expect(result.updatedSlime.inventory).toBeDefined()
    expect(result.updatedSlime.inventory!.length).toBeGreaterThan(0)
    // fish ドロップテーブルは food-fish-001 か food-fish-002
    const droppedFoodId = result.updatedSlime.inventory![0].foodId
    expect(['food-fish-001', 'food-fish-002']).toContain(droppedFoodId)
  })

  // ----------------------------------------------------------------
  // テスト 5: インベントリ満杯のとき inventory_full イベントが発生し fish_success はない
  // ----------------------------------------------------------------
  it('インベントリ満杯のとき inventory_full イベントが発生し fish_success はない', async () => {
    const fullInventory: InventorySlot[] = Array.from({ length: 10 }, (_, i) => ({
      foodId: `food-filler-${String(i).padStart(3, '0')}`,
      quantity: 1,
    }))
    const slime = makeSlime({ tileX: 4, tileY: 4, inventory: fullInventory })
    const tiles = [makeTile(4, 4, { water: 0.5 })]
    const reservation = makeFishReservation()

    const result = await executeReservedAction(slime, reservation, foods, tiles)

    const fullEvent = result.events.find((e) => e.eventType === 'inventory_full')
    expect(fullEvent).toBeDefined()
    const successEvent = result.events.find((e) => e.eventType === 'fish_success')
    expect(successEvent).toBeUndefined()
    // インベントリは変化しない
    expect(result.updatedSlime.inventory!.length).toBe(10)
  })

  // ----------------------------------------------------------------
  // テスト 6: fish_fail のときスライムのステータスは変化しない
  // ----------------------------------------------------------------
  it('fish_fail のときスライムのステータスは変化しない', async () => {
    const slime = makeSlime({ tileX: 4, tileY: 4 })
    const tiles = [makeTile(4, 4, { water: 0.0 })]
    const reservation = makeFishReservation()

    const result = await executeReservedAction(slime, reservation, foods, tiles)

    expect(result.updatedSlime.stats.hp).toBe(slime.stats.hp)
    expect(result.updatedSlime.stats.hunger).toBe(slime.stats.hunger)
    expect(result.updatedSlime.inventory!.length).toBe(0)
  })
})
