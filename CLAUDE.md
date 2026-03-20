# スライム箱庭ゲーム — Claude Code 設定

## プロジェクト概要

スライム育成WEBゲーム。箱庭諸島的な「行動予約」でターン進行するリアルタイム連動型。

- **Firebase ProjectID**: slime-sim-prototype
- **デプロイ**: フロントエンド→Netlify、ターン進行→Firebase Cloud Functions

## 現在の状態

Phase 1（ターン進行システム基盤）完了。次はPhase 2（認証・ユーザー・マップ基盤）。

詳細は `implementation_plan.md` を参照。

## エージェント構成

実装はマルチエージェントチームで進める。`agent_plan.md` を必ず参照すること。

> **重要**: サブエージェントはファイルの書き込み権限を持たない。ファイル生成・編集はオーケストレーター（Claude Code 本体）が直接行うこと。サブエージェントには調査・レビュー・設計判断のみを委任する。

| ID | 担当 | 参加必須タイミング |
|----|------|-----------------|
| A1/Fun | ゲームデザイン・面白さ管理 | ゲームパラメータ変更・UX変更時（全フェーズ） |
| A2/Sec | セキュリティ | 新API・Firestoreルール変更・認証フロー変更時（全フェーズ） |
| A3/BE | バックエンド・ターン進行 | Cloud Functions・Netlify Functions実装時 |
| A4/FE | フロントエンド | Reactコンポーネント・ストア実装時 |
| A5/DB | データモデル・DB | スキーマ変更・新エンティティ追加時 |
| A6/Infra | インフラ・CI/CD | 環境設定・デプロイ設定変更時 |
| A7/QA | テスト・品質管理 | 実装完了後のテスト・カバレッジ確認 |
| A8/Analytics | 分析・モニタリング | Analytics設計・コスト試算・モニタリング設計時（Phase 5〜） |

**フェーズ完了時のレビュー順序**: QA(A7) → Sec(A2) → Fun(A1) → 全員承認で次フェーズへ

## 作業ルール

### 実装前の確認
- 新規Phaseに入る前に `implementation_plan.md` の該当Phaseを確認する
- セキュリティ影響がある変更は A2/Sec を先に参照する
- ゲームパラメータ変更は A1/Fun の判断を仰ぐ
- **実装に着手する前に、取るアプローチを箇条書きで提示しユーザーの承認を得ること**（特に設定ファイル・デプロイ関連・コンポーネント特定が必要な変更）
- 着手前に関連する既存ファイル（netlify.toml, package.json, tsconfig, firestore.* 等）を読み、既存パターンに沿った方法を選ぶこと

### デバッグ方針
- バグ修正の前に**必ず原因診断を先に行う**こと
- 関連する全ての設定ファイル・ログを確認し、問題点を全て列挙してから修正に入る
- 症状への対処ではなく根本原因を修正する（Fix-chainを避ける）

### 修正・設計の判断基準
バグ修正・実装変更を行う前に、**「最も簡単な修正」を採用せず**、以下の順序で検討すること：

1. **理想形の確認**: 面白いゲームとして・安定したシステムとして「あるべき姿」は何かを先に定める
   - A1/Fun（ゲーム体験）・A2/Sec（安全性）・A3/BE（保守性）の視点で多角的に検討する
   - 必要に応じてエージェントに議論させ、合意案を得てから実装方針を決定する
2. **修正計画の分類**: 理想形に照らして、今回の修正が「一時対処」か「正式実装」かを明示する
   - 一時対処の場合: `TODO(PhaseX): 〜に移行する` コメントを残し、implementation_plan.md に記載する
   - 正式実装の場合: 理想形と一致していることを確認してから着手する
3. **ユーザーへの説明**: 採用した修正が一時対処か正式実装かを、理由とともに明示して報告する

### TDD方針
- A7(QA) がテストを先行作成 → A3/A4 が実装する順序を守る
- コアロジック（ターン処理・アクション実行）のカバレッジ目標: 80%以上
- テストレポートは `tests/reports/` に出力する

### セキュリティ
- Firestoreへの書き込み権限は Admin SDK（Cloud Functions）のみ（`firestore.rules` 参照）
- 全APIエンドポイントで Firebase IDトークン検証を行う（`netlify/functions/helpers/auth.ts` 使用）
- 入力バリデーションは zod（`netlify/functions/helpers/validation.ts` 使用）

### コミット・ブランチ
- `main`: 本番環境（PRのみマージ可）
- `develop`: 開発統合ブランチ
- `feature/*`: 機能開発 / `fix/*`: バグ修正

### PR作成
- 実装・修正が完了したら、**コミット・プッシュ後に必ずPRを作成する**
- PR作成先は原則 `develop → main`
- PRの作成まで含めて「作業完了」とする

## ディレクトリ構成

```
slime-hakoniwa/
├── frontend/          React + TypeScript + Vite（Netlifyデプロイ）
├── functions/         Firebase Cloud Functions（ターン進行）
├── netlify/functions/ Netlify Functions（APIゲートウェイ）
├── shared/
│   ├── types/         フロント・Functions共用型定義
│   └── data/          マスタデータ（foods, slimeSpecies）
├── docs/              openapi.yaml・schema.dbml・security.md・レビュー報告
├── tests/
│   ├── unit/
│   ├── integration/
│   └── reports/
├── firestore.rules
└── firestore.indexes.json
```

## よく使うコマンド

### ローカル開発起動手順（3ターミナル）

```bash
# Terminal 1: Firebase Emulator（Firestore・Auth・Functions）
npm run emulator          # 前回の状態を復元して起動
# npm run emulator:reset  # シードデータにリセットしたい場合

# Terminal 2: Netlify Functions（APIゲートウェイ、port 8888）
npm run dev:functions

# Terminal 3: フロントエンド Vite（port 5173）← ブラウザはここに接続
npm run dev:frontend
```

> **注意**: `netlify dev` はフロントエンドのプロキシとして使わない。
> catch-all redirect (`/* → index.html`) が Vite のモジュールリクエストに干渉し
> MIME type エラーが発生するため、Vite を直接起動する構成にしている。
> Vite の `/api/*` プロキシが netlify dev (8888) に転送する。

```bash
# テスト
cd functions && npm test       # Functions テスト（Emulator必要）
cd frontend && npm test        # フロントエンドテスト
```

## Phase 1 完了済みファイル（主要）

- `functions/src/scheduled/turnProcessor.ts` — ターン処理コア
- `netlify/functions/api.ts` — 予約CRUD API
- `shared/types/` — 全型定義
- `shared/data/` — food・slimeSpeciesマスタ
- `firestore.rules` — セキュリティルール
- `docs/openapi.yaml` — Swagger仕様書
- `docs/schema.dbml` — DBスキーマ

## 注意事項

- `slime-sim-prototype-firebase-adminsdk-*.json` は `.gitignore` 対象。コミットしないこと
- `turnIntervalSec` のデフォルトは **3600秒**（1時間）。変更時はA1/Funに確認
- Firestoreの `worlds` コレクションへの直接書き込みは一切禁止（Admin SDKのみ）
