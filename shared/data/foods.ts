/**
 * 食料マスタデータ
 * FoodCategory ごとに最低2種類ずつ定義
 */

import { Food } from "../types";

export const foods: Food[] = [
  // ===== slime 種 =====
  {
    id: "food-slime-001",
    name: "スライムの欠片",
    description: "スライムの体から落ちた小さな欠片。スライム系の種族値が少し上がる。",
    category: "slime",
    statDeltas: {},
    racialDeltas: { slime: 0.1 },
    skillGrantId: null,
    skillGrantProb: 0.0,
  },
  {
    id: "food-slime-002",
    name: "スライムコア",
    description: "スライムの核。栄養価が高く、スライム系種族値と HP が大きく上がる。",
    category: "slime",
    statDeltas: { hp: 5 },
    racialDeltas: { slime: 0.2 },
    skillGrantId: null,
    skillGrantProb: 0.0,
  },
  {
    id: "food-slime-003",
    name: "プリズムスライムゼリー",
    description: "虹色に輝くスライムゼリー。まれにスキルを習得できる。",
    category: "slime",
    statDeltas: { hp: 3, exp: 5 },
    racialDeltas: { slime: 0.15 },
    skillGrantId: "skill-def-001",
    skillGrantProb: 0.1,
  },

  // ===== plant 種 =====
  {
    id: "food-plant-001",
    name: "野草",
    description: "どこにでも生える草。水属性種族値が少し上がり、HP も回復する。",
    category: "plant",
    statDeltas: { hp: 2 },
    racialDeltas: { water: 0.05 },
    skillGrantId: null,
    skillGrantProb: 0.0,
  },
  {
    id: "food-plant-002",
    name: "薬草",
    description: "薬効のある草。水属性種族値が上がり、DEF も強化される。",
    category: "plant",
    statDeltas: { def: 3 },
    racialDeltas: { water: 0.1, plant: 0.05 },
    skillGrantId: null,
    skillGrantProb: 0.0,
  },
  {
    id: "food-plant-003",
    name: "世界樹の葉",
    description: "神秘的な木の葉。plant 種族値が大きく上がり、EXP も得られる。",
    category: "plant",
    statDeltas: { hp: 5, exp: 10 },
    racialDeltas: { plant: 0.2, earth: 0.05 },
    skillGrantId: "skill-def-002",
    skillGrantProb: 0.08,
  },

  // ===== human 種 =====
  {
    id: "food-human-001",
    name: "干し肉",
    description: "人間が作った保存食。human 種族値が上がり、ATK が強化される。",
    category: "human",
    statDeltas: { atk: 2 },
    racialDeltas: { human: 0.1 },
    skillGrantId: null,
    skillGrantProb: 0.0,
  },
  {
    id: "food-human-002",
    name: "魔法のパン",
    description: "魔法使いが焼いたパン。human 種族値と EXP が上がる。",
    category: "human",
    statDeltas: { exp: 8 },
    racialDeltas: { human: 0.15 },
    skillGrantId: "skill-def-003",
    skillGrantProb: 0.05,
  },

  // ===== beast 種 =====
  {
    id: "food-beast-001",
    name: "獣の肉",
    description: "野生の獣の肉。beast 種族値が上がり、ATK と HP が強化される。",
    category: "beast",
    statDeltas: { hp: 3, atk: 3 },
    racialDeltas: { beast: 0.1 },
    skillGrantId: null,
    skillGrantProb: 0.0,
  },
  {
    id: "food-beast-002",
    name: "魔獣の心臓",
    description: "強力な魔獣の心臓。beast 種族値が大きく上がり、全ステータスが上昇する。",
    category: "beast",
    statDeltas: { hp: 5, atk: 5, def: 3, spd: 2 },
    racialDeltas: { beast: 0.25, fire: 0.05 },
    skillGrantId: "skill-def-004",
    skillGrantProb: 0.12,
  },

  // ===== spirit 種 =====
  {
    id: "food-spirit-001",
    name: "精霊の涙",
    description: "精霊が流した涙。spirit 種族値が上がり、DEF が強化される。",
    category: "spirit",
    statDeltas: { def: 4 },
    racialDeltas: { spirit: 0.1, wind: 0.05 },
    skillGrantId: null,
    skillGrantProb: 0.0,
  },
  {
    id: "food-spirit-002",
    name: "霊魂の結晶",
    description: "霊魂が結晶化したもの。spirit 種族値が大きく上がり、EXP も大量に得られる。",
    category: "spirit",
    statDeltas: { exp: 15 },
    racialDeltas: { spirit: 0.2 },
    skillGrantId: "skill-def-005",
    skillGrantProb: 0.15,
  },

  // ===== fish 種 =====
  {
    id: "food-fish-001",
    name: "川魚",
    description: "川で取れた新鮮な魚。fish 種族値と水属性種族値が上がる。",
    category: "fish",
    statDeltas: { hp: 2, spd: 1 },
    racialDeltas: { fish: 0.1, water: 0.05 },
    skillGrantId: null,
    skillGrantProb: 0.0,
  },
  {
    id: "food-fish-002",
    name: "深海魚",
    description: "深海に棲む謎の魚。fish 種族値が大きく上がり、SPD も強化される。",
    category: "fish",
    statDeltas: { spd: 5, exp: 5 },
    racialDeltas: { fish: 0.2, water: 0.1 },
    skillGrantId: "skill-def-006",
    skillGrantProb: 0.1,
  },
];
