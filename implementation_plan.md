# スライム箱庭ゲーム 実装計画

## フェーズ概要

| Phase | 内容 | 目安期間 | 状態 |
|-------|------|---------|------|
| Phase 1 | ターン進行システム基盤 | 3週間 | ✅ 完了 |
| Phase 2 | 認証・ユーザー・マップ基盤 | 2週間 | ✅ 完了 |
| Phase 3 | スライム育成基本 | 3週間 | ✅ 完了 |
| Phase 4 | 進化・分裂・融合 | 3週間 | ✅ 完了 |
| Phase 5 | マップ描画・UI完成 | 3週間 | ✅ 完了 |
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
- [x] `shared/types/action.ts`: `ActionType` に `"gather" | "fish" | "hunt"` 追加、`BattleActionData / GatherActionData / FishActionData / HuntActionData` 型追加
- [x] `shared/types/slime.ts`: `InventorySlot { foodId: string, quantity: number }` 型追加・`inventory?: InventorySlot[]`・`color?: string` 追加
- [x] `shared/types/turnLog.ts`: 以下を変更（A5/DB 設計済み・後方互換）
  - `slimeId: string` → `slimeId: string | null`（ワールドイベント対応・既存ドキュメント影響なし）
  - `actorType: 'slime' | 'world'` フィールド追加（既存ドキュメントはデフォルト `'slime'` で扱う）
  - `TurnEventType` に `gather_success / gather_fail / fish_success / fish_fail / hunt_success / hunt_fail / inventory_full / inventory_not_found / battle_incapacitated` 追加
  - `TurnEventType` にワールドイベント種別を予約列挙: `season_change / weather_change / area_unlock / item_spawn`（Phase 6で実装、型定義のみ先行）
- [x] `shared/types/wildMonster.ts`: `WildMonsterSpecies / MonsterStrength` 型定義（新規）
- [x] `shared/types/dropTable.ts`: `DropEntry / TileCondition / DropTableEntry` 型定義（新規）
- [x] `shared/constants/game.ts`（新規または既存）: `RACIAL_VALUE_MAX = 1.0`、`INVENTORY_MAX_SLOTS = 10` 定数追加

**マスタデータ作成（A3/BE・A1/Fun確認）**
- [x] `shared/data/wildMonsters.ts`: beast/plant × weak/normal 12エントリ定義
- [x] `shared/data/dropTable.ts`: gather/fish/hunt/battle 14ドロップテーブル定義

**インベントリAPI・バリデーション（A3/BE・A2/Sec）**
- [x] `netlify/functions/helpers/validation.ts`: `BattleActionData / HuntActionData` の zodスキーマ追加（targetStrength は `"weak" | "normal"` のみ、`"strong"` は Phase 4 除外）
- [x] `GatherActionData / FishActionData` は空オブジェクト（zod `.strict()` で余分なキーを拒否）
- [x] `firestore.rules`: `slimes/{slimeId}/inventory` サブコレクションのアクセス制御追加（ownerUid == request.auth.uid のみ読み書き可）
- [x] `firestore.indexes.json`: 3インデックス追加
  - `turnLogs`: `slimeId ASC + turnNumber DESC`
  - `turnLogs`: `worldId ASC + eventType ASC + turnNumber DESC`（WorldLogPanel のイベント種別フィルタ用）
  - `slimes`: `mapId ASC + tileX ASC + tileY ASC`

**テスト先行作成（A7/QA）**
- [x] `tests/unit/inventoryOps.test.ts`: インベントリ操作ヘルパー 8件（RED）
- [x] `tests/unit/eatAction.test.ts`: インベントリ連動ケース 2件追加（RED）、既存8件 GREEN 維持
- [x] `tests/unit/functions/turnProcessor.test.ts`: eatブロック修正・`actorType:'slime'` 欠落バグ修正

**Phase 3残課題 UI改善（A4/FE）**
- [x] **[M-1]** ウェルカムカード文言を設計書準拠に修正
- [x] **[M-2]** 食料詳細パネルのステータスラベル日本語化（hp→HP 等）
- [x] **[M-3]** 行動予約フォームのターン番号入力を相対ターン選択UIに変更
- [x] **[M-4]** move アクション時に現在座標ヒント表示
- [x] **[M-5]** hunger < 20 時の警告文追加

