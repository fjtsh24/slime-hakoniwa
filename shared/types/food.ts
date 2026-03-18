/**
 * 食料の型定義
 */

import { SlimeStats, RacialValues } from "./slime";

/** 食料カテゴリ */
export type FoodCategory = "slime" | "plant" | "human" | "beast" | "spirit" | "fish";

/** ステータスの増減量（部分指定可） */
export type StatDeltas = Partial<SlimeStats>;

/** 種族値の増減量（部分指定可） */
export type RacialDeltas = Partial<RacialValues>;

export interface Food {
  id: string;
  name: string;
  description: string;
  category: FoodCategory;
  /** 食べた際のステータス増減 */
  statDeltas: StatDeltas;
  /** 食べた際の種族値増減 */
  racialDeltas: RacialDeltas;
  /** スキル付与があればスキル定義ID、なければ null */
  skillGrantId: string | null;
  /** スキル付与確率（0.0〜1.0） */
  skillGrantProb: number;
}
