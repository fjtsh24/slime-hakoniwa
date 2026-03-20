# スライム箱庭ゲーム

スライムの育成をまったり楽しむ、行動予約型のターン進行ゲームです。

リアルタイムで自動進行するターンに合わせて行動を予約し、スライムの成長・進化を計画するところに楽しさを見出すゲームです。

## ゲームの概要

1. **行動予約** — UIから複数ターン分の行動（食事・移動・採集・戦闘など）を事前に予約する
2. **ターン自動進行** — バックエンドが1時間ごとにターンを進行し、予約をもとにスライムのステータスを更新する
3. **結果確認と調整** — 行動結果を確認して次の予約を組む

### 育成要素

| 要素 | 内容 |
|------|------|
| 食料 | 種別（植物・獣・魚・スライム・精霊・人間）によって種族値やスキルが変化 |
| 環境 | マップタイルの属性（火・水・地・風）がスライムに影響 |
| 進化 | 条件を満たすと種族が変化し、新たな能力を獲得 |
| 分裂・融合 | 成長したスライムが分裂して別種族を生んだり、他のスライムを吸収して強化できる |
| スキル | 調理スキルを持つスライムが食事効果を高めるなど、育成がほかの育成をサポートする |

## 技術スタック

| 領域 | 技術 |
|------|------|
| フロントエンド | React + TypeScript + Vite + Tailwind CSS |
| ホスティング | Netlify |
| バックエンド API | Netlify Functions (TypeScript) |
| ターン進行 | Firebase Cloud Functions (Scheduled) |
| データベース | Cloud Firestore |
| 認証 | Firebase Authentication (Google OAuth) |

## ディレクトリ構成

```
slime-hakoniwa/
├── frontend/          # React フロントエンド（Netlify デプロイ）
├── functions/         # Firebase Cloud Functions（ターン進行）
├── netlify/functions/ # Netlify Functions（API ゲートウェイ）
├── shared/
│   ├── types/         # フロント・Functions 共用型定義
│   └── data/          # マスタデータ（食料・スライム種族）
├── docs/              # 設計書・API 仕様・レビュー報告
├── tests/             # ユニットテスト・統合テスト
├── firestore.rules    # Firestore セキュリティルール
└── firebase.json
```

## 開発環境のセットアップ

詳細は [docs/dev_setup.md](docs/dev_setup.md) を参照してください。

### 前提条件

- Node.js 20.x
- Firebase CLI (`npm install -g firebase-tools`)
- Netlify CLI (`npm install -g netlify-cli`)

### クイックスタート

```bash
# 1. 依存関係のインストール
cd frontend && npm install
cd ../functions && npm install
cd ../netlify/functions && npm install && cd ../..

# 2. Functions のビルド
cd functions && npm run build && cd ..

# 3. 環境変数の設定
cp .env.example .env.local          # Netlify Functions 用
cp .env.example frontend/.env.local # フロントエンド用（VITE_* 変数を設定）
# 各ファイルを編集して Firebase プロジェクトの値を設定

# --- 3ターミナルで同時起動 ---

# Terminal 1: Firebase Emulator（シードデータ込みでリセット起動）
npm run emulator:reset   # 初回のみ。2回目以降は npm run emulator

# Terminal 2: Netlify Functions（API サーバー、port 8888）
npm run dev:functions

# Terminal 3: フロントエンド（Vite、port 5173）
npm run dev:frontend
```

アクセス先: **http://localhost:5173**（`localhost:8888` はFunctions専用）

ログイン画面に表示される「テストユーザーでログイン」ボタンで即座にテスト開始できます。

### テスト実行

```bash
# Functions 単体テスト
cd functions && npm test

# フロントエンドテスト
cd frontend && npm test

# Functions 統合テスト（Emulator 起動後）
FIRESTORE_EMULATOR_HOST=localhost:8080 GCLOUD_PROJECT=slime-hakoniwa-test \
  npx jest tests/integration --forceExit --verbose
```

## 実装状況

| Phase | 内容 | 状態 |
|-------|------|------|
| Phase 1 | ターン進行システム基盤 | 完了 |
| Phase 2 | 認証・ユーザー・マップ基盤 | 完了 |
| Phase 3 | スライム育成基本 | 完了 |
| Phase 4 | 進化・分裂・融合 + アクション拡張 | 進行中（Week 1〜2 完了） |
| Phase 5 | マップ描画・UI完成 | 未着手 |
| Phase 6 | ソーシャル・野生スライム | 未着手 |
| Phase 7 | チューニング・リリース準備 | 未着手 |
