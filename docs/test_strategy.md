# テスト戦略書

スライム箱庭ゲーム - テスト方針・実行手順

---

## 1. テスト方針

### TDD（テスト駆動開発）アプローチ

本プロジェクトでは TDD を採用する。実装コードより先にテストを書き、テストが失敗する（Red）状態から始めて、テストを通過させる（Green）実装を行い、その後リファクタリング（Refactor）するサイクルを繰り返す。

- **Red**: テストを先に書く。実装がないためテストは失敗する
- **Green**: テストが通過する最小限の実装を書く
- **Refactor**: コードの品質を上げつつテストが通過し続けることを確認する

### カバレッジ目標

| 種別 | 目標 |
|------|------|
| 行カバレッジ (lines) | **80% 以上** |
| 関数カバレッジ (functions) | 80% 以上 |
| 分岐カバレッジ (branches) | 70% 以上 |

カバレッジ設定は `functions/jest.config.js` の `coverageThreshold` で管理する。

### テスト対象の優先度

1. **高優先**: ビジネスロジック（turnProcessor のターン計算・ステータス更新）
2. **中優先**: Firestore トランザクション・バッチ処理
3. **低優先**: 外部 API 連携・フロントエンド UI

---

## 2. テスト種別と実行環境

### ユニットテスト

- **配置場所**: `tests/unit/`
- **実行環境**: Node.js（Jest、Firestore モックあり）
- **目的**: 個々の関数・メソッドのビジネスロジックを検証する
- **モック**: `jest.mock('firebase-admin')` で Firestore への実際のアクセスをモックする
- **対象ファイル**:
  - `tests/unit/functions/turnProcessor.test.ts` — ターン処理ロジック全般（Phase 1）
  - `tests/unit/authTrigger.test.ts` — Auth Trigger 初期化ロジック（Phase 2）

#### Phase 1: ターン処理ユニットテスト（`turnProcessor.test.ts`）

| テストケース | 検証内容 |
|-------------|---------|
| processDueTurns | 期限切れワールドのクエリ・processWorldTurn の呼び出し |
| processWorldTurn | currentTurn インクリメント・nextTurnAt 更新・スライム処理 |
| processSlimeTurn | 予約行動の実行・自律行動・hunger 減少・進化チェック |
| executeReservedAction (eat) | statDeltas/racialDeltas 加算・hunger 上限 |
| executeReservedAction (move) | tileX/tileY 更新 |
| executeReservedAction (rest) | HP 回復・最大値上限 |
| executeAutonomousAction | hunger 閾値による分岐 |
| checkEvolution | 進化条件判定・speciesId 更新 |

#### Phase 2: Auth Trigger ユニットテスト（`authTrigger.test.ts`）

| テストケース | 検証内容 |
|-------------|---------|
| 新規ユーザー登録 — users ドキュメント作成 | db.collection('users').doc(uid).set() が呼ばれること・フィールド検証 |
| 新規ユーザー登録 — maps ドキュメント作成 | batch.set() で maps/{mapId} が作成されること・GameMap 型フィールド検証 |
| 新規ユーザー登録 — tiles 100件作成 | batch.set() の tiles への呼び出しが正確に 100 回・全座標 (0,0)〜(9,9) の網羅 |
| 二重登録の冪等性 | users/{uid} が既存の場合は batch.commit() が呼ばれないこと |

### 統合テスト

- **配置場所**: `tests/integration/`
- **実行環境**: Firebase Emulator Suite（Firestore Emulator）
- **目的**: 実際の Firestore に対する読み書き・トランザクション・バッチ処理を検証する
- **前提**: Firebase Emulator が起動していること（後述の手順参照）
- **対象ファイル**:
  - `tests/integration/turnFlow.test.ts` — ターン進行のエンドツーエンドフロー（Phase 1）
  - `tests/integration/userRegistration.test.ts` — ユーザー登録フロー（Phase 2）

#### Phase 1: ターン進行統合テスト（`turnFlow.test.ts`）

| テストケース | 検証内容 |
|-------------|---------|
| currentTurn インクリメント | Firestore の currentTurn が実際に +1 されること |
| 予約行動の実行 | pending → executed への status 変更 |
| ターンログ記録 | turnLogs コレクションへの正しいログ書き込み |
| 自律行動の実行 | 予約なし時の自律行動イベント記録 |

#### Phase 2: ユーザー登録統合テスト（`userRegistration.test.ts`）

