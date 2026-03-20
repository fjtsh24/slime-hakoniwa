# スライム箱庭ゲーム 実装計画

## フェーズ概要

| Phase | 内容 | 目安期間 | 状態 |
|-------|------|---------|------|
| Phase 1 | ターン進行システム基盤 | 3週間 | ✅ 完了 |
| Phase 2 | 認証・ユーザー・マップ基盤 | 2週間 | ✅ 完了 |
| Phase 3 | スライム育成基本 | 3週間 | ✅ 完了 |
| Phase 4 | 進化・分裂・融合 | 3週間 | 未着手 |
| Phase 5 | マップ描画・UI完成 | 3週間 | 未着手 |
| Phase 6 | ソーシャル・野生スライム | 2週間 | 未着手 |
| Phase 7 | チューニング・リリース準備 | 2週間 | 未着手 |

---

## Phase 1: ターン進行システム基盤 ✅ 完了

ゲームの根幹となるターン進行の骨格を構築する。

### Week 1: 環境構築・型定義・Firestore初期化 ✅

- [x] GitHubリポジトリ作成・ブランチ戦略設定（main/develop）
- [x] ディレクトリ構成作成（frontend/, functions/, netlify/, shared/, docs/, tests/）
- [x] `shared/types/` に共用型定義を実装
  - `World`（`status?: 'idle' | 'processing'` 含む）, `Slime`, `ActionReservation`, `TurnLog`, `Food`, `Skill`, `GameMap`, `Tile`
- [x] Firebase Emulator Suite の動作確認（Firestore, Functions）— `firebase.json` 設定済み
- [x] Firestore スキーマ初期投入スクリプト（`functions/src/scripts/seed.ts`）
  - ワールド1件・マップ1件・タイル100件・スライム5件（うち野生2件）
  - **turnIntervalSec: 3600**（1時間）
- [x] `firestore.rules` の基本実装（Admin SDKのみターンデータ書き込み可）
  - actionReservationsに `get()` でスライム所有者確認を追加済み
- [x] GitHub Actions `ci.yml` の lint + build チェック設定

### Week 2: ターンプロセッサ実装（TDD） ✅

- [x] `functions/src/scheduled/turnProcessor.ts` の実装（23テストケース全通過）
  - TDDで実装（A7がテスト先行作成→A3が実装）
  - `processWorldTurn(worldId)`: Firestoreトランザクション内でターン処理
    - `world.status === 'processing'` チェックによる二重処理防止強化
    - try/finally で `status: 'idle'` に必ず戻す
  - `processSlimeTurn(slime, reservations)`: 予約アクション or 自律行動
  - `executeReservedAction(slime, reservation)`: 食事・移動・休息アクション
    - rest アクションに `hunger += 10` 追加
  - `executeAutonomousAction`: hunger 50以上→歩き回る / 20-49→HP微回復 / 20未満→動けない
  - `checkEvolution(slime, speciesData)`: 進化条件判定
  - Firestore `WriteBatch` による一括書き込み（500件超は分割）
  - turnLog IDに `crypto.randomUUID()` を使用
- [x] `functions/src/index.ts` にScheduled Function登録（毎分起動・asia-northeast1）
- [x] Firebase Emulatorを使った統合テスト実装（`tests/integration/turnFlow.test.ts`）
- [x] `tests/reports/` へのテストレポート出力設定

**テスト検証済みケース:**
- 予約あり/なし混在ターンの正常処理
- 500件超スライムのバッチ分割処理
- `nextTurnAt` + `status: 'processing'` による二重処理防止
- 予約の所有者検証（不正アクセス防止）

### Week 3: 予約API・フロントエンド最小構成・デプロイ ✅

- [x] Netlify Functions `netlify/functions/api.ts` の実装
  - `POST /api/reservations`：行動予約作成（IDトークン検証・所有者確認・1スライム10件上限）
  - `DELETE /api/reservations/:id`：予約キャンセル
  - `GET /api/worlds/:worldId/status`：ターン状態取得（認証不要）
  - zodによる入力バリデーション（actionDataの内部フィールド含む）
  - 全エンドポイントにエラーログ追加
