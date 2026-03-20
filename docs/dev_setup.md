# 開発環境セットアップ手順

## 前提条件

- Node.js 20.x
- Firebase CLI (`npm install -g firebase-tools`)
- Netlify CLI (`npm install -g netlify-cli`)

## セットアップ手順

### 1. 依存関係のインストール

```bash
cd frontend && npm install
cd ../functions && npm install
cd ../netlify/functions && npm install
cd ../..
```

### 2. 環境変数の設定

```bash
cp .env.example .env.local
cp .env.example frontend/.env.local
```

それぞれのファイルを開き、Firebase プロジェクトの値を設定する。
設定項目の詳細は `.env.example` のコメントを参照。

**ローカル開発に必要な設定:**

| 変数 | 設定先 | 値 | 用途 |
|------|--------|-----|------|
| `VITE_FIREBASE_*` | `frontend/.env.local` | Firebase コンソールの値 | フロントエンドの Firebase 接続 |
| `VITE_USE_EMULATOR` | `frontend/.env.local` | `true` | Auth/Firestore をエミュレータに向ける |
| `FIRESTORE_EMULATOR_HOST` | `.env.local` | `127.0.0.1:8080` | Netlify Functions のエミュレータ接続 |
| `FIREBASE_AUTH_EMULATOR_HOST` | `.env.local` | `127.0.0.1:9099` | 同上 |

> **注意**: `frontend/.env.local` の `VITE_USE_EMULATOR=true` を設定し忘れると、
> フロントエンドが本番 Firebase Auth に接続しようとして `403 Forbidden` エラーになる。

### 3. Functions のビルド（Emulator 起動前に必須）

```bash
cd functions && npm run build
```

> Cloud Functions は TypeScript をコンパイルして生成した JS を読み込む。
> ビルド前に Emulator を起動すると `lib/functions/src/index.js does not exist` エラーになる。

### 4. Firebase Emulator の起動

```bash
# 初回またはデータをリセットしたいとき（エミュレータ起動 + シード自動投入）
npm run emulator:reset

# 2回目以降（前回の状態を復元して起動）
npm run emulator
```

Emulator UI: http://localhost:4000
Firestore: http://localhost:8080
Auth: http://localhost:9099

**エミュレータのデータ保持について:**
`npm run emulator` は起動時に `emulator-data/` から状態を復元し、Ctrl+C 終了時に保存する。
`emulator-data/` は `.gitignore` 対象。リセットしたいときは `npm run emulator:reset` を使う。

### 4.5. シードデータの手動投入（起動済みエミュレータに流す場合のみ）

`npm run emulator:reset` を使えば自動でシードが流れるため、通常は不要。

```bash
npm run seed
```

投入されるデータ:
- Auth Emulator: `test@slime.local` / `test1234` (uid: `test-user-001`)
- `worlds/world-001` — ターンタイマー・行動予約に必要
- `maps/map-001` + `tiles`（100件）
- テスト用スライム 3体（インベントリ付き）+ 野生スライム 2体

> ユーザー固有のマップ（`maps/{uid}-map` と `tiles`）は Auth Trigger が
> ユーザー登録時に自動生成するため、シードスクリプトでは作成しない。

### 5. 開発サーバーの起動（3ターミナル構成）

```bash
# Terminal 1（Emulator は手順 4 で起動済みであること）

# Terminal 2: Netlify Functions（API ゲートウェイ、port 8888）
npm run dev:functions

# Terminal 3: フロントエンド Vite（port 5173）← ブラウザはここに接続
npm run dev:frontend
```

アクセス先: **http://localhost:5173**

> **重要: ブラウザで `localhost:8888` を開かない**
> netlify dev (8888) は Functions 専用サーバー。フロントエンドを提供しない。
> 8888 にアクセスすると `frontend/dist/`（production ビルド）が返り、
> `VITE_USE_EMULATOR` が無効になって本番 Firebase Auth に繋がる。

**各サーバーの役割:**

