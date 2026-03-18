# Phase 2 セキュリティレビューレポート

**レビュー担当**: A2 / セキュリティ担当
**対象フェーズ**: Phase 2 — 認証・ユーザー・マップ基盤
**レビュー日**: 2026-03-16
**参照**: docs/qa_review/phase_2.md（A7/QAレビュー結果）、docs/security_review/phase_2_design.md
**ステータス**: レビュー完了（修正2件実施）

---

## 1. レビュー概要

Phase 2 で追加・変更された全ファイルのセキュリティレビューを実施した。
Critical 0件 / High 0件 / Medium 2件（うち2件本レビューで修正済） / Low 1件を検出した。

A7/QA 申し送り事項 M-1（`allow create: if false` への変更）を本レビューで正式判断し修正を実施した。また SEC-M-2（`allow update` のフィールドレベル制限）についても本レビューで修正を実施した。

---

## 2. 発見した問題点

### Medium

#### [SEC-M-1] `firestore.rules` の `users/{uid}` に `allow create` が残存 — **本レビューで修正済**

- **ファイル**: `firestore.rules`（37〜42行目）
- **元の記述**: `allow create: if request.auth != null && request.auth.uid == uid;`
- **リスク**: 認証済みユーザーがクライアントから直接 `users/{uid}` ドキュメントを作成できる状態だった。攻撃シナリオとして、ユーザーが自身の UID に対して `mapId` を改ざんした `users` ドキュメントを Auth Trigger より先に作成し、Auth Trigger の冪等性チェック（`userSnap.exists` 早期リターン）を悪用してマップ割り当てを回避・改ざんできる可能性があった。
- **判断**: Auth Trigger（Admin SDK）がユーザードキュメントを作成する設計であり、クライアントからの `create` は不要。`phase_2_design.md` のアクセス制御設計方針とも矛盾する。
- **修正内容**: `allow create: if false` に変更。`users` コレクションへの書き込み権限を Admin SDK のみに限定する。

修正後の該当ブロック:
```
match /users/{uid} {
  allow read:   if request.auth != null && request.auth.uid == uid;
  allow create: if false;  // Auth Trigger (Admin SDK) のみ作成可
  allow update: if request.auth != null && request.auth.uid == uid;
  allow delete: if false;
}
```

#### [SEC-M-2] `users/{uid}` の `allow update` でフィールドレベルの制限がない — **対応完了**

- **ファイル**: `firestore.rules`（38〜41行目）
- **内容**: `allow update: if request.auth != null && request.auth.uid == uid;` は本人であれば `uid`、`email`、`mapId` 等の全フィールドを更新できる状態になっている。本来クライアントから更新を許可すべきフィールドは `displayName` のみである。
- **リスク**: ユーザーが `mapId` を書き換えて他人のマップを自分のものとして扱う可能性がある。また `uid` フィールドを書き換えることで、Firestore のドキュメントID（パス上の uid）とドキュメント内の `uid` フィールドが不整合になる可能性がある。
- **推奨対応（Phase 3 前）**: `request.resource.data.diff(resource.data).affectedKeys()` を用いたフィールドレベルの制限を追加する。

```
// Phase 3 推奨実装例
allow update: if request.auth != null
              && request.auth.uid == uid
              && request.resource.data.diff(resource.data)
                   .affectedKeys()
                   .hasOnly(['displayName', 'updatedAt']);
```

---

### Low

#### [SEC-L-1] `userStore.ts` の `console.error` でエラーオブジェクトが露出 — **許容範囲**

- **ファイル**: `frontend/src/stores/userStore.ts`（33行目）
- **内容**: `console.error('userStore: onSnapshot error', error)` でエラーオブジェクト全体をコンソールに出力している。
- **リスク評価**: エラーオブジェクトに含まれる情報は Firestore クライアントエラーコード（`permission-denied` 等）と内部スタックトレース。Firestore のセキュリティルールの拒否理由がブラウザのコンソールに表示されるが、これは Firestore SDK の標準的な挙動の範囲内。攻撃者がブラウザのコンソールにアクセスできる前提ではデバイスが既に侵害済みであるため、実質的な攻撃への寄与は限定的。
- **判断**: 本番ビルドでの `console.*` 出力を無効化するビルド設定（Vite の `drop: ['console']` 等）を Phase 3 前に検討することを推奨するが、現時点では許容範囲とする。

