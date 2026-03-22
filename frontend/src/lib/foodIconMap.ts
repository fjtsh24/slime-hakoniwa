/**
 * foodId → アイコン画像URL のユーティリティ
 *
 * 画像パスは shared/data/foods.ts の imageUrl フィールドで一元管理。
 * このモジュールは後方互換のラッパーとして残す。
 *
 * 使用素材クレジット:
 * - fruits アイコン: おれんじりりぃ (https://orangelily.booth.pm/)
 * - plants (herb/nut/mushroom) アイコン: ゆきはな / Paper Moon (https://twitter.com/__yukihana__)
 *   ※ブラウザゲームのため画像の抜き出しはご遠慮ください
 */

import { foods } from '../../../shared/data/foods'

export function getFoodIconUrl(foodId: string): string | null {
  return foods.find((f) => f.id === foodId)?.imageUrl ?? null
}
