/**
 * plant アクション ユニットテスト（Phase 8 Week 2）
 *
 * テスト対象:
 *   functions/src/scheduled/turnProcessor.ts — executePlantAction (plant case)
 *
 * 実行方法:
 *   cd functions && npx jest tests/unit/plantAction.test.ts --verbose
 *
 * 注意: executePlantAction は A3/BE による実装後に通過する。
 *       テストは TDD 方針に従い先行作成。
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
import type { Food } from '../../shared/types/food'

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
    id: 'slime-plant-test-001',
    ownerUid: 'user-test-001',
    mapId: 'map-test-001',
    worldId: 'world-test-001',
    speciesId: 'slime-001',
    tileX: 5,
    tileY: 5,
    name: '植え付けテストスライム',
    stats: makeStats(),
    racialValues: makeRacialValues(),
    inventory: [],
    isWild: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makePlantReservation(foodId: string, overrides?: Partial<ActionReservation>): ActionReservation {
  return {
    id: 'reservation-plant-test-001',
    slimeId: 'slime-plant-test-001',
    ownerUid: 'user-test-001',
    worldId: 'world-test-001',
    turnNumber: 1,
    actionType: 'plant',
    actionData: { foodId },
    status: 'pending',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    executedAt: null,
    ...overrides,
  }
}

function makeTile(
  x: number,
  y: number,
  attrs: Partial<{ fire: number; water: number; earth: number; wind: number }> = {}
): Tile {
  const baseAttrs = { fire: 0, water: 0, earth: 0, wind: 0, ...attrs }
  return {
    id: `tile-${x}-${y}`,
    mapId: 'map-test-001',
    x,
    y,
    attributes: { ...baseAttrs },
    baseAttributes: { fire: 0, water: 0, earth: 0, wind: 0 },
  }
}

/** beast 系食料: fire +0.05 */
const beastFood: Food = {
  id: 'food-beast-meat',
  name: '獣の肉',
  description: 'beast 系の食料。タイルの fire 属性を強化する。',
  category: 'beast',
  statDeltas: {},
  racialDeltas: {},
  skillGrantId: null,
  skillGrantProb: 0,
  tileAttributeDelta: { fire: 0.05 },
}

/** 浄化食料: fire -0.08 */
const purifyFireFood: Food = {
  id: 'food-purify-fire',
  name: '消炎草',
  description: '浄化食料。タイルの fire 属性を弱化する。',
  category: 'plant',
  statDeltas: {},
  racialDeltas: {},
  skillGrantId: null,
  skillGrantProb: 0,
  tileAttributeDelta: { fire: -0.08 },
}

/** tileAttributeDelta が未定義の食料（plant 不可） */
const noEffectFood: Food = {
  id: 'food-slime-fragment',
  name: 'スライムのかけら',
  description: 'タイル効果なし。',
  category: 'slime',
  statDeltas: {},
  racialDeltas: {},
  skillGrantId: null,
  skillGrantProb: 0,
  // tileAttributeDelta: 未定義
}

/** human 系食料: 全属性 +0.01 */
const humanFood: Food = {
  id: 'food-human-bread',
  name: '人間のパン',
  description: 'human 系の食料。全属性を微量強化する。',
  category: 'human',
  statDeltas: {},
  racialDeltas: {},
  skillGrantId: null,
  skillGrantProb: 0,
  tileAttributeDelta: { fire: 0.01, water: 0.01, earth: 0.01, wind: 0.01 },
}

// ================================================================
// テストスイート
// ================================================================

