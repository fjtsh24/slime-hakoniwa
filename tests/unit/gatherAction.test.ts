/**
 * 採集アクション ユニットテスト（Phase 4 Week 2）
 *
 * テスト対象:
 *   functions/src/scheduled/turnProcessor.ts — executeReservedAction (gather)
 *
 * 実行方法:
 *   cd functions && npx jest tests/unit/gatherAction.test.ts --verbose
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
    id: 'slime-gather-test-001',
    ownerUid: 'user-test-001',
    mapId: 'map-test-001',
    worldId: 'world-test-001',
    speciesId: 'slime-001',
    tileX: 5,
    tileY: 5,
    name: '採集テストスライム',
    stats: makeStats(),
    racialValues: makeRacialValues(),
    inventory: [],
    isWild: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeGatherReservation(overrides?: Partial<ActionReservation>): ActionReservation {
  return {
    id: 'reservation-gather-test-001',
    slimeId: 'slime-gather-test-001',
    ownerUid: 'user-test-001',
    worldId: 'world-test-001',
    turnNumber: 1,
    actionType: 'gather',
    actionData: {},
    status: 'pending',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    executedAt: null,
    ...overrides,
  }
}

function makeTile(x: number, y: number, attrs: Partial<{ fire: number; water: number; earth: number; wind: number }> = {}): Tile {
  return {
    id: `tile-${x}-${y}`,
    mapId: 'map-test-001',
    x,
    y,
    attributes: { fire: 0, water: 0, earth: 0, wind: 0, ...attrs },
  }
}

// ================================================================
// テストスイート
// ================================================================

describe('executeGatherAction', () => {
  // ----------------------------------------------------------------
  // テスト 1: earth 属性 >= 0.3 のタイルでは gather_success が発生する
  // ----------------------------------------------------------------
  it('earth 属性 >= 0.3 のタイルで gather_success イベントが記録される', async () => {
    const slime = makeSlime({ tileX: 3, tileY: 3 })
    const tiles = [makeTile(3, 3, { earth: 0.5 })]
    const reservation = makeGatherReservation()

    const result = await executeReservedAction(slime, reservation, foods, tiles)

    const successEvent = result.events.find((e) => e.eventType === 'gather_success')
    expect(successEvent).toBeDefined()
    expect(successEvent?.eventData['tableId']).toBe('drop-gather-earth')
  })

  // ----------------------------------------------------------------
  // テスト 2: water 属性 >= 0.3 のタイルでは水属性テーブルが使われる
  // ----------------------------------------------------------------
  it('water 属性 >= 0.3 のタイルで drop-gather-water テーブルが使われる', async () => {
    const slime = makeSlime({ tileX: 2, tileY: 2 })
    const tiles = [makeTile(2, 2, { water: 0.4 })]
    const reservation = makeGatherReservation()

    const result = await executeReservedAction(slime, reservation, foods, tiles)

    const successEvent = result.events.find((e) => e.eventType === 'gather_success')
    expect(successEvent).toBeDefined()
    expect(successEvent?.eventData['tableId']).toBe('drop-gather-water')
  })

  // ----------------------------------------------------------------
  // テスト 3: 全属性 < 0.3 のタイルではデフォルトテーブルが使われる
  // ----------------------------------------------------------------
  it('全属性 < 0.3 のタイルでデフォルトテーブル（drop-gather-default）が使われる', async () => {
    const slime = makeSlime({ tileX: 1, tileY: 1 })
    const tiles = [makeTile(1, 1, { earth: 0.1, water: 0.1, fire: 0.1, wind: 0.1 })]
    const reservation = makeGatherReservation()

    const result = await executeReservedAction(slime, reservation, foods, tiles)

    const successEvent = result.events.find((e) => e.eventType === 'gather_success')
    expect(successEvent).toBeDefined()
    expect(successEvent?.eventData['tableId']).toBe('drop-gather-default')
  })

  // ----------------------------------------------------------------
  // テスト 4: タイル情報がない場合もデフォルトテーブルにフォールバックする
  // ----------------------------------------------------------------
  it('タイル情報なし（tiles 空）の場合もデフォルトテーブルで gather_success になる', async () => {
    const slime = makeSlime({ tileX: 5, tileY: 5 })
    const reservation = makeGatherReservation()

    const result = await executeReservedAction(slime, reservation, foods, [])

    const successEvent = result.events.find((e) => e.eventType === 'gather_success')
    expect(successEvent).toBeDefined()
    expect(successEvent?.eventData['tableId']).toBe('drop-gather-default')
  })

  // ----------------------------------------------------------------
  // テスト 5: gather 成功時にインベントリにアイテムが追加される
  // ----------------------------------------------------------------
  it('gather 成功後にインベントリにアイテムが追加される', async () => {
    const slime = makeSlime({ tileX: 3, tileY: 3, inventory: [] })
    const tiles = [makeTile(3, 3, { earth: 0.5 })]
    const reservation = makeGatherReservation()

    const result = await executeReservedAction(slime, reservation, foods, tiles)

    expect(result.updatedSlime.inventory).toBeDefined()
    expect(result.updatedSlime.inventory!.length).toBeGreaterThan(0)
  })

  // ----------------------------------------------------------------
  // テスト 6: インベントリ満杯の場合 inventory_full イベントが発生し gather_success はない
  // ----------------------------------------------------------------
  it('インベントリ満杯のとき inventory_full イベントが発生し gather_success はない', async () => {
    const fullInventory: InventorySlot[] = Array.from({ length: 10 }, (_, i) => ({
      foodId: `food-filler-${String(i).padStart(3, '0')}`,
      quantity: 1,
    }))
    const slime = makeSlime({ tileX: 3, tileY: 3, inventory: fullInventory })
    const tiles = [makeTile(3, 3, { earth: 0.5 })]
    const reservation = makeGatherReservation()

    const result = await executeReservedAction(slime, reservation, foods, tiles)

    const fullEvent = result.events.find((e) => e.eventType === 'inventory_full')
    expect(fullEvent).toBeDefined()
    const successEvent = result.events.find((e) => e.eventType === 'gather_success')
    expect(successEvent).toBeUndefined()
    // インベントリは変化しない
    expect(result.updatedSlime.inventory!.length).toBe(10)
  })

  // ----------------------------------------------------------------
  // テスト 7: gather 成功時、スライムのステータスは変化しない（hunger は別途処理）
  // ----------------------------------------------------------------
  it('gather 成功時にスライムのステータス（hp/atk/hunger）は変化しない', async () => {
    const slime = makeSlime({ tileX: 3, tileY: 3 })
    const tiles = [makeTile(3, 3, { earth: 0.5 })]
    const reservation = makeGatherReservation()

    const result = await executeReservedAction(slime, reservation, foods, tiles)

    expect(result.updatedSlime.stats.hp).toBe(slime.stats.hp)
    expect(result.updatedSlime.stats.atk).toBe(slime.stats.atk)
    expect(result.updatedSlime.stats.hunger).toBe(slime.stats.hunger)
  })

  // ----------------------------------------------------------------
  // テスト 8: 複数タイルがある場合スライムのtileX/tileYに合致するタイルが選ばれる
  // ----------------------------------------------------------------
  it('複数タイルがあるときスライムの位置のタイルが正しく選択される', async () => {
    const slime = makeSlime({ tileX: 7, tileY: 2 })
    const tiles = [
      makeTile(3, 3, { earth: 0.5 }),  // スライムの位置ではない
      makeTile(7, 2, { water: 0.6 }),  // スライムの位置
      makeTile(1, 1, { fire: 0.8 }),
    ]
    const reservation = makeGatherReservation()

    const result = await executeReservedAction(slime, reservation, foods, tiles)

    const successEvent = result.events.find((e) => e.eventType === 'gather_success')
    expect(successEvent).toBeDefined()
    expect(successEvent?.eventData['tableId']).toBe('drop-gather-water')
  })
})
