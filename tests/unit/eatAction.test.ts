/**
 * 食事アクション ユニットテスト（Phase 3 TDD スケルトン）
 *
 * テスト対象:
 *   functions/src/scheduled/turnProcessor.ts — executeReservedAction (eat)
 *
 * 実行方法:
 *   cd functions && npx jest tests/unit/eatAction.test.ts --verbose
 *
 * TDD 手順:
 *   1. このスケルトンの各 it() が Red（失敗）になることを確認する
 *   2. turnProcessor.ts の executeReservedAction を実装し Green にする
 *   3. リファクタリングして Green を維持する
 *
 * 依存関係:
 *   - functions/src/scheduled/turnProcessor.ts（executeReservedAction）
 *   - shared/data/foods.ts（食料マスタデータ）
 *   - shared/types/slime.ts（Slime, SlimeStats, RacialValues）
 *   - shared/types/food.ts（Food）
 *   - shared/types/action.ts（ActionReservation）
 *
 * モック方針:
 *   - firebase-admin は jest.mock() で完全にモックする
 *   - 食料データは shared/data/foods.ts のマスタデータを直接利用する
 *   - Firestore アクセスは発生しない（foods 引数で直接渡す）
 */

// ================================================================
// firebase-admin モック（Firestore アクセスを遮断）
// ================================================================

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

// ================================================================
// テスト対象のインポート
// ================================================================

import { executeReservedAction } from '../../functions/src/scheduled/turnProcessor'
import type { Slime, SlimeStats, RacialValues, InventorySlot } from '../../shared/types/slime'
import type { Food, StatDeltas, RacialDeltas } from '../../shared/types/food'
import type { ActionReservation } from '../../shared/types/action'
import { foods } from '../../shared/data/foods'

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
    id: 'slime-eat-test-001',
    ownerUid: 'user-test-001',
    mapId: 'map-test-001',
    worldId: 'world-test-001',
    speciesId: 'slime-001',
    tileX: 5,
    tileY: 5,
    name: '食事テストスライム',
    stats: makeStats(),
    racialValues: makeRacialValues(),
    // Phase 4 Week 1: インベントリフィールドを追加
    // 既存テストは現在の実装（インベントリ未対応）でも通過できるよう、
    // inventory は Slime 型の省略可能フィールドとして扱う
    inventory: [{ foodId: 'food-plant-001', quantity: 3 }] as InventorySlot[],
    isWild: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeEatReservation(foodId: string, overrides?: Partial<ActionReservation>): ActionReservation {
  return {
    id: 'reservation-eat-test-001',
    slimeId: 'slime-eat-test-001',
    ownerUid: 'user-test-001',
    worldId: 'world-test-001',
    turnNumber: 1,
    actionType: 'eat',
    actionData: { foodId },
    status: 'pending',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    executedAt: null,
    ...overrides,
  }
}

/**
 * テスト用食料オブジェクトを作成するヘルパー
 * statDeltas と racialDeltas を明示的に指定できる
 */
function makeFood(
  id: string,
  statDeltas: StatDeltas,
  racialDeltas: RacialDeltas,
  skillGrantProb = 0,
  skillGrantId: string | null = null
): Food {
  return {
    id,
    name: `テスト食料（${id}）`,
    description: 'テスト用食料',
    category: 'slime',
    statDeltas,
    racialDeltas,
    skillGrantId,
    skillGrantProb,
  }
}

// ================================================================
// テストスイート
// ================================================================

