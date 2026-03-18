# QAレビュー Phase 3
**レビュー担当**: A7/QA
**レビュー日**: 2026-03-17
**対象フェーズ**: Phase 3（スライム育成基本）

---

## 総評

Phase 3 で実装された主要ファイルを静的解析した結果、実装自体の品質は概ね良好だが、テストカバレッジに重大な欠陥がある。`tests/unit/slimeCreation.test.ts` および `tests/unit/eatAction.test.ts` の全テストケース（合計 13 件）は TDD スケルトンのままであり、すべて `expect(true).toBe(true)` のプレースホルダーしか持たない。実際のロジック検証がゼロであるため、**コアロジックのカバレッジ 80% 以上という目標を達成できていない**。

`POST /api/slimes/initial` エンドポイントの実装は適切だが、そのエンドポイントに対する統合テストが存在しない。`userRegistration.test.ts` の 10 テストは実装・構造ともに妥当だが、スライム作成フローとは独立したテストであり、Phase 3 の新機能をカバーしていない。

フロントエンドの実装にはいくつかの注目すべき問題点があり、以下に詳述する。

---

## 発見した問題点

### 高優先度

#### [H-1] `slimeCreation.test.ts` 全テストがプレースホルダーのまま未実装
- **ファイル**: `tests/unit/slimeCreation.test.ts`
- **内容**: 5 件のテストケースがすべて `expect(true).toBe(true)` で終わっており、`createInitialSlime` 関数の実装コードもコメントアウトされたまま。テスト対象モジュールのインポートすら行われていない（`// TODO: Phase 3 で実装後にインポートを追加する`）。
- **影響**: スライム初期生成ロジック（speciesId 固定・ownerUid 設定・冪等性・mapId 整合性・baseStats 適用）が一切テストされていない。

#### [H-2] `eatAction.test.ts` 全テストがプレースホルダーのまま未実装
- **ファイル**: `tests/unit/eatAction.test.ts`
- **内容**: 8 件のテストケース（hunger 回復・上限クランプ・statDeltas 適用・racialDeltas 適用・スキル付与確率・スキル不付与・存在しない foodId・マスタデータ参照テスト）がすべてプレースホルダー。
- **影響**: 食事アクション（`executeReservedAction` の eat ケース）の全ロジックが未検証。特に hunger クランプ・statDeltas 加算・スキル付与確率処理などはゲームバランスに直結するため、未テストは高リスク。

#### [H-3] `POST /api/slimes/initial` エンドポイントに対する統合テストが存在しない
- **ファイル**: `tests/` 配下全体
- **内容**: `netlify/functions/api.ts` に実装された `POST /api/slimes/initial` エンドポイントをカバーするテストファイルが存在しない。以下のシナリオがすべて未テスト:
  - 正常系: 新規ユーザーへのスライム付与（201 レスポンス）
  - 409 競合: 既存スライム所持ユーザーへの再リクエスト
  - 401 未認証: Authorization ヘッダー不正・欠如
  - 500 エラー: world-001 が Firestore に存在しない場合

#### [H-4] `GamePage.tsx` の `useEffect` で `selectedSlimeId` が依存配列から漏れている
- **ファイル**: `frontend/src/pages/GamePage.tsx` 行 52-78
- **内容**:
  ```typescript
  useEffect(() => {
    // ...
    if (items.length > 0 && !selectedSlimeId) {
      setSelectedSlimeId(items[0].id)
    }
  }, [user])  // selectedSlimeId が依存配列にない
  ```
- **影響**: `selectedSlimeId` が stale closure になる可能性がある。ESLint（react-hooks/exhaustive-deps）で警告が出る。実際の動作としては `selectedSlimeId` が更新された後に `user` が変化しないため破綻するケースは稀だが、ルール違反であり将来のリファクタリング時にバグの温床となる。

---

### 中優先度

#### [M-1] `SetupPage.tsx` の `useEffect` で `subscribe`・`cleanup` が依存配列から漏れている
- **ファイル**: `frontend/src/pages/SetupPage.tsx` 行 14-18
- **内容**:
  ```typescript
  useEffect(() => {
    if (!user) return
    subscribe(user.uid)
    return () => cleanup()
  }, [user?.uid])  // subscribe, cleanup が依存配列にない
  ```
- **影響**: `subscribe` や `cleanup` が Zustand のセレクターで安定した参照を返す場合は実害なしだが、ESLint の react-hooks/exhaustive-deps 警告が発生する。参照が変わりうる実装に変更された場合に無限ループのリスクがある。

#### [M-2] `SetupPage.tsx` のエラー表示条件に論理的なズレがある
- **ファイル**: `frontend/src/pages/SetupPage.tsx` 行 40-44
- **内容**:
  ```typescript
  {!isLoading && showError && !userProfile && (
  ```
  エラー表示タイマー（行 27-31）は `userProfile?.mapId` の有無を条件にしているが、エラー表示は `!userProfile`（userProfile オブジェクト自体の有無）を条件にしている。`userProfile` が存在して `mapId` だけ未設定の場合、タイマーが発火してもエラーが表示されない（`!userProfile` が false になるため）。

