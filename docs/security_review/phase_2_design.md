# Phase 2 セキュリティ設計ドキュメント

**作成担当**: A2: セキュリティ担当
**対象フェーズ**: Phase 2 — 認証・ユーザー・マップ基盤
**作成日**: 2026-03-16
**参照**: docs/security_review/phase_1.md、docs/security.md

---

## 1. Phase 2 で追加されるデータアクセスパターン

### 新規コレクション

| コレクション | 読み取り | 作成 | 更新 | 削除 |
|---|---|---|---|---|
| `users/{uid}` | 本人のみ | 本人のみ | 本人のみ | 禁止（Phase 1 実装済み） |
| `maps/{mapId}` | 認証済みユーザー全員 | 禁止 | 禁止 | 禁止 |
| `maps/{mapId}/tiles/{tileId}` | マップオーナーのみ | 禁止 | 禁止 | 禁止 |

### アクセスパターンの根拠

**maps の読み取りを認証済み全員に許可する理由**

Phase 6 でのマップ閲覧機能（他プレイヤーのマップを見る）を見越した設計。
マップのメタ情報（名前・サイズ・ownerUid）は公開情報として扱う。
現時点（Phase 2）では自マップしか表示しないが、ルール変更なしで Phase 6 に対応できる。

**tiles の読み取りをオーナーのみに制限する理由**

タイルの属性値（火/水/土/風強度）はゲーム戦略に直結するデータ。
他プレイヤーのタイル詳細を自由に閲覧できると、マップ選択・スライム配置の戦略的優位性が失われる。
Phase 6 でマップ閲覧機能を実装する際は、tiles の読み取りルールも同時に見直す必要がある。

---

## 2. users/maps/tiles のアクセス制御設計方針

### 多層防御の原則

```
クライアント → Netlify Functions API → Firestore Security Rules → Admin SDK
```

- **第1層（API）**: IDトークン検証・入力バリデーション・ownerUid チェック
- **第2層（Firestore Rules）**: クライアント直接アクセスへの防御
- **第3層（Admin SDK）**: Cloud Functions からの書き込みは Rules をバイパス（意図的設計）

### users コレクション

- UID は Firebase Auth が発行する不変の識別子であるため、`request.auth.uid == uid` の一致確認が最も確実な所有者チェック
- `delete: if false` を採用: ユーザーデータの誤削除・悪意ある削除を防ぐ（Phase 1 実装済み）
- アカウント削除フローは Auth Trigger（Admin SDK）経由でのみ実行

### maps コレクション

- クライアントからの書き込みを `allow write: if false` で全面禁止
- ユーザー登録時のマップ自動割り当ては Auth Trigger（Cloud Functions）が Admin SDK で実行
- `ownerUid` フィールドの信頼性を担保するため、マップ作成は必ず Admin SDK 経由とする

### tiles サブコレクション（maps/{mapId}/tiles/{tileId}）

- `get()` によるクロスドキュメント参照でマップオーナーを確認
- **コスト考慮**: `get()` は Firestore 読み取りとしてカウントされる。タイル読み取りごとに追加の読み取りが発生するが、タイルデータはまとめてクエリされるため実質的なコスト増加は限定的
- マップ設定画面（タイル属性調整UI）からの書き込みは API 経由（Admin SDK）で行う

---

## 3. Auth Trigger のセキュリティ考慮事項

### Auth Trigger とは

Firebase Auth の `onCreate` イベントをトリガーとして起動する Cloud Functions。
新規ユーザー登録時に `users` ドキュメントと初期 `maps`/`tiles` を自動作成する。

### セキュリティ要件

1. **Admin SDK のみで書き込み**: Auth Trigger は Cloud Functions 環境で動作するため、Admin SDK を使用。Firestore Rules をバイパスして直接 `users/{uid}` と `maps/{mapId}` に書き込み可能
2. **冪等性の確保**: Trigger の再実行（Firebase の保証は「少なくとも1回」）に対応するため、既存ドキュメントが存在する場合は上書きしない設計にする

   ```typescript
   // 冪等性を保証する書き込み例
   const userRef = db.collection('users').doc(uid);
   const userSnap = await userRef.get();
   if (!userSnap.exists) {
     await userRef.set({ uid, createdAt: FieldValue.serverTimestamp(), ... });
   }
   ```