- [x] フロントエンド最小構成
  - Firebase Auth ログイン画面（Google OAuth）
  - Zustand `worldStore`（Firestoreの`worlds/{id}`をonSnapshot購読）
  - Zustand `authStore`（onAuthStateChanged・unsubscribeリーク修正済み）
  - `TurnTimer` コンポーネント（カウントダウン・ターン進行通知5秒表示）
  - `ActionReservationForm` 基本版（スライム選択→eat/move/rest→ターン番号→送信）
  - `ReservationList`（予約一覧・食料名/座標の詳細表示・pending予約の削除）
  - `GamePage`（ヘッダー・スライム一覧・フォーム統合）
- [x] `docs/openapi.yaml` Phase 1スコープのAPI仕様記載（OpenAPI 3.0・435行）
- [x] `docs/schema.dbml` DBMLスキーマ記載（11テーブル・dbdiagram.io対応）
- [x] GitHub Actions `deploy.yml` 実装（Functions→Netlify順でデプロイ）
- [ ] **Netlify・Firebase の本番環境デプロイ確認**（GitHub Secrets設定が必要・手動作業）

### レビュー完了 ✅

- [x] A1/Fun レビュー → `docs/fun_review/phase_1.md`
- [x] A2/Sec レビュー → `docs/security_review/phase_1.md`
- [x] レビュー指摘の修正完了（turnIntervalSec・自律行動ロジック・rest hunger回復・H-1/H-2/H-3修正）

### 残課題（Phase 2以降で対応）

- 本番環境デプロイ（GitHub Secrets設定が必要）
- `slimeSpecies.ts` の進化後スライム第2進化先の自己参照修正（A1指摘・優先度中）
- マップ座標のサーバーサイド範囲チェック（A2指摘M-3・優先度中）

---

## Phase 2: 認証・ユーザー・マップ基盤

### 実装内容

- [x] Firebase Auth 完全実装（メールアドレス認証・Google OAuth）
- [x] ユーザー登録フロー（新規登録時にマップ自動割り当て）
- [x] Firestoreにユーザー・マップ・タイルを初期化する Cloud Function（Auth Trigger）
- [x] マップ設定画面（タイル属性調整UI）— 表示のみ・属性変更は今後のアップデートで対応
- [x] `firestore.rules` の完全実装（users/maps/tilesのアクセス制御・users.createをfalseに修正）
- [x] フロントエンドのルーティング設計（React Router）— hasMap分岐・/setup・/game・/map-settings
- [x] Phase 1残課題の修正（進化先自己参照 → evolutionConditions: [] に修正済み）
- [x] Phase 1残課題の修正（座標範囲チェック — shared/constants/map.ts + validation.ts修正済み）

### レビュー完了 ✅

- [x] A7/QA レビュー → `docs/qa_review/phase_2.md`（修正3件・条件付き承認）
- [x] A2/Sec レビュー → `docs/security_review/phase_2.md`（SEC-M-1修正済・承認）
- [x] A1/Fun レビュー → `docs/fun_review/phase_2.md`（H-1修正済・条件付き承認）

### 残課題（Phase 3以降で対応）

- `users/{uid}` の `allow update` フィールドレベル制限（A2指摘 SEC-M-2・Phase 3前必須）
- スライム0体状態のGamePage体験設計（A1指摘 H-2・Phase 3着手前に合意要）
- userRegistration.test.tsの統合テスト実装（Emulator使用・Phase 3序盤）

### A1 指摘事項（Phase 3 着手前に対応が必要）

- [ ] **[H-1]** SetupPage エラー表示トリガーを10〜15秒後に遅らせる（A4/FE対応）
- [ ] **[H-2]** スライム0体状態のGamePage体験設計を A4/FE・A3/BE で合意する
- [ ] **[M-1]** SetupPage 待機メッセージをゲームコンテキストを含む文言に変更（A4/FE対応）
- [ ] **[M-2]** MapSettingsPage にマップ属性の意味説明文を追加（A4/FE対応）

---

## Phase 3: スライム育成基本

### 設計済み事項（A1/Fun 確認済み）

- [x] ゲームパラメータ設計書作成 → `docs/game_parameters.md`
  - ターン間隔 3600秒（1時間）継続判断：適切と評価
  - hunger 消費/回復バランス試算完了（毎ターン -5、eat +30、rest +10）
  - 第1進化 EXP 到達日数試算（最短約1.7日〜約14日）
  - 初期スライム付与方式決定（ボタン起点・Auth Trigger自動付与は不採用）
  - スライム0体状態の GamePage ウェルカムカード設計完了（Phase 2 H-2 対応）

