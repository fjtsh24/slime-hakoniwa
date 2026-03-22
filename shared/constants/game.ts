/**
 * ゲームグローバル定数
 */

/** 種族値の上限値 */
export const RACIAL_VALUE_MAX = 1.0;

/** スライム1体のインベントリ最大スロット数 */
export const INVENTORY_MAX_SLOTS = 10;

/** 1スライムあたりの pending 予約の上限件数 */
export const MAX_PENDING_RESERVATIONS = 50;

/** 現在ターンからの予約可能な最大ターン距離 */
export const MAX_RESERVATION_TURN_DISTANCE = 50;

/** plant アクション: tileAttributeDelta の値域 */
export const TILE_DELTA_MAX = 1.0;
export const TILE_DELTA_MIN = -1.0;

/** 季節自動変化: 1ターンあたりのタイル属性変化量 */
export const SEASON_TILE_DELTA_PER_TURN = 0.005;