describe('executeEatAction', () => {
  // ----------------------------------------------------------------
  // テスト 1: hunger が statDeltas.hunger 分だけ回復する
  // ----------------------------------------------------------------
  it('hunger が +30 回復する（実装固定値）', async () => {
    const slime = makeSlime({ stats: makeStats({ hunger: 50 }) })
    const food = makeFood('food-test-001', { hp: 5 }, {})
    const reservation = makeEatReservation(food.id)

    const result = await executeReservedAction(slime, reservation, [food])

    expect(result.updatedSlime.stats.hunger).toBe(80) // 50 + 30 = 80
  })

  // ----------------------------------------------------------------
  // テスト 2: hunger は100を超えない（クランプ）
  // ----------------------------------------------------------------
  it('hunger は100を超えない（上限クランプ）', async () => {
    const slime = makeSlime({ stats: makeStats({ hunger: 80 }) })
    const food = makeFood('food-test-001', {}, {})
    const reservation = makeEatReservation(food.id)

    const result = await executeReservedAction(slime, reservation, [food])

    expect(result.updatedSlime.stats.hunger).toBe(100) // clamp(80+30, 0, 100)
  })

  // ----------------------------------------------------------------
  // テスト 3: statDeltas の全フィールドが適用される
  // ----------------------------------------------------------------
  it('statDeltas の全フィールド（hp/atk/def/spd/exp）が適用される', async () => {
    const slime = makeSlime({
      stats: makeStats({ hp: 50, atk: 10, def: 10, spd: 10, exp: 0 }),
    })
    const food = makeFood('food-test-all-stats', {
      hp: 5,
      atk: 3,
      def: 2,
      spd: 1,
      exp: 10,
    }, {})
    const reservation = makeEatReservation(food.id)

    const result = await executeReservedAction(slime, reservation, [food])

    expect(result.updatedSlime.stats.hp).toBe(55)
    expect(result.updatedSlime.stats.atk).toBe(13)
    expect(result.updatedSlime.stats.def).toBe(12)
    expect(result.updatedSlime.stats.spd).toBe(11)
    expect(result.updatedSlime.stats.exp).toBe(10)
  })

  // ----------------------------------------------------------------
  // テスト 4: racialDeltas の全フィールドが適用される
  // ----------------------------------------------------------------
  it('racialDeltas の全フィールドが適用される', async () => {
    const slime = makeSlime({ racialValues: makeRacialValues() }) // 全値 0
    const food = makeFood('food-test-racial', {}, {
      fire: 0.1,
      water: 0.2,
      earth: 0.3,
      slime: 0.15,
      plant: 0.05,
    })
    const reservation = makeEatReservation(food.id)

    const result = await executeReservedAction(slime, reservation, [food])

    expect(result.updatedSlime.racialValues.fire).toBeCloseTo(0.1)
    expect(result.updatedSlime.racialValues.water).toBeCloseTo(0.2)
    expect(result.updatedSlime.racialValues.earth).toBeCloseTo(0.3)
    expect(result.updatedSlime.racialValues.slime).toBeCloseTo(0.15)
    expect(result.updatedSlime.racialValues.plant).toBeCloseTo(0.05)
  })

  // ----------------------------------------------------------------
  // テスト 5: skillGrantProb > 0 かつ Math.random() がしきい値以下の場合スキルが付与される
  // ----------------------------------------------------------------
  it('skillGrantProb > 0 かつ Math.random() がしきい値以下の場合スキルが付与される', async () => {
    // skillGrantProb=1.0 なら Math.random() は常に 1.0 以下なのでモック不要
    const slime = makeSlime()
    const food = makeFood('food-skill-test', {}, {}, 1.0, 'skill-def-001') // 確率100%
    const reservation = makeEatReservation(food.id)

    const result = await executeReservedAction(slime, reservation, [food])

    const skillGrantEvent = result.events.find((e) => e.eventType === 'skill_grant')
    expect(skillGrantEvent).toBeDefined()
    expect(skillGrantEvent?.eventData['skillId']).toBe('skill-def-001')
  })

  // ----------------------------------------------------------------
  // テスト 6: skillGrantProb = 0 の場合スキルは付与されない
  // ----------------------------------------------------------------
  it('skillGrantProb = 0 の場合スキルは付与されない', async () => {
    const slime = makeSlime()
    const food = makeFood('food-no-skill', {}, {}, 0, null) // 確率0%
    const reservation = makeEatReservation(food.id)

    const result = await executeReservedAction(slime, reservation, [food])

    const skillGrantEvent = result.events.find((e) => e.eventType === 'skill_grant')
    expect(skillGrantEvent).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // テスト 7: 存在しない foodId の場合アクションがスキップされる
  // ----------------------------------------------------------------
  it('存在しない foodId の場合アクションがスキップされる（スライムのステータスが変化しない）', async () => {
    const slime = makeSlime({ stats: makeStats({ hunger: 50 }) })
    const reservation = makeEatReservation('food-nonexistent-999')

    const result = await executeReservedAction(slime, reservation, [])
    // foods 引数に空配列 → 食料が見つからない

    expect(result.updatedSlime.stats.hunger).toBe(50) // hunger は変化しない
    expect(result.updatedSlime.stats.hp).toBe(slime.stats.hp)

    const eatEvent = result.events.find((e) => e.eventType === 'eat')
    expect(eatEvent).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // 参考テスト: マスタデータの food-slime-002 を使った食事テスト
  // ----------------------------------------------------------------
  it('（参考）マスタデータ food-slime-002 で食事するとステータスと種族値が変化する', async () => {
    const slime = makeSlime({ stats: makeStats({ hp: 50, hunger: 50 }) })
    const food = foods.find((f) => f.id === 'food-slime-002')!
    const reservation = makeEatReservation(food.id)

    const result = await executeReservedAction(slime, reservation, foods)

    expect(result.updatedSlime.stats.hp).toBe(55) // 50 + 5
    expect(result.updatedSlime.stats.hunger).toBe(80) // 50 + 30
    expect(result.updatedSlime.racialValues.slime).toBeCloseTo(0.2)

    const eatEvent = result.events.find((e) => e.eventType === 'eat')
    expect(eatEvent).toBeDefined()
    expect(eatEvent?.eventData['foodId']).toBe('food-slime-002')
  })

  // ================================================================
  // Phase 4 Week 1 追加テスト（RED: 現在の実装では失敗する）
  // インベントリ連動の eat アクション挙動を検証する
  // ================================================================

  // ----------------------------------------------------------------
  // 追加テスト 9: インベントリに食料がある場合は eat アクションが成功し、
  //               インベントリの数量が1減算される（Week 2 実装後に GREEN になる）
  // ----------------------------------------------------------------
  it.skip('[RED] インベントリに食料がある場合、eat アクション後にインベントリの数量が減る', async () => {
    const foodId = 'food-plant-001'
    const food = makeFood(foodId, { hp: 5 }, { plant: 0.1 })
    const inventory: InventorySlot[] = [{ foodId, quantity: 3 }]
    const slime = makeSlime({
      stats: makeStats({ hunger: 50 }),
      inventory,
    })
    const reservation = makeEatReservation(foodId)

    const result = await executeReservedAction(slime, reservation, [food])

    // インベントリの数量が1減算されていること（3 → 2）
    expect(result.updatedSlime.inventory).toBeDefined()
    const slot = result.updatedSlime.inventory!.find((s: InventorySlot) => s.foodId === foodId)
    expect(slot).toBeDefined()
    expect(slot!.quantity).toBe(2)
  })

  // ----------------------------------------------------------------
  // 追加テスト 10: インベントリに食料がない場合は eat アクションが失敗し、
  //                ステータスが変化しない（Week 2 実装後に GREEN になる）
  // ----------------------------------------------------------------
  it.skip('[RED] インベントリに食料がない場合、eat アクションが失敗してステータスが変化しない', async () => {
    const foodId = 'food-plant-001'
    const food = makeFood(foodId, { hp: 5 }, { plant: 0.1 })
    // インベントリは空（対象の食料がない）
    const inventory: InventorySlot[] = []
    const slime = makeSlime({
      stats: makeStats({ hunger: 50 }),
      inventory,
    })
    const reservation = makeEatReservation(foodId)

    const result = await executeReservedAction(slime, reservation, [food])

    // インベントリに食料がないため、hunger とステータスは変化しない
    expect(result.updatedSlime.stats.hunger).toBe(50)
    expect(result.updatedSlime.stats.hp).toBe(slime.stats.hp)
    // eat イベントは記録されない
    const eatEvent = result.events.find((e) => e.eventType === 'eat')
    expect(eatEvent).toBeUndefined()
    // inventory_not_found イベントが記録されること
    const notFoundEvent = result.events.find((e) => e.eventType === 'inventory_not_found')
    expect(notFoundEvent).toBeDefined()
  })
})
