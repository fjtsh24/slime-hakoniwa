/**
 * スキルの型定義
 */

/** スキル効果の種類 */
export type SkillEffectType = "stat_boost" | "action_bonus" | "cooking" | "other";

/**
 * スキル定義（マスタデータ）
 */
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  effectType: SkillEffectType;
  /** 効果の詳細データ（スキルごとに異なる構造） */
  effectData: Record<string, unknown>;
}

/**
 * スライムが習得済みのスキル
 */
export interface SlimeSkill {
  id: string;
  slimeId: string;
  skillDefinitionId: string;
  acquiredAt: Date;
}