| サーバー | ポート | 役割 |
|---------|-------|------|
| Firebase Emulator | 8080/9099/4000 | Firestore・Auth のモック |
| netlify dev | 8888 | `/api/*` `/dev-cheat/*` Netlify Functions のみ提供 |
| Vite | 5173 | フロントエンドを配信。`/api/*` `/dev-cheat/*` を 8888 へ転送 |

### 6. ログイン

開発環境（`VITE_USE_EMULATOR=true`）のログイン画面には 2 種類のボタンが表示される:

- **「テストユーザーでログイン（開発専用）」（amber）** — `test@slime.local` / `test1234` で即ログイン
- **「Googleでログイン」** — Auth Emulator の偽 Google OAuth を経由してログイン

> テストユーザーは `npm run seed`（または `npm run emulator:reset`）で作成される。

### 7. テストの実行

```bash
# Functions 単体テスト（Emulator 不要）
cd functions && npm test

# Functions テスト + カバレッジ
cd functions && npm run test:coverage

# フロントエンドテスト
cd frontend && npm test

# Functions 統合テスト（Emulator 起動後に実行）
FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=slime-hakoniwa-test \
  npx jest tests/integration --forceExit --verbose
```

> **統合テストの注意**: `GCLOUD_PROJECT=slime-hakoniwa-test` を指定して
> テストデータを本番 (`slime-sim-prototype`) と分離すること。

## ブランチ戦略

- `main`: 本番環境（PR のみマージ可）
- `develop`: 開発統合ブランチ
- `feature/*`: 機能開発
- `fix/*`: バグ修正

---

## Dev Cheat API（開発環境専用）

ローカル開発時（`FIRESTORE_EMULATOR_HOST` が設定されている場合のみ）有効なデバッグ支援機能。
進化・分裂・融合など長期プレイ前提のコンテンツをすぐに確認できる。

### フロントエンドの Dev Panel

開発サーバー（`npm run dev:frontend`）で起動した場合のみ、ゲーム画面の右下に **🛠 Dev Panel** が表示される。

| 操作 | 手順 |
|------|------|
| スライム一覧表示 | 「スライム一覧を読み込む」ボタン |
| 進化を確認 | スライム選択 → 「進化直前 (exp=490)」→ ⚡ターン強制実行 |
| 分裂を確認 | スライム選択 → 「分裂直前 (exp=490, beast=0.71)」→ ⚡ターン強制実行（15%確率なので複数回） |
| 融合を確認 | 融合対象スライムを選択 → 「融合テスト用 (atk=100)」→ 別スライムで merge 予約 → ターン強制実行 |
| hunger=0 | 「hunger=0 (空腹)」プリセット |

> **Dev Panel が表示されない場合**: `npm run dev:frontend`（Vite, port 5173）ではなく
> `localhost:8888`（netlify dev）でアクセスしていないか確認。8888 は Functions 専用。

### API 直接操作（curl 等で使う場合）

エミュレータ起動・`npm run dev:functions` 起動後に使用可能（port 8888）。

```bash
# dev モード確認
curl http://localhost:8888/dev-cheat/status

# スライム一覧取得
curl "http://localhost:8888/dev-cheat/slimes?worldId=world-001"

# スライムのステータスを上書き（EXP=490 に設定）
curl -X POST http://localhost:8888/dev-cheat/set-slime \
  -H "Content-Type: application/json" \
  -d '{"slimeId": "YOUR_SLIME_ID", "stats": {"exp": 490}}'

# 種族値を上書き（beast=0.71 に設定）
curl -X POST http://localhost:8888/dev-cheat/set-slime \
  -H "Content-Type: application/json" \
  -d '{"slimeId": "YOUR_SLIME_ID", "racialValues": {"beast": 0.71}}'

# ターン処理を即時実行
curl -X POST http://localhost:8888/dev-cheat/force-turn \
  -H "Content-Type: application/json" \
  -d '{"worldId": "world-001"}'
```

> **本番での動作**: `FIRESTORE_EMULATOR_HOST` が未設定の環境（本番 Netlify）では
> 全エンドポイントが **403** を返す。フロントの Dev Panel も本番ビルドでは除去される。