### 実装内容

- [x] **[Phase 2 残課題 H-1]** SetupPage エラー表示を 10〜15秒後に遅らせる（SETUP_TIMEOUT_MS=12000 で実装済み）
- [x] **[Phase 2 残課題 M-1]** SetupPage 待機メッセージをゲームコンテキストを含む文言に変更（「スライムの箱庭を準備しています...」）
- [x] **[Phase 2 残課題 M-2]** MapSettingsPage にマップ属性の意味説明文を追加（🔥💧🌍💨 属性説明カード追加済み）
- [x] **[Phase 2 残課題 SEC-M-2]** `users/{uid}` の `allow update` フィールドレベル制限（`hasOnly(['displayName', 'updatedAt'])` 実装済み）
- [x] スライム初期付与API実装（`POST /api/slimes/initial`・冪等性確保）
  - 付与条件: スライムが0体のユーザーのみ（既存ユーザーは 409 Conflict）
  - 初期スペック: speciesId=slime-001、name="はじめてのスライム"、tileX=0、tileY=0、hunger=80
- [x] GamePage ウェルカムカード実装（スライム0体のとき表示・ボタン押下で初期スライム付与）
- [x] スライムステータス表示UI（hunger 現在値と次ターン予測値を含む・hunger バッジ赤/黄/緑）
- [x] 食事アクションの完全実装
  - 食料マスタデータ定義（静的JSON・`shared/data/foods.ts` 14種定義済み）
  - ステータス強化・種族値変動・スキル付与（確率）ロジック（`turnProcessor.ts` 実装済み）
  - 食料選択UI（全14種の食料一覧・statDeltas/racialDeltas/skillGrantProb 詳細パネル表示）
- [x] 行動予約UIの完全実装（複数ターン分の予約管理・ReservationList で pending/executed/cancelled 表示）
- [x] ターンログ表示（`TurnLogList.tsx` 新規作成・直近20件・イベント種別日本語表示）
- [x] スライム種族マスタデータ拡充（`shared/data/slimeSpecies.ts` 10種族完備・進化ルート定義済み）
- [x] userRegistration.test.ts の統合テスト実装（10テストケース実装済み）

### レビュー完了 ✅

- [x] A7/QA レビュー → `docs/qa_review/phase_3.md`（条件付き承認 → 修正完了）
  - [x] H-1/H-2: eatAction.test.ts・slimeCreation.test.ts のプレースホルダー実装
  - [x] H-3: `POST /api/slimes/initial` 統合テスト作成（`tests/integration/slimeInitial.test.ts`）
  - [x] H-4: GamePage.tsx useEffect 依存配列修正
  - [x] M-3: MapSettingsPage onSnapshot エラーハンドラ追加
  - [x] M-5/M-6: api.ts の hardcode stats → createInitialSlime 使用に修正
  - [x] L-1: TurnLogList isLoading 状態追加
  - [x] L-2: TurnLogList 件数を動的表示
- [x] A2/Sec レビュー → `docs/security_review/phase_3.md`（条件付き承認 → 必須修正完了）
  - [x] SEC-H-1: createInitialSlime を Firestore runTransaction で TOCTTOU 対策
- [x] A1/Fun レビュー → `docs/fun_review/phase_3.md`（条件付き承認 → 必須修正完了）
  - [x] H-1: TurnLogList eat イベントの foodId → 食料名変換
  - [x] H-3: GamePage ヘッダーに /map-settings リンク追加

### 残課題（Phase 4 以降で対応）

- A2: Firebase App Check 導入（SEC-M-1・Phase 4 高優先）
- A2: users/{uid}.hasSlime を利用したレート制限検討（SEC-M-2）
- A1: ターンログのステータス変化量表示（H-2・eventData スキーマ拡張が必要）
- A1: ウェルカムカード文言の設計書準拠（M-1）
- A1: 食料詳細パネルのステータスラベル日本語化（M-2・hp→HP 等）
- A1: 行動予約フォームのターン番号入力 UI 改善（M-3・相対ターン選択）
- A1: move アクション時に現在座標ヒント表示（M-4）
- A1: hunger < 20 時の警告文追加（M-5）

---

## Phase 4: 進化・分裂・融合 ＋ アクション拡張・食料獲得システム基盤

