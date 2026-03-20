/**
 * 狩りアクション ユニットテスト（Phase 4 Week 2）
 *
 * テスト対象:
 *   functions/src/scheduled/turnProcessor.ts — executeReservedAction (hunt)
 *
 * 実行方法:
 *   cd functions && npx jest tests/unit/huntAction.test.ts --verbose
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
    id: 'slime-hunt-test-001',
    ownerUid: 'user-test-001',
    mapId: 'map-test-001',
    worldId: 'world-test-001',
    speciesId: 'slime-001',
    tileX: 5,
    tileY: 5,
    name: '狩りテストスライム',
    stats: makeStats(),
    racialValues: makeRacialValues(),
    inventory: [],
    isWild: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeHuntReservation(
  targetCategory: string,
  targetStrength: string,
  overrides?: Partial<ActionReservation>
): ActionReservation {
  return {
    id: 'reservation-hunt-test-001',
    slimeId: 'slime-hunt-test-001',
    ownerUid: 'user-test-001',
    worldId: 'world-test-001',
    turnNumber: 1,
    actionType: 'hunt',
    actionData: { targetCategory, targetStrength },
    status: 'pending',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    executedAt: null,
    ...overrides,
  }
}

// ================================================================
// テストスイート
// ================================================================

describe('executeHuntAction', () => {
  // ----------------------------------------------------------------
  // テスト 1: 高ステータスのスライムは weak モンスターに必ず勝てる
  // atk=100 → attackRoll が必ず monster.power(10) を超える
  // ----------------------------------------------------------------
  it('atk が十分高い場合 hunt_success イベントが記録される', async () => {
    const slime = makeSlime({ stats: makeStats({ atk: 100, spd: 0 }) })
    const reservation = makeHuntReservation('beast', 'weak')

    const result = await executeReservedAction(slime, reservation, foods)

    const successEvent = result.events.find((e) => e.eventType === 'hunt_success')
    expect(successEvent).toBeDefined()
    expect(successEvent?.eventData['monsterId']).toBeDefined()
    // hunt_fail は発生しない
    const failEvent = result.events.find((e) => e.eventType === 'hunt_fail')
    expect(failEvent).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // テスト 2: ステータスが極めて低いスライムは normal モンスターに負ける
  // atk=1, spd=0 → attackRoll=1 ≤ monster.power(30) → 敗北確定
  // ----------------------------------------------------------------
  it('atk が十分低い場合 hunt_fail イベントが記録され HP が減少する', async () => {
    const slime = makeSlime({ stats: makeStats({ atk: 1, spd: 0, hp: 50 }) })
    const reservation = makeHuntReservation('beast', 'normal')

    const result = await executeReservedAction(slime, reservation, foods)

    const failEvent = result.events.find((e) => e.eventType === 'hunt_fail')
    expect(failEvent).toBeDefined()
    expect(failEvent?.eventData['damage']).toBeGreaterThan(0)
    // HP が減少している
    expect(result.updatedSlime.stats.hp).toBeLessThan(slime.stats.hp)
  })

  // ----------------------------------------------------------------
  // テスト 3: 敗北ダメージは ceil(monster.power * 0.5)
  // normal モンスター power=30 → damage = ceil(30 * 0.5) = 15
  // ----------------------------------------------------------------
  it('敗北ダメージが ceil(monster.power * 0.5) になる', async () => {
    const slime = makeSlime({ stats: makeStats({ atk: 1, spd: 0, hp: 50 }) })
    const reservation = makeHuntReservation('beast', 'normal') // power=30

    const result = await executeReservedAction(slime, reservation, foods)

    const failEvent = result.events.find((e) => e.eventType === 'hunt_fail')
    expect(failEvent).toBeDefined()
    expect(failEvent?.eventData['damage']).toBe(15) // ceil(30 * 0.5) = 15
    expect(result.updatedSlime.stats.hp).toBe(35) // 50 - 15
  })

  // ----------------------------------------------------------------
  // テスト 4: targetCategory / targetStrength がない場合はアクションがスキップされる
  // ----------------------------------------------------------------
  it('actionData に targetCategory がない場合アクションがスキップされる', async () => {
    const slime = makeSlime()
    const reservation = makeHuntReservation('', '') // 空文字列でも undefined 同様にスキップ

    const result = await executeReservedAction(slime, reservation, foods)

    const huntEvent = result.events.find((e) => e.eventType === 'hunt_success' || e.eventType === 'hunt_fail')
    expect(huntEvent).toBeUndefined()
    // ステータス変化なし
    expect(result.updatedSlime.stats.hp).toBe(slime.stats.hp)
  })

  // ----------------------------------------------------------------
  // テスト 5: 勝利時にインベントリにアイテムが追加される
  // ----------------------------------------------------------------
  it('hunt 勝利時にインベントリにドロップアイテムが追加される', async () => {
    const slime = makeSlime({ stats: makeStats({ atk: 100, spd: 0 }), inventory: [] })
    const reservation = makeHuntReservation('beast', 'weak')

    const result = await executeReservedAction(slime, reservation, foods)

    const successEvent = result.events.find((e) => e.eventType === 'hunt_success')
    expect(successEvent).toBeDefined()
    // drop-beast-weak のドロップ: food-beast-001 か food-human-001
    expect(result.updatedSlime.inventory!.length).toBeGreaterThan(0)
    const droppedFoodId = result.updatedSlime.inventory![0].foodId
    expect(['food-beast-001', 'food-human-001']).toContain(droppedFoodId)
  })

  // ----------------------------------------------------------------
  // テスト 6: インベントリ満杯でも hunt_success は記録される（hunt_success + inventory_full）
  // ----------------------------------------------------------------
  it('インベントリ満杯でも hunt_success が記録され inventory_full も発生する', async () => {
    const fullInventory: InventorySlot[] = Array.from({ length: 10 }, (_, i) => ({
      foodId: `food-filler-${String(i).padStart(3, '0')}`,
      quantity: 1,
    }))
    const slime = makeSlime({ stats: makeStats({ atk: 100, spd: 0 }), inventory: fullInventory })
    const reservation = makeHuntReservation('beast', 'weak')

    const result = await executeReservedAction(slime, reservation, foods)

    const successEvent = result.events.find((e) => e.eventType === 'hunt_success')
    expect(successEvent).toBeDefined()
    const fullEvent = result.events.find((e) => e.eventType === 'inventory_full')
    expect(fullEvent).toBeDefined()
    // インベントリは変化しない
    expect(result.updatedSlime.inventory!.length).toBe(10)
  })
})
