# Phase 7 最終セキュリティレビュー

**レビュー実施日**: 2026-03-22
**担当**: A2/Sec
**対象コミット**: develop ブランチ最新 (9e72761)
**レビュー対象**: `firestore.rules`, `netlify/functions/api.ts`, `netlify/functions/helpers/`

---

## サマリー

| 区分 | 件数 |
|------|------|
| MUST（リリースブロッカー） | 0 |
| SHOULD（推奨修正） | 2 |
| MAY（任意改善） | 3 |

**総評**: リリースブロッカーとなる重大な問題は発見されなかった。`firestore.rules` は各コレクションの読み書き権限が設計意図に沿って正確に実装されており、Admin SDK のみが書き込める構造が維持されている。Netlify Functions の全認証必須エンドポイントで `verifyIdToken` が適切に呼ばれており、zod バリデーションも全 POST/PATCH エンドポイントで実施されている。

---

## 発見事項

### MUST（リリースブロッカー）

**なし。**

現時点でリリースをブロックするセキュリティ上の問題は発見されなかった。

---

### SHOULD（推奨修正）

#### S-1: `GET /worlds/:worldId/status` エンドポイントが認証不要

**場所**: `netlify/functions/api.ts` L347–382

**現状**:
`GET /worlds/:worldId/status` は IDトークン検証を行わない公開エンドポイントとして実装されている。`worldId` パスパラメータには `worldIdParamSchema` による長さ・スラッシュ禁止バリデーションが実施されている（S-1: A2/Sec の対応済みコメントあり）。

**問題点**:
公開エンドポイントであること自体は設計上問題ないが、`worldId` として任意の文字列を指定した Firestore 読み取りが発生する。現行のバリデーション（1〜128文字・スラッシュ不可）は最低限であり、存在しない worldId に対しても Firestore `get()` が実行される。レートリミットが存在しないため、大量リクエストによる Firestore 読み取りコスト増加が懸念される。

**推奨対応**:
- Netlify Functions のレートリミット（`netlify.toml` の `rate-limit` 設定）を検討する
- または `worldId` の許可する値を既知のID一覧に限定する（マスタ化）
- Phase 5 の Analytics 設計時に Cloud Monitoring アラートを追加する

**優先度**: SHOULD（現時点でのコスト影響は低い）

---

#### S-2: `slimes` コレクションの read が認証済みユーザー全員に開放されている

**場所**: `firestore.rules` L64–83

**現状**:
```
match /slimes/{slimeId} {
  allow read: if request.auth != null;  // 認証済み全員が全スライムを読める
  allow write: if false;
}
```

**問題点**:
スライムのステータス（HP・ATK・種族値・インベントリを除く全フィールド）が認証済みユーザー全員から読み取り可能になっている。ゲームデザイン上、他プレイヤーのスライム情報の閲覧は「ライブ観戦」などの用途で許容されているが、全フィールド（`ownerUid` 含む）が公開されている点は情報漏洩リスクがある。

**推奨対応**:
- `publicProfiles/{uid}.slimeSummaries` に公開用サマリーを集約する設計（現状の実装）で概ね対処されている
- フロントエンドが直接 `/slimes/{slimeId}` を `ownerUid` フィルタなしで読まないよう実装レベルで管理する
- Phase 5 以降で読み取り制御を強化する場合: `read` を `allow read: if request.auth != null && resource.data.ownerUid == request.auth.uid || resource.data.isWild == true;` に変更することを検討する

**優先度**: SHOULD（現フェーズでは設計上許容されているが、将来的に見直しを推奨）

---

### MAY（任意改善）

#### M-1: `actionReservations` の create ルールにおける `get()` のコスト

**場所**: `firestore.rules` L98–113

**現状**:
`allow create` に `get(/databases/$(database)/documents/slimes/$(request.resource.data.slimeId))` が含まれており、正規フロー（API経由）では Admin SDK が事前チェックするため、このルールは主にAPIバイパス攻撃への二層目の防御として機能する。コメントにもトレードオフが明示されている。

**推奨対応**:
現状のドキュメントコメントが適切に意図を説明しており、対応不要。将来コスト最適化が必要になった場合に検討する。

**優先度**: MAY

---

#### M-2: `publicProfiles` の `update` ルールで `displayName` のみ変更許可（現行で対処済み）

**場所**: `firestore.rules` L125–129

**現状**:
`allow update` で `hasOnly(['displayName', 'updatedAt'])` により `publicHandle` の直接書き込みをブロックし、API経由（30日制限付き）のみに制限している。設計意図通りに実装されており、問題なし。

**評価**: 対策済み。改善の余地なし。

**優先度**: MAY（確認のみ）

---

#### M-3: `GET /public/live` エンドポイントの eventData ホワイトリストフィルタ確認

**場所**: `netlify/functions/api.ts` L566–625

**現状**:
`PUBLIC_EVENT_DATA_KEYS` によるホワイトリスト方式でフィルタリングし、`split` / `merge` / `battle_win` イベントは eventData を空（`{}`）で返す実装になっている。また `weather_change` / `season_change` の `from`/`to` フィールドには enum バリデーションも実施されており、XSS/インジェクション対策が適切。

**評価**: 現状の実装は十分。Phase 9 以降でイベント種別が増えた場合は `PUBLIC_EVENT_DATA_KEYS` の更新を忘れないよう注意する。

**優先度**: MAY（確認のみ）

---

## A01 アクセス制御 詳細チェック

