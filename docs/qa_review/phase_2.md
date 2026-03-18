# Phase 2 QAレビューレポート

**レビュー担当**: A7 / QA
**対象フェーズ**: Phase 2 — 認証・ユーザー・マップ基盤
**レビュー日**: 2026-03-16
**ステータス**: レビュー完了（修正3件実施済み）

---

## 1. レビュー概要

Phase 2 で追加・変更された全ファイルをコードレビューした結果、Critical 0件 / High 1件（修正済）/ Medium 3件（うち2件修正済）/ Low 1件（修正済）を検出した。ユニットテスト（4ケース）の設計品質は良好。統合テストはスケルトン状態であり、次フェーズでの実装が必要。

---

## 2. 問題点一覧

### High

#### [H-1] `userRegistration.test.ts` の `getTilesForMap` ヘルパーがコレクション構造と不整合 — **修正済**

- **ファイル**: `tests/integration/userRegistration.test.ts`
- **内容**: `authTrigger.ts` はタイルを `maps/{mapId}/tiles/{tileId}` サブコレクションに書き込む。しかしテストの `getTilesForMap` 関数はトップレベルコレクション `tiles` に対してクエリを発行していた。このままでは統合テスト実装時に必ず空配列が返り、テストが偽陽性（pass）になる。
- **修正**: `db.collection('tiles').where('mapId', '==', mapId)` → `db.collection('maps').doc(mapId).collection('tiles')` に変更した。
- **合わせて修正**: `afterAll` / `beforeEach` でのクリーンアップも `clearCollection('tiles')` ではサブコレクションを削除できないため、`clearMapsAndTiles()` ヘルパーを追加して maps ドキュメントと tiles サブコレクションを正しく削除するよう修正した。

---

### Medium

#### [M-1] `firestore.rules` の `users` コレクションに `allow create` が残っている — **A2/Sec 要確認**

- **ファイル**: `firestore.rules`（37〜42行目）
- **内容**: `users/{uid}` の `allow create` が認証済みユーザーに開放されている。Auth Trigger（Admin SDK）が自動作成するため、クライアントから直接 `users` ドキュメントを作成できる状態になっている。悪意あるユーザーが自分の `mapId` を改ざんした `users` ドキュメントを事前作成することが可能。
- **推奨対応**: `allow create: if false` に変更し、`users` の書き込み権限を Admin SDK（onUserCreate）のみに限定する。ただし、この変更はセキュリティ設計全体に影響するため **A2/Sec が正式判断**すること。

#### [M-2] `SetupPage.tsx` の `useEffect` 依存配列が不完全 — **設計意図確認要**

- **ファイル**: `frontend/src/pages/SetupPage.tsx`（11〜15行目）
- **内容**: `useEffect(() => { ... }, [user?.uid])` の依存配列に `subscribe` と `cleanup` 関数が含まれていない。同様のパターンが `App.tsx` にも存在する。React の `exhaustive-deps` ESLint ルール違反に相当する。
- **評価**: Zustand ストアの参照安定性によりランタイムの誤動作は起きにくいが、`useCallback` でラップされていない場合は再レンダリングのたびに関数参照が変わる可能性がある。今後の依存変更時の影響を抑えるため、`useUserStore((s) => s.subscribe)` 等の個別セレクターに分離する設計が望ましい。今フェーズは許容範囲とし、次フェーズでの改善を推奨する。

---

### Low

#### [L-1] `authTrigger.ts` でマップ定数が `shared/constants/map.ts` と二重定義 — **修正済**

- **ファイル**: `functions/src/triggers/authTrigger.ts`（6〜7行目）
- **内容**: `MAP_WIDTH = 10` / `MAP_HEIGHT = 10` をローカル定数で定義しており、`shared/constants/map.ts` の `MAP_WIDTH_DEFAULT` / `MAP_HEIGHT_DEFAULT` が使われていなかった。定数が散在すると将来の変更時に変更漏れが生じる。
- **修正**: `shared/constants/map.ts` から `MAP_WIDTH_DEFAULT` / `MAP_HEIGHT_DEFAULT` をインポートし、ローカル定数はそれらへの参照に変更した。

---

## 3. OK項目（問題なし）

