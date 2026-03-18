/**
 * 行動予約の型定義
 */

/** 行動の種類 */
export type ActionType = "eat" | "move" | "rest" | "battle";

/** 行動予約のステータス */
export type ActionStatus = "pending" | "executed" | "cancelled";

/** 食事行動のデータ */
export interface EatActionData {
  foodId: string;
}

/** 移動行動のデータ */
export interface MoveActionData {
  targetX: number;
  targetY: number;
}

/** 休息行動のデータ（追加データなし） */
export type RestActionData = Record<string, never>;

/** 行動データのユニオン型 */
export type ActionData = EatActionData | MoveActionData | RestActionData;

/**
 * 行動予約
 */
export interface ActionReservation {
  id: string;
  slimeId: string;
  ownerUid: string;
  worldId: string;
  /** 予約を実行するターン番号 */
  turnNumber: number;
  actionType: ActionType;
  actionData: ActionData;
  status: ActionStatus;
  createdAt: Date;
  /** 実行日時（未実行の場合は null） */
  executedAt: Date | null;
}
