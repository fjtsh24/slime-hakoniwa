/**
 * ターンログの型定義
 */

/** ターン内で発生したイベントの種類 */
export type TurnEventType =
  // --- スライムアクションイベント ---
  | "eat"
  | "move"
  | "rest"
  | "battle_win"
  | "battle_lose"
  | "evolve"
  | "split"
  | "merge"
  | "autonomous"
  | "hunger_decrease"
  | "skill_grant"
  // --- Phase 4: 採集・釣り・狩猟イベント ---
  | "gather_success"
  | "gather_fail"
  | "fish_success"
  | "fish_fail"
  | "hunt_success"
  | "hunt_fail"
  | "inventory_full"
  | "inventory_not_found"
  | "battle_incapacitated"
  // --- Phase 8: plant アクション・季節タイル変化イベント ---
  | "plant_success"
  | "plant_fail"
  | "season_tile_change"
  // --- Phase 6向け予約列挙（ワールドイベント） ---
  | "season_change"
  | "weather_change"
  | "area_unlock"
  | "item_spawn";

/**
 * ターンログ（各ターンでスライムまたはワールドに起きたイベントの記録）
 *
 * - 既存のスライムイベントは常に actorType: 'slime'（slimeId に値あり）
 * - ワールドイベント（season_change / weather_change 等）は actorType: 'world'（slimeId は null）
 */
export interface TurnLog {
  id: string;
  worldId: string;
  /**
   * イベントを起こしたスライムのID。
   * ワールドイベント（actorType: 'world'）の場合は null。
   */
  slimeId: string | null;
  /** イベントの発生主体 */
  actorType: "slime" | "world";
  turnNumber: number;
  eventType: TurnEventType;
  /** イベントの詳細データ（イベント種別ごとに構造が異なる） */
  eventData: Record<string, unknown>;
  processedAt: Date;
}
