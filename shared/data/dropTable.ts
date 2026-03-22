/**
 * ドロップテーブルマスタデータ
 * gather / fish / hunt / battle アクション用のドロップ定義
 *
 * 参照 foodId 一覧（foods.ts より）:
 *   slime  : food-slime-001〜003
 *            food-slime-drop-weak-001/002, food-slime-drop-normal-001/002, food-slime-drop-strong-001/002
 *   plant  : food-plant-001〜003
 *            food-fruit-001〜007（リンゴ/バナナ/イチゴ/メロン/サクランボ/スイカ/レモン）
 *            food-mush-001〜003（きのこ/毒きのこ/霊きのこ）
 *   human  : food-human-001〜002
 *   beast  : food-beast-001〜002
 *   spirit : food-spirit-001〜002
 *            food-spirit-drop-weak-001/002, food-spirit-drop-normal-001/002, food-spirit-drop-strong-001/002
 *   fish   : food-fish-001〜002
 *
 * ⚠️ foods.ts に存在しない foodId を追加すると turnProcessor でサイレントに無視される。
 *    変更後は tests/unit/dropTableConsistency.test.ts を必ず実行すること。
 */

import { DropTableEntry } from "../types/dropTable";

export const dropTables: DropTableEntry[] = [
  // =========================================================
  // gather ドロップテーブル（タイル属性条件付き）
  // =========================================================

  {
    id: "drop-gather-fire",
    actionType: "gather",
    tileCondition: { attribute: "fire", minValue: 0.3 },
    drops: [
      // 火属性タイル: beast / spirit 系 + 赤系フルーツ（サクランボ・バナナ）
      { foodId: "food-beast-001",  weight: 40, minQty: 1, maxQty: 2 },
      { foodId: "food-beast-002",  weight: 10, minQty: 1, maxQty: 1 },
      { foodId: "food-spirit-001", weight: 30, minQty: 1, maxQty: 2 },
      { foodId: "food-spirit-002", weight: 10, minQty: 1, maxQty: 1 },
      { foodId: "food-fruit-005",  weight: 20, minQty: 1, maxQty: 2 }, // サクランボ（赤・fire）
      { foodId: "food-fruit-002",  weight: 15, minQty: 1, maxQty: 2 }, // バナナ（エネルギー）
    ],
  },

  {
    id: "drop-gather-water",
    actionType: "gather",
    tileCondition: { attribute: "water", minValue: 0.3 },
    drops: [
      // 水属性タイル: fish / plant 系 + 水分豊富なフルーツ（スイカ・メロン）
      { foodId: "food-fish-001",   weight: 50, minQty: 1, maxQty: 2 },
      { foodId: "food-fish-002",   weight: 15, minQty: 1, maxQty: 1 },
      { foodId: "food-plant-001",  weight: 40, minQty: 1, maxQty: 3 },
      { foodId: "food-plant-002",  weight: 20, minQty: 1, maxQty: 2 },
      { foodId: "food-fruit-006",  weight: 25, minQty: 1, maxQty: 2 }, // スイカ（water豊富）
      { foodId: "food-fruit-004",  weight: 15, minQty: 1, maxQty: 1 }, // メロン（water豊富）
    ],
  },

  {
    id: "drop-gather-earth",
    actionType: "gather",
    tileCondition: { attribute: "earth", minValue: 0.3 },
    drops: [
      // 土属性タイル: plant 系 + フルーツ全般・キノコ（土から生える）
      { foodId: "food-plant-001",  weight: 50, minQty: 1, maxQty: 3 },
      { foodId: "food-plant-002",  weight: 25, minQty: 1, maxQty: 2 },
      { foodId: "food-plant-003",  weight: 10, minQty: 1, maxQty: 1 },
      { foodId: "food-beast-001",  weight: 20, minQty: 1, maxQty: 2 },
      { foodId: "food-fruit-001",  weight: 30, minQty: 1, maxQty: 2 }, // リンゴ
      { foodId: "food-fruit-003",  weight: 20, minQty: 1, maxQty: 2 }, // イチゴ
      { foodId: "food-mush-001",   weight: 25, minQty: 1, maxQty: 2 }, // きのこ
      { foodId: "food-mush-002",   weight: 10, minQty: 1, maxQty: 1 }, // 毒きのこ（レア）
      { foodId: "food-mush-003",   weight:  5, minQty: 1, maxQty: 1 }, // 霊きのこ（超レア）
    ],
  },

  {
    id: "drop-gather-wind",
    actionType: "gather",
    tileCondition: { attribute: "wind", minValue: 0.3 },
    drops: [
      // 風属性タイル: spirit / plant 系 + 酸味・香り系フルーツ（レモン・イチゴ）
      { foodId: "food-spirit-001", weight: 40, minQty: 1, maxQty: 2 },
      { foodId: "food-spirit-002", weight: 15, minQty: 1, maxQty: 1 },
      { foodId: "food-plant-001",  weight: 35, minQty: 1, maxQty: 3 },
      { foodId: "food-plant-002",  weight: 20, minQty: 1, maxQty: 2 },
      { foodId: "food-fruit-007",  weight: 25, minQty: 1, maxQty: 2 }, // レモン（爽快・wind）
      { foodId: "food-fruit-003",  weight: 20, minQty: 1, maxQty: 2 }, // イチゴ（軽い・spd）
      { foodId: "food-mush-003",   weight: 10, minQty: 1, maxQty: 1 }, // 霊きのこ（風の精霊由来）
    ],
  },

  {
    id: "drop-gather-default",
    actionType: "gather",
    tileCondition: null,
    drops: [
      // 条件なし: 基本的な食料 + 定番フルーツ・きのこ
      { foodId: "food-plant-001",  weight: 50, minQty: 1, maxQty: 3 },
      { foodId: "food-plant-002",  weight: 20, minQty: 1, maxQty: 2 },
      { foodId: "food-human-001",  weight: 20, minQty: 1, maxQty: 2 },
      { foodId: "food-beast-001",  weight: 15, minQty: 1, maxQty: 2 },
      { foodId: "food-fruit-001",  weight: 30, minQty: 1, maxQty: 2 }, // リンゴ（定番）
      { foodId: "food-fruit-002",  weight: 20, minQty: 1, maxQty: 2 }, // バナナ（定番）
      { foodId: "food-mush-001",   weight: 15, minQty: 1, maxQty: 1 }, // きのこ（定番）
    ],
  },

  // =========================================================
  // fish ドロップテーブル（water >= 0.3 が実行条件）
  // =========================================================

  {
    id: "drop-fish-water",
    actionType: "fish",
    tileCondition: { attribute: "water", minValue: 0.3 },
    drops: [
      // 魚系食料のみ
      { foodId: "food-fish-001", weight: 50, minQty: 1, maxQty: 3 },
      { foodId: "food-fish-002", weight: 15, minQty: 1, maxQty: 2 },
    ],
  },

  // =========================================================
  // hunt ドロップテーブル（タイル条件なし）
  // =========================================================

  {
    id: "drop-beast-weak",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      // beast 系食料（低品質）
      { foodId: "food-beast-001", weight: 50, minQty: 1, maxQty: 2 },
      { foodId: "food-human-001", weight: 20, minQty: 1, maxQty: 1 },
    ],
  },

  {
    id: "drop-beast-normal",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      // beast 系食料（高品質）
      { foodId: "food-beast-001", weight: 40, minQty: 1, maxQty: 3 },
      { foodId: "food-beast-002", weight: 25, minQty: 1, maxQty: 2 },
      { foodId: "food-human-001", weight: 15, minQty: 1, maxQty: 2 },
    ],
  },

  {
    id: "drop-plant-weak",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      // plant 系食料（低品質）
      { foodId: "food-plant-001", weight: 50, minQty: 1, maxQty: 2 },
      { foodId: "food-plant-002", weight: 20, minQty: 1, maxQty: 1 },
    ],
  },

  {
    id: "drop-plant-normal",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      // plant 系食料（高品質）
      { foodId: "food-plant-001", weight: 35, minQty: 1, maxQty: 3 },
      { foodId: "food-plant-002", weight: 30, minQty: 1, maxQty: 2 },
      { foodId: "food-plant-003", weight: 15, minQty: 1, maxQty: 1 },
    ],
  },

  // =========================================================
  // battle ドロップテーブル（hunt と同系統の food）
  // =========================================================

  {
    id: "drop-battle-beast-weak",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-beast-001", weight: 50, minQty: 1, maxQty: 2 },
      { foodId: "food-human-001", weight: 20, minQty: 1, maxQty: 1 },
    ],
  },

  {
    id: "drop-battle-beast-normal",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-beast-001", weight: 40, minQty: 1, maxQty: 3 },
      { foodId: "food-beast-002", weight: 30, minQty: 1, maxQty: 2 },
      { foodId: "food-human-001", weight: 15, minQty: 1, maxQty: 2 },
    ],
  },

  {
    id: "drop-battle-plant-weak",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-plant-001", weight: 50, minQty: 1, maxQty: 2 },
      { foodId: "food-plant-002", weight: 20, minQty: 1, maxQty: 1 },
    ],
  },

  {
    id: "drop-battle-plant-normal",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-plant-001", weight: 35, minQty: 1, maxQty: 3 },
      { foodId: "food-plant-002", weight: 30, minQty: 1, maxQty: 2 },
      { foodId: "food-plant-003", weight: 15, minQty: 1, maxQty: 1 },
    ],
  },

  // =========================================================
  // hunt ドロップテーブル（Phase 6 W2: 全カテゴリ strong + fish/human/spirit/slime）
  // =========================================================

  {
    id: "drop-beast-strong",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-beast-002", weight: 55, minQty: 1, maxQty: 3 },
      { foodId: "food-beast-001", weight: 30, minQty: 2, maxQty: 4 },
    ],
  },
  {
    id: "drop-plant-strong",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-plant-003", weight: 50, minQty: 1, maxQty: 2 },
      { foodId: "food-plant-002", weight: 35, minQty: 1, maxQty: 2 },
    ],
  },

  {
    id: "drop-fish-weak",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-fish-001", weight: 50, minQty: 1, maxQty: 2 },
      { foodId: "food-plant-001", weight: 20, minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: "drop-fish-normal",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-fish-001", weight: 40, minQty: 1, maxQty: 3 },
      { foodId: "food-fish-002", weight: 30, minQty: 1, maxQty: 2 },
      { foodId: "food-plant-001", weight: 15, minQty: 1, maxQty: 2 },
    ],
  },
  {
    id: "drop-fish-strong",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-fish-002", weight: 55, minQty: 1, maxQty: 3 },
      { foodId: "food-fish-001", weight: 30, minQty: 2, maxQty: 4 },
    ],
  },
  {
    id: "drop-human-weak",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-human-001", weight: 50, minQty: 1, maxQty: 2 },
      { foodId: "food-plant-001", weight: 20, minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: "drop-human-normal",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-human-001", weight: 40, minQty: 1, maxQty: 3 },
      { foodId: "food-human-002", weight: 25, minQty: 1, maxQty: 2 },
      { foodId: "food-beast-001", weight: 15, minQty: 1, maxQty: 2 },
    ],
  },
  {
    id: "drop-human-strong",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-human-002", weight: 55, minQty: 1, maxQty: 2 },
      { foodId: "food-human-001", weight: 30, minQty: 2, maxQty: 3 },
    ],
  },
  {
    id: "drop-spirit-weak",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-spirit-drop-weak-001", weight: 55, minQty: 1, maxQty: 2 },
      { foodId: "food-spirit-drop-weak-002", weight: 35, minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: "drop-spirit-normal",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-spirit-drop-normal-001", weight: 40, minQty: 1, maxQty: 2 },
      { foodId: "food-spirit-drop-normal-002", weight: 35, minQty: 1, maxQty: 1 },
      { foodId: "food-spirit-drop-weak-001",   weight: 15, minQty: 1, maxQty: 2 },
    ],
  },
  {
    id: "drop-spirit-strong",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-spirit-drop-strong-001", weight: 40, minQty: 1, maxQty: 1 },
      { foodId: "food-spirit-drop-strong-002", weight: 30, minQty: 1, maxQty: 1 },
      { foodId: "food-spirit-drop-normal-001", weight: 20, minQty: 1, maxQty: 2 },
    ],
  },
  {
    id: "drop-slime-weak",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-slime-drop-weak-001", weight: 55, minQty: 1, maxQty: 2 },
      { foodId: "food-slime-drop-weak-002", weight: 35, minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: "drop-slime-normal",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-slime-drop-normal-001", weight: 40, minQty: 1, maxQty: 2 },
      { foodId: "food-slime-drop-normal-002", weight: 35, minQty: 1, maxQty: 1 },
      { foodId: "food-slime-drop-weak-001",   weight: 15, minQty: 1, maxQty: 2 },
    ],
  },
  {
    id: "drop-slime-strong",
    actionType: "hunt",
    tileCondition: null,
    drops: [
      { foodId: "food-slime-drop-strong-001", weight: 40, minQty: 1, maxQty: 1 },
      { foodId: "food-slime-drop-strong-002", weight: 30, minQty: 1, maxQty: 1 },
      { foodId: "food-slime-drop-normal-001", weight: 20, minQty: 1, maxQty: 2 },
    ],
  },

  // =========================================================
  // battle ドロップテーブル（Phase 6 W2: 全カテゴリ strong + spirit/slime）
  // =========================================================

  {
    id: "drop-battle-beast-strong",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-beast-002", weight: 55, minQty: 1, maxQty: 2 },
      { foodId: "food-beast-001", weight: 30, minQty: 2, maxQty: 4 },
    ],
  },
  {
    id: "drop-battle-plant-strong",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-plant-003", weight: 50, minQty: 1, maxQty: 2 },
      { foodId: "food-plant-002", weight: 35, minQty: 1, maxQty: 2 },
    ],
  },
  {
    id: "drop-battle-fish-weak",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-fish-001", weight: 55, minQty: 1, maxQty: 2 },
      { foodId: "food-plant-001", weight: 20, minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: "drop-battle-fish-normal",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-fish-001", weight: 40, minQty: 1, maxQty: 3 },
      { foodId: "food-fish-002", weight: 35, minQty: 1, maxQty: 2 },
    ],
  },
  {
    id: "drop-battle-fish-strong",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-fish-002", weight: 60, minQty: 1, maxQty: 3 },
      { foodId: "food-fish-001", weight: 30, minQty: 2, maxQty: 4 },
    ],
  },
  {
    id: "drop-battle-human-weak",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-human-001", weight: 55, minQty: 1, maxQty: 2 },
      { foodId: "food-plant-001", weight: 20, minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: "drop-battle-human-normal",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-human-001", weight: 40, minQty: 1, maxQty: 3 },
      { foodId: "food-human-002", weight: 30, minQty: 1, maxQty: 2 },
      { foodId: "food-beast-001", weight: 15, minQty: 1, maxQty: 2 },
    ],
  },
  {
    id: "drop-battle-human-strong",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-human-002", weight: 60, minQty: 1, maxQty: 2 },
      { foodId: "food-human-001", weight: 25, minQty: 2, maxQty: 3 },
    ],
  },
  {
    id: "drop-battle-spirit-weak",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-spirit-drop-weak-001", weight: 55, minQty: 1, maxQty: 2 },
      { foodId: "food-spirit-drop-weak-002", weight: 35, minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: "drop-battle-spirit-normal",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-spirit-drop-normal-001", weight: 40, minQty: 1, maxQty: 2 },
      { foodId: "food-spirit-drop-normal-002", weight: 40, minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: "drop-battle-spirit-strong",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-spirit-drop-strong-001", weight: 45, minQty: 1, maxQty: 1 },
      { foodId: "food-spirit-drop-strong-002", weight: 35, minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: "drop-battle-slime-weak",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-slime-drop-weak-001", weight: 55, minQty: 1, maxQty: 2 },
      { foodId: "food-slime-drop-weak-002", weight: 35, minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: "drop-battle-slime-normal",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-slime-drop-normal-001", weight: 40, minQty: 1, maxQty: 2 },
      { foodId: "food-slime-drop-normal-002", weight: 40, minQty: 1, maxQty: 1 },
    ],
  },
  {
    id: "drop-battle-slime-strong",
    actionType: "battle",
    tileCondition: null,
    drops: [
      { foodId: "food-slime-drop-strong-001", weight: 45, minQty: 1, maxQty: 1 },
      { foodId: "food-slime-drop-strong-002", weight: 35, minQty: 1, maxQty: 1 },
    ],
  },
];