> **設計書**: `docs/fun_review/battle_design.md`（A1/Fun 2026-03-18）
> **レビュー済み**: A1/Fun・A2/Sec・A3/BE・A5/DB・A7/QA（2026-03-18）

### 設計決定事項（レビュー確定）

| 項目 | 決定内容 | 根拠 |
|------|---------|------|
| インベントリ格納場所 | `slimes/{slimeId}/inventory/{foodId}` サブコレクション | A2/Sec SEC-H-1: 他プレイヤーへの公開防止 |
| インベントリ操作 | `db.runTransaction` でアトミック化必須 | A2/Sec SEC-H-2: TOCTTOU対策 |
| wildMonstersデータ | `shared/data/wildMonsters.ts` 静的マスタ | A5/DB: Firestore不要、`isWild` スライムとは別管理 |
| dropTableデータ | `shared/data/dropTable.ts` 静的マスタ | A5/DB: 変更頻度低い |
| Phase 4のbattle強度 | weak/normal のみ（strongはzodスキーマから除外） | A2/Sec SEC-H-3: 未実装コードパスへの到達防止 |
| racialValues上限 | `RACIAL_VALUE_MAX` 定数定義 + `Math.min` クランプ必須 | A2/Sec SEC-M-4 |
| hunt対象カテゴリ | beast / plant（Phase 4）| A1/Fun: 既存食料マスタと整合性が高い |

### Week 1: 型定義拡張・インベントリ基盤（TDD先行）

> **A7/QA先行**: 型定義確定後にテストを先行作成してから実装する

**型定義拡張（A5/DB・A3/BE）**
- [ ] `shared/types/action.ts`: `ActionType` に `"gather" | "fish" | "hunt"` 追加、`BattleActionData / GatherActionData / FishActionData / HuntActionData` 型追加
- [ ] `shared/types/slime.ts`: `InventorySlot { foodId: string, quantity: number }` 型追加
- [ ] `shared/types/turnLog.ts`: 以下を変更（A5/DB 設計済み・後方互換）
  - `slimeId: string` → `slimeId: string | null`（ワールドイベント対応・既存ドキュメント影響なし）
  - `actorType: 'slime' | 'world'` フィールド追加（既存ドキュメントはデフォルト `'slime'` で扱う）
  - `TurnEventType` に `gather_success / gather_fail / fish_success / fish_fail / hunt_success / hunt_fail / inventory_full / battle_incapacitated` 追加
  - `TurnEventType` にワールドイベント種別を予約列挙: `season_change / weather_change / area_unlock / item_spawn`（Phase 6で実装、型定義のみ先行）
- [ ] `shared/types/wildMonster.ts`: `WildMonsterSpecies / MonsterStrength` 型定義（新規）
- [ ] `shared/types/dropTable.ts`: `DropEntry / TileCondition / DropTableEntry` 型定義（新規）
- [ ] `shared/constants/game.ts`（新規または既存）: `RACIAL_VALUE_MAX = 1.0`、`INVENTORY_MAX_SLOTS = 10` 定数追加

**マスタデータ作成（A3/BE・A1/Fun確認）**
- [ ] `shared/data/wildMonsters.ts`: 6種族 × 2強度（weak/normal）= 最低12エントリ定義（beast/plant系を先行）
- [ ] `shared/data/dropTable.ts`: gather・fish・hunt・battleのドロップテーブル定義（タイル属性条件・weight・minQty/maxQty）

**インベントリAPI・バリデーション（A3/BE・A2/Sec）**
- [ ] `netlify/functions/helpers/validation.ts`: `BattleActionData / HuntActionData` の zodスキーマ追加（targetStrength は `"weak" | "normal"` のみ、`"strong"` は Phase 4 除外）
- [ ] `GatherActionData / FishActionData` は空オブジェクト（zod `.strict()` で余分なキーを拒否）
- [ ] `firestore.rules`: `slimes/{slimeId}/inventory` サブコレクションのアクセス制御追加（ownerUid == request.auth.uid のみ読み書き可）
- [ ] `firestore.indexes.json`: 4インデックス追加
  - `turnLogs`: `slimeId ASC + turnNumber DESC`
  - `turnLogs`: `worldId ASC + eventType ASC + turnNumber DESC`（WorldLogPanel のイベント種別フィルタ用）
  - `slimes`: `mapId ASC + tileX ASC + tileY ASC`