### Week 2: gather / fish / hunt アクション実装（TDD） ✅

**テスト先行作成（A7/QA）**
- [x] `tests/unit/gatherAction.test.ts`: 8件（タイル属性別ドロップ・インベントリ満杯・hunger消費）（GREEN）
- [x] `tests/unit/fishAction.test.ts`: 6件（water属性閾値0.3の境界値・fish系食料のみドロップ）（GREEN）
- [x] `tests/unit/huntAction.test.ts`: 6件（成功/失敗・HP損傷・インベントリ満杯でhunt_success）（GREEN）

**バックエンド実装（A3/BE）**
- [x] `functions/src/scheduled/turnProcessor.ts`: インベントリヘルパー関数実装（`addToInventory / removeFromInventory`、INVENTORY_MAX_SLOTS制限付き）
- [x] `functions/src/scheduled/turnProcessor.ts`: `eatアクション` をインベントリ参照・消費に変更（`inventory?` オプショナル対応で後方互換維持）
- [x] `functions/src/scheduled/turnProcessor.ts`: `eatアクション` の racialDeltas 未適用バグ修正
- [x] `functions/src/scheduled/turnProcessor.ts`: `gatherアクション` ハンドラ追加（タイル属性→dropTable→インベントリ追加）
- [x] `functions/src/scheduled/turnProcessor.ts`: `fishアクション` ハンドラ追加（water >= 0.3 実行条件付き）
- [x] `functions/src/scheduled/turnProcessor.ts`: `huntアクション` ハンドラ追加（成功/失敗判定・HP損傷・係数0.75でspd反映強化）
- [x] タイルデータのバルク取得実装（N+1問題解消: mapId単位で一括取得）
- [x] `move`アクションの種族値上限クランプ修正（RACIAL_VALUE_MAX）

**フロントエンド（A4/FE）**
- [x] インベントリ表示UI（スライムカード内の所持食料一覧・数量表示）
- [x] 食事フォームの在庫なし食料グレーアウト（インベントリ在庫0の foodId は選択不可）
- [x] gather/fish/hunt アクションの予約フォーム追加（hunt は種別・強さ選択UI）
- [x] hunt normal 選択時のステータス不足警告表示
- [x] eat フォームにガイダンス文追加（gather/fish/hunt で獲得してから eat）

### Week 3: battle アクション + 進化・分裂・融合

**テスト先行作成（A7/QA）**
- [x] `tests/unit/battleAction.test.ts`: 10件（勝敗判定・種族値上昇・食料ドロップ・EXP・HP損傷・戦闘不能状態）（GREEN）
- [x] `tests/unit/functions/turnProcessor.test.ts`: `checkSplit` 9件追加（境界値・確率・親フィールド継承）（A7/QA H-1 対応）
- [ ] `tests/integration/inventoryApi.test.ts`: gather→インベントリ確認→eatでインベントリ消費 の一連フロー（Emulator）【Phase 5】
- [ ] `tests/integration/battleHunt.test.ts`: hunt成功/失敗・battle勝利/敗北フロー（Emulator）【Phase 5】

**バックエンド実装（A3/BE）**
- [x] `functions/src/scheduled/turnProcessor.ts`: `battleアクション` ハンドラ追加
  - 勝敗判定: `(slime.stats.atk + Math.random() * slime.stats.spd * 0.5) > monsterPower`（weak=10/normal=30）
  - 勝利時: 種族値直接加算（`Math.min(current + delta, RACIAL_VALUE_MAX)` でクランプ）+ 食料ドロップ + EXP×1.5〜2
  - 敗北時: HP大ダメージ、HP=0で戦闘不能（2ターン行動停止フラグ）
  - 対象カテゴリ: beast/plant（weak/normal）のみ（Phase 4スコープ）

**スキルシステム設計・実装（A1/Fun設計 → A3/BE・A5/DB実装）**

> 現状: `shared/types/skill.ts` に型定義あり、`turnProcessor.ts` にスキル付与ロジックあり。
> しかしスキルマスタデータ（`skill-def-001〜006` の実体）と効果発動ロジックが未実装。

