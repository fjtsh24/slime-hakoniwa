/**
 * foodId → アイコン画像URL のマッピング
 *
 * 使用素材クレジット:
 * - fruits/plants (herb, nut, mushroom) icons: おれんじりりぃ (https://orangelily.booth.pm/)
 * - herb/nut/mushroom icons: ゆきはな / Paper Moon (https://twitter.com/__yukihana__)
 *   ※ブラウザゲームのため画像の抜き出しはご遠慮ください
 * - slime-base.png: © 2022 SakeSalmon
 */

const FOOD_ICON_MAP: Record<string, string> = {
  // slime 系 — dragon_fruit (虹色のイメージ) / grape (透明感)
  'food-slime-001': '/assets/food/fruits/grape.png',
  'food-slime-002': '/assets/food/fruits/blueberry.png',
  'food-slime-003': '/assets/food/fruits/dragon_fruit.png',

  // plant 系 — 薬草・木の実アイコン（ゆきはな/Paper Moon）
  'food-plant-001': '/assets/food/plants/herb1.png',
  'food-plant-002': '/assets/food/plants/herb2.png',
  'food-plant-003': '/assets/food/plants/nut1.png',

  // human 系 — 干し肉, 魔法のパン
  'food-human-001': '/assets/food/prepared/preserved_meat.png',
  'food-human-002': '/assets/food/prepared/bread.png',

  // beast 系 — 獣の肉, 魔獣の心臓
  'food-beast-001': '/assets/food/prepared/meat.png',
  'food-beast-002': '/assets/food/fruits/persimmon.png', // 深紅の実 = 魔獣の心臓イメージ

  // spirit 系 — 精霊の涙, 霊魂の結晶
  'food-spirit-001': '/assets/food/fruits/peaches.png',  // ほんのりピンク = 精霊の涙
  'food-spirit-002': '/assets/food/fruits/kiwi_fruit.png', // 緑の結晶イメージ

  // fish 系 — 川魚, 深海魚
  'food-fish-001': '/assets/food/prepared/fish_river.png',
  'food-fish-002': '/assets/food/prepared/fish_deep.png',
}

export function getFoodIconUrl(foodId: string): string | null {
  return FOOD_ICON_MAP[foodId] ?? null
}
