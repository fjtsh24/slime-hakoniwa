# セキュリティレビュー Phase 3

**レビュー担当**: A2/Sec
**レビュー日**: 2026-03-17
**対象フェーズ**: Phase 3（スライム育成基本）
**参照**: docs/security_review/phase_2.md（前フェーズ申し送り事項）
**ステータス**: レビュー完了

---

## 1. レビュー概要

Phase 3 で追加・変更された以下のファイルに対してセキュリティレビューを実施した。

| ファイル | 変更内容 |
|---|---|
| `netlify/functions/api.ts` | `POST /api/slimes/initial` エンドポイントを新規追加 |
| `netlify/functions/helpers/auth.ts` | 変更なし（Phase 2 実装のまま） |
| `netlify/functions/helpers/validation.ts` | 変更なし（Phase 2 実装のまま） |
| `firestore.rules` | `slimes` コレクションルール確認、前フェーズ修正（SEC-M-2）の適用確認 |
| `frontend/src/pages/GamePage.tsx` | `handleSummon` 関数（IDトークン取得・送信フロー）を新規追加 |

**検出結果サマリ**: Critical 0件 / High 1件 / Medium 2件 / Low 2件

---

## 2. 発見した問題点

### Critical

なし

---

### High

#### [SEC-H-1] `POST /api/slimes/initial` に TOCTTOU 競合によるスライム重複作成リスク

- **ファイル**: `netlify/functions/api.ts`（248〜302行目）
- **内容**: 冪等性チェックとスライム作成が非アトミック（2フェーズに分割）で実装されている。

  ```
  // ステップA: 既存スライム確認（Firestoreクエリ）
  const existingSnap = await db.collection('slimes').where('ownerUid', '==', uid).limit(1).get()
  if (!existingSnap.empty) { return 409 }

  // ↑ ここに並行リクエストが割り込める

  // ステップB: 新規スライム作成
  await slimeRef.set(newSlime)
  ```

- **攻撃シナリオ**: 2つの並行リクエストが同一ユーザーで同時にステップAを通過した場合、両リクエストともスライムが「存在しない」と判定してステップBに進み、同一ユーザーに2体（またはそれ以上）のスライムが作成される可能性がある。Firestore のクエリ（`where('ownerUid', '==', uid).limit(1)`）は書き込みに対してトランザクション保証を持たないため、ステップAとステップBの間は非保護状態になる。
- **影響範囲**: ゲームバランスの崩壊（1ユーザー1スライム制約の突破）、不正なゲーム優位性の獲得。
- **推奨対応**: Firestore トランザクション（`db.runTransaction`）を使用して存在確認と作成を原子的に行う。または、`users/{uid}` ドキュメントに `hasSlime: boolean` フラグを追加し、トランザクション内でこのフラグのCAS（Compare-And-Swap）更新とスライム作成を一括実施する。レート制限（後述 SEC-M-1）との組み合わせで攻撃ウィンドウを狭めることも有効だが、トランザクション化が根本的解決策である。

---

### Medium

#### [SEC-M-1] `POST /api/slimes/initial` にレート制限がない

- **ファイル**: `netlify/functions/api.ts`（233〜314行目）
- **内容**: エンドポイントにレート制限が実装されていない。有効な Firebase IDトークンを取得した攻撃者が短時間に大量のリクエストを送信できる。
- **リスク**:
  - TOCTTOU（SEC-H-1）の攻撃ウィンドウを広げる。大量の並行リクエストを送ることで競合成功確率が上昇する。
  - Firestore の読み取り・書き込み課金をユーザー1人によって発生させることができる（コスト増大）。
  - スライム作成が1回制約で失敗しても、繰り返しの試行でサーバーリソースを圧迫する。
- **推奨対応**: Netlify Functions の前段に Netlify Edge Functions またはサードパーティのレート制限（例: Upstash Redis）を設置し、UID または IP 単位で `POST /api/slimes/initial` を時間窓あたり数回に制限する。Firebase App Check（後述）との組み合わせで自動化ツールによる大量リクエストを防ぐことも有効。

#### [SEC-M-2] `worldId: 'world-001'` のハードコードによる将来的なアクセス制御漏れリスク

- **ファイル**: `netlify/functions/api.ts`（258行目、273〜274行目）
- **内容**: `worlds/world-001` の存在確認と `worldId: 'world-001'`・`mapId: 'world-001'` のスライム属性設定がサーバー側でハードコードされている。現在はワールドが1つしか存在しないため実害はないが、将来マルチワールド実装時にこのハードコードが残存すると、意図しないワールドへの強制配置や、削除・非公開済みワールドへの誤配置が発生しうる。
- **リスク評価**: Phase 3 現在は実害なし。ただし技術的負債として将来の設計ミスを誘発するリスクがある。
- **推奨対応**: `world-001` をシステム設定（Firestore の `/config/default` ドキュメント等）から動的に取得する、またはリクエストボディでクライアントが選択可能にしてサーバー側でバリデーションする設計に移行することを Phase 5 以降で検討する。現時点では低優先度だが設計ドキュメントに記録しておく。

