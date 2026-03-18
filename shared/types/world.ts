/**
 * ワールド（ゲーム世界）の型定義
 */

export interface World {
  id: string;
  name: string;
  /** 現在のターン番号 */
  currentTurn: number;
  /** 次のターン処理が実行される日時 */
  nextTurnAt: Date;
  /** ターン間隔（秒） */
  turnIntervalSec: number;
  /** ターン処理中の状態（二重処理防止用） */
  status?: 'idle' | 'processing';
  createdAt: Date;
}

/**
 * ワールドの現在状態を表す読み取り専用ビュー型
 */
export interface WorldStatus {
  readonly worldId: string;
  readonly currentTurn: number;
  readonly nextTurnAt: Date;
  /** 次のターンまでの残り秒数 */
  readonly secondsUntilNextTurn: number;
}
