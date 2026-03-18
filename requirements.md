# スライム箱庭ゲーム 要件定義書

## 1. プロジェクト概要

- **プロジェクト名**：スライム箱庭ゲーム（Slime Hakoniwa）
- **目的**：スライムの幅広く自由な育成をまったり楽しむリアルタイム連動型WEBゲームの開発
- **Firebase プロジェクトID**：slime-sim-prototype

---

## 2. システムアーキテクチャ

### 全体構成

```
[ブラウザ (PC / スマホ)]
        |
        v
[Netlify] ← フロントエンド (React + TypeScript) のみホスト
  └── Netlify Functions (APIゲートウェイ役)
        |
        v
[Firebase Platform]
  ├── Firebase Authentication  ... ユーザー認証
  ├── Firestore                ... メインDB（リアルタイム購読対応）
  ├── Firebase Cloud Functions
  │    ├── Scheduled (毎分起動): ターン進行処理
  │    └── HTTP: 補助API
  └── Firebase Storage         ... 画像アセット等
        |
[Google Analytics] ← フロントエンドから直接送信
```

> **注意**：Netlifyは静的ホスティング＋サーバーレス関数のみ対応。常駐バックエンドサーバーは動かせないため、定期実行が必要なターン進行はFirebase Cloud Functions（Scheduled）で実装する。

### 技術スタック

| レイヤー | 技術 | 理由 |
|---------|------|------|
| フロントエンド | React + TypeScript + Vite | 型安全・エコシステム成熟 |
| UIスタイル | Tailwind CSS + shadcn/ui | レスポンシブ対応・軽量 |
| タイルマップ描画 | Phaser 3 または Pixi.js | 2Dタイルマップの標準ライブラリ |
| フロント状態管理 | Zustand | 軽量・Firestore購読との相性 |
| APIゲートウェイ | Netlify Functions (Node.js) | Firebase Admin SDKを安全に利用可能 |
| DB | Firestore | リアルタイム更新・スケール容易 |
| 認証 | Firebase Authentication | 要件通り |
| ターン進行 | Firebase Cloud Functions (Scheduled) | 定期実行の唯一の現実的手段 |
| フロントテスト | Vitest + React Testing Library | Viteとネイティブ統合 |
| Functionsテスト | Jest + Firebase Emulator Suite | ローカル完結テスト |
| CI/CD | GitHub Actions | 要件通り |
| デプロイ | Netlify (FE) + Firebase CLI (Functions) | 要件通り |
| API仕様 | OpenAPI 3.0 (Swagger UI) | 要件通り |
| DB設計 | DBML (dbdiagram.io入力形式) | 要件通り |

---

## 3. 機能要件

### 3.1 ゲーム進行システム

- **行動予約**：ユーザーが複数ターン分の行動予約を登録・キャンセルできる
- **ターン進行**：Cloud Functions Scheduledが毎分起動し `nextTurnAt <= now()` のワールドのターンを処理する
- **結果確認**：行動結果をFirestoreのリアルタイム購読でUIに即時反映する

### 3.2 スライム育成システム

- 進化要素：環境（タイル属性）・食料・経験・強さ
- 強化要素：食事（ステータス強化・スキル取得）・イベント報酬・分裂・融合
- スキル：他スライムの育成をサポートする補助スキル含む

### 3.3 マップ・ワールドシステム

- ワールド内最大100マップ
- ユーザー1名につき1マップ保有
- N×Mタイル構成（タイルは複数属性値を持つ）
- 野生スライムの自律行動

### 3.4 ユーザー・認証機能

- Firebase Authentication によるログイン（メール/Google等）
- ユーザープロフィール管理
- セッション管理はFirebaseに委任

### 3.5 ゲーム進行段階別機能

- 初期段階：チュートリアル・基本操作習得
- 中期段階：スライム育成・スキル強化・中難易度ダンジョン
- 後期段階：特殊スライム作成・コンプリート要素

### 3.6 ソーシャル機能

- 他プレイヤーのマップ閲覧（読み取り専用）
- スライム育成状況の確認

---

## 4. 非機能要件

### 4.1 プラットフォーム

- PCおよびスマートフォンのWEBブラウザで動作
- レスポンシブUIデザイン

### 4.2 セキュリティ（OWASP Top 10準拠）

| 項目 | 対策 |
|------|------|
| アクセス制御 | Firestoreルールで所有者確認・Netlify FunctionsでIDトークン検証 |
| 暗号化 | HTTPS必須・機密情報は環境変数管理 |
| インジェクション | 入力バリデーションをzodで実施 |
| 認証 | Firebase Auth（IDトークン有効期限1時間）・セッション管理委任 |
| ログ | turnLogs + Firebase Cloud Loggingでイベント記録 |

### 4.3 パフォーマンス

- 100マップ×複数スライムのターン処理をCloud Functions実行時間（最大540秒）内に完了
- Firestoreの `WriteBatch`（最大500件）を活用した一括書き込み
- マスタデータ（食料・スキル・スライム種族）は静的JSONとしてフロントにバンドルし、Firestoreの読み取りコストを削減

### 4.4 開発・運用

- GitHub でコード管理（main/develop/feature/fix ブランチ戦略）
- GitHub Actions によるCI/CDパイプライン
- Netlify に自動デプロイ（フロントエンド）
- Firebase CLI による Functions 自動デプロイ
- Google Analytics（測定ID設定予定）によるアクセス解析