---

### Low

#### [SEC-L-1] `verifyIdToken` の `decoded.uid` のみを返す設計でトークンクレームの追加検証が行われていない

- **ファイル**: `netlify/functions/helpers/auth.ts`（22〜23行目）
- **内容**: `verifyIdToken` は `decoded.uid` のみを返す。将来的に Firebase Auth Custom Claims（例: `disabled: true`、`role: 'banned'` 等）を用いてアカウント制限を実装した場合、現在の実装ではカスタムクレームの検証が行われないため、制限されたアカウントでも API を利用できてしまう可能性がある。
- **リスク評価**: Phase 3 現在は Custom Claims を使用していないため実害なし。設計の将来性に関わる低リスク。
- **推奨対応**: `verifyIdToken` の戻り値を `{ uid: string, claims?: DecodedIdToken }` に拡張し、カスタムクレームを呼び出し元で利用できるようにすることを Phase 5 以降で検討する。

#### [SEC-L-2] `GamePage.tsx` の `useEffect` 依存配列に `selectedSlimeId` が不足している

- **ファイル**: `frontend/src/pages/GamePage.tsx`（52〜78行目）
- **内容**: スライム一覧を購読する `useEffect` の依存配列が `[user]` のみで、`selectedSlimeId` が含まれていない。これはセキュリティの問題というよりバグだが、`selectedSlimeId` の状態が古い値のまま参照されるクロージャ問題が発生しうる。
- **リスク評価**: 現在の実装では `selectedSlimeId` は `useEffect` 内の `setSlimes` と `setSelectedSlimeId` 更新にのみ参照されており、直接的なセキュリティリスクはない。ただし将来的に `useEffect` 内で `selectedSlimeId` を使った条件分岐が追加された場合、古い値に基づく誤動作が生じうる。
- **推奨対応**: A7/QA と連携して依存配列の修正を行う（前フェーズ QA 申し送り事項と同じ指摘）。

---

## 3. 前回申し送り事項の対応確認

Phase 2 レポート（`docs/security_review/phase_2.md`）の申し送り事項について対応状況を確認した。

| 項番 | 内容 | 優先度 | 対応状況 |
|---|---|---|---|
| Phase 3 必須-1 | `users/{uid}` の `allow update` フィールドレベル制限（SEC-M-2） | 高 | **対応済** — `firestore.rules` 40〜43行目で `displayName` と `updatedAt` のみに限定する `affectedKeys().hasOnly()` が実装されている |
| Phase 3 必須-2 | Firebase App Check の導入 | 高 | **未対応** — `netlify/functions/api.ts` および `frontend/` に App Check の設定は確認できない。Phase 4 へ引き継ぐ（後述） |
| Phase 3 推奨-3 | `userStore.ts` のランタイム型検証（zod）の追加 | 推奨 | **未対応** — `userStore.ts` 27行目で `snap.data() as User` の型アサーションのまま変更なし。Phase 4 へ引き継ぐ（後述） |
| Phase 6 着手前-4 | `maps/tiles` 読み取りルールのマップ閲覧機能対応 | 将来 | 継続監視 — 対応時期変わらず |
| 継続-5 | Firestore Rules のユニットテスト追加 | 継続 | **未対応** — `@firebase/rules-unit-testing` による自動テストは未実装のまま。Phase 4 へ引き継ぐ |
| 継続-6 | Auth Trigger 失敗時の Cloud Logging アラート設定 | 継続 | **未対応** — Phase 4 以降の課題として引き継ぐ |

**重要**: Phase 3 必須-1（`allow update` フィールドレベル制限）は `firestore.rules` に正しく実装されており、前フェーズの申し送り事項が適切に対応されていることを確認した。

---

## 4. OWASP Top 10 対応状況

Phase 2 からの変化点を中心に更新した。