- [x] `shared/data/skillDefinitions.ts` 作成（skill-def-001〜006 の実体定義）
  - effectType別の effectData 構造を確定する（A1/Fun が内容を決定）
  - 例: `cooking` → `{ eatHungerBonus: 10, eatExpMultiplier: 1.5 }`
- [ ] スキル効果の発動ロジック設計・実装（A3/BE）【Phase 5 以降】
  - `effectType: "cooking"` — eatアクション時に所持スキルを参照して食事効果（hunger回復・EXP）を増幅
  - `effectType: "stat_boost"` — ターン開始時に恒常的なステータス加算
  - `effectType: "action_bonus"` — gather/hunt等の特定アクションの成功率・ドロップ量を増加
  - スキル効果の適用はターン処理側（`turnProcessor.ts`）で行う（クライアント側での計算は不可）
- [x] スキル確認UI（スライムカードへの習得スキル一覧・効果説明表示）（A4/FE）

**進化・分裂・融合（A3/BE・A4/FE）**
- [x] 進化UIの実装（`TurnLogList.tsx` に種族名表示・evolveイベント色強調）
- [x] 分裂ロジック（条件達成時に新スライムを生成）（`checkSplit()` 実装: exp≥500 + racialMax≥0.7 + 15%確率）
- [x] 分裂による別種族スライム生成条件の実装（親と同種族・baseStats継承）
- [x] 融合アクションの実装（他スライムを吸収・ステータス強化）（ATK/DEF×30%吸収、自己融合防止、オーナー一致チェック）
- [x] `battle` / `merge` を `AVAILABLE_ACTIONS` に追加（A1/Fun H-1・H-2 対応）
  - battle UI: カテゴリ・強さ選択（hunt と同じセレクタを使用）
  - merge UI: 融合対象スライム選択 + 「対象スライムが削除されます」警告

### レビュー完了 ✅（2026-03-21）

- [x] A7/QA レビュー → `docs/qa_review/phase_4.md`（H-1: checkSplit テスト追加で対応済み）
- [x] A2/Sec レビュー → `docs/security_review/phase_4.md`（M レベルは Phase 5 対応）
- [x] A1/Fun レビュー → `docs/fun_review/phase_4.md`（H-1・H-2: battle/merge フロントエンド追加で対応済み）

### Phase 4 残課題（Phase 5 以降で対応）

- Firebase App Check 導入（A2/Sec SEC-M-4・Phase 4 高優先で持ち越し）
- `coverageThreshold` に `branches: 70` 追加（A7/QA-M-2）
- cooking スキル効果ロジックのテスト追加（A7/QA-M-4）
- `slimesToDelete` / `newSlimesToCreate` をメインバッチに組み込みアトミック化（A2/Sec SEC-M-2・M-3）
- battle/skill_grant ターンログにモンスター名・スキル名表示（A1/Fun L-1）
- autonomous eventData に action フィールド追加（A1/Fun L-2）
- 統合テスト CI 除外の明示化（A7/QA-M-3）
- Phase 3残課題のA1指摘事項（H-2/M-1〜M-5）を Phase 5序盤に対応

---

## Phase 5: マップ描画・UI完成 ＋ アクション拡張（fish/human系）

### 実装内容

**マップ描画（A4/FE）**
- [x] CSS Grid によるタイルマップ描画（Phaser 3 / Pixi.js の代わりに採用 — A1/Fun判断: ゼロ依存・MapSettingsPageと共通パターン）
- [x] マップ上へのスライム配置表示（スライムカラードット）
- [x] スライムのリアルタイム位置更新（Firestoreリアルタイム購読）
- [x] タイル属性の視覚的表示（アイコン・カラーコーディング: fire→赤/water→青/earth→黄/wind→緑）
- [x] チュートリアルフロー実装（localStorage dismissible ヒントカード — A1/Fun B案推奨）
- [x] マップタイルクリック → ActionReservationForm の move 座標オートセット