---

## 5. データ構造

### 5.1 Firestoreコレクション構造

```
/worlds/{worldId}
  - currentTurn: number
  - nextTurnAt: timestamp
  - turnIntervalSec: number   // デフォルト 3600（1時間）

/worlds/{worldId}/maps/{mapId}
  - ownerUid: string | null   // null = 野生マップ
  - width: number
  - height: number

/worlds/{worldId}/maps/{mapId}/tiles/{tileId}
  - x, y: number
  - attrFire, attrWater, attrEarth, attrWind: float

/users/{uid}
  - displayName: string
  - mapId: string
  - worldId: string

/slimes/{slimeId}
  - ownerUid: string | null
  - mapId, worldId: string
  - speciesId: string
  - tileX, tileY: number
  - stats: { hp, atk, def, spd, exp, hunger }
  - racialValues: { fire, water, earth, wind, slime, plant, human, beast, spirit, fish }
  - isWild: boolean

/slimes/{slimeId}/skills/{skillId}

/actionReservations/{reservationId}
  - slimeId, ownerUid, worldId: string
  - turnNumber: number
  - actionType: "eat" | "move" | "rest" | "battle"
  - actionData: object
  - status: "pending" | "executed" | "cancelled"

/turnLogs/{logId}
  - worldId, slimeId: string
  - turnNumber: number
  - eventType: string
  - eventData: object
  - processedAt: timestamp

// マスタデータ（静的JSONとしてバンドル可）
/skillDefinitions/{skillId}
/foods/{foodId}
/slimeSpecies/{speciesId}
```

### 5.2 DBMLスキーマ（dbdiagram.io用）

`docs/schema.dbml` に管理する。

### 5.3 Firestoreセキュリティルール方針

- `worlds`・`turnLogs`・`actionReservations`（status更新）はAdmin SDK（Cloud Functions）のみ書き込み可
- `actionReservations`の作成は所有者のみ可能・status='pending'のみ許可
- 他プレイヤーのマップ・スライムは読み取りのみ許可

---

## 6. API設計

- Swagger（OpenAPI 3.0）で仕様書を作成（`docs/openapi.yaml`）
- Netlify FunctionsをAPIゲートウェイとして使用
- 全エンドポイントでFirebase IDトークンによる認証を実施

### 主要エンドポイント

```
POST   /api/reservations          # 行動予約の作成
DELETE /api/reservations/:id      # 行動予約のキャンセル
GET    /api/worlds/:worldId/status # ワールドのターン状態取得
GET    /api/maps/:mapId           # マップ情報取得（他プレイヤー分も可）
```

---

## 7. テスト要件

- テスト駆動開発（TDDアプローチ）
- テストレポートは `tests/reports/` フォルダに管理
- Firebase Emulator Suiteを用いた統合テスト
- テストカバレッジ目標：コアロジック（ターン処理・アクション実行）80%以上

---

## 8. リポジトリ構成

```
slime-hakoniwa/
├── frontend/                  # React アプリ (Netlify デプロイ)
│   ├── src/
│   ├── vite.config.ts
│   └── package.json
├── functions/                 # Firebase Cloud Functions
│   ├── src/
│   │   ├── scheduled/
│   │   │   └── turnProcessor.ts
│   │   └── index.ts
│   └── package.json
├── netlify/
│   └── functions/             # Netlify Functions (APIゲートウェイ)
│       └── api.ts
├── shared/
│   └── types/                 # フロント・Functions共用型定義
├── docs/
│   ├── openapi.yaml           # Swagger仕様書
│   └── schema.dbml            # dbdiagram.io用DBML
├── tests/
│   └── reports/               # テストレポート出力先
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
├── firebase.json
├── firestore.rules
└── firestore.indexes.json
```

---

## 9. 開発優先順位

### Phase 1（最優先）：ターン進行システム基盤
現実時間連動ターン処理のコアを構築する。

### Phase 2：認証・ユーザー・マップ基盤
ユーザー登録、マップ・タイル初期化、Firebase Auth連携。

### Phase 3：スライム育成基本
スライム生成、ステータス管理、行動予約UI、食事アクション。

### Phase 4：進化・分裂・融合
進化条件判定、分裂・融合ロジック、スキル取得。

### Phase 5：マップ描画・UI完成
タイルマップ表示、スライム配置、行動予約UI完成。

### Phase 6：ソーシャル・野生スライム
他プレイヤー拠点閲覧、野生スライムAI行動。

### Phase 7：チューニング・リリース準備
Google Analytics実装、パフォーマンス最適化、セキュリティルール整備。

---

## 10. CI/CD構成

### GitHub Secrets

| Secret名 | 用途 |
|---------|------|
| FIREBASE_TOKEN | Firebase CLI認証 |
| VITE_FIREBASE_API_KEY | フロントFirebase設定 |
| VITE_FIREBASE_PROJECT_ID | フロントFirebase設定 |
| VITE_FIREBASE_AUTH_DOMAIN | フロントFirebase設定 |
| VITE_GA_MEASUREMENT_ID | Google Analytics |
| NETLIFY_AUTH_TOKEN | Netlifyデプロイ認証 |
| NETLIFY_SITE_ID | NetlifyサイトID |

### ブランチ戦略

```
main      ... 本番環境（PRのみマージ可）
develop   ... 開発統合ブランチ
feature/* ... 機能開発（develop向けPR）
fix/*     ... バグ修正
```
