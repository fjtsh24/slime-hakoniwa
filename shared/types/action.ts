/**
 * 行動予約の型定義
 */

/** 行動の種類 */
export type ActionType = "eat" | "move" | "rest" | "battle" | "gather" | "fish" | "hunt" | "merge";

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

/** 採集行動のデータ（追加データなし） */
export type GatherActionData = Record<string, never>;

/** 釣り行動のデータ（追加データなし） */
export type FishActionData = Record<string, never>;

/** 狩猟行動のデータ */
export interface HuntActionData {
  /** 狩猟対象カテゴリ: beast / plant / fish / human（Phase 5スコープ） */
  targetCategory: "beast" | "plant" | "fish" | "human";
  /** 強度: weak / normal（Phase 4スコープ、strong は Phase 6で解放） */
  targetStrength: "weak" | "normal";
}

/** 戦闘行動のデータ */
export interface BattleActionData {
  /** 戦闘対象カテゴリ: beast / plant / fish / human（Phase 5スコープ） */
  targetCategory: "beast" | "plant" | "fish" | "human";
  /** 強度: weak / normal（Phase 4スコープ） */
  targetStrength: "weak" | "normal";
}

/** 融合行動のデータ（Phase 4 追加） */
export interface MergeActionData {
  /** 融合対象スライムID（同オーナーのスライムのみ） */
  targetSlimeId: string;
}

/** 行動データのユニオン型 */
export type ActionData =
  | EatActionData
  | MoveActionData
  | RestActionData
  | GatherActionData
  | FishActionData
  | HuntActionData
  | BattleActionData
  | MergeActionData;

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