**テスト先行作成（A7/QA）**
- [ ] `tests/unit/inventoryOps.test.ts`: インベントリ操作ヘルパー 7〜8件（RED）
- [ ] `tests/unit/eatAction.test.ts`: 既存8件をインベントリ参照形式に修正（フィクスチャに `inventory` 追加）
- [ ] `tests/unit/functions/turnProcessor.test.ts`: eatブロック4件をインベントリ形式に修正

### Week 2: gather / fish / hunt アクション実装（TDD）

**テスト先行作成（A7/QA）**
- [ ] `tests/unit/gatherAction.test.ts`: 8件（タイル属性別ドロップ・インベントリ満杯・hunger消費）（RED）
- [ ] `tests/unit/fishAction.test.ts`: 6件（water属性閾値0.3の境界値・fish系食料のみドロップ）（RED）
- [ ] `tests/unit/huntAction.test.ts`: 5件（成功/失敗・HP損傷・hunger消費）（RED）

**バックエンド実装（A3/BE）**
- [ ] `functions/src/scheduled/turnProcessor.ts`: スキル付与の独立batchを外部batchに統合（リファクタ先行）
- [ ] `functions/src/scheduled/turnProcessor.ts`: インベントリヘルパー関数実装（`addToInventory / removeFromInventory`、INVENTORY_MAX_SLOTS制限付き）
- [ ] `functions/src/scheduled/turnProcessor.ts`: `eatアクション` をインベントリ参照・消費に変更（`runTransaction` によるアトミック処理・`inventory?` オプショナル対応で後方互換維持）
- [ ] `functions/src/scheduled/turnProcessor.ts`: `gatherアクション` ハンドラ追加（タイル属性→dropTable→インベントリ追加）
- [ ] `functions/src/scheduled/turnProcessor.ts`: `fishアクション` ハンドラ追加（water >= 0.3 実行条件付き）
- [ ] `functions/src/scheduled/turnProcessor.ts`: `huntアクション` ハンドラ追加（成功/失敗判定・HP損傷）
- [ ] タイルデータのバルク取得実装（N+1問題解消: gather/fish予約スライムの座標を事前collectして一括取得）
- [ ] `netlify/functions/api.ts`: `POST /api/reservations` のバリデーションに gather/fish/hunt スキーマ追加

**フロントエンド（A4/FE）**
- [ ] インベントリ表示UI（スライムカード内の所持食料一覧・数量表示）
- [ ] 食事フォームの在庫なし食料グレーアウト（インベントリ在庫0の foodId は選択不可）
- [ ] gather/fish/hunt アクションの予約フォーム追加

### Week 3: battle アクション + 進化・分裂・融合

**テスト先行作成（A7/QA）**
- [ ] `tests/unit/battleAction.test.ts`: 10件（勝敗判定・種族値上昇・食料ドロップ・EXP・HP損傷・戦闘不能状態）（RED）
- [ ] `tests/integration/inventoryApi.test.ts`: gather→インベントリ確認→eatでインベントリ消費 の一連フロー（Emulator）
- [ ] `tests/integration/battleHunt.test.ts`: hunt成功/失敗・battle勝利/敗北フロー（Emulator）

**バックエンド実装（A3/BE）**
- [ ] `functions/src/scheduled/turnProcessor.ts`: `battleアクション` ハンドラ追加
  - 勝敗判定: `(slime.stats.atk + Math.random() * slime.stats.spd * 0.5) > monsterPower`（weak=10/normal=30）
  - 勝利時: 種族値直接加算（`Math.min(current + delta, RACIAL_VALUE_MAX)` でクランプ）+ 食料ドロップ + EXP×1.5〜2
  - 敗北時: HP大ダメージ、HP=0で戦闘不能（2ターン行動停止フラグ）
  - 対象カテゴリ: beast/plant（weak/normal）のみ（Phase 4スコープ）

**スキルシステム設計・実装（A1/Fun設計 → A3/BE・A5/DB実装）**

> 現状: `shared/types/skill.ts` に型定義あり、`turnProcessor.ts` にスキル付与ロジックあり。
> しかしスキルマスタデータ（`skill-def-001〜006` の実体）と効果発動ロジックが未実装。