| テストケース | 検証内容 |
|-------------|---------|
| Auth登録 → onUserCreate → Firestore初期化 | users / maps / tiles の全ドキュメントが Emulator 上に作成されること |
| users/{uid} ドキュメントのフィールド検証 | uid / email / displayName / mapId / createdAt の型と値 |
| maps/{mapId} ドキュメントと tiles 100件 | GameMap 型フィールド・tiles 100件・x/y 座標範囲・attributes の存在 |

---

## 2.5 Phase 3: スライム育成基本テスト（TDD スケルトン）

Phase 3 の実装前に A7/QA がテストスケルトンを先行作成する。
実装担当（A3/BE）はこのスケルトンを Red → Green にする形で実装を進める。

### ユニットテスト対象

#### 食事アクション（`tests/unit/eatAction.test.ts`）

テスト対象: `functions/src/scheduled/turnProcessor.ts` — `executeReservedAction` の `eat` ケース

| テストケース | 検証内容 |
|-------------|---------|
| hunger +30 回復 | 食事後に hunger が +30 されること（ハードコード値） |
| hunger 上限クランプ | hunger が 100 を超えないこと（clamp 処理） |
| statDeltas 全フィールド適用 | hp/atk/def/spd/exp が food.statDeltas に従って加算されること |
| racialDeltas 全フィールド適用 | fire/water/earth/wind/slime/plant/human/beast/spirit/fish が加算されること |
| スキル付与（確率あり） | skillGrantProb > 0 かつ乱数がしきい値以下の場合スキルが付与されること |
| スキル付与なし（確率0） | skillGrantProb = 0 の場合スキルが付与されないこと |
| 存在しない foodId スキップ | 食料が見つからない場合アクションがスキップされステータスが変化しないこと |
| マスタデータ food-slime-002 参照 | 実際のマスタデータを使って食事結果を検証する統合的なケース |

**実装メモ:**
- スキル付与ロジックは Phase 3 で `executeReservedAction` に追加実装される予定
- スキル付与テストは Phase 3 実装完了後に Red → Green にすること
- 食料の下限クランプ（`Math.max(0, current + delta)`）もあわせて検証すること

#### スライム生成（`tests/unit/slimeCreation.test.ts`）

テスト対象（未実装）: `functions/src/triggers/slimeCreation.ts` または `turnProcessor.ts` 内の `createInitialSlime`

| テストケース | 検証内容 |
|-------------|---------|
| speciesId=slime-001 | 生成されるスライムの種族が基本種スライムであること |
| ownerUid 一致 | 生成スライムの ownerUid がリクエストユーザーの UID と一致すること |
| 冪等性（既存スライムあり） | 既にスライムが存在する場合は生成しないこと |
| mapId 一致 | 生成スライムの mapId がリクエストの mapId と一致すること |
| baseStats 初期値 | 生成スライムの stats が slime-001.baseStats（hp:50, atk:10 等）と一致すること |

**実装メモ:**
- `createInitialSlime` のシグネチャは Phase 3 設計時に確定させる
- 配置場所（triggers/ か scheduled/ か）は A3/BE が決定する
- 冪等性は `slimes` コレクションの `ownerUid` フィルタクエリで確認する

### 統合テスト対象（Phase 3 追加予定）

| テストファイル | テスト対象 | 検証内容 |
|--------------|-----------|---------|
| `tests/integration/slimeCreation.test.ts`（新規予定） | `createInitialSlime` + Firestore Emulator | スライムが Emulator 上に実際に作成されること・speciesId/ownerUid/mapId の正確性 |
| `tests/integration/turnFlow.test.ts`（既存・拡張） | `executeReservedAction` (eat) + Emulator | 食事後の stats/racialValues が Firestore に正しく保存されること |

### Phase 3 テスト実行順序（TDD サイクル）

```
A7/QA: スケルトン作成（本ファイル群）
  ↓
A3/BE: createInitialSlime 実装
  ↓
A7/QA: slimeCreation.test.ts Red → Green 確認
  ↓
A3/BE: executeReservedAction のスキル付与ロジック実装
  ↓
A7/QA: eatAction.test.ts の skillGrant テスト Red → Green 確認
  ↓
Phase 3 完了レビュー（QA → Sec → Fun）
```

---

## 3. テストレポートの確認方法

### カバレッジレポートの生成

```bash
cd functions
npm run test:coverage
```

生成先: `tests/reports/functions-coverage/index.html`

ブラウザで開いて確認する:
```bash
# Linux / WSL
xdg-open ../tests/reports/functions-coverage/index.html

# macOS
open ../tests/reports/functions-coverage/index.html
```

