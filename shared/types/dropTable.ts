/**
 * ドロップテーブルの型定義
 */

/** ドロップテーブルのエントリ */
export interface DropEntry {
  foodId: string;
  /** 抽選の重み（相対値） */
  weight: number;
  minQty: number;
  maxQty: number;
}

/** タイル属性の条件（gather/fishアクション用） */
export interface TileCondition {
  /** 対象の属性キー（"water" | "fire" | "earth" | "wind"） */
  attribute: "water" | "fire" | "earth" | "wind";
  /** 最低属性値（0.0〜1.0） */
  minValue: number;
}

/** ドロップテーブルエントリ（アクション種別・条件別） */
export interface DropTableEntry {
  id: string;
  /** 対象アクション（"gather" | "fish" | "hunt" | "battle"） */
  actionType: "gather" | "fish" | "hunt" | "battle";
  /** タイル属性条件（gather/fish用・huntの場合は null） */
  tileCondition: TileCondition | null;
  drops: DropEntry[];
}