| 項目 | 評価 | 備考 |
|------|------|------|
| `authTrigger.ts` — 冪等性チェック | OK | `userSnap.exists` 確認後の早期リターン実装済み |
| `authTrigger.ts` — WriteBatch 原子性 | OK | `users` + `maps` + `tiles(100件)` を単一バッチでコミット |
| `authTrigger.ts` — TypeScript 型 | OK | `Omit<User, ...> & { createdAt: any }` パターンで serverTimestamp を適切に扱っている |
| `validation.ts` — 座標範囲チェック | OK | `MAP_WIDTH_MAX` / `MAP_HEIGHT_MAX` を用いた `min(0).max(MAP_WIDTH_MAX - 1)` が正しく実装されている |
| `validation.ts` — cross-field validation | OK | `superRefine` ではなく `.refine()` で actionType ↔ actionData の整合チェックが実装されている |
| `slimeSpecies.ts` — 自己参照の修正 | OK | 各進化先スライム（slime-002〜005）の `evolutionConditions` が空配列になっており、自己参照ループが解消されている |
| `shared/types/user.ts` | OK | `uid`, `displayName`, `email`, `mapId`, `createdAt`, `updatedAt` の全フィールドが定義されている |
| `shared/types/index.ts` | OK | `user.ts` が barrel export に追加済み |
| `userStore.ts` — onSnapshot unsubscribe | OK | `_unsubscribe` を state に保持し、`subscribe` 再呼び出し時に前の購読を解除、`cleanup` でも解除している。リソースリークなし |
| `MapSettingsPage.tsx` — onSnapshot unsubscribe | OK | `useEffect` の return で `unsubscribe()` を正しく呼んでいる |
| `App.tsx` — ルーティング設計 | OK | `isAuthLoading` → `isUserLoading` → `hasMap` の3段階ガードが適切に実装されている |
| `firestore.rules` — maps/tiles 書き込み禁止 | OK | `allow write: if false` でクライアントからの直接書き込みを禁止。Admin SDK がバイパスするため Auth Trigger との整合性に問題なし |
| `authTrigger.test.ts` — 4テストケース | OK | 正常系（users作成・maps作成・tiles100件）と異常系（二重登録の冪等性）を網羅 |
| `authTrigger.test.ts` — モック設計 | OK | firebase-admin / firebase-functions のモックが適切に設計されており、Cloud Functions ランタイムなしでテスト実行可能 |
| `docs/schema.dbml` — users テーブル追加 | OK | `uid`, `displayName`, `email`, `mapId`, `createdAt`, `updatedAt` が正しく定義されている |

---

## 4. テスト網羅性評価

### ユニットテスト（`authTrigger.test.ts`）

| テストケース | 状態 | 評価 |
|------------|------|------|
| 新規ユーザー登録時に users ドキュメントが作成される | 実装済 | OK |
| 新規ユーザー登録時に maps ドキュメントが作成される | 実装済 | OK |
| 新規ユーザー登録時に tiles 100件が作成される | 実装済 | OK（座標網羅チェック含む） |
| 同一ユーザーの二重登録は冪等に処理される | 実装済 | OK |
| **カバレッジ推定** | — | authTrigger.ts のコアパスをほぼカバー（推定80%以上） |

### 統合テスト（`userRegistration.test.ts`）

| テストケース | 状態 | 評価 |
|------------|------|------|
| Auth登録→onUserCreate→Firestore初期化の一連フロー | TODO（placeholder） | 未実装 |
| users/{uid} ドキュメントのフィールド確認 | TODO（placeholder） | 未実装 |
| maps/{mapId} ドキュメントのフィールド確認 | TODO（placeholder） | 未実装 |

統合テストは実装コメントとスケルトンのみ存在する状態。実装完了後に Emulator を使った実行が必要。

---

## 5. 次フェーズへの申し送り事項

1. **[必須] 統合テストの実装**: `tests/integration/userRegistration.test.ts` の3テストケースに実装が必要。TODO コメントには実装例も記載済みのため優先的に対応すること。実装後は Firebase Emulator を使って実行し、全件 pass を確認すること。

2. **[A2/Sec 判断要] `users` の `allow create` 権限見直し**: M-1 の通り。Phase 3 着手前に A2/Sec のレビューを受けること。

3. **[推奨] `useEffect` 依存配列の改善**: `SetupPage.tsx` および `App.tsx` の `subscribe` / `cleanup` 依存配列問題。個別セレクターに分離するか `useCallback` でラップすることを推奨。

4. **[推奨] `SetupPage` のタイムアウト処理**: 現在 `isLoading=false && userProfile=null` でエラーメッセージを表示するが、タイムアウト時間の定義がない。Auth Trigger の処理遅延（通常数秒）に備えて、明示的なタイムアウト値（例: 30秒）を設定することを推奨。

5. **[確認] `mapId` のnull許容性の不整合**: `shared/types/user.ts` では `mapId: string`（非null）だが、`docs/schema.dbml` では `mapId varchar [null]`（null許容）と定義されている。SetupPage の「mapIdが未設定のユーザー」というユースケースを考慮すると、型定義を `mapId: string | null` に変更すべきか、あるいは Auth Trigger 完了後は常に設定済みとして良いか設計を確認すること。

---

## 6. 総合評価

**Phase 3 移行判定: 条件付き承認**

- ユニットテストの設計・実装品質は良好
- authTrigger.ts のコア実装に Critical な問題なし
- H-1（統合テストの構造的バグ）は本レポートで修正済み
- M-1（Firestoreルールのcreate権限）は A2/Sec の確認後に修正すること
- 統合テストの placeholder 実装は Phase 3 序盤に完了させること

以上の申し送り事項を踏まえ、A2/Sec レビューに引き渡す。