#### [M-3] `MapSettingsPage.tsx` の `onSnapshot` でエラーハンドラーが未定義
- **ファイル**: `frontend/src/pages/MapSettingsPage.tsx` 行 17-25
- **内容**: `onSnapshot` の第2引数にエラーハンドラーが渡されていない。Firestore の権限エラーや接続エラーが発生した場合、`isLoading` が `false` にならず永続的なローディング状態になる。また、コンソールにも何も出力されないためデバッグが困難になる。

#### [M-4] `ActionReservationForm.tsx` の食料詳細パネルで負の値のフォーマットが不正
- **ファイル**: `frontend/src/components/reservations/ActionReservationForm.tsx` 行 167-169
- **内容**:
  ```typescript
  .map(([k, v]) => `${k}+${v}`)
  ```
  `v` が負の値の場合、`hp+-3` のように表示される。現在の foods マスタデータには負の statDeltas は存在しないが、将来的にデバフ食料が追加された場合に UI が壊れる。

#### [M-5] `api.ts` の `POST /api/slimes/initial` で初期スライムの `stats.hp` が種族マスタと不一致
- **ファイル**: `netlify/functions/api.ts` 行 267-285
- **内容**: API が直接ハードコードした `hp: 100` でスライムを作成しているが、`slimeSpecies` マスタデータ（`slime-001`）の `baseStats.hp` は `50`。`slimeSpecies` がインポートされているにもかかわらず（行 8）参照されていない。初期スライムのステータスがマスタデータと一致しないため、将来的な種族バランス調整が API 側に反映されない。

#### [M-6] `api.ts` の `POST /api/slimes/initial` で `slimeSpecies` がインポートされているが未使用
- **ファイル**: `netlify/functions/api.ts` 行 8
- **内容**: `import { slimeSpecies } from '../../shared/data/slimeSpecies'` がインポートされているが、コード中で一切参照されていない（[M-5] と連動）。TypeScript の no-unused-vars 警告が発生しうる。

---

### 低優先度

#### [L-1] `TurnLogList.tsx` のローディング状態が区別されない
- **ファイル**: `frontend/src/components/world/TurnLogList.tsx` 行 122-128
- **内容**: ログ 0 件のとき「まだターンログがありません」と表示するが、onSnapshot の初回データ到着前（読み込み中）と実際に 0 件の場合が区別されない。初回レンダリング時に一瞬「まだターンログがありません」が表示される。`isLoading` ステートを追加してローディングスピナーを表示することが推奨される。

#### [L-2] `TurnLogList.tsx` のヘッダーが常に「直近20件」と表示される
- **ファイル**: `frontend/src/components/world/TurnLogList.tsx` 行 133
- **内容**: Firestore クエリは `limit(20)` を設定しているが、実際のログが 20 件未満の場合でもヘッダーが「ターンログ（直近20件）」と表示される。`logs.length` を使って実際の件数を表示すべき（例: `ターンログ（直近${logs.length}件）`）。

#### [L-3] `GamePage.tsx` の `handleSummon` で HTTP 4xx 以外のエラーメッセージが汎用的すぎる
- **ファイル**: `frontend/src/pages/GamePage.tsx` 行 91-93
- **内容**: `res.status === 409` 以外の非 OK レスポンス（400, 401, 500 など）はすべて「エラーが発生しました」と表示される。401 の場合は「ログインし直してください」など、エラー種別に応じたメッセージを表示するとユーザー体験が向上する。

#### [L-4] `SetupPage.tsx` の `navigate` が `useEffect` の依存配列にない
- **ファイル**: `frontend/src/pages/SetupPage.tsx` 行 20-24
- **内容**:
  ```typescript
  useEffect(() => {
    if (userProfile?.mapId) {
      navigate('/game', { replace: true })
    }
  }, [userProfile?.mapId])  // navigate が依存配列にない
  ```
  `navigate` は `react-router-dom` が安定した参照を保証しているため実害はないが、ESLint 警告の原因になりうる。

#### [L-5] `foods.ts` の `racialDeltas` に `water` キーが使われているが `RacialValues` の環境属性と混在
- **ファイル**: `shared/data/foods.ts` 行 48, 57
- **内容**: `food-plant-001` と `food-plant-002` の `racialDeltas` に `water: 0.05` / `water: 0.1` が設定されているが、`RacialDeltas` 型において `water` は環境由来（食料由来ではなくタイル属性由来）の種族値である。コメント上は「水属性種族値が上がる」と記されているが、food が `water` 種族値を直接増やすのはゲームデザイン上の意図か確認が必要（A1/Fun に確認推奨）。

