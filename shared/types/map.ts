/**
 * マップ・タイルの型定義
 */

export interface GameMap {
  id: string;
  worldId: string;
  /** マップオーナーのUID（null の場合は公共マップ） */
  ownerUid: string | null;
  name: string;
  /** マップの横幅（タイル数） */
  width: number;
  /** マップの縦幅（タイル数） */
  height: number;
  createdAt: Date;
}

/**
 * タイルの属性値（各 0.0〜1.0 の float）
 */
export interface TileAttributes {
  /** 火属性強度 */
  fire: number;
  /** 水属性強度 */
  water: number;
  /** 土属性強度 */
  earth: number;
  /** 風属性強度 */
  wind: number;
}

export interface Tile {
  id: string;
  mapId: string;
  /** タイルのX座標 */
  x: number;
  /** タイルのY座標 */
  y: number;
  attributes: TileAttributes;
}