| リスク | 対応状況 | Phase 3 での変化 |
|---|---|---|
| A01: アクセス制御の不備 | 部分対応 | `slimes` コレクションの書き込みは `allow write: if false` で正しく禁止されている。ただし `POST /api/slimes/initial` の TOCTTOU 競合（SEC-H-1）により1ユーザー1スライム制約が突破されうる。トランザクション化が必要 |
| A02: 暗号化の失敗 | 対応済 | 変化なし。Firebase Auth / Firestore のデフォルト暗号化を使用 |
| A03: インジェクション | 対応済 | `POST /api/slimes/initial` ではクライアント入力をスライムデータとして使用していないため、インジェクションリスクはない。既存 API の zod バリデーションは維持 |
| A04: 安全でない設計 | 部分対応 | `POST /api/slimes/initial` の冪等性設計が非アトミックであり（SEC-H-1）、並行リクエスト耐性が不足している。トランザクション設計への改修が必要 |
| A05: セキュリティの設定ミス | 対応済 | Firestore Rules の `slimes/{slimeId}` は `allow write: if false` で正しく設定されている。Phase 2 申し送りの `allow update` フィールドレベル制限も適用済み |
| A06: 脆弱で古いコンポーネント | 評価対象外 | パッケージ依存関係の定期監査は別途実施が必要 |
| A07: 識別と認証の失敗 | 対応済 | `POST /api/slimes/initial` で `verifyIdToken` による Firebase IDトークン検証を実施。`ownerUid` はサーバー側で `uid`（検証済みトークン由来）を使用しており、クライアント入力に依存していない |
| A08: ソフトウェアとデータの整合性の失敗 | 部分対応 | 変化なし。CI/CD の署名検証は Phase 6 以降の課題 |
| A09: セキュリティログとモニタリングの失敗 | 部分対応 | `POST /api/slimes/initial` はエラー時に `console.error` で記録しているが、成功時のログが存在しない。スライム作成の監査ログとして成功時も `console.info` で記録することを推奨 |
| A10: サーバーサイドリクエストフォージェリ | 該当なし | 変化なし。外部URLへのサーバーサイドリクエストはなし |

---

## 5. Phase 4 への申し送り事項

### 必須対応（Phase 4 着手前）

1. **[High 優先度] `POST /api/slimes/initial` の TOCTTOU 競合修正（SEC-H-1）**: Firestore トランザクション（`db.runTransaction`）を使用して、スライム存在確認と新規作成を原子的に実行する。1ユーザー1スライム制約の安全性担保のために Phase 4 着手前に対応すること。

2. **[High 優先度] Firebase App Check の導入（前フェーズ Phase 3 必須-2 からの継続）**: Netlify Functions および Firestore へのアクセスを正規クライアントアプリからのみに制限する。現状は有効な Firebase IDトークンを取得できる任意のクライアント（カスタムスクリプト、curl 等）から全APIにアクセス可能。SEC-M-1（レート制限不足）の軽減にも寄与する。

### 推奨対応（Phase 4 中に対応）

3. **[Medium 優先度] レート制限の追加（SEC-M-1）**: `POST /api/slimes/initial` に対して UID 単位のレート制限を実装する。App Check 導入後も組み合わせての多層防御として推奨。Netlify Edge Functions または Upstash Redis による実装を検討する。

4. **[推奨] `userStore.ts` のランタイム型検証の追加（前フェーズ Phase 3 推奨-3 からの継続）**: `snap.data() as User` を zod スキーマによる実行時パースに置き換える。Firestore スキーマ変更時の静かな型不整合を防ぐ。

### Phase 6 着手前

5. **`worldId: 'world-001'` のハードコード解消（SEC-M-2）**: マルチワールド実装に向けた設計変更として、ワールドIDを設定ドキュメントから動的取得する方式に移行する。

### 継続監視

6. **Firestore Rules のユニットテスト追加（前フェーズ継続-5 からの継続）**: `@firebase/rules-unit-testing` を使用して、`slimes` の書き込み禁止、`actionReservations` の所有者チェック、`users` の create 禁止・update フィールド制限を自動テストで保証する。

7. **Auth Trigger 失敗時の Cloud Logging アラート設定（前フェーズ継続-6 からの継続）**: Auth Trigger の失敗検知と通知体制の整備。

8. **`POST /api/slimes/initial` 成功時の監査ログ追加**: スライム作成（ゲーム上の重要イベント）の成功ケースを `console.info` または `functions.logger.info` で記録し、Cloud Logging で追跡できるようにする。

---

## 6. 総合評価

**Phase 4 移行判定: 条件付き承認**

条件: SEC-H-1（TOCTTOU 競合）のトランザクション修正を Phase 4 着手前に完了すること。

### 承認根拠

- `POST /api/slimes/initial` の `ownerUid` はサーバーサイドで検証済み IDトークン由来の `uid` を使用しており、クライアント入力への依存はなく適切。
- `firestore.rules` の `slimes/{slimeId}` に `allow write: if false` が正しく設定されており、クライアントからのスライム直接書き込みは Firestore ルールレベルで禁止されている。
- `handleSummon`（`GamePage.tsx`）では `getIdToken(user)` によって Firebase SDK 経由でIDトークンを動的取得しており、ローカルストレージ等への永続化は行われていない。トークンの取り扱いは適切。
- Phase 2 申し送りの必須対応項目（`allow update` フィールドレベル制限）は正しく実装されていることを確認した。

### 懸念事項

- SEC-H-1（TOCTTOU）は High 判定。並行リクエストによる1ユーザー1スライム制約の突破リスクがあり、ゲームバランスへの直接的影響が高い。トランザクション化による修正を条件とする。
- Firebase App Check が未導入のため、IDトークンを取得できる正規ユーザーであれば任意のスクリプトからAPI操作が可能な状態が続いている。

以上。A1/Fun レビューへ引き渡す。