describe('executePlantAction', () => {
  // ----------------------------------------------------------------
  // テスト 1: 通常植え付け（beast food → fire +0.05）
  // ----------------------------------------------------------------
  it('beast 系食料を plant すると fire 属性が +0.05 され、インベントリから1個消費される', async () => {
    const inventory: InventorySlot[] = [{ foodId: beastFood.id, quantity: 3 }]
    const slime = makeSlime({ tileX: 5, tileY: 5, inventory })
    const tile = makeTile(5, 5, { fire: 0.2 })
    const reservation = makePlantReservation(beastFood.id)

    const result = await executeReservedAction(slime, reservation, [beastFood], [tile])

    const successEvent = result.events.find((e) => e.eventType === 'plant_success')
    expect(successEvent).toBeDefined()

    // fire 属性が +0.05 されているか
    const updatedFire = successEvent?.eventData['fire'] as number | undefined
    expect(updatedFire).toBeCloseTo(0.2 + 0.05, 5)

    // インベントリから1個消費されているか
    const slot = result.updatedSlime.inventory?.find((s) => s.foodId === beastFood.id)
    expect(slot?.quantity).toBe(2)
  })

  // ----------------------------------------------------------------
  // テスト 2: 浄化植え付け（purify-fire → fire -0.08）
  // ----------------------------------------------------------------
  it('浄化食料を plant すると fire 属性が -0.08 され、インベントリから1個消費される', async () => {
    const inventory: InventorySlot[] = [{ foodId: purifyFireFood.id, quantity: 2 }]
    const slime = makeSlime({ tileX: 5, tileY: 5, inventory })
    const tile = makeTile(5, 5, { fire: 0.5 })
    const reservation = makePlantReservation(purifyFireFood.id)

    const result = await executeReservedAction(slime, reservation, [purifyFireFood], [tile])

    const successEvent = result.events.find((e) => e.eventType === 'plant_success')
    expect(successEvent).toBeDefined()

    const updatedFire = successEvent?.eventData['fire'] as number | undefined
    expect(updatedFire).toBeCloseTo(0.5 - 0.08, 5)

    const slot = result.updatedSlime.inventory?.find((s) => s.foodId === purifyFireFood.id)
    expect(slot?.quantity).toBe(1)
  })

  // ----------------------------------------------------------------
  // テスト 3: インベントリに食料なし → plant_fail
  // ----------------------------------------------------------------
  it('インベントリに指定 foodId がない場合は plant_fail (reason: food_not_found) が発生する', async () => {
    const slime = makeSlime({ tileX: 5, tileY: 5, inventory: [] })
    const tile = makeTile(5, 5, { fire: 0.3 })
    const reservation = makePlantReservation(beastFood.id)

    const result = await executeReservedAction(slime, reservation, [beastFood], [tile])

    const failEvent = result.events.find((e) => e.eventType === 'plant_fail')
    expect(failEvent).toBeDefined()
    expect(failEvent?.eventData['reason']).toBe('food_not_found')

    // plant_success は発生しない
    const successEvent = result.events.find((e) => e.eventType === 'plant_success')
    expect(successEvent).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // テスト 4: tileAttributeDelta 未定義食料 → plant_fail
  // ----------------------------------------------------------------
  it('tileAttributeDelta が未定義の食料を plant しようとすると plant_fail (reason: no_tile_effect) が発生する', async () => {
    const inventory: InventorySlot[] = [{ foodId: noEffectFood.id, quantity: 1 }]
    const slime = makeSlime({ tileX: 5, tileY: 5, inventory })
    const tile = makeTile(5, 5)
    const reservation = makePlantReservation(noEffectFood.id)

    const result = await executeReservedAction(slime, reservation, [noEffectFood], [tile])

    const failEvent = result.events.find((e) => e.eventType === 'plant_fail')
    expect(failEvent).toBeDefined()
    expect(failEvent?.eventData['reason']).toBe('no_tile_effect')

    const successEvent = result.events.find((e) => e.eventType === 'plant_success')
    expect(successEvent).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // テスト 5: 上限クランプ（属性 0.95 + 0.1 → 1.0 に収まる）
  // ----------------------------------------------------------------
  it('fire が 0.95 のタイルに fire +0.1 の食料を plant すると結果は 1.0 にクランプされる', async () => {
    const strongBeastFood: Food = {
      ...beastFood,
      id: 'food-beast-heart',
      tileAttributeDelta: { fire: 0.1 },
    }
    const inventory: InventorySlot[] = [{ foodId: strongBeastFood.id, quantity: 1 }]
    const slime = makeSlime({ tileX: 5, tileY: 5, inventory })
    const tile = makeTile(5, 5, { fire: 0.95 })
    const reservation = makePlantReservation(strongBeastFood.id)

    const result = await executeReservedAction(slime, reservation, [strongBeastFood], [tile])

    const successEvent = result.events.find((e) => e.eventType === 'plant_success')
    expect(successEvent).toBeDefined()

    const updatedFire = successEvent?.eventData['fire'] as number | undefined
    expect(updatedFire).toBe(1.0)
    // 1.0 を超えないことを保証
    expect(updatedFire).toBeLessThanOrEqual(1.0)
  })

  // ----------------------------------------------------------------
  // テスト 6: 下限クランプ（属性 0.05 - 0.1 → 0.0 に収まる）
  // ----------------------------------------------------------------
  it('fire が 0.05 のタイルに fire -0.1 の食料を plant すると結果は 0.0 にクランプされる', async () => {
    const strongPurifyFood: Food = {
      ...purifyFireFood,
      id: 'food-purify-fire-strong',
      tileAttributeDelta: { fire: -0.1 },
    }
    const inventory: InventorySlot[] = [{ foodId: strongPurifyFood.id, quantity: 1 }]
    const slime = makeSlime({ tileX: 5, tileY: 5, inventory })
    const tile = makeTile(5, 5, { fire: 0.05 })
    const reservation = makePlantReservation(strongPurifyFood.id)

    const result = await executeReservedAction(slime, reservation, [strongPurifyFood], [tile])

    const successEvent = result.events.find((e) => e.eventType === 'plant_success')
    expect(successEvent).toBeDefined()

    const updatedFire = successEvent?.eventData['fire'] as number | undefined
    expect(updatedFire).toBe(0.0)
    // 0.0 を下回らないことを保証
    expect(updatedFire).toBeGreaterThanOrEqual(0.0)
  })

  // ----------------------------------------------------------------
  // テスト 7: 複数属性変化（human food で fire/water/earth/wind 各 +0.01）
  // ----------------------------------------------------------------
  it('human 系食料を plant すると fire/water/earth/wind の全属性が +0.01 される', async () => {
    const inventory: InventorySlot[] = [{ foodId: humanFood.id, quantity: 1 }]
    const slime = makeSlime({ tileX: 5, tileY: 5, inventory })
    const tile = makeTile(5, 5, { fire: 0.3, water: 0.3, earth: 0.3, wind: 0.3 })
    const reservation = makePlantReservation(humanFood.id)

    const result = await executeReservedAction(slime, reservation, [humanFood], [tile])

    const successEvent = result.events.find((e) => e.eventType === 'plant_success')
    expect(successEvent).toBeDefined()

    const data = successEvent?.eventData as Record<string, number> | undefined
    expect(data?.['fire']).toBeCloseTo(0.3 + 0.01, 5)
    expect(data?.['water']).toBeCloseTo(0.3 + 0.01, 5)
    expect(data?.['earth']).toBeCloseTo(0.3 + 0.01, 5)
    expect(data?.['wind']).toBeCloseTo(0.3 + 0.01, 5)
  })

  // ----------------------------------------------------------------
  // テスト 8: タイルが見つからない → plant_fail
  // ----------------------------------------------------------------
  it('スライムの tileX/tileY に対応するタイルが worldTiles にない場合は plant_fail (reason: tile_not_found) が発生する', async () => {
    const inventory: InventorySlot[] = [{ foodId: beastFood.id, quantity: 1 }]
    const slime = makeSlime({ tileX: 5, tileY: 5, inventory })
    // スライムの位置 (5,5) とは別の座標のタイルのみ渡す
    const tiles = [makeTile(1, 1), makeTile(2, 2)]
    const reservation = makePlantReservation(beastFood.id)

    const result = await executeReservedAction(slime, reservation, [beastFood], tiles)

    const failEvent = result.events.find((e) => e.eventType === 'plant_fail')
    expect(failEvent).toBeDefined()
    expect(failEvent?.eventData['reason']).toBe('tile_not_found')

    const successEvent = result.events.find((e) => e.eventType === 'plant_success')
    expect(successEvent).toBeUndefined()
  })
})