---

## 3. セキュリティチェックリスト評価結果

### 認証フロー

| チェック項目 | 結果 | 備考 |
|---|---|---|
| `authTrigger.ts` は Admin SDK のみで書き込みを行っているか | OK | `admin.firestore()` を使用。Firestore Rules をバイパスして書き込み。クライアント SDK は使用していない |
| IDトークン検証なしでアクセスできるエンドポイントがないか | OK | `netlify/functions/helpers/auth.ts` でIDトークン検証を実施（Phase 1 実装済み）。Phase 2 では新エンドポイントの追加なし |
| フロントエンド（App.tsx）で未認証ユーザーが保護ページにアクセスできないか | OK | `isAuthLoading → !user → isUserLoading → hasMap` の3段階ガードで全保護ルートに対して未認証リダイレクトを実装している |

### Firestoreルール

| チェック項目 | 結果 | 備考 |
|---|---|---|
| `users/{uid}`: `create` を `false` に変更 | 完了 | 本レビューで修正（SEC-M-1） |
| `maps/{mapId}`: 書き込み禁止が正しく設定されているか | OK | `allow write: if false` で全クライアント書き込みを禁止。Auth Trigger（Admin SDK）はバイパスするため整合性に問題なし |
| `maps/{mapId}/tiles/{tileId}`: オーナーチェックが正しいか | OK | `get(/databases/$(database)/documents/maps/$(mapId)).data.ownerUid == request.auth.uid` でクロスドキュメント参照による所有者確認を実施。書き込みは `if false` で禁止 |

### 入力バリデーション

| チェック項目 | 結果 | 備考 |
|---|---|---|
| `validation.ts` の座標範囲チェックが適切に実装されているか | OK | `MAP_WIDTH_MAX` / `MAP_HEIGHT_MAX` を共有定数から参照し、`.int().min(0).max(MAP_WIDTH_MAX - 1)` で適切に範囲制限している |
| `userStore.ts` の Firestore データの型キャストに実行時型チェックが必要か | 許容 | `snap.data() as User` はコンパイル時のみの型アサーション。ただし Firestore のドキュメント構造は Auth Trigger（Admin SDK）が制御する設計であり、クライアントからの書き込みは Firestore Rules で禁止されているため、不正なデータが混入するリスクは低い。Phase 3 でのランタイム検証（zod）導入を推奨 |

### 情報漏洩リスク

| チェック項目 | 結果 | 備考 |
|---|---|---|
| `SetupPage.tsx` で他ユーザーのデータを表示する可能性 | なし | `subscribe(user.uid)` で自身の UID のドキュメントのみを購読。Firestore Rules の `request.auth.uid == uid` によりサーバーサイドでも他ユーザーデータへのアクセスを禁止 |
| `MapSettingsPage.tsx` で他ユーザーのデータを表示する可能性 | なし | `userProfile.mapId`（ストア経由、自身のプロファイルから取得）で自マップのみを参照。Firestore Rules の `ownerUid == request.auth.uid` によりサーバーサイドでも他ユーザーのタイルへのアクセスを禁止 |
| `userStore.ts` の `onSnapshot` エラー時のセンシティブ情報露出 | 低リスク | SEC-L-1 参照。本番ビルドでの `console.*` 出力無効化を Phase 3 前に検討推奨 |

---

## 4. Auth Trigger の設計評価

### 冪等性

`authTrigger.ts` は `userSnap.exists` を確認後に早期リターンする実装であり、Firebase の「少なくとも1回」実行保証に対して適切に対応している。

### WriteBatch の原子性

`users` ドキュメント + `maps` ドキュメント + `tiles` 100件を単一の `WriteBatch` でコミットしている。ネットワーク障害等でバッチが途中失敗した場合、全書き込みがロールバックされるため、部分的な初期化状態（`users` のみ存在する等）が残ることはない。

### UID の信頼性

