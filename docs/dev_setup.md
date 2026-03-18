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
# .env.local を編集して各値を設定

# Vite はフロントエンドの実行ディレクトリから env を読むため、frontend/ にもコピーする
cp .env.local frontend/.env.local
```

> **注意**: `.env.local` はルートと `frontend/` の両方に必要。ルートのみだと Vite が読めず `auth/invalid-api-key` エラーになる。

### 3. Functions のビルド（Emulator 起動前に必須）

```bash
cd functions && npm run build
```

> Cloud Functions は TypeScript をコンパイルして生成した JS を読み込む。ビルド前に Emulator を起動すると `lib/functions/src/index.js does not exist` エラーになる。

### 4. Firebase Emulator の起動

```bash
firebase emulators:start
```

Emulator UI: http://localhost:4000
Firestore: http://localhost:8080
Functions: http://localhost:5001

> **注意: エミュレーターのデータは揮発性**。停止するたびに Firestore のデータが全消去される。起動のたびに次のシードスクリプトを実行する必要がある。

### 4.5. シードデータの投入（Emulator 起動後・毎回必須）

```bash
cd functions
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx ts-node src/scripts/seed.ts
cd ..
```

投入されるデータ:
- `worlds/world-001` — ターンタイマー・行動予約に必要。**これがないと TurnTimer が「ワールド情報が取得できません」と表示される**
- `maps/map-001` + `tiles`（100件）— マップ初期データ
- テスト用スライム（野生2体含む計5件）

> ユーザー固有のマップ（`maps/{uid}-map` と `tiles`）は Auth Trigger（Cloud Function）がユーザー登録時に自動生成するため、シードスクリプトでは作成しない。

### 5. 開発サーバーの起動（`netlify dev`）

```bash
# プロジェクトルートから実行すること（frontend/ ではない）
netlify dev
```

`netlify dev` は以下を同時に提供する:
- **フロントエンド (Vite)**: `frontend/` で `npm run dev` を起動 → ポート 5173
- **Netlify Functions** (`netlify/functions/api.ts`): `/.netlify/functions/api` で提供
- **リダイレクトルール**: `/api/*` → `/.netlify/functions/api/:splat` が有効になる

アクセス先: **http://localhost:8888**（Vite の 5173 ではなく 8888）

> **注意**: `npm run dev` だけでは Netlify Functions が起動せず、「スライムを呼び出す」等のボタンが 404 になる。

> **前提**: Netlify CLI のインストール: `npm install -g netlify-cli`

### 6. テストの実行

```bash
# Functions 単体テスト（Emulator 不要）
cd functions && npm test

# Functions 統合テスト（Emulator 起動後に実行）
# GCLOUD_PROJECT はテスト用プロジェクトID（本番の slime-sim-prototype とは別）
FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=slime-hakoniwa-test npx jest tests/integration --forceExit --verbose

# フロントエンドテスト
cd frontend && npm test
```

> **統合テストの注意**: `GCLOUD_PROJECT=slime-hakoniwa-test` を指定することで、テスト用データが本番 (`slime-sim-prototype`) と分離される。`FIRESTORE_EMULATOR_HOST` も必須。

## ブランチ戦略

- `main`: 本番環境（PRのみマージ可）
- `develop`: 開発統合ブランチ
- `feature/*`: 機能開発
- `fix/*`: バグ修正

---

## 動作確認シナリオ（Phase 3 時点）

Emulator + `netlify dev` を起動した状態（**http://localhost:8888** でアクセス）で以下のシナリオを順番に実行する。
各ステップの「確認内容」を満たせば正常動作している。

### シナリオ 1: ログインと初期セットアップ

1. ブラウザでフロントエンドにアクセスする
2. Google アカウントでログインする
3. **確認**: セットアップ画面（「箱庭を準備しています」）が表示される
4. **確認**: 数秒後にゲーム画面（`/game`）に遷移し、「はじめてのスライムを迎えよう！」カードが表示される
5. **確認（Emulator）**: Firestore の `users` コレクションにドキュメントが作成され、`mapId` フィールドが存在する。`maps` コレクションにマップが、`maps/{id}/tiles` に100件のタイルが存在する

> セットアップが終わらない場合: Emulator が起動していない、または環境変数（Firebase プロジェクト設定）が誤っている可能性がある

> シナリオ 2 以降でターンタイマーが「ワールド情報が取得できません」と表示される場合: シードスクリプト（手順 4.5）が未実行。`worlds/world-001` が存在しないため。

### シナリオ 2: スライムの召喚

1. ゲーム画面の「スライムを呼び出す」ボタンを押す
2. **確認**: ボタンが「召喚中...」に変わり、しばらくするとスライムリストに「はじめてのスライム」が表示される
3. **確認**: スライムリスト項目に満腹度バッジ（緑）と HP・ATK 数値が表示される
4. **確認（Emulator）**: Firestore の `slimes` コレクションに `speciesId: "slime-001"` のドキュメントが作成されている
5. ボタンをもう一度押した場合: 「すでにスライムがいます」エラーが表示される（2体目は作成されない）

### シナリオ 3: 行動予約

1. スライムリストからスライムを選択する（選択中は緑ハイライト）
2. 「行動予約」フォームで「食事」を選び、食料を選択する
3. **確認**: 食料詳細パネル（説明・ステータス変化・種族値変化）が表示される
4. ターン番号に「現在のターン番号 + 1」以上の値を入力して送信する
5. **確認**: 「予約を追加しました」等の成功応答があり、予約一覧（「現在の予約」セクション）に行が追加される
6. **確認（Emulator）**: `actionReservations` コレクションに `status: "pending"` のドキュメントが作成されている

> 過去のターン番号を入力した場合: バリデーションエラーが返る

### シナリオ 4: ターン進行（Emulator での短縮確認）

本番では1時間ごとにターンが進むが、Emulator では Cloud Functions を直接呼び出して即時確認できる。

1. Emulator UI（Functions タブ）から `scheduledTurnProcessor` を手動トリガーする、または Functions Emulator に HTTP リクエストを送る
2. **確認**: Firestore の `worlds/{id}` の `currentTurn` が 1 増加している
3. **確認**: `turnLogs` コレクションに `eventType: "eat"`（または `hunger_decrease` 等）のドキュメントが作成されている
4. ゲーム画面の「ターンログ」セクションに、食事した食料名（例: 「食事した（スライムコア）」）が表示される
5. **確認**: `actionReservations` の対象予約の `status` が `"executed"` になっている

> ターンが進まない場合: `worlds/{id}` の `nextTurnAt` が未来になっているため turnProcessor がスキップしている。Emulator で `nextTurnAt` を過去の時刻に書き換えてから再実行する

### シナリオ 5: マップ設定画面

1. ヘッダーの「マップ設定」リンクをクリックする
2. **確認**: タイルグリッド（10×10）が属性色付きで表示される
3. タイルにホバーすると座標と属性値がツールチップで確認できる

---

## 現時点で動作しない・確認できない機能

Phase 3 完了時点では以下は未実装のため動作確認対象外。

| 機能 | 対応予定 |
|------|---------|
| 進化の画面通知（進化はバックエンドで自動処理されるが画面表示なし） | Phase 4 |
| マップ上へのスライム位置表示 | Phase 5 |
| 他プレイヤーのマップ閲覧・野生スライム | Phase 6 |

進化自体はターン進行時に `checkEvolution` が自動判定し、条件を満たせば `speciesId` が更新される。
Emulator の Firestore でスライムドキュメントを確認すると `speciesId` の変化は追える。