**アクション拡張（A3/BE・A1/Fun確認）**
- [x] `wildMonsters.ts` に fish / human 系モンスター追加（各3体×weak/normal、A1/Fun設計）
- [x] battle/hunt対象カテゴリ拡張: fish / human 系を追加（zodスキーマ更新・shared/types/action.ts更新）
- [x] マップ上でのタイル選択→move フォームへ自動入力（`clickedTile` prop 経由）

**WorldLogPanel — 全スライム統合ログ（A4/FE・A5/DB・A1/Fun確認）**

> **設計背景**: 複数スライムが共存するマップを管理する形を目指すため、A1/Fun・A4/FE・A5/DB チーム議論で設計済み（2026-03-20）

- [x] `frontend/src/components/world/turnLogUtils.ts` 作成（`formatEvent` / `EVENT_COLORS` を `TurnLogList` から切り出して共用）
- [x] `frontend/src/components/world/WorldLogPanel.tsx` 新規作成
  - Firestore クエリ: `worldId + turnNumber DESC` + `limit(100)` のみ（フィルタはクライアント側処理）
  - **スライムフィルター**: スライム3体以下→タブ、4体以上→ドロップダウン（「全員」＋スライム名リスト）
  - **イベント種別フィルター**: 「重要のみ」プリセット（evolve/battle/split/merge）
  - **視覚区別**: 各行の左端にスライムカラーバー + スライム名バッジ、ワールドイベントは 🌍 アイコン
  - **ポーリング化**: `onSnapshot` を廃止し、`world.currentTurn` の変化を検知して `getDocs` で再取得
  - `actorType: 'world'` のドキュメントは専用スタイルで表示
- [x] `GamePage.tsx`: `WorldLogPanel` + `TurnLogList`（スライム個別詳細用）を両方搭載
- [x] スライムカラーコードをFirestoreの `slimes` ドキュメントに追加（`color: string`、初期付与時にランダム割り当て）

---

## Phase 6: ソーシャル・野生スライム ＋ アクション拡張（spirit/slime系）

> **設計書**: `docs/phase6_social_design.md` を参照（A1/Fun + A2/Sec レビュー済み、2026-03-20）

### Week 1: ソーシャル基盤・ログイン不要公開ページ

**課題**: アカウント登録しないとゲームの面白さが全く分からない → 公開ページで解決

**データ基盤（A5/DB・A2/Sec）**
- [x] `publicProfiles/{uid}` コレクション設計（publicHandle / displayName / slimeSummaries）
  - 書き込みは Cloud Functions（Admin SDK）のみ（`allow write: if false` in rules）
  - `slimes` 更新トリガー（`onSlimeWrite`）で自動同期 → `functions/src/triggers/slimeTrigger.ts`
  - 全スライム削除後も publicHandle は保持。ハンドル解除は別途変更APIが必要（仕様）
- [x] `publicHandle` の登録フロー追加（初回ゲーム画面）
  - バリデーション: `^[a-zA-Z0-9_-]{3,32}$`、lowercase 正規化、30日変更制限
  - `HandleSetupModal.tsx` + `POST /api/users/handle` で実装

**公開API（A3/BE・A2/Sec必須事項確認後実装）**
- [x] `netlify/functions/api.ts` に `/api/public/*` ルート追加（認証不要）
  - ✅ MUST-1: 全レスポンスをホワイトリスト方式でフィールドフィルタリング
  - ✅ MUST-2: `racialValues`・`exp`・`hunger`・`skillIds`・`incapacitatedUntilTurn` を非公開
  - ✅ Firebase UID をレスポンスに含めない（識別子は publicHandle のみ）
  - `Cache-Control: public, max-age=60` でCDNキャッシュ活用
- [x] `GET /api/public/encyclopedia` — スライム図鑑データ
- [x] `GET /api/public/players/:handle` — プレイヤープロフィール
- [x] `GET /api/public/live` — ライブ観戦フィード（eventData もホワイトリスト適用・MUST-5）

**フロントエンド（A4/FE）**
- [x] `/encyclopedia` スライム図鑑ページ（全10種族・進化ルート・CTAボタン）
- [x] `/players/:handle` プレイヤー公開プロフィールページ（スライム一覧・「このゲームを始める」CTAボタン）
- [ ] トップページにスライム図鑑・ライブフィードへのリンク追加（Week 2 対応予定）