---

## 未テストのエッジケース一覧

| # | 対象 | エッジケース | 優先度 |
|---|------|------------|--------|
| 1 | `POST /api/slimes/initial` | 401: Authorization ヘッダーなしリクエスト | 高 |
| 2 | `POST /api/slimes/initial` | 401: 不正な IDトークンでのリクエスト | 高 |
| 3 | `POST /api/slimes/initial` | 409: 既存スライムを持つユーザーの再リクエスト | 高 |
| 4 | `POST /api/slimes/initial` | 500: Firestore の `worlds/world-001` が存在しない場合 | 高 |
| 5 | `POST /api/slimes/initial` | 正常系: 新規ユーザーへの 201 レスポンスと返却フィールド検証 | 高 |
| 6 | `executeReservedAction` (eat) | hunger=100 のスライムが食事しても hunger=100 のまま | 高 |
| 7 | `executeReservedAction` (eat) | hunger=0 のスライムが食事すると hunger=30 になる | 高 |
| 8 | `executeReservedAction` (eat) | 存在しない foodId で食事してもステータスが変化しない | 高 |
| 9 | `createInitialSlime` | ownerUid が既にスライムを持つ場合は生成されない（冪等性） | 高 |
| 10 | `createInitialSlime` | 生成されたスライムの speciesId が `slime-001` であること | 高 |
| 11 | `createInitialSlime` | 生成されたスライムの stats が slime-001.baseStats と一致すること | 高 |
| 12 | `GamePage` ウェルカムカード | summon エラー時（非 409）にエラーメッセージが表示される | 中 |
| 13 | `GamePage` ウェルカムカード | summon 中（isSummoning=true）にボタンが無効化・ラベル変更される | 中 |
| 14 | `GamePage` ウェルカムカード | summon 成功後（409 以外の 2xx）にウェルカムカードが非表示になる | 中 |
| 15 | `TurnLogList` | ログ 0 件のとき「まだターンログがありません」が表示される | 中 |
| 16 | `TurnLogList` | ログ 20 件超でも最新 20 件のみ表示される（limit クエリ検証） | 中 |
| 17 | `TurnLogList` | 未知の `eventType` が来ても `formatEvent` がクラッシュしない | 低 |
| 18 | `ActionReservationForm` | `foods` 配列が空のとき `foodId` の初期値が空文字になる | 低 |
| 19 | `ActionReservationForm` | `foods.find` が null を返すとき詳細パネルが表示されない | 低 |
| 20 | `ActionReservationForm` | `slimes` が空配列のとき submit ボタンが disabled になる | 低 |
| 21 | `MapSettingsPage` | `onSnapshot` エラー時に永続ローディング状態にならないこと | 中 |
| 22 | `SetupPage` | 12 秒経過後（SETUP_TIMEOUT_MS）にエラーメッセージが表示される | 低 |
| 23 | `SetupPage` | `userProfile.mapId` が設定されたとき `/game` にリダイレクトされる | 低 |

---

## 承認判定

**判定: 条件付き否認（CONDITIONAL REJECT）**

### 承認条件（次フェーズ移行前に必須）

1. **[必須]** `tests/unit/slimeCreation.test.ts` の 5 件のテストケースを実装し Green にすること
2. **[必須]** `tests/unit/eatAction.test.ts` の 8 件のテストケースを実装し Green にすること
3. **[必須]** `POST /api/slimes/initial` の統合テストを新規作成し、少なくとも正常系・409・401 の 3 シナリオを検証すること
4. **[必須]** `api.ts` の `POST /api/slimes/initial` で `slimeSpecies` マスタデータを参照して初期ステータスを設定するか、ハードコード値の意図を明確にドキュメント化すること（[M-5][M-6] 対応）

### 推奨修正（次フェーズ移行後でも可）

5. `GamePage.tsx` の `useEffect` 依存配列に `selectedSlimeId` を追加する（[H-4]）
6. `SetupPage.tsx` のエラー表示条件の論理的なズレを修正する（[M-2]）
7. `MapSettingsPage.tsx` の `onSnapshot` にエラーハンドラーを追加する（[M-3]）
8. `TurnLogList.tsx` にローディング状態を追加する（[L-1]）

### 備考

- `userRegistration.test.ts` の 10 テストケースは構造・内容ともに適切に実装されており、問題なし。
- `foods.ts` の `racialDeltas.water` の扱い（[L-5]）については A1/Fun への確認を推奨する。ゲームデザイン上の意図であれば修正不要。
- `ActionReservationForm.tsx` の API エンドポイント URL `/.netlify/functions/api/api/slimes/initial` と `GamePage.tsx` の `/api/reservations` でパスが異なる点（前者は Netlify Functions 直アクセス、後者はプロキシ経由）は意図的な差異と思われるが、運用上の整合性を確認すること。