- [ ] `shared/data/skillDefinitions.ts` 作成（skill-def-001〜006 の実体定義）
  - effectType別の effectData 構造を確定する（A1/Fun が内容を決定）
  - 例: `cooking` → `{ eatHungerBonus: 10, eatExpMultiplier: 1.5 }`
- [ ] スキル効果の発動ロジック設計・実装（A3/BE）
  - `effectType: "cooking"` — eatアクション時に所持スキルを参照して食事効果（hunger回復・EXP）を増幅
  - `effectType: "stat_boost"` — ターン開始時に恒常的なステータス加算
  - `effectType: "action_bonus"` — gather/hunt等の特定アクションの成功率・ドロップ量を増加
  - スキル効果の適用はターン処理側（`turnProcessor.ts`）で行う（クライアント側での計算は不可）
- [ ] スキル確認UI（スライムカードへの習得スキル一覧・効果説明表示）（A4/FE）

**進化・分裂・融合（A3/BE）**
- [ ] 進化UIの実装（`checkEvolution` は Phase 1 で実装済み）
- [ ] 分裂ロジック（条件達成時に新スライムを生成）
- [ ] 分裂による別種族スライム生成条件の実装
- [ ] 融合アクションの実装（他スライムを吸収・ステータス強化）

### Phase 4 残課題（Phase 5 以降で対応）

- Firebase App Check 導入（A2/Sec SEC-L-3・Phase 4 高優先で持ち越し）
- `coverageThreshold` に `branches: 70` 追加（A7/QA推奨）
- Phase 3残課題のA1指摘事項（H-2/M-1〜M-5）を Phase 4序盤に対応

---

## Phase 5: マップ描画・UI完成 ＋ アクション拡張（fish/human系）

### 実装内容

**マップ描画（A4/FE）**
- [ ] Phaser 3 または Pixi.js によるタイルマップ描画
- [ ] マップ上へのスライム配置表示
- [ ] スライムのリアルタイム位置更新（Firestoreリアルタイム購読）
- [ ] 移動アクションのビジュアル表示
- [ ] タイル属性の視覚的表示（アイコン・カラーコーディング）
- [ ] レスポンシブ対応の最終調整（PC・スマホ両対応）
- [ ] チュートリアルフロー実装

**アクション拡張（A3/BE・A1/Fun確認）**
- [ ] `wildMonsters.ts` に fish / human 系モンスター追加（weak/normal）
- [ ] battle対象カテゴリ拡張: fish / human 系を追加（zodスキーマ更新）
- [ ] マップ上でのタイル選択→gather/fish実行という直感的UIとの連動

**WorldLogPanel — 全スライム統合ログ（A4/FE・A5/DB・A1/Fun確認）**

> **設計背景**: 複数スライムが共存するマップを管理する形を目指すため、A1/Fun・A4/FE・A5/DB チーム議論で設計済み（2026-03-20）

- [ ] `frontend/src/components/world/turnLogUtils.ts` 作成（`formatEvent` / `EVENT_COLORS` を `TurnLogList` から切り出して共用）
- [ ] `frontend/src/components/world/WorldLogPanel.tsx` 新規作成
  - Firestore クエリ: `worldId + turnNumber DESC` + `limit(100)` のみ（フィルタはクライアント側処理）
  - **スライムフィルター**: スライム3体以下→タブ、4体以上→ドロップダウン（「全員」＋スライム名リスト）
  - **イベント種別フィルター**: チェックボックス群（デフォルト全ON）＋「重要のみ」プリセット（evolve/battle/split/merge）
  - **視覚区別**: 各行の左端にスライムカラーバー + スライム名バッジ、ワールドイベントは 🌍 アイコン
  - **ポーリング化**: `onSnapshot` を廃止し、`world.currentTurn` の変化を検知して `getDocs` で再取得（Firestore コスト削減・ターン間隔1時間のため十分）
  - `actorType: 'world'` のドキュメントは専用スタイルで表示
- [ ] `GamePage.tsx`: `TurnLogList`（1スライム用・スライム詳細パネル向けに残す）を `WorldLogPanel` に差し替え
  - `slimes` 配列を props として渡し、スライムフィルターと `GamePage` の `selectedSlimeId` を初期値として連動
- [ ] スライムカラーコードをFirestoreの `slimes` ドキュメントに追加（`color: string`、初期付与時にランダム割り当て）

---