### レビュー完了 ✅（2026-03-22）

- [x] A7/QA レビュー → `docs/qa_review/phase_6_w1.md`（141件全通過）
- [x] A2/Sec レビュー → `docs/security_review/phase_6_w1.md`（MUST-1〜5 全達成）
- [x] A1/Fun レビュー → `docs/fun_review/phase_6_w1.md`（H指摘 HandleSetupModal 説明追加済み）

### Phase 6 Week 1 残課題（Week 2 以降）

- トップページへのスライム図鑑・ライブフィードリンク追加（A4/FE）
- EncyclopediaPage 進化ルート SVG ツリー表示（A1/Fun M-1）
- CDN キャッシュパージ設定（A2/Sec M-1）
- Firebase App Check 導入（Phase 4 持ち越し）

### Week 2: ソーシャル拡張・野生スライム・ワールドイベント ✅（2026-03-22完了）

**ソーシャル拡張（A4/FE）**
- [ ] `/players/:handle/map` 他プレイヤーのマップ閲覧（読み取り専用・Week 3 対応予定）
- [x] `/live` ライブ観戦フィードページ（未認証アクセス可・30秒自動更新）
- [x] LoginPage にスライム図鑑・ライブ観戦リンク追加（未ログインユーザー向け）
- [x] EncyclopediaPage 進化ルート SVGツリー表示（Week 1 残課題 M-1 対応）

**野生スライム・モンスター拡張（A3/BE）**
- [x] `wildMonsters.ts` に spirit / slime 系モンスター追加（weak/normal/strong 各3体）
- [x] beast / plant / fish / human の strong 強度モンスター追加
- [x] spirit / slime 系ドロップ食料追加（foods.ts + dropTable.ts）
- [x] battle対象カテゴリ拡張: spirit / slime 系を追加（validation.ts）
- [x] battle強度に `"strong"` を追加（zodスキーマ解放）

**ワールドイベント実装（A3/BE・A1/Fun設計・A5/DB）**
- [x] A1/Fun によるワールドイベント詳細設計（`docs/phase6_w2_design.md`）
- [x] `checkWeatherTransition` / `checkSeasonTransition` を turnProcessor.ts に実装
  - `actorType: 'world'` で `turnLogs` に記録（WorldLogPanel 表示対応）
  - 季節による hunger 消費補正（夏+2, 冬+1）
- [x] `worlds/{worldId}` スキーマに `weather / season` フィールド追加（shared/types/world.ts）
- [x] SEASON_DURATION_TURNS = 120（約5日/季節）

### Week 3: /players/:handle/map・天候季節テスト・ライブフィード拡張 ✅（2026-03-22完了）

**Phase 6 Week 2 残課題の消化**
- [x] `/players/:handle/map` 他プレイヤーマップ閲覧ページ（準備中プレースホルダー、Phase 7 で本実装）
  - `TODO(Phase7)`: mapId を公開 API に追加して WorldMapPanel を表示
  - `TODO(Phase7)`: PlayerProfilePage と共通フック `usePublicProfile(handle)` に切り出す
- [x] LiveFeedPage に天候・季節イベント表示追加（weather_change/season_change カード実装）
- [x] 天候継続ターン数の乱数幅導入（minDuration/maxDuration で抽選）
- [x] `checkWeatherTransition` / `checkSeasonTransition` ユニットテスト追加（WT-01〜05 / ST-W-01〜07）
- [x] world.ts の `weather` 型を `'sunny'|'rainy'|'stormy'|'foggy'` literal union に強化
- [x] 図鑑の進化条件説明文を登録誘導文に変更（EncyclopediaPage）
- [x] /public/live バックエンドで actorType:'world' イベントを Promise.all でマージ
- [x] publicApi.test.ts を Promise.all 並行取得対応・makeWorldLog ヘルパー追加

**テスト総数**: 154件全通過（WT: +5件、ST-W: +7件、ST-W-02b境界値 +1件）

### Phase 6 Week 3 残課題（Phase 7 以降）

