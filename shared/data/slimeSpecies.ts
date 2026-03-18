/**
 * スライム種族マスタデータ
 * 10種族を定義（基本種1 + 第1進化4 + 第2進化5）
 */

import { SlimeSpecies } from "../types";

export const slimeSpecies: SlimeSpecies[] = [
  // ===== 1. スライム（基本種） =====
  {
    id: "slime-001",
    name: "スライム",
    description: "基本種のスライム。全能力がバランスよくまとまっており、どんな環境にも適応できる。",
    baseStats: {
      hp: 50,
      atk: 10,
      def: 10,
      spd: 10,
      exp: 0,
      hunger: 80,
    },
    evolutionConditions: [
      {
        targetSpeciesId: "slime-002",
        requiredStats: { exp: 100 },
        requiredRacialValues: { fire: 0.5 },
      },
      {
        targetSpeciesId: "slime-003",
        requiredStats: { exp: 100 },
        requiredRacialValues: { water: 0.5 },
      },
      {
        targetSpeciesId: "slime-004",
        requiredStats: { exp: 100 },
        requiredRacialValues: { earth: 0.5 },
      },
      {
        targetSpeciesId: "slime-005",
        requiredStats: { exp: 100 },
        requiredRacialValues: { wind: 0.5 },
      },
    ],
  },

  // ===== 2. ファイアスライム =====
  {
    id: "slime-002",
    name: "ファイアスライム",
    description: "炎を宿したスライム。ATK が高く、火属性のタイルで育つと真価を発揮する。",
    baseStats: {
      hp: 45,
      atk: 25,
      def: 8,
      spd: 12,
      exp: 0,
      hunger: 75,
    },
    evolutionConditions: [
      {
        targetSpeciesId: "slime-006",
        requiredStats: { exp: 300 },
        requiredRacialValues: { spirit: 0.5 },
      },
    ],
  },

  // ===== 3. アクアスライム =====
  {
    id: "slime-003",
    name: "アクアスライム",
    description: "水を纏ったスライム。DEF が高く、水属性のタイルで安定した防御力を発揮する。",
    baseStats: {
      hp: 55,
      atk: 8,
      def: 25,
      spd: 10,
      exp: 0,
      hunger: 80,
    },
    evolutionConditions: [
      {
        targetSpeciesId: "slime-007",
        requiredStats: { exp: 300 },
        requiredRacialValues: { human: 0.5 },
      },
      {
        targetSpeciesId: "slime-010",
        requiredStats: { exp: 300 },
        requiredRacialValues: { plant: 0.5 },
      },
    ],
  },

  // ===== 4. アーススライム =====
  {
    id: "slime-004",
    name: "アーススライム",
    description: "大地の力を宿したスライム。HP が高く、土属性のタイルで圧倒的な耐久力を発揮する。",
    baseStats: {
      hp: 80,
      atk: 10,
      def: 15,
      spd: 6,
      exp: 0,
      hunger: 85,
    },
    evolutionConditions: [
      {
        targetSpeciesId: "slime-008",
        requiredStats: { exp: 300 },
        requiredRacialValues: { beast: 0.5 },
      },
    ],
  },

  // ===== 5. ウィンドスライム =====
  {
    id: "slime-005",
    name: "ウィンドスライム",
    description: "風を操るスライム。SPD が高く、風属性のタイルで素早い行動が可能になる。",
    baseStats: {
      hp: 40,
      atk: 12,
      def: 8,
      spd: 30,
      exp: 0,
      hunger: 70,
    },
    evolutionConditions: [
      {
        targetSpeciesId: "slime-009",
        requiredStats: { exp: 300 },
        requiredRacialValues: { fish: 0.5 },
      },
    ],
  },

  // ===== 6. ダークスライム =====
  {
    id: "slime-006",
    name: "ダークスライム",
    description: "霊気を宿したスライム。ATK と EXP 獲得に特化しており、spirit 系の食料で力をつけたファイアスライムが辿り着く闇の形態。",
    baseStats: {
      hp: 45,
      atk: 30,
      def: 8,
      spd: 15,
      exp: 0,
      hunger: 70,
    },
    evolutionConditions: [],
  },

  // ===== 7. ライトスライム =====
  {
    id: "slime-007",
    name: "ライトスライム",
    description: "人の温もりを宿したスライム。DEF が飛びぬけて高く、human 系の食料で育ったアクアスライムが辿り着く守護の形態。",
    baseStats: {
      hp: 60,
      atk: 8,
      def: 30,
      spd: 12,
      exp: 0,
      hunger: 80,
    },
    evolutionConditions: [],
  },

  // ===== 8. ドラゴンスライム =====
  {
    id: "slime-008",
    name: "ドラゴンスライム",
    description: "竜の血を取り込んだスライム。全ステータスが最高水準で、beast 系の食料で鍛えたアーススライムが到達できる究極の形態。",
    baseStats: {
      hp: 100,
      atk: 35,
      def: 25,
      spd: 20,
      exp: 0,
      hunger: 90,
    },
    evolutionConditions: [],
  },

  // ===== 9. マリンスライム =====
  {
    id: "slime-009",
    name: "マリンスライム",
    description: "深海の速さを体現したスライム。SPD が全種族最高で、fish 系の食料を摂り続けたウィンドスライムが辿り着く疾風の形態。",
    baseStats: {
      hp: 40,
      atk: 15,
      def: 10,
      spd: 40,
      exp: 0,
      hunger: 75,
    },
    evolutionConditions: [],
  },

  // ===== 10. フォレストスライム =====
  {
    id: "slime-010",
    name: "フォレストスライム",
    description: "森の生命力を宿したスライム。HP と回復能力に特化しており、plant 系の食料で育ったアクアスライムが辿り着く大地の守護者。",
    baseStats: {
      hp: 90,
      atk: 8,
      def: 20,
      spd: 10,
      exp: 0,
      hunger: 85,
    },
    evolutionConditions: [],
  },
];