### ユニットテストの実行（カバレッジなし）

```bash
cd functions
npm test
```

### 特定のテストファイルのみ実行

```bash
cd functions
npx jest tests/unit/functions/turnProcessor.test.ts --verbose
```

### テスト結果の CI 出力形式（JUnit XML）

CI/CD パイプラインで使用する場合は以下のオプションを追加する:

```bash
cd functions
npx jest --reporters=jest-junit --forceExit
```

---

## 4. Firebase Emulator を使った統合テストの実行手順

### 前提条件

- Node.js 20 以上
- Firebase CLI がインストール済み（`npm install -g firebase-tools`）
- `firebase login` 済み、または CI 環境では `GOOGLE_APPLICATION_CREDENTIALS` が設定済み

### 手順 1: Firebase Emulator を起動する

プロジェクトルート（`/home/fjsth24/workspace/slime_hakoniwa/`）で実行:

```bash
firebase emulators:start --only firestore --project slime-hakoniwa-test
```

Emulator の Firestore は `localhost:8080` で起動する。

Emulator UI は `http://localhost:4000` で確認できる。

### 手順 2: 統合テストを実行する

別のターミナルで実行:

```bash
cd /home/fjsth24/workspace/slime_hakoniwa/functions
FIRESTORE_EMULATOR_HOST=localhost:8080 npx jest tests/integration --forceExit --verbose
```

### 手順 3: テスト後のデータ確認

テスト完了後、Emulator UI（`http://localhost:4000`）で Firestore の状態を確認できる。

`afterAll` フックでテストデータは自動的にクリアされる。

### Emulator の設定ファイル

`firebase.json` で Emulator のポート設定を確認・変更できる:

```json
{
  "emulators": {
    "firestore": {
      "port": 8080
    },
    "ui": {
      "enabled": true,
      "port": 4000
    }
  }
}
```

ポートを変更した場合は、テスト実行時の `FIRESTORE_EMULATOR_HOST` も合わせて変更すること。

### CI/CD での統合テスト実行

GitHub Actions 等で実行する場合のサンプル:

```yaml
- name: Start Firebase Emulator
  run: firebase emulators:start --only firestore --project slime-hakoniwa-test &
  working-directory: ./

- name: Wait for Emulator
  run: sleep 5

- name: Run Integration Tests
  run: npx jest tests/integration --forceExit
  working-directory: ./functions
  env:
    FIRESTORE_EMULATOR_HOST: localhost:8080
```

---

## 5. ファイル構成

```
slime_hakoniwa/
├── functions/
│   ├── jest.config.js          # Jest 設定（testMatch / moduleNameMapper / coverageThreshold）
│   ├── src/
│   │   ├── scheduled/
│   │   │   └── turnProcessor.ts        # Phase 1 テスト対象（実装済み）
│   │   └── triggers/
│   │       ├── authTrigger.ts          # Phase 2 テスト対象（実装済み）
│   │       └── slimeCreation.ts        # Phase 3 テスト対象（未実装 — TDD）
│   └── ...
├── tests/
│   ├── unit/
│   │   ├── functions/
│   │   │   └── turnProcessor.test.ts   # Phase 1 ユニットテスト
│   │   ├── authTrigger.test.ts         # Phase 2 ユニットテスト（実装済み）
│   │   ├── eatAction.test.ts           # Phase 3 ユニットテスト（TDDスケルトン）
│   │   └── slimeCreation.test.ts       # Phase 3 ユニットテスト（TDDスケルトン）
│   ├── integration/
│   │   ├── turnFlow.test.ts            # Phase 1 統合テスト（Emulator使用）
│   │   ├── userRegistration.test.ts    # Phase 2 統合テスト（Emulator使用・実装済み）
│   │   └── slimeCreation.test.ts       # Phase 3 統合テスト（Emulator使用・未作成）
│   └── reports/
│       └── functions-coverage/         # カバレッジレポート出力先（git ignore 推奨）
├── shared/
│   ├── types/
│   │   ├── world.ts
│   │   ├── slime.ts
│   │   ├── action.ts
│   │   ├── map.ts                      # GameMap / Tile 型（Phase 2 で活用）
│   │   └── turnLog.ts
│   └── data/
│       ├── foods.ts                    # 食料マスタデータ（Phase 3 テストで利用）
│       └── slimeSpecies.ts             # 種族マスタデータ（Phase 3 テストで利用）
└── docs/
    └── test_strategy.md                # 本ファイル
```