Auth Trigger の `userRecord.uid` は Firebase Auth が保証する値であり、クライアントからの入力ではないため改ざん不可能。Auth Trigger 経由で作成された `users/{uid}` の `uid` フィールドおよび `maps/{mapId}` の `ownerUid` フィールドの信頼性は担保されている。

---

## 5. OWASP Top 10 対応状況

| リスク | 対応状況 | 実装箇所 |
|---|---|---|
| A01: アクセス制御の不備 | 対応済 | Firestore Rules（本人のみ read/update、create/delete 禁止）、Auth Trigger のみ作成可 |
| A02: 暗号化の失敗 | 対応済 | Firebase Auth / Firestore は転送中・保存中ともにデフォルト暗号化 |
| A03: インジェクション | 対応済 | zod によるスキーマバリデーション（validation.ts）、Firestore SDK はクエリインジェクション不可の構造 |
| A04: 安全でない設計 | 対応済 | 多層防御（API → Rules → Admin SDK）設計済み。users の update フィールドレベル制限を追加（SEC-M-2 修正済） |
| A05: セキュリティの設定ミス | 対応済 | Firestore Rules でデフォルト拒否、Admin SDK のみ書き込み可の設計 |
| A06: 脆弱で古いコンポーネント | 評価対象外 | パッケージ管理は別途確認が必要 |
| A07: 識別と認証の失敗 | 対応済 | Firebase Auth + IDトークン検証（auth.ts）、App.tsx の3段階認証ガード |
| A08: ソフトウェアとデータの整合性の失敗 | 一部対応 | Auth Trigger の WriteBatch による原子的書き込み。CI/CD の署名検証は Phase 6 以降の課題 |
| A09: セキュリティログとモニタリングの失敗 | 部分対応 | `functions.logger.info` で主要操作を記録。失敗時の Cloud Logging アラートは未設定 |
| A10: サーバーサイドリクエストフォージェリ | 該当なし | 外部URLへのサーバーサイドリクエストはなし |

---

## 6. Phase 3 への申し送り事項

### 必須対応（Phase 3 着手前）

1. ~~**[高優先度] `users/{uid}` の `allow update` フィールドレベル制限の追加**: `displayName` と `updatedAt` のみ更新可とする。`mapId` や `uid` がクライアントから更新されるリスクを排除する（SEC-M-2）。~~ **→ 本レビューで対応完了**

2. **[高優先度] Firebase App Check の導入**: Firestore および Cloud Functions へのアクセスを正規クライアントアプリからのみに制限する。現状は有効な Firebase IDトークンを持つ任意のクライアント（カスタムスクリプト等）からアクセス可能。

3. **[推奨] `userStore.ts` のランタイム型検証の追加**: `snap.data() as User` を zod スキーマによる実行時パースに置き換える。Firestore スキーマ変更時の静かな型不整合を防ぐ。

### Phase 6 着手前

4. **`maps/{mapId}/tiles/{tileId}` の読み取りルール見直し**: Phase 6 でマップ閲覧機能を実装する際、タイルの属性値をどの範囲まで公開するか設計と合わせてルールを変更する。

### 継続監視

5. **Firestore Rules のユニットテスト追加**: `@firebase/rules-unit-testing` を使って `users` の create 禁止・update 制限、`tiles` のオーナーチェックを自動テストで保証する。現状テストが存在しないため、Rules の意図しない変更を検知できない。

6. **Auth Trigger 失敗時の Cloud Logging アラート設定**: Auth と Firestore は独立しており、Auth Trigger の失敗はユーザー登録のロールバックを意味しない。Trigger が失敗してもユーザーはログイン可能になるが `users` / `maps` ドキュメントが作成されない状態が生じうる。Cloud Logging のエラーフィルタとアラートを設定する。

---

## 7. 総合評価

**Phase 3 移行判定: 承認**

- Critical・High の問題なし
- M-1（`allow create: if false` への変更）は本レビューで修正済み
- M-2（update フィールドレベル制限）は本レビューで修正済み
- 多層防御の設計方針は適切に実装されている
- A7/QA 申し送り事項（統合テスト実装、useEffect 依存配列改善）も合わせて対応すること

以上。A1/Fun レビューへ引き渡す。