- PlayerProfilePage/PlayerMapPage の fetch ロジック共通フック化（A7/QA H-03 TODO）
- mapId を公開 API に追加して PlayerMapPage を本実装（A1/Fun M-1）
- eventData の `from`/`to` 値を enum で検証してから返す（A2/Sec S-1）
- 天候 ID の命名体系統一（設計書 `weather-sunny` vs 実装 `sunny`）（A1/Fun M-2）

### レビュー完了 ✅（2026-03-22）

- [x] A7/QA レビュー → `docs/qa_review/phase_6_w2.md`（141件全通過・M-1/M-2 即修正済み）
- [x] A2/Sec レビュー → `docs/security_review/phase_6_w2.md`（MUST-1〜3 全達成）
- [x] A1/Fun レビュー → `docs/fun_review/phase_6_w2.md`（H-1/H-2 即修正済み）
- [x] A7/QA Phase 6 W3 レビュー（H-01/H-03 対応済み・154件全通過）
- [x] A2/Sec Phase 6 W3 レビュー（MUST: 0件・条件付き承認）
- [x] A1/Fun Phase 6 W3 レビュー（High: LiveFeed 型不整合 対応済み）

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
- [ ] **Step 3 スライム視覚化（A1/Fun + A4/FE 設計済み）**
  - SVG パスモーフィング + 種族別シルエットスプライト
  - アニメーション分岐（基本ぷるぷる / 重い呼吸 / 速い揺れ）
  - 前提: Step 2 SVG マップ化 + アート素材の制作が完了していること

---

## スライム視覚化ロードマップ（A1/Fun + A4/FE 設計 2026-03-21）

> マップを「機能ツール」から「眺めて癒される空間」へ。A1/Fun と A4/FE が方針を合意済み。

### Step 1: CSS 待機アニメーション ✅ 完了（Phase 5 末）

- [x] `frontend/src/index.css` に `@keyframes slime-idle` / `slime-selected` を追加
- [x] `WorldMapPanel.tsx` のスライムドットに `.slime-idle` / `.slime-selected` クラスを適用
  - 通常スライム: 2.4秒ぷるぷり、選択中: 1.0秒の速いぷるぷる
- ライブラリ追加ゼロ、変更箇所最小

### Step 2: SVG アイソメトリックマップ化（Phase 6 予定）

> A4/FE 評価: WorldMapPanel.tsx の約45行変更のみ。Firestore 購読・onTileClick・選択ハイライトは無変更。ライブラリ不要。

- [ ] CSS Grid → SVG ベースのアイソメトリック描画に移行
  - 座標変換: `isoX = (x - y) * TW`, `isoY = (x + y) * TH`（菱形タイル配置）
  - `<polygon onClick>` でタイルクリック判定（CSS Grid より精度が高くなる）
  - タイルソート順は現行 `y → x` のまま（painter's algorithm が成立）
  - `viewBox` でレスポンシブ対応
- [ ] タイル属性色を SVG `fill` で表現（TILE_COLORS を HEX 変換）
- [ ] スライムドットを SVG `<circle>` に変更し `.slime-idle` CSS アニメを維持
- **不採用**: CSS Transform 方式（クリック判定が崩れる）・Pixi.js（+400KB、過剰）

### Step 3: 種族別 SVG ミニキャラ（Phase 7 予定）

> A1/Fun 設計: speciesId ベースの SVG シルエット + color フィールドで fill。データモデル変更ゼロ。

- [ ] `shared/data/slimeSprites.ts` に speciesId → SVG path のマッピングを追加
  - slime-001（基本スライム）: 丸くぷよぷよ揺れる
  - slime-002（ファイアスライム）: 上部に炎のゆらぎ
  - slime-004（アーススライム）: 重く揺れる（振幅小・周期長）
  - slime-005（ウィンドスライム）: 速く揺れる（振幅大・周期短）
- [ ] CSS パスモーフィング（`d` プロパティアニメ、Chrome 92+ / Firefox 110+ 対応済み）
- [ ] アニメーション分岐3種: ぷるぷる（基本）/ 呼吸（大型種）/ 速い揺れ（高SPD種）
- [ ] 進化イベント（`evolve` turnLog）をトリガーに1回限りのエフェクト
- **前提**: SVG マップ化（Step 2）とアート素材の制作が完了していること

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