| コレクション | read | write | 評価 |
|------------|------|-------|------|
| `/worlds/{worldId}` | 認証済み全員 | `false`（Admin SDK のみ） | 適切 |
| `/worlds/{worldId}/maps/{mapId}` | 認証済み全員 | `false` | 適切 |
| `/worlds/{worldId}/maps/{mapId}/tiles/{tileId}` | 認証済み全員 | `false` | 適切 |
| `/turnLogs/{logId}` | 認証済み全員 | `false` | 適切 |
| `/users/{uid}` | 本人のみ | create=禁止, update=displayName+updatedAt のみ, delete=禁止 | 適切 |
| `/maps/{mapId}` | 認証済み全員 | `false` | 適切 |
| `/maps/{mapId}/tiles/{tileId}` | マップオーナーのみ（get() で確認） | `false` | 適切 |
| `/slimes/{slimeId}` | 認証済み全員 | `false` | SHOULD S-2参照 |
| `/slimes/{slimeId}/skills/{skillId}` | 認証済み全員 | `false` | 適切 |
| `/slimes/{slimeId}/inventory/{itemId}` | オーナーのみ（get() で確認） | `false` | 適切 |
| `/actionReservations/{reservationId}` | 本人のみ | create=条件付き, update=禁止, delete=禁止 | 適切 |
| `/publicProfiles/{uid}` | 認証済み全員 | create=禁止, update=displayName+updatedAt のみ | 適切 |
| `/publicHandles/{handle}` | 認証済み全員 | `false` | 適切 |
| `/skillDefinitions/{skillId}` | 認証済み全員 | `false` | 適切 |
| `/foods/{foodId}` | 認証済み全員 | `false` | 適切 |
| `/slimeSpecies/{speciesId}` | 認証済み全員 | `false` | 適切 |

---

## A03 インジェクション チェック

| エンドポイント | zodスキーマ | 評価 |
|-------------|-----------|------|
| `POST /reservations` | `createReservationSchema` (superRefine含む) | 適切 |
| `DELETE /reservations/:id` | `deleteReservationSchema` | 適切 |
| `GET /worlds/:worldId/status` | `worldIdParamSchema` | 適切 |
| `POST /slimes/initial` | 入力なし（uid はトークンから取得） | 適切 |
| `GET /public/encyclopedia` | 入力なし | 適切 |
| `GET /public/players/:handle` | `publicHandleParamSchema` | 適切 |
| `GET /public/live` | 入力なし | 適切 |
| `POST /users/handle` | `registerHandleSchema` | 適切 |

**特記事項**: `createReservationSchema` の `actionData` は `z.union([...])` で型別に厳密バリデーションされており、`superRefine` で `actionType` と `actionData` の組み合わせ整合性も検証している。インジェクション対策は十分。

---

## A07 認証 チェック

| エンドポイント | IDトークン検証 | 評価 |
|-------------|-------------|------|
| `POST /reservations` | `verifyIdToken` 呼び出しあり | 適切 |
| `DELETE /reservations/:id` | `verifyIdToken` 呼び出しあり | 適切 |
| `GET /worlds/:worldId/status` | **認証なし**（意図的公開） | 設計通り |
| `POST /slimes/initial` | `verifyIdToken` 呼び出しあり | 適切 |
| `GET /public/encyclopedia` | **認証なし**（意図的公開） | 設計通り |
| `GET /public/players/:handle` | **認証なし**（意図的公開） | 設計通り |
| `GET /public/live` | **認証なし**（意図的公開） | 設計通り |
| `POST /users/handle` | `verifyIdToken` 呼び出しあり | 適切 |

**評価**: 認証が必要な全エンドポイント（予約CRUD・スライム作成・ハンドル登録）で `verifyIdToken` が適切に実装されている。公開エンドポイントは設計上意図的に認証なしであり、各エンドポイントで返すデータはホワイトリスト方式でフィルタリングされている。

---

## Phase 8 準備確認

### `/tiles/{tileId}` トップレベルコレクション（Phase 8 パス統一計画）

**現状**:
`firestore.rules` に `/tiles/{tileId}` トップレベルのルールが**存在しない**（デフォルト拒否）。

**Phase 8 設計書の指示**（`docs/phase8_tile_design.md` §5-1）:
- `/tiles/{tileId}` に認証済み読み取り許可を追加
- `/maps/{mapId}/tiles/{tileId}` のルールは削除（フロントエンドが `/tiles/` に移行後）

**現時点での影響**:
- turnProcessor（Admin SDK）はルールに関係なくアクセス可能 → **問題なし**
- フロントエンドは現在 `/maps/{mapId}/tiles/{tileId}` を使用 → **問題なし**
- Phase 8 実装時に `/tiles/{tileId}` にルールを追加しないとフロントエンドがアクセス不可

**推奨対応（Phase 8 着手時）**:

Phase 8 で `/tiles/` パス統一を実施する際、`firestore.rules` に以下を追加し、`/maps/{mapId}/tiles/{tileId}` の `get()` ルールは削除する：

```
// /tiles/{tileId}: 認証済み読み取り可、書き込みは Admin SDK のみ
match /tiles/{tileId} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

**現在の firestore.rules は修正不要**（Phase 8 実装時に対応）。

---

## 修正ファイル一覧

**今回のレビューで `firestore.rules` への修正は行わなかった。**

MUST レベルの問題がなかったため、ファイルへの直接修正はなし。
SHOULD S-2（`slimes` の読み取り範囲）は設計上現フェーズで許容されており、Phase 5 以降での再検討を `implementation_plan.md` に記載することを推奨する。
