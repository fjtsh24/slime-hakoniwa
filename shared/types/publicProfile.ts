/**
 * 公開プロフィールの型定義（Phase 6）
 */

/**
 * publicProfiles に埋め込むスライムの公開情報サマリー
 *
 * ホワイトリスト方式: exp・hunger・racialValues・inventory・skillIds は除外。
 * Cloud Functions が slimes コレクションから自動同期する。
 */
export interface SlimeSummary {
  id: string;
  name: string;
  speciesId: string;
  stats: {
    hp: number;
    atk: number;
    def: number;
    spd: number;
  };
  color?: string;
}

/**
 * publicProfiles/{uid} ドキュメント
 *
 * - 認証済みユーザー全員が読み取り可能（公開プロフィール）
 * - publicHandle・displayName: 本人のみ更新可（Firestore Rules で制御）
 * - slimeSummaries: Cloud Functions（Admin SDK）のみ更新可
 */
export interface PublicProfile {
  /** ハンドル名（英数字・ハイフン・アンダースコアのみ、小文字正規化済み、3〜32文字） */
  publicHandle: string;
  /** プレイヤー表示名 */
  displayName: string;
  /** スライムの公開サマリー（Cloud Functions が自動同期） */
  slimeSummaries: SlimeSummary[];
  /** publicHandle を最後に変更した日時（30日変更制限に使用） */
  lastHandleChangedAt: Date | null;
  /** 最終更新日時 */
  updatedAt: Date;
}

/**
 * publicHandles/{normalizedHandle} インデックスコレクション
 * publicHandle の一意性保証専用。Cloud Functions がトランザクション内で管理する。
 */
export interface PublicHandleIndex {
  /** ハンドルを所有するユーザーのUID */
  uid: string;
  /** 登録日時 */
  registeredAt: Date;
}

/** publicHandle のバリデーション正規表現（3〜32文字・英数字・ハイフン・アンダースコア） */
export const PUBLIC_HANDLE_PATTERN = /^[a-z0-9_-]{3,32}$/;

/**
 * ライブフィードの1エントリ（公開API レスポンス用）
 *
 * eventData はホワイトリスト方式でフィルタリング済み（MUST-5）。
 */
export interface LiveFeedEntry {
  id: string;
  worldId: string;
  turnNumber: number;
  eventType: 'evolve' | 'split' | 'merge' | 'battle_win';
  eventData: {
    previousSpeciesId?: string;
    newSpeciesId?: string;
  };
  slimeSummary: {
    slimeId: string;
    name: string;
    speciesId: string;
    color: string | null;
  } | null;
  processedAt: string;
}
