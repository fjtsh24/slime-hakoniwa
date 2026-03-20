/**
 * 野生モンスターマスタデータ
 * Phase 4 スコープ: beast / plant カテゴリの weak / normal 強度
 */

import { WildMonsterSpecies } from "../types/wildMonster";

export const wildMonsters: WildMonsterSpecies[] = [
  // ===== beast / weak =====
  {
    id: "monster-beast-weak-001",
    name: "ちびゴブリン",
    description: "小さくてすばしっこいゴブリン。まだ力は弱いが群れで行動することがある。",
    category: "beast",
    strength: "weak",
    power: 10,
    dropTableId: "drop-beast-weak",
  },
  {
    id: "monster-beast-weak-002",
    name: "コボルト子犬",
    description: "犬の頭を持つ小型の獣人。好奇心旺盛で食料を求めてウロウロしている。",
    category: "beast",
    strength: "weak",
    power: 10,
    dropTableId: "drop-beast-weak",
  },
  {
    id: "monster-beast-weak-003",
    name: "野うさぎ（凶暴）",
    description: "見た目はかわいいが牙を持つ凶暴なうさぎ。油断すると噛みついてくる。",
    category: "beast",
    strength: "weak",
    power: 10,
    dropTableId: "drop-beast-weak",
  },

  // ===== beast / normal =====
  {
    id: "monster-beast-normal-001",
    name: "オーク戦士",
    description: "立派な体格を持つオーク。木の棍棒を振り回して縄張りを守る。",
    category: "beast",
    strength: "normal",
    power: 30,
    dropTableId: "drop-beast-normal",
  },
  {
    id: "monster-beast-normal-002",
    name: "大角鹿",
    description: "鋭い角を持つ大型の鹿。普段は温厚だが追い詰めると突進してくる。",
    category: "beast",
    strength: "normal",
    power: 30,
    dropTableId: "drop-beast-normal",
  },
  {
    id: "monster-beast-normal-003",
    name: "ブラウンベア",
    description: "森に棲む茶色い熊。蜂蜜の匂いに引き寄せられ、邪魔者を容赦なく排除する。",
    category: "beast",
    strength: "normal",
    power: 30,
    dropTableId: "drop-beast-normal",
  },

  // ===== plant / weak =====
  {
    id: "monster-plant-weak-001",
    name: "毒キノコ",
    description: "怪しく光る毒々しいキノコ。近づいた者に胞子を吹きかけてくる。",
    category: "plant",
    strength: "weak",
    power: 10,
    dropTableId: "drop-plant-weak",
  },
  {
    id: "monster-plant-weak-002",
    name: "つる草怪",
    description: "地面を這うつる草に意思が宿ったもの。足元に絡みついて動きを封じてくる。",
    category: "plant",
    strength: "weak",
    power: 10,
    dropTableId: "drop-plant-weak",
  },
  {
    id: "monster-plant-weak-003",
    name: "プチフラワー",
    description: "愛らしい見た目の小さな花モンスター。花粉を撒いて眠気を誘う。",
    category: "plant",
    strength: "weak",
    power: 10,
    dropTableId: "drop-plant-weak",
  },

  // ===== plant / normal =====
  {
    id: "monster-plant-normal-001",
    name: "木人（もくじん）",
    description: "古木に精霊が宿った木人。長年育った樹皮は鎧のように硬い。",
    category: "plant",
    strength: "normal",
    power: 30,
    dropTableId: "drop-plant-normal",
  },
  {
    id: "monster-plant-normal-002",
    name: "毒花の女王",
    description: "美しい大輪の毒花。甘い香りで獲物を誘い、猛毒の蜜で仕留める。",
    category: "plant",
    strength: "normal",
    power: 30,
    dropTableId: "drop-plant-normal",
  },
  {
    id: "monster-plant-normal-003",
    name: "マンドラゴラ",
    description: "二足歩行する根菜モンスター。引き抜かれると耳を劈く叫び声を上げる。",
    category: "plant",
    strength: "normal",
    power: 30,
    dropTableId: "drop-plant-normal",
  },
];
