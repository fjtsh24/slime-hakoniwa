/**
 * スキル定義マスタデータ（Phase 4）
 *
 * skill-def-001〜006 の実体定義。
 * foods.ts の skillGrantId から参照される。
 *
 * effectType 別の実装方針（turnProcessor.ts）:
 *   cooking     : case 'eat' で hunger/EXP に effectData の値を加算・乗算
 *   stat_boost  : processSlimeTurn 先頭で「実効 stats」を生成する際にボーナス加算
 *   action_bonus: 各アクション case 内で effectData.targetAction を確認して適用
 */

import { SkillDefinition } from "../types/skill";

export const skillDefinitions: SkillDefinition[] = [
  // ----------------------------------------------------------------
  // skill-def-001: 虹彩吸収（stat_boost）
  // ドロップ元: プリズムスライムゼリー（slime カテゴリ、付与確率10%）
  // ----------------------------------------------------------------
  {
    id: "skill-def-001",
    name: "虹彩吸収",
    description:
      "プリズムスライムの神秘的な力を宿す。食料を食べるたびに種族値の吸収効率が高まり、全ステータスがわずかに底上げされる。",
    effectType: "stat_boost",
    effectData: {
      hp: 3,
      atk: 2,
      def: 2,
      spd: 1,
      /**
       * 適用タイミング: processSlimeTurn 先頭で「実効 stats」を生成する際に一度だけ加算。
       * Firestore に書き込む stats には反映しない（累積バグ防止）。
       */
      applyTiming: "turn_start",
    },
  },

  // ----------------------------------------------------------------
  // skill-def-002: 世界樹の加護（cooking）
  // ドロップ元: 世界樹の葉（plant カテゴリ、付与確率8%）
  // ----------------------------------------------------------------
  {
    id: "skill-def-002",
    name: "世界樹の加護",
    description:
      "世界樹の精霊に祝福されている。食べ物を口にするたびに経験値の吸収量が増し、より速く成長できる。",
    effectType: "cooking",
    effectData: {
      /** eat 時の hunger 追加回復量 */
      eatHungerBonus: 5,
      /** eat 時の EXP 倍率（食料の statDeltas.exp に乗算） */
      eatExpMultiplier: 1.8,
      /**
       * plant 系食料を食べたときの追加ボーナス（任意実装・Phase 5以降）
       * category が "plant" の食料では eatExpMultiplier を 2.5 に上書き
       */
      categoryBonus: { category: "plant", eatExpMultiplier: 2.5 },
    },
  },

  // ----------------------------------------------------------------
  // skill-def-003: 賢者のレシピ（cooking）
  // ドロップ元: 魔法のパン（human カテゴリ、付与確率5%）
  // ----------------------------------------------------------------
  {
    id: "skill-def-003",
    name: "賢者のレシピ",
    description:
      "魔法使いの知恵が宿り、どんな食事も最高の栄養に変えてしまう。hunger 回復量が大幅に増加し、満腹を維持しやすくなる。",
    effectType: "cooking",
    effectData: {
      /** eat 時の hunger 追加回復量（+20 = 合計 +50 相当） */
      eatHungerBonus: 20,
      /** eat 時の EXP 倍率 */
      eatExpMultiplier: 1.3,
    },
  },

  // ----------------------------------------------------------------
  // skill-def-004: 魔獣の覇気（action_bonus）
  // ドロップ元: 魔獣の心臓（beast カテゴリ、付与確率12%）
  // ----------------------------------------------------------------
  {
    id: "skill-def-004",
    name: "魔獣の覇気",
    description:
      "強大な魔獣の闘志が宿る。狩猟時の攻撃力が上昇し、より強い相手にも勝利できるようになる。",
    effectType: "action_bonus",
    effectData: {
      /** 対象アクション */
      targetAction: "hunt",
      /**
       * hunt の勝敗判定式:
       *   atk + atkBonus + floor(random * spd * 0.75) > monster.power
       */
      atkBonus: 8,
      /** ドロップ数量倍率（1.0 = 変化なし、勝率向上のみ） */
      dropQuantityMultiplier: 1.0,
    },
  },

  // ----------------------------------------------------------------
  // skill-def-005: 霊魂の共鳴（action_bonus）
  // ドロップ元: 霊魂の結晶（spirit カテゴリ、付与確率15%）
  // ----------------------------------------------------------------
  {
    id: "skill-def-005",
    name: "霊魂の共鳴",
    description:
      "霊魂と共鳴し、採集の勘が冴えわたる。採集時に得られるアイテムの量がわずかに増える。",
    effectType: "action_bonus",
    effectData: {
      /** 対象アクション */
      targetAction: "gather",
      /**
       * weightedDrop で得た数量に乗算する倍率（floor して整数化）。
       * 確率15%と高いため控えめな1.3×設定。
       */
      dropQuantityMultiplier: 1.3,
    },
  },

  // ----------------------------------------------------------------
  // skill-def-006: 深海の直感（action_bonus）
  // ドロップ元: 深海魚（fish カテゴリ、付与確率10%）
  // ----------------------------------------------------------------
  {
    id: "skill-def-006",
    name: "深海の直感",
    description:
      "深海の感覚が身に宿り、水の気配に敏感になる。釣りの成功確率が上昇し、より多くの魚を釣り上げられる。",
    effectType: "action_bonus",
    effectData: {
      /** 対象アクション */
      targetAction: "fish",
      /** ドロップ数量倍率（floor して整数化） */
      dropQuantityMultiplier: 1.5,
      /**
       * fish アクションの水属性タイル判定閾値を引き下げる。
       * 通常 water >= 0.3 が必要なところを water >= 0.3 - 0.15 = 0.15 に緩和。
       */
      waterThresholdReduction: 0.15,
    },
  },
];
