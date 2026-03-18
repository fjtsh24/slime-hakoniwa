/**
 * スライムの型定義
 */

/**
 * スライムのステータス
 * hunger: 0（空腹）〜100（満腹）
 */
export interface SlimeStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  exp: number;
  /** 満腹度（0〜100） */
  hunger: number;
}

/**
 * スライムの種族値
 * 環境由来: fire, water, earth, wind
 * 食料由来: slime, plant, human, beast, spirit, fish
 */
export interface RacialValues {
  /** 環境由来: 火属性 */
  fire: number;
  /** 環境由来: 水属性 */
  water: number;
  /** 環境由来: 土属性 */
  earth: number;
  /** 環境由来: 風属性 */
  wind: number;
  /** 食料由来: スライム系 */
  slime: number;
  /** 食料由来: 植物系 */
  plant: number;
  /** 食料由来: 人間系 */
  human: number;
  /** 食料由来: 獣系 */
  beast: number;
  /** 食料由来: 霊系 */
  spirit: number;
  /** 食料由来: 魚系 */
  fish: number;
}

export interface Slime {
  id: string;
  /** オーナーのUID（null の場合は野生スライム） */
  ownerUid: string | null;
  mapId: string;
  worldId: string;
  /** 種族ID（SlimeSpecies.id を参照） */
  speciesId: string;
  /** 現在いるタイルのX座標 */
  tileX: number;
  /** 現在いるタイルのY座標 */
  tileY: number;
  name: string;
  stats: SlimeStats;
  racialValues: RacialValues;
  /** 野生スライムかどうか */
  isWild: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 進化条件
 */
export interface EvolutionCondition {
  /** 進化先の種族ID */
  targetSpeciesId: string;
  /** 必要なステータス（部分一致） */
  requiredStats: Partial<SlimeStats>;
  /** 必要な種族値（部分一致） */
  requiredRacialValues: Partial<RacialValues>;
}

/**
 * スライム種族定義
 */
export interface SlimeSpecies {
  id: string;
  name: string;
  description: string;
  /** この種族の基本ステータス */
  baseStats: SlimeStats;
  /** 進化条件の一覧 */
  evolutionConditions: EvolutionCondition[];
}
