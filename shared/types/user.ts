/**
 * ユーザーの型定義
 */

export interface User {
  /** Firebase Auth のユーザーUID */
  uid: string;
  /** 表示名 */
  displayName: string;
  /** メールアドレス */
  email: string;
  /** 割り当てられたマップID */
  mapId: string;
  /** ユーザー登録日時 */
  createdAt: Date;
  /** 最終更新日時 */
  updatedAt: Date;
}
