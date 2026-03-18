# セキュリティ設計書

## 1. 設計方針

本システムは OWASP Top 10 (2021) を参照し、以下の方針でセキュリティを設計する。

| OWASP カテゴリ | 本システムでの対応 |
|---|---|
| A01 アクセス制御の不備 | Firestore Security Rules により、認証ユーザーは自分のデータのみ操作可能。書き込み権限は Admin SDK に限定。 |
| A02 暗号化の失敗 | Firebase / GCP の転送中暗号化（TLS）および保管中暗号化（AES-256）を利用。クライアントに秘密情報を渡さない。 |
| A03 インジェクション | Firestore SDK はクエリをパラメータ化して送信するため SQL インジェクション相当の攻撃は無効。 |
| A04 安全でない設計 | ゲームロジック（ターン進行）はサーバーサイド（Cloud Functions）のみで実行し、クライアントは行動予約のみ投稿する。 |
| A05 セキュリティの設定ミス | Security Rules のユニットテストを CI で実施。デフォルト deny ルールを採用。 |
| A06 脆弱なコンポーネント | Firebase SDK・依存ライブラリのバージョンを定期的にアップデートし、`npm audit` を CI に組み込む。 |
| A07 認証と認証セッションの管理 | Firebase Authentication の ID トークン（JWT）を使用。有効期限は 1 時間。 |
| A08 ソフトウェアとデータの完全性の失敗 | Cloud Functions デプロイは CI/CD パイプライン経由のみ許可。手動デプロイは禁止。 |
| A09 セキュリティの記録とモニタリングの失敗 | Cloud Logging で Security Rules の拒否イベントを収集。異常アクセスはアラートを設定する。 |
| A10 サーバーサイドリクエストフォージェリ | Cloud Functions は外部 URL へのリクエストを必要最小限に制限し、許可リスト方式で管理する。 |

---

## 2. Firestore セキュリティルール設計

### アクセス制御表

| コレクション | 読み取り | 作成 | 更新 | 削除 |
|---|---|---|---|---|
| `worlds/{worldId}` | 認証済みユーザー | 禁止 | 禁止 | 禁止 |
| `worlds/{worldId}/maps/{mapId}` | 認証済みユーザー | 禁止 | 禁止 | 禁止 |
| `worlds/{worldId}/maps/{mapId}/tiles/{tileId}` | 認証済みユーザー | 禁止 | 禁止 | 禁止 |
| `turnLogs/{logId}` | 認証済みユーザー | 禁止 | 禁止 | 禁止 |
| `users/{uid}` | 本人のみ | 本人のみ | 本人のみ | 禁止 |
| `slimes/{slimeId}` | 認証済みユーザー | 禁止 | 禁止 | 禁止 |
| `slimes/{slimeId}/skills/{skillId}` | 認証済みユーザー | 禁止 | 禁止 | 禁止 |
| `actionReservations/{reservationId}` | 本人のみ (ownerUid) | 本人のみ（条件付き） | 禁止 | 禁止 |
| `skillDefinitions/{skillId}` | 認証済みユーザー | 禁止 | 禁止 | 禁止 |
| `foods/{foodId}` | 認証済みユーザー | 禁止 | 禁止 | 禁止 |
| `slimeSpecies/{speciesId}` | 認証済みユーザー | 禁止 | 禁止 | 禁止 |

### actionReservations 作成条件

以下の全条件を満たす場合のみ作成を許可する：

1. 認証済みであること（`request.auth != null`）
2. `request.resource.data.ownerUid == request.auth.uid`（自分の所有であること）
3. `request.resource.data.status == 'pending'`（初期ステータスが pending であること）
4. 必須フィールド `slimeId, worldId, turnNumber, actionType, actionData` が全て存在すること

### デフォルト拒否

Security Rules にマッチしないパスへのアクセスはデフォルトで拒否される。明示的に `allow` しない限りアクセス不可。

---

## 3. API 認証フロー

```
[クライアント]                        [Cloud Functions]           [Firebase Auth]
     |                                       |                          |
     |-- Firebase Auth でサインイン --------->|                          |
     |<-- ID トークン (JWT, 有効期限1h) ------|                          |
     |                                       |                          |
     |-- HTTP リクエスト + Authorization: Bearer <IDトークン> -->|       |
     |                                       |-- verifyIdToken() ------>|
     |                                       |<-- デコード済みトークン --|
     |                                       |                          |
     |                                       |-- uid, email 等を取得    |
     |                                       |-- ビジネスロジック実行    |
     |<-- レスポンス ------------------------|                          |
```

**検証手順（Cloud Functions 内）：**

1. `Authorization` ヘッダーから `Bearer` トークンを抽出する。
2. `admin.auth().verifyIdToken(idToken)` を呼び出す。
3. 失敗（期限切れ・改ざん）の場合は HTTP 401 を返す。
4. 成功した場合、デコード済みトークンの `uid` を信頼できる識別子として使用する。
5. Firestore への書き込みは Admin SDK 経由で行い、クライアントの Security Rules をバイパスする。

**トークン更新：**

- Firebase SDK がバックグラウンドでトークンを自動更新（期限切れ前に更新）する。
- 強制ログアウト（BAN等）が必要な場合は `admin.auth().revokeRefreshTokens(uid)` を使用する。

---

## 4. 不正操作の防止策