---

## 動作確認シナリオ（Phase 4 Week 3 時点）

Emulator + 開発サーバーを起動した状態（**http://localhost:5173** でアクセス）で以下を順番に実行する。

### シナリオ 1: ログインと初期セットアップ

1. ブラウザで `http://localhost:5173` にアクセスする
2. ログイン画面で「テストユーザーでログイン（開発専用）」ボタンを押す
3. **確認**: セットアップ画面（`/setup`）が表示される
4. **確認**: 数秒後にゲーム画面（`/game`）に遷移する
5. **確認（Emulator UI）**: `users` に UID ドキュメント、`maps` にマップ、`tiles` に 100 件が作成される

> セットアップが終わらない場合: Emulator が起動していないか、`VITE_USE_EMULATOR=true` が未設定

### シナリオ 2: スライムの召喚

1. ゲーム画面の「スライムを呼び出す」ボタンを押す
2. **確認**: スライムリストに「はじめてのスライム」が表示される
3. ボタンをもう一度押した場合: 「すでにスライムがいます」エラーが表示される（冪等性確認）

### シナリオ 3: 行動予約（gather / fish / hunt 含む）

1. 「アクション予約」フォームでアクション種別を選ぶ
2. **gather**: パネルに採集の説明が表示され、予約できる
3. **fish**: 水属性タイルでのみ成功する旨が表示される
4. **hunt**: モンスター種別・強さを選択（強さ「普通」かつ低ステータスの場合は警告が出る）
5. **eat**: インベントリの所持数が表示され、未所持の食料はグレーアウトされる
6. **確認**: 実行タイミングのドロップダウンが「予約済みを除いた次の空き 5 枠」を表示する
7. **確認**: 同一ターンに重複予約しようとすると 409 エラーになる

### シナリオ 4: ターン進行

**方法 A: Dev Panel（推奨）**
1. ゲーム画面右下の Dev Panel で「⚡ ターン強制実行」ボタンを押す
2. **確認**: ログ欄に `Turn N → N+1` が表示される

**方法 B: Emulator UI**
1. Emulator UI（Functions タブ）から `scheduledTurnProcessor` を手動トリガーする
2. **確認**: `worlds/world-001` の `currentTurn` が増加する

共通確認事項:
- `turnLogs` に `eventType: "gather_success"` や `eat` 等のドキュメントが作成される
- gather/fish/hunt 成功後は `slimes/{id}` の `inventory` にアイテムが追加される
- eat 実行後はインベントリの数が減り、ステータスが変化する

> ターンが進まない場合: Emulator UI で `worlds/world-001` の `nextTurnAt` を過去に書き換えてから再実行する

### シナリオ 5: 進化・分裂・融合の確認（Dev Panel 使用）

1. Dev Panel で対象スライムを選択
2. **進化確認**: 「進化直前 (exp=490)」プリセット → 「⚡ ターン強制実行」→ ターンログに ★進化 が表示
3. **分裂確認**: 「分裂直前 (exp=490, beast=0.71)」プリセット → ターン強制実行を繰り返す（15%確率）→ スライム一覧が増える
4. **融合確認**: 2体スライムが必要。一方を選択して「融合テスト用 (atk=100)」→ もう一方で merge 予約 → ターン強制実行 → ターゲットが消える

### シナリオ 6: マップ設定画面

1. ヘッダーの「マップ設定」リンクをクリックする
2. **確認**: タイルグリッド（10×10）が属性色付きで表示される

---

## 現時点で動作しない機能（Phase 5 以降）

| 機能 | 対応予定 |
|------|---------|
| スキル効果発動（cooking/stat_boost/action_bonus） | Phase 5 |
| マップ上へのスライム位置表示 | Phase 5 |
| WorldLogPanel（複数スライム統合ログ） | Phase 5 |
| 他プレイヤーのマップ閲覧・野生スライム | Phase 6 |
| ソーシャル機能（公開プロフィール等） | Phase 6 |
