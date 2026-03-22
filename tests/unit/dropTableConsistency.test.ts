/**
 * DropTable × Foods 整合性テスト
 *
 * dropTable.ts に定義された全 foodId が foods.ts に存在することを保証する。
 * foods.ts に存在しない foodId は turnProcessor でサイレントに無視され、
 * インベントリに追加されないバグになるため、このテストで早期検出する。
 *
 * 食料データ変更時やドロップテーブル変更時は必ずこのテストが通ることを確認すること。
 */

import { dropTables } from '../../shared/data/dropTable'
import { foods } from '../../shared/data/foods'

describe('DropTable × Foods 整合性', () => {
  const foodIdSet = new Set(foods.map((f) => f.id))

  test('全 dropTable エントリの foodId が foods.ts に定義されている', () => {
    const missing: { tableId: string; foodId: string }[] = []

    for (const table of dropTables) {
      for (const drop of table.drops) {
        if (!foodIdSet.has(drop.foodId)) {
          missing.push({ tableId: table.id, foodId: drop.foodId })
        }
      }
    }

    if (missing.length > 0) {
      const lines = missing.map((m) => `  ${m.tableId}: "${m.foodId}" が foods.ts に存在しない`).join('\n')
      throw new Error(`以下の foodId が foods.ts に定義されていません:\n${lines}`)
    }

    expect(missing).toEqual([])
  })

  test('foods.ts の全エントリに imageUrl が設定されているか、または意図的に省略されている', () => {
    // imageUrl なしの食料を一覧化（情報として出力し、テストは失敗させない）
    const noImage = foods.filter((f) => !f.imageUrl)
    if (noImage.length > 0) {
      console.warn(
        `imageUrl 未設定の食料（${noImage.length}件）:\n` +
          noImage.map((f) => `  ${f.id} (${f.name})`).join('\n')
      )
    }
    // imageUrl なし自体はエラーではなく警告のみ
    expect(true).toBe(true)
  })

  test('dropTable の各エントリに foods が1件以上ある', () => {
    for (const table of dropTables) {
      expect(table.drops.length).toBeGreaterThan(0)
    }
  })

  test('dropTable の各 drop.weight が正の整数である', () => {
    for (const table of dropTables) {
      for (const drop of table.drops) {
        expect(drop.weight).toBeGreaterThan(0)
        expect(Number.isInteger(drop.weight)).toBe(true)
      }
    }
  })

  test('dropTable の各 drop.minQty <= maxQty かつ両方1以上', () => {
    for (const table of dropTables) {
      for (const drop of table.drops) {
        expect(drop.minQty).toBeGreaterThanOrEqual(1)
        expect(drop.maxQty).toBeGreaterThanOrEqual(drop.minQty)
      }
    }
  })
})
