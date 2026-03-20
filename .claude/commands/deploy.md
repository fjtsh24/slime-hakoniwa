---
description: Netlify + Firebase へのデプロイ手順を確認・実行する
---

# デプロイ手順

このプロジェクトのデプロイは以下の構成で行う。**必ずこの手順に従うこと。**

## デプロイ構成

| 対象 | 方法 | トリガー |
|------|------|---------|
| フロントエンド + Netlify Functions | **Netlify の GitHub ネイティブ連携**（自動） | `main` ブランチへのマージ |
| Firebase Cloud Functions + Firestore | **GitHub Actions** (`deploy.yml`) | `main` ブランチへのマージ |

> ⚠️ Netlify CLI や GitHub Actions から手動で Netlify へデプロイしない。必ず Git 連携経由で行うこと。

## 実行手順

1. **ローカルビルドを確認する**
   ```bash
   npm ci --prefix netlify/functions
   npm run build --prefix frontend
   cd functions && npm run build
   ```

2. **テストを通す**
   ```bash
   cd frontend && npm test
   cd functions && npm test
   ```

3. **`develop` ブランチにコミット・プッシュする**
   ```bash
   git add <files>
   git commit -m "fix|feat|chore(...): ..."
   git push origin develop
   ```

4. **PR を作成する（`develop → main`）**
   ```bash
   gh pr create --base main --head develop --title "..." --body "..."
   ```

5. **Netlify の Deploy Preview でビルドが通ることを確認してからマージする**

6. **マージ後、Netlify と GitHub Actions が自動デプロイする**
   - Netlify: `https://slime-hakoniwa.netlify.app/` に反映
   - Firebase: Cloud Functions と Firestore ルール・インデックスに反映

## よくある失敗と対処

| エラー | 原因 | 対処 |
|--------|------|------|
| `tsc: not found` | frontend の node_modules 未インストール | ビルドコマンドに `npm ci --prefix frontend` を追加 |
| `firebase-admin` not resolved | netlify/functions の node_modules 未インストール | ビルドコマンドに `npm ci --prefix netlify/functions` を追加 |
| 401 エラー | Firebase Admin SDK 未初期化 | `FIREBASE_ADMIN_SDK_SERVICE_ACCOUNT_KEY` 環境変数を Netlify に設定 |
| Secrets scanning ブロック | 実際の値が `.env.example` 等に含まれている | `SECRETS_SCAN_OMIT_KEYS` に追加 or プレースホルダーに置換 |
| Firestore index エラー | `firestore.indexes.json` に複合インデックス未定義 | インデックスを追加して `firebase deploy --only firestore` |