### 4-1. 他ユーザーのスライムへの行動予約

**脅威：** 攻撃者が他プレイヤーの `slimeId` を指定して行動予約を作成する。

**対策：**

- Firestore Security Rules で `request.resource.data.ownerUid == request.auth.uid` を必須チェックする。
- Cloud Functions のターン処理時にも `actionReservation.ownerUid` と対象スライムの `ownerUid` の一致を検証する（二重チェック）。

### 4-2. 過去ターンへの予約

**脅威：** 攻撃者が既に終了したターン番号を指定して行動予約を作成し、ゲーム状態を不正に書き換えようとする。

**対策：**

- Cloud Functions で actionReservation 受付 API を設ける場合、`turnNumber > currentTurn` をサーバーサイドで検証する。
- ターン処理時に `status == 'pending'` かつ `turnNumber == currentTurn` の予約のみを処理対象とする。
- 過去ターン向けの予約はステータスを `invalid` に更新して無視する。

### 4-3. 二重ターン処理

**脅威：** ネットワーク遅延やリトライにより、同一ターンのターン処理が複数回実行される。

**対策：**

- ターン処理の開始時に Firestore トランザクションを使用し、`worlds/{worldId}` の `currentTurn` と `status` フィールドを原子的に確認・更新する。
- 処理中は `status: 'processing'` に設定し、完了後に `status: 'idle'` に戻す。
- `status == 'processing'` の場合は処理をスキップ（冪等性の保証）。

```
// 擬似コード（Cloud Functions）
await db.runTransaction(async (tx) => {
  const worldRef = db.doc(`worlds/${worldId}`);
  const world = await tx.get(worldRef);

  if (world.data().status === 'processing') {
    throw new Error('Already processing');
  }
  if (world.data().currentTurn !== expectedTurn) {
    throw new Error('Turn already advanced');
  }

  tx.update(worldRef, { status: 'processing' });
});
// ... ターン処理本体 ...
// 完了後: tx.update(worldRef, { status: 'idle', currentTurn: nextTurn });
```

### 4-4. クライアントサイドの検証のみへの依存禁止

- すべてのバリデーション（必須フィールド、値の範囲、所有者チェック）はサーバーサイドでも実施する。
- クライアントのバリデーションはUX向上目的のみとして扱う。

---

## 5. 環境変数・シークレット管理ルール

### 禁止事項

- `.env` ファイルや `serviceAccountKey.json` をリポジトリにコミットしてはならない。
- Firebase API キー以外の秘密情報をクライアントバンドルに含めてはならない。

### Cloud Functions の環境変数

- シークレットは **Google Cloud Secret Manager** に格納し、Cloud Functions から参照する。
- ローカル開発では `.env.local`（`.gitignore` 対象）または Firebase エミュレータを使用する。

### `.gitignore` 必須エントリ

```
.env
.env.local
.env.*.local
serviceAccountKey.json
*.key.json
```

### Firebase クライアント設定

- `firebaseConfig`（apiKey, projectId 等）はフロントエンドに含めることが許容されている（Firebase の設計上の想定）。
- ただし、Security Rules により未認証アクセスを適切に制限すること。
- API キーのリファラー制限・IP 制限を Firebase Console で設定する。

### シークレットのローテーション

- サービスアカウントキーは 90 日ごとにローテーションする。
- 漏洩が疑われる場合は即時ローテーションし、Cloud Logging でアクセスログを確認する。

---

## 6. フェーズごとのセキュリティレビュー項目

### Phase 1（基盤構築）

- [ ] Firestore Security Rules のユニットテスト（`@firebase/rules-unit-testing`）を全コレクションに作成し、CI で自動実行する
- [ ] Security Rules の `allow write: if false` が Admin SDK の書き込みをブロックしないことを確認する（Admin SDK は Rules をバイパスする仕様）
- [ ] Firebase Authentication のプロバイダ設定（許可するサインイン方法）を最小限に絞る
- [ ] Cloud Functions のデプロイ権限を CI/CD サービスアカウントのみに制限する
- [ ] `.gitignore` に秘密情報ファイルが含まれていることを確認する

### Phase 2（ゲームロジック実装）

- [ ] ターン処理のトランザクション実装をレビューする（二重処理防止）
- [ ] actionReservation の turnNumber バリデーションをサーバーサイドで実装・テストする
- [ ] Cloud Functions のレート制限（1ユーザーあたりの予約数上限）を実装する
- [ ] 異常なアクセスパターン（大量予約作成等）を検知するアラートを設定する

### Phase 3（マルチプレイヤー・公開前）

- [ ] ペネトレーションテスト（外部業者または社内レッドチーム）を実施する
- [ ] Security Rules の網羅的なテストケースを再確認する
- [ ] Cloud Armor または Firebase App Check を導入し、ボット・スクレイピングを防止する
- [ ] GDPR / 個人情報保護法に基づくプライバシーポリシーを策定する
- [ ] インシデント対応手順書（アカウント BAN、データ漏洩時の対応フロー）を整備する

### 定期レビュー（月次）

- [ ] Firebase SDK・npm パッケージの脆弱性スキャン（`npm audit`）
- [ ] Cloud Logging で Security Rules の拒否ログを確認し、不審なアクセスを調査する
- [ ] アクティブなサービスアカウントキーの棚卸しを行う
