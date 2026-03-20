/**
 * 野生モンスターの型定義
 */

/** 野生モンスターの強度 */
export type MonsterStrength = "weak" | "normal" | "strong";

/** 野生モンスターの対象カテゴリ */
export type MonsterCategory = "beast" | "plant" | "fish" | "human" | "spirit" | "slime";

/** 野生モンスター種族定義 */
export interface WildMonsterSpecies {
  id: string;
  name: string;
  description: string;
  category: MonsterCategory;
  strength: MonsterStrength;
  /** モンスターの戦闘力（勝敗判定に使用） */
  power: number;
  /** ドロップテーブルのエントリID参照 */
  dropTableId: string;
}
