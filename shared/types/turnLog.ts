/**
 * ターンログの型定義
 */

/** ターン内で発生したイベントの種類 */
export type TurnEventType =
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
  | "skill_grant";

/**
 * ターンログ（各ターンでスライムに起きたイベントの記録）
 */
export interface TurnLog {
  id: string;
  worldId: string;
  slimeId: string;
  turnNumber: number;
  eventType: TurnEventType;
  /** イベントの詳細データ（イベント種別ごとに構造が異なる） */
  eventData: Record<string, unknown>;
  processedAt: Date;
}