3. **エラーハンドリング**: Auth Trigger の失敗はユーザー登録のロールバックを意味しない（Auth と Firestore は独立）。失敗した場合の補完は Cloud Logging アラートで検知する
4. **タイムアウト**: Auth Trigger のデフォルトタイムアウトは 60 秒。初期タイル生成（10×10 = 100タイル）のバッチ書き込みは十分に収まる

### UID の信頼性

Auth Trigger の `event.data.uid` は Firebase Auth が保証する値であり、クライアントからの入力ではないため改ざん不可能。

---

## 4. Phase 1 残課題 M-3（座標範囲チェック）の実装方針

### 課題概要

`move` アクション実行時、`targetX` / `targetY` がサーバーサイドで範囲チェックされていない。
マップ外座標がスライムに設定された場合の挙動が未定義であり、データ整合性が壊れる可能性がある。

### Phase 2 での実装方針

#### Step 1: マップサイズ定数の一元管理

```typescript
// shared/constants/map.ts
export const MAP_WIDTH_DEFAULT = 10;
export const MAP_HEIGHT_DEFAULT = 10;
export const MAP_WIDTH_MAX = 100;
export const MAP_HEIGHT_MAX = 100;
```

#### Step 2: API レイヤーでの静的範囲チェック（即時対応）

`netlify/functions/helpers/validation.ts` の `move` actionData スキーマに範囲制限を追加:

```typescript
actionType: z.literal('move'),
actionData: z.object({
  targetX: z.number().int().min(0).max(MAP_WIDTH_MAX - 1),
  targetY: z.number().int().min(0).max(MAP_HEIGHT_MAX - 1),
}),
```

#### Step 3: サーバーサイドでの動的範囲チェック（完全対応）

`functions/src/scheduled/turnProcessor.ts` の `executeReservedAction` 内で、マップドキュメントを参照して実際のサイズで検証:

```typescript
const mapSnap = await db().collection('maps').doc(slime.mapId).get();
const map = mapSnap.data();
if (targetX < 0 || targetX >= map.width || targetY < 0 || targetY >= map.height) {
  return { eventType: 'invalid_action', reason: 'out_of_bounds' };
}
```

#### 優先度

| Step | 優先度 | 担当 | タイミング |
|---|---|---|---|
| Step 1（定数化） | 高 | A3/BE | Phase 2 Week 2 |
| Step 2（静的チェック） | 高 | A3/BE | Phase 2 Week 2 |
| Step 3（動的チェック） | 中 | A3/BE | Phase 2 Week 2 |

---

## 5. Phase 2 セキュリティチェックリスト

### Firestore Security Rules

- [x] `users/{uid}`: 本人のみ read/create/update、delete 禁止（Phase 1 実装済み）
- [x] `maps/{mapId}`: 認証済みユーザー全員 read、write 禁止（Phase 2 追加）
- [x] `maps/{mapId}/tiles/{tileId}`: オーナーのみ read、write 禁止（Phase 2 追加）
- [ ] 新規ルールのユニットテスト追加（`@firebase/rules-unit-testing`）

### Auth Trigger

- [ ] `onCreate` Trigger の冪等性を担保する実装
- [ ] Trigger 失敗時の Cloud Logging アラート設定
- [ ] 初期タイル生成のバッチ書き込みが 60 秒以内に完了することを Emulator で確認

### 座標範囲チェック（M-3）

- [ ] `shared/constants/map.ts` の作成
- [ ] `validation.ts` への静的範囲チェック追加
- [ ] `turnProcessor.ts` への動的マップサイズチェック追加

---

## 6. Phase 3 以降への申し送り

- **Firebase App Check の導入（Phase 3 前）**: Firestore への直接アクセスを正規クライアントからのみに制限
- **tiles 読み取りルールの見直し（Phase 6 前）**: 他プレイヤーのタイルをどの範囲まで公開するか設計が必要
- **フィールドレベルの更新制限（Phase 3 前）**: `users` ドキュメントの `displayName` 以外のフィールドをクライアントから更新できないよう `request.resource.data.diff(resource.data).affectedKeys()` で制限を追加する
