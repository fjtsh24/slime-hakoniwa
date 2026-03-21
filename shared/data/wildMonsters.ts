/**
 * 野生モンスターマスタデータ
 * Phase 4 スコープ: beast / plant カテゴリの weak / normal 強度
 * Phase 5 スコープ: fish / human カテゴリの weak / normal 強度を追加
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

  // ===== fish / weak =====
  {
    id: "monster-fish-weak-001",
    name: "チビウナギ",
    description: "水辺に棲む小さなウナギ。電気を帯びており、触れるとピリッとする程度の感電を引き起こす。",
    category: "fish",
    strength: "weak",
    power: 10,
    dropTableId: "drop-fish-weak",
  },
  {
    id: "monster-fish-weak-002",
    name: "トゲトゲウニ",
    description: "浅瀬に転がるウニ型の生き物。棘で刺さるだけが能だが、踏んだら痛い。",
    category: "fish",
    strength: "weak",
    power: 10,
    dropTableId: "drop-fish-weak",
  },
  {
    id: "monster-fish-weak-003",
    name: "ちびクラゲ",
    description: "ふわふわ漂うクラゲの幼体。触手に微弱な毒があるが、本人は戦う気があまりない。",
    category: "fish",
    strength: "weak",
    power: 10,
    dropTableId: "drop-fish-weak",
  },

  // ===== fish / normal =====
  {
    id: "monster-fish-normal-001",
    name: "大サメ（淡水）",
    description: "川を縄張りにする巨大なサメ。淡水に棲む珍種で、縄張りに入った者を猛スピードで追い回す。",
    category: "fish",
    strength: "normal",
    power: 30,
    dropTableId: "drop-fish-normal",
  },
  {
    id: "monster-fish-normal-002",
    name: "深海の番人",
    description: "深海から這い上がってきた巨大な魚。発光する体で獲物を誘い込む。落ち着いた動きが逆に不気味。",
    category: "fish",
    strength: "normal",
    power: 30,
    dropTableId: "drop-fish-normal",
  },
  {
    id: "monster-fish-normal-003",
    name: "タコの怒り",
    description: "巨大なタコが岩場を根城にしている。触手で抱きしめてから離さない。力は強いが頭もいい。",
    category: "fish",
    strength: "normal",
    power: 30,
    dropTableId: "drop-fish-normal",
  },

  // ===== human / weak =====
  {
    id: "monster-human-weak-001",
    name: "迷子の旅人",
    description: "道に迷ってパニックになっている旅人。何でも投げつけてくるが、狙いがまるで定まっていない。",
    category: "human",
    strength: "weak",
    power: 10,
    dropTableId: "drop-human-weak",
  },
  {
    id: "monster-human-weak-002",
    name: "見習い魔法使い",
    description: "まだ魔法が安定しない見習い。呪文を唱えるたびに想定外の方向に魔弾が飛んでいく。",
    category: "human",
    strength: "weak",
    power: 10,
    dropTableId: "drop-human-weak",
  },
  {
    id: "monster-human-weak-003",
    name: "腹ペコ盗賊",
    description: "食料を求めてうろつく盗賊。腹が減りすぎて動きが鈍い。食料を渡したら帰ると思う。",
    category: "human",
    strength: "weak",
    power: 10,
    dropTableId: "drop-human-weak",
  },

  // ===== human / normal =====
  {
    id: "monster-human-normal-001",
    name: "傭兵隊長",
    description: "依頼を受けてこの地に来た腕利きの傭兵。冷静な判断力と重装備が厄介。誰に雇われたかは不明。",
    category: "human",
    strength: "normal",
    power: 30,
    dropTableId: "drop-human-normal",
  },
  {
    id: "monster-human-normal-002",
    name: "暴走魔道士",
    description: "禁術の研究に没頭するあまり常識を失った魔道士。膨大な魔力を持つが制御できていない。",
    category: "human",
    strength: "normal",
    power: 30,
    dropTableId: "drop-human-normal",
  },
  {
    id: "monster-human-normal-003",
    name: "山岳の番人",
    description: "古くからこの土地を守る番人。外来者を問答無用で追い払う。ルールに従っているだけで悪人ではない。",
    category: "human",
    strength: "normal",
    power: 30,
    dropTableId: "drop-human-normal",
  },
];
