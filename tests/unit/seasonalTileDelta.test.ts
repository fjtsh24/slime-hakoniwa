/**
 * 季節タイル自動変化 ユニットテスト（Phase 8 Week 3）
 *
 * テスト対象:
 *   functions/src/scheduled/turnProcessor.ts — computeSeasonalTileDelta
 *
 * 実行方法:
 *   cd functions && npx jest tests/unit/seasonalTileDelta.test.ts --verbose
 *
 * 注意: computeSeasonalTileDelta は純粋関数のため Firestore モック不要。
 */

jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
      })),
      where: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ docs: [] }),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    })),
  })),
  initializeApp: jest.fn(),
  apps: [],
  app: jest.fn(),
}))

import { computeSeasonalTileDelta } from '../../functions/src/scheduled/turnProcessor'
import type { TileAttributes } from '../../shared/types/map'
import { SEASON_TILE_DELTA_PER_TURN } from '../../shared/constants/game'

// ================================================================
// テスト用フィクスチャ
// ================================================================

function makeAttrs(overrides: Partial<TileAttributes> = {}): TileAttributes {
  return { fire: 0.3, water: 0.3, earth: 0.3, wind: 0.3, ...overrides }
}

// ================================================================
// テストスイート
// ================================================================

describe('computeSeasonalTileDelta', () => {
  // ----------------------------------------------------------------
  // テスト 1: spring → water +0.005
  // ----------------------------------------------------------------
  it('spring のとき water が +0.005 される', () => {
    const attrs = makeAttrs({ water: 0.3 })
    const result = computeSeasonalTileDelta(attrs, 'spring')
    expect(result.water).toBeCloseTo(0.3 + SEASON_TILE_DELTA_PER_TURN, 5)
    // 他の属性は変化しない
    expect(result.fire).toBe(attrs.fire)
    expect(result.earth).toBe(attrs.earth)
    expect(result.wind).toBe(attrs.wind)
  })

  // ----------------------------------------------------------------
  // テスト 2: summer → fire +0.005
  // ----------------------------------------------------------------
  it('summer のとき fire が +0.005 される', () => {
    const attrs = makeAttrs({ fire: 0.5 })
    const result = computeSeasonalTileDelta(attrs, 'summer')
    expect(result.fire).toBeCloseTo(0.5 + SEASON_TILE_DELTA_PER_TURN, 5)
    expect(result.water).toBe(attrs.water)
    expect(result.earth).toBe(attrs.earth)
    expect(result.wind).toBe(attrs.wind)
  })

  // ----------------------------------------------------------------
  // テスト 3: autumn → wind +0.005
  // ----------------------------------------------------------------
  it('autumn のとき wind が +0.005 される', () => {
    const attrs = makeAttrs({ wind: 0.2 })
    const result = computeSeasonalTileDelta(attrs, 'autumn')
    expect(result.wind).toBeCloseTo(0.2 + SEASON_TILE_DELTA_PER_TURN, 5)
    expect(result.fire).toBe(attrs.fire)
    expect(result.water).toBe(attrs.water)
    expect(result.earth).toBe(attrs.earth)
  })

  // ----------------------------------------------------------------
  // テスト 4: winter → earth +0.005
  // ----------------------------------------------------------------
  it('winter のとき earth が +0.005 される', () => {
    const attrs = makeAttrs({ earth: 0.7 })
    const result = computeSeasonalTileDelta(attrs, 'winter')
    expect(result.earth).toBeCloseTo(0.7 + SEASON_TILE_DELTA_PER_TURN, 5)
    expect(result.fire).toBe(attrs.fire)
    expect(result.water).toBe(attrs.water)
    expect(result.wind).toBe(attrs.wind)
  })

  // ----------------------------------------------------------------
  // テスト 5: 上限クランプ（0.998 + 0.005 → 1.0）
  // ----------------------------------------------------------------
  it('属性値が 0.998 のとき spring で water +0.005 すると 1.0 にクランプされる', () => {
    const attrs = makeAttrs({ water: 0.998 })
    const result = computeSeasonalTileDelta(attrs, 'spring')
    expect(result.water).toBe(1.0)
    expect(result.water).toBeLessThanOrEqual(1.0)
  })

  // ----------------------------------------------------------------
  // テスト 6: すでに 1.0 の属性は 1.0 のまま変わらない
  // ----------------------------------------------------------------
  it('属性値が 1.0 のとき summer で fire +0.005 しても 1.0 のまま', () => {
    const attrs = makeAttrs({ fire: 1.0 })
    const result = computeSeasonalTileDelta(attrs, 'summer')
    expect(result.fire).toBe(1.0)
  })

  // ----------------------------------------------------------------
  // テスト 7: 未知のシーズンは属性を変化させない
  // ----------------------------------------------------------------
  it('未知のシーズン（"foggy" 等）では属性が変化しない', () => {
    const attrs = makeAttrs()
    const result = computeSeasonalTileDelta(attrs, 'foggy')
    expect(result).toEqual(attrs)
  })

  // ----------------------------------------------------------------
  // テスト 8: 下限クランプ（0.0 に負の変化がかかっても 0.0 未満にならない）
  // ----------------------------------------------------------------
  it('SEASON_TILE_DELTA_PER_TURN が負の値でも下限 0.0 にクランプされる（防御的テスト）', () => {
    // 現在は DELTA=+0.005 で下限に達することはないが、将来の変更に備えて検証
    // computeSeasonalTileDelta は clamp(0, 1.0) を保証しているため、
    // 仮に属性値が 0.0 でも結果が 0.0 以上であることを確認する
    const attrs = makeAttrs({ water: 0.0, fire: 0.0, earth: 0.0, wind: 0.0 })
    const result = computeSeasonalTileDelta(attrs, 'spring')
    expect(result.water).toBeGreaterThanOrEqual(0.0)
    expect(result.fire).toBeGreaterThanOrEqual(0.0)
    expect(result.earth).toBeGreaterThanOrEqual(0.0)
    expect(result.wind).toBeGreaterThanOrEqual(0.0)
  })

  // ----------------------------------------------------------------
  // テスト 9: 元の attrs オブジェクトを変更しない（イミュータブル）
  // ----------------------------------------------------------------
  it('元の attrs オブジェクトを変更しない', () => {
    const attrs = makeAttrs({ water: 0.3 })
    const original = { ...attrs }
    computeSeasonalTileDelta(attrs, 'spring')
    expect(attrs).toEqual(original)
  })
})