## Phase 6: ソーシャル・野生スライム ＋ アクション拡張（spirit/slime系）

### 実装内容

**ソーシャル機能（A4/FE）**
- [ ] 他プレイヤーのマップ閲覧機能（読み取り専用）
- [ ] プレイヤー一覧表示

**野生スライム・モンスター拡張（A3/BE）**
- [ ] 野生スライムのAI自律行動ロジック（ターン進行時に処理）
- [ ] `wildMonsters.ts` に spirit / slime 系モンスター追加（weak/normal/strong 全解放）
- [ ] slime 系モンスターと `isWild: true` スライムエンティティの統合設計（A1・A3・A5で協議）
  - 推奨: 静的マスタ（wildMonsters.ts）から生成する方式を基本とし、`isWild` スライムとは別管理
- [ ] battle対象カテゴリ拡張: spirit / slime 系を追加
- [ ] battle強度に `"strong"` を追加（zodスキーマ解放）
- [ ] 食料交換・贈与機能の検討（Phase 7のフィードバック次第）

**ワールドイベント実装（A3/BE・A1/Fun設計・A5/DB）**

> **設計背景**: Phase 4で `slimeId: null` + `actorType: 'world'` のスキーマを導入し、Phase 5で WorldLogPanel の表示対応を完了した後、ここで実際のトリガーを実装する

- [ ] A1/Fun によるワールドイベント詳細設計（優先度・頻度・ゲームバランスへの影響）
  - 候補: 天気変化（gather/fish成功率変動）・アイテム自然出現（マップ上の特定タイル）・エリア封鎖/開放
- [ ] `functions/src/scheduled/turnProcessor.ts`: ターン処理時にワールドイベントを判定・書き込む
  - `slimeId: null`、`actorType: 'world'` で `turnLogs` に書き込み
  - 天気・季節などのワールド状態は `worlds/{worldId}` に保持し、ターン処理時に参照
- [ ] `worlds/{worldId}` スキーマに `weather / season` 等のワールド状態フィールド追加（A5/DB）
- [ ] `firestore.rules`: `slimeId: null` ドキュメントの読み取り権限確認（`worldId` が自分のワールドであること）

**対人戦闘（PvP）について**
- Phase 6では実装しない
- 将来実装する場合は `battle` とは別アクション（`raid` / `duel` 等）として独立設計
- Phase 7以降のプレイヤーフィードバックを踏まえて判断

---

## Phase 7: チューニング・リリース準備

### 実装内容

- [ ] Google Analytics 実装（`VITE_GA_MEASUREMENT_ID`）
- [ ] パフォーマンス計測・最適化
  - ターン処理時間の計測とCloud Functionsタイムアウト内の確認
  - Firestoreインデックス最適化（`firestore.indexes.json`）
- [ ] セキュリティルール最終レビュー（OWASP Top 10確認）
- [ ] エラーハンドリング・ユーザー向けエラーメッセージの整備
- [ ] テストカバレッジ最終確認（コアロジック80%以上）
- [ ] ダンジョン機能の基本実装（後期段階コンテンツ）

---

## 技術的注意事項

### ターン進行の冪等性

Cloud Schedulerは毎分起動するが、実際のターン処理は `nextTurnAt <= now()` のワールドのみ対象。
Firestoreトランザクション内で `nextTurnAt` を更新し、`status: 'processing'` フィールドで並列起動時の競合も防ぐ。

```
毎分: Scheduler起動
  → worlds で nextTurnAt <= now() を検索
  → 該当ワールドを processWorldTurn()
    → トランザクション内で status='processing' + nextTurnAt 更新
    → スライム処理実行
    → finally で status='idle' に戻す
```

### Firestoreバッチ書き込みの上限

WriteBatchは最大500オペレーション。スライム数が多い場合は複数バッチに分割して `Promise.all()` でコミット。

### マスタデータの扱い

食料・スキル・スライム種族などのマスタデータはFirestoreではなく静的JSONとしてfrontend/functionsにバンドルする。

### Cloud Functionsのタイムアウト

デフォルト60秒、最大540秒。100マップ×多数スライムの処理が長引く場合は：
- ワールドごとの処理を分散（複数ワールドは `Promise.all()`）
- スライム処理の最適化（不要なFirestore読み取りを削減）
- 必要に応じてCloud Tasks等でワールドごとに別Functionをディスパッチ
