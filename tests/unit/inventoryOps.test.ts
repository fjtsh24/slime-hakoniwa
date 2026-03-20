/**
 * インベントリ操作ヘルパー ユニットテスト（Phase 4 Week 1 TDD RED フェーズ）
 *
 * テスト対象:
 *   functions/src/scheduled/turnProcessor.ts — addToInventory / removeFromInventory
 *
 * 実行方法:
 *   cd functions && npx jest tests/unit/inventoryOps.test.ts --verbose
 *
 * TDD 手順:
 *   1. このテストが Red（失敗）になることを確認する（Week 1）
 *   2. turnProcessor.ts に addToInventory / removeFromInventory を実装し Green にする（Week 2 以降、A3/BE担当）
 *   3. リファクタリングして Green を維持する
 *
 * 依存関係:
 *   - functions/src/scheduled/turnProcessor.ts（addToInventory, removeFromInventory）
 *   - shared/types/slime.ts（InventorySlot）
 *   - shared/constants/game.ts（INVENTORY_MAX_SLOTS）
 *
 * モック方針:
 *   - firebase-admin は jest.mock() で完全にモックする
 *   - Firestore アクセスは発生しない（純粋なヘルパー関数）
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

// Week 2 で実装される想定のヘルパー関数
// 現時点では export されていないため、このインポートは RED になる
import {
  addToInventory,
  removeFromInventory,
} from '../../functions/src/scheduled/turnProcessor'
import type { InventorySlot } from '../../shared/types/slime'
import { INVENTORY_MAX_SLOTS } from '../../shared/constants/game'

// ================================================================
// テスト用フィクスチャ
// ================================================================

function makeInventory(slots: Array<{ foodId: string; quantity: number }>): InventorySlot[] {
  return slots.map(({ foodId, quantity }) => ({ foodId, quantity }))
}

// ================================================================
// addToInventory テストスイート
// ================================================================

describe.skip('addToInventory', () => {
  // ----------------------------------------------------------------
  // テスト 1: 新規アイテムを追加する
  // ----------------------------------------------------------------
  it('空のインベントリに新規アイテムを追加できる', () => {
    const inventory: InventorySlot[] = []

    const result = addToInventory(inventory, 'food-plant-001', 2)

    expect(result.success).toBe(true)
    expect(result.inventory).toBeDefined()
    expect(result.inventory).toHaveLength(1)
    expect(result.inventory![0]).toEqual({ foodId: 'food-plant-001', quantity: 2 })
  })

  // ----------------------------------------------------------------
  // テスト 2: 既存アイテムの数量を加算する
  // ----------------------------------------------------------------
  it('既存の foodId のスロットに数量を加算する', () => {
    const inventory = makeInventory([{ foodId: 'food-plant-001', quantity: 3 }])

    const result = addToInventory(inventory, 'food-plant-001', 2)

    expect(result.success).toBe(true)
    expect(result.inventory).toHaveLength(1) // スロット数は増えない
    expect(result.inventory![0]).toEqual({ foodId: 'food-plant-001', quantity: 5 })
  })

  // ----------------------------------------------------------------
  // テスト 3: INVENTORY_MAX_SLOTS を超えた場合は追加を拒否して inventory_full イベントを返す
  // ----------------------------------------------------------------
  it(`INVENTORY_MAX_SLOTS（${INVENTORY_MAX_SLOTS}）を超えた場合は追加を拒否して inventory_full を返す`, () => {
    // INVENTORY_MAX_SLOTS 分の異なる foodId でインベントリを満杯にする
    const inventory = makeInventory(
      Array.from({ length: INVENTORY_MAX_SLOTS }, (_, i) => ({
        foodId: `food-filler-${String(i).padStart(3, '0')}`,
        quantity: 1,
      }))
    )

    // 新しい foodId（既存スロットなし）を追加しようとする
    const result = addToInventory(inventory, 'food-new-999', 1)

    expect(result.success).toBe(false)
    expect(result.event).toBe('inventory_full')
    // inventory は変更されていないこと
    expect(result.inventory).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // テスト 4: 同一 foodId のスロットが存在する場合はスロット数を増やさない
  // ----------------------------------------------------------------
  it('既存の foodId へ加算してもスロット数が増えない（インベントリ満杯でも加算できる）', () => {
    // INVENTORY_MAX_SLOTS 分の異なる foodId でインベントリを満杯にする
    // ただし最後のスロットは 'food-plant-001' にしておく
    const slots = Array.from({ length: INVENTORY_MAX_SLOTS - 1 }, (_, i) => ({
      foodId: `food-filler-${String(i).padStart(3, '0')}`,
      quantity: 1,
    }))
    slots.push({ foodId: 'food-plant-001', quantity: 3 })
    const inventory = makeInventory(slots)

    // 既存の foodId に加算 → スロット数は変わらないため許可される
    const result = addToInventory(inventory, 'food-plant-001', 5)

    expect(result.success).toBe(true)
    expect(result.inventory).toHaveLength(INVENTORY_MAX_SLOTS) // スロット数変化なし
    const targetSlot = result.inventory!.find((s) => s.foodId === 'food-plant-001')
    expect(targetSlot).toEqual({ foodId: 'food-plant-001', quantity: 8 })
  })
})

// ================================================================
// removeFromInventory テストスイート
// ================================================================

describe.skip('removeFromInventory', () => {
  // ----------------------------------------------------------------
  // テスト 5: アイテムの数量を減算する
  // ----------------------------------------------------------------
  it('指定した foodId の数量を減算する', () => {
    const inventory = makeInventory([
      { foodId: 'food-plant-001', quantity: 5 },
      { foodId: 'food-slime-001', quantity: 2 },
    ])

    const result = removeFromInventory(inventory, 'food-plant-001', 3)

    expect(result.success).toBe(true)
    expect(result.inventory).toBeDefined()
    const targetSlot = result.inventory!.find((s) => s.foodId === 'food-plant-001')
    expect(targetSlot).toEqual({ foodId: 'food-plant-001', quantity: 2 })
    // 他のスロットは変化しない
    const otherSlot = result.inventory!.find((s) => s.foodId === 'food-slime-001')
    expect(otherSlot).toEqual({ foodId: 'food-slime-001', quantity: 2 })
  })

  // ----------------------------------------------------------------
  // テスト 6: 数量が0になったスロットを削除する
  // ----------------------------------------------------------------
  it('数量が0になったスロットはインベントリから削除される', () => {
    const inventory = makeInventory([
      { foodId: 'food-plant-001', quantity: 3 },
      { foodId: 'food-slime-001', quantity: 2 },
    ])

    const result = removeFromInventory(inventory, 'food-plant-001', 3)

    expect(result.success).toBe(true)
    expect(result.inventory).toHaveLength(1)
    expect(result.inventory![0].foodId).toBe('food-slime-001')
    // 削除されたスロットが存在しないこと
    const removedSlot = result.inventory!.find((s) => s.foodId === 'food-plant-001')
    expect(removedSlot).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // テスト 7: 存在しないアイテムの削除を試みた場合はエラーを返す
  // ----------------------------------------------------------------
  it('存在しない foodId を削除しようとした場合はエラーを返す', () => {
    const inventory = makeInventory([{ foodId: 'food-plant-001', quantity: 3 }])

    const result = removeFromInventory(inventory, 'food-nonexistent-999', 1)

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(typeof result.error).toBe('string')
    // inventory は変更されていないこと
    expect(result.inventory).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // テスト 8: 数量が不足している場合はエラーを返す
  // ----------------------------------------------------------------
  it('指定した数量がインベントリの数量を超える場合はエラーを返す', () => {
    const inventory = makeInventory([{ foodId: 'food-plant-001', quantity: 2 }])

    const result = removeFromInventory(inventory, 'food-plant-001', 5) // 2個しかないのに5個取ろうとする

    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
    expect(typeof result.error).toBe('string')
    // inventory は変更されていないこと（部分的な差し引きもしない）
    expect(result.inventory).toBeUndefined()
  })
})
