# Phase 1 セキュリティレビュー報告書

**レビュー担当**: A2: セキュリティ担当
**レビュー対象**: Phase 1 実装コード全体
**レビュー実施日**: 2026-03-16
**参照基準**: OWASP Top 10 (2021)

---

## 1. 総評

**判定: 要対応**

基盤部分（Firestore ルール、IDトークン検証、ownerUid チェック）は設計通りに実装されており、致命的な穴はない。しかし、`actionData` の内容（foodId の実在確認・move の座標範囲）がサーバーサイドで検証されていない点、1スライムあたりの予約数上限が未実装である点、および二重ターン処理防止が設計書の仕様（status フィールドによるロック）と乖離している点は Phase 2 開始前に対処が必要。

---

## 2. OWASP Top 10 対応状況表

| OWASP カテゴリ | 対応状況 | 備考 |
|---|---|---|
| A01 アクセス制御の不備 | 対応済み（一部要改善） | ownerUid チェックは API/Rules 両方に実装済み。ただし Firestore Rules 側でスライムの ownerUid チェックが行われないため API バイパス時のリスクが残る |
| A02 暗号化の失敗 | 対応済み | 環境変数経由での設定。ハードコードなし |
| A03 インジェクション | 要改善 | zod バリデーションは実装済みだが actionData の内部フィールド（foodId・targetX/Y）が未検証 |
| A04 安全でない設計 | 対応済み | ターン処理はサーバーサイドのみで実行 |
| A05 セキュリティの設定ミス | 対応済み | デフォルト deny、Rules のユニットテストは設計書に記載（CI 未確認） |
| A06 脆弱なコンポーネント | 対応済み（未確認） | 設計書に npm audit の CI 組み込みを明記。実装状況は未確認 |
| A07 認証の失敗 | 対応済み | 全認証必須エンドポイントで verifyIdToken を実施。期限切れは Firebase SDK が自動処理 |
| A08 ソフトウェアとデータの完全性の失敗 | 対応済み（設計のみ） | CI/CD 経由デプロイ方針を設計書に明記 |
| A09 セキュリティの記録とモニタリングの失敗 | 要改善 | ターン処理ログは TurnLog に記録されるが、API レイヤーの成功/失敗ログが不足。エラーログが catch で握りつぶされている箇所あり |
| A10 SSRF | 対応済み | Cloud Functions は外部 URL へのリクエストを不要とする設計 |

---

## 3. 発見した問題点

### [High] H-1: actionData の内容が API でまったく検証されていない

**ファイル**: `netlify/functions/helpers/validation.ts` (L18), `netlify/functions/api.ts` (L63-64)

`actionData` は `z.record(z.unknown())` で受け取るのみで、内部フィールドの検証は一切行われていない。

- `eat` アクション: `foodId` が任意の文字列で送れる。実在しない foodId を送っても API 側ではエラーにならず、ターン処理時に Firestore から取得を試みて `food` が `undefined` になった場合はアクションがサイレントにスキップされる（`turnProcessor.ts` L378-398）。これはゲームロジックとして問題だが、**サーバーサイドで foodId の実在確認を行わないことで、大量の存在しない foodId によるターン処理時の Firestore 読み取りコスト増加が生じる**。
- `move` アクション: `targetX` / `targetY` に負数・極端に大きい値・非整数が送れる。マップ範囲外への移動がサーバーサイドで防げていない。
- `battle` アクション: `actionType` として受理されるが `actionData` の検証もロジックも未実装（`turnProcessor.ts` L480 の `default: break`）。

**重大度**: High（ゲームロジック破壊・不正なリソース消費につながる）

---

### [High] H-2: 1スライムあたりの予約数上限がない（DoS リスク）

**ファイル**: `netlify/functions/api.ts` (L90-111)

予約作成 API は同一スライム・同一ターンに対して何件でも予約を作成できる。ターン処理では `pendingReservations[0]` のみが実行されるが、大量予約を送り込むことで:

1. Firestore の `actionReservations` コレクションを肥大化させる
2. ターン処理時のクエリ負荷が増大する
3. ストレージコストが増加する

設計書 `docs/security.md` L193 にも「Phase 2 で実装予定」と明記されているが、Phase 1 の API 実装に保護がない状態で公開することは DoS リスクが高い。

**重大度**: High（サービス可用性・コストへの影響）

---

### [High] H-3: 二重ターン処理防止が設計書の仕様と乖離している

**ファイル**: `functions/src/scheduled/turnProcessor.ts` (L101-134)

設計書 `docs/security.md` L117-135 では、トランザクション内で `world.status` を `'processing'` に設定することで二重処理を防ぐ擬似コードが示されているが、**実装では `status` フィールドの管理が一切行われていない**。

実装されている二重処理防止は `nextTurnAt > now` のチェック（L116-119）のみ。しかしこのチェックは:

- スケジューラが重複起動した場合、2つの処理が同時に `nextTurnAt` を読んで `now` より大きいと判定し、**両方がトランザクションを通過する競合が起きる可能性がある**。
- Firestore トランザクションの楽観的ロックは同一ドキュメントの同時更新を検知できるが、`nextTurnAt` の更新（L130-133）は一方が成功した後に他方がリトライしても `nextTurnAt` はすでに更新済みなので、リトライした処理が `nextTurnAt > now` で止まる。ただしこの保証が「楽観的ロックのリトライ機構」に依存しており、設計書に記載された `status: 'processing'` による確実な冪等性保証より脆弱である。
- 処理中のクラッシュ時に `status` が `'processing'` のまま残るという設計書の想定フローがないため、障害時の自動復旧手順が不明確。

**重大度**: High（ゲームデータの重複更新につながる可能性がある）

---

### [Medium] M-1: GET /api/worlds/:worldId/status が認証不要かつ worldId を無検証で受け入れる

**ファイル**: `netlify/functions/api.ts` (L180-210)

このエンドポイントは「公開エンドポイント」として認証なしで設計されているが（L182 コメント）、`worldId` に対するバリデーションがなく任意の文字列を受け入れる。存在しない worldId は 404 を返すだけなので直接的な被害はないが、大量リクエストによるスキャン・負荷が発生しうる。認証不要とした根拠がコメント以外に記載されていない（設計書にも言及なし）。

**重大度**: Medium（意図的な設計かどうかが不明確。設計書への明記と、可能なら簡易レート制限の追加を推奨）

---

### [Medium] M-2: Firestore Rules で actionReservations に slimeId の ownerUid チェックがない

**ファイル**: `firestore.rules` (L61-81)

Rules では `ownerUid == request.auth.uid` のチェックのみで、指定した `slimeId` が実際にそのユーザーのスライムかどうかを確認していない。クライアントから直接 Firestore にアクセスした場合、他人の `slimeId` と自分の `ownerUid` を組み合わせた予約ドキュメントを作成できる（API を経由しない場合）。

API 経由では `api.ts` L72 でスライムの ownerUid チェックが行われているため、**通常フローでは防がれている**。ただし、Rules 単体での防御が不完全なため、将来的に API を経由しないクライアント実装が追加された場合にリスクが顕在化する。

**重大度**: Medium（現状は API チェックで防御済みだが、多層防御として Rules 側も強化すべき）

---

### [Medium] M-3: move アクション実行時にタイル範囲外チェックがない

**ファイル**: `functions/src/scheduled/turnProcessor.ts` (L428-468)

`targetX` / `targetY` はバリデーションなしにそのままスライムの座標として設定される（L435-436）。マップ外座標が設定された場合の挙動が未定義であり、ゲームデータの整合性が壊れる可能性がある。

**重大度**: Medium（ゲームロジックの整合性破壊）

---

### [Medium] M-4: ターン処理の API レイヤーにエラーログがない

**ファイル**: `netlify/functions/api.ts`

予約作成・削除の各エンドポイントで、Firestore アクセスエラーや予期しない例外が発生した場合のロギングが実装されていない。エラーが発生すると `catch` ブロックなしで例外が Netlify のランタイムに素通りするか、トップレベルで 500 が返るが詳細がログに残らない。

一方、フロントエンド（`ActionReservationForm.tsx` L86 および `authStore.ts` L27, 38）では `console.error` によるログが実装されている。

**重大度**: Medium（インシデント発生時の調査が困難になる）

---

### [Low] L-1: turnProcessor のターンログ ID に Date.now() を使用しており衝突リスクがある

**ファイル**: `functions/src/scheduled/turnProcessor.ts` (L206)

```typescript
const logId = `${worldId}-${newTurn}-${slime.id}-${event.eventType}-${Date.now()}`
```

同一ミリ秒に同じスライム・同じイベントタイプが複数発生した場合、ログ ID が衝突してターンログが上書きされる。ゲームの監査証跡として重要なデータが失われうる。

**重大度**: Low（現実的には発生しにくいが、UUID または Firestore auto-ID 使用を推奨）

---

### [Low] L-2: authStore で initialize() を複数回呼ぶと onAuthStateChanged リスナーが複数登録される

**ファイル**: `frontend/src/stores/authStore.ts` (L20-31)

`initialize()` を複数回呼び出すと `onAuthStateChanged` のリスナーが累積して登録される。返却されたアンサブスクライブ関数が無視されているため、コンポーネントのアンマウント時やリロード時にリスナーが解除されない。メモリリークおよび意図しない状態更新の原因になりうる。

**重大度**: Low（通常の使用では影響小。アンサブスクライブ関数を保持して適切に解除する実装を推奨）

---

## 4. 各問題の修正方針

### H-1: actionData の内容検証

`validation.ts` の `createReservationSchema` を actionType に応じたユニオン型に変更する。

```typescript
// 修正案: actionType ごとに actionData を厳密に型付け
export const createReservationSchema = z.discriminatedUnion('actionType', [
  z.object({
    slimeId: z.string().min(1),
    worldId: z.string().min(1),
    turnNumber: z.number().int().positive(),
    actionType: z.literal('eat'),
    actionData: z.object({
      foodId: z.string().min(1, 'foodId は必須です'),
    }),
  }),
  z.object({
    slimeId: z.string().min(1),
    worldId: z.string().min(1),
    turnNumber: z.number().int().positive(),
    actionType: z.literal('move'),
    actionData: z.object({
      targetX: z.number().int().min(0).max(99),  // マップ最大値は定数化
      targetY: z.number().int().min(0).max(99),
    }),
  }),
  z.object({
    slimeId: z.string().min(1),
    worldId: z.string().min(1),
    turnNumber: z.number().int().positive(),
    actionType: z.enum(['rest', 'battle']),
    actionData: z.object({}).passthrough(),
  }),
])
```

さらに `api.ts` のステップ 3 と 4 の間で、`eat` アクションの場合に Firestore の `foods` コレクションで `foodId` の実在を確認する処理を追加する。

---

### H-2: 1スライムあたりの予約数上限

`api.ts` のステップ 5（world の currentTurn チェック）の後に、以下のカウントチェックを追加する。

```typescript
// 同一スライム・ターンの pending 予約数を確認
const MAX_RESERVATIONS_PER_SLIME_PER_TURN = 1  // または小さな上限値

const existingReservationsSnap = await db
  .collection('actionReservations')
  .where('slimeId', '==', slimeId)
  .where('turnNumber', '==', turnNumber)
  .where('status', '==', 'pending')
  .get()

if (existingReservationsSnap.size >= MAX_RESERVATIONS_PER_SLIME_PER_TURN) {
  return jsonResponse(409, {
    error: 'このターンのこのスライムへの予約は既に存在します',
  })
}
```

---

### H-3: 二重ターン処理防止の強化

設計書の仕様通り、`processWorldTurn` のトランザクション内に `status` フィールドのチェックと更新を追加する。

```typescript
// トランザクション内で status チェックを追加
if (worldData['status'] === 'processing') {
  throw new Error(`World ${worldId} is already being processed`)
}

// currentTurn の更新と同時に status を 'processing' に設定
transaction.update(worldRef, {
  currentTurn: newTurn,
  nextTurnAt: nextTurnAtTimestamp,
  status: 'processing',
})

// ターン処理完了後（バッチコミット後）に status を 'idle' に戻す
await db().collection('worlds').doc(worldId).update({ status: 'idle' })
```

また、クラッシュ時の自動復旧のため、`processDueTurns` の開始前に `status == 'processing'` かつ `nextTurnAt` が一定時間以上経過しているワールドを強制的に `'idle'` に戻す回復処理を追加することを推奨する。

---

### M-1: GET /api/worlds/:worldId/status の設計明確化

設計書 `docs/security.md` に「ターン状態 GET は認証不要」と明記し、その根拠（ゲームクライアントの初期ロード前に表示するため等）を記載する。加えて、Netlify の Rate Limiting 機能または関数内でのシンプルな応答遅延を検討する。

---

### M-2: Firestore Rules の slimeId ownerUid チェック強化

Rules 内でスライムドキュメントへのクロスドキュメント参照は標準機能では困難なため（Rules は `get()` で他ドキュメントを参照できるが課金が発生）、短期的には API 経由の強制を徹底する。中長期的には Firebase App Check の導入で直接 Firestore アクセスを制限することを推奨する。

---

### M-3: move アクションの座標範囲チェック

H-1 の修正（discriminatedUnion）に `targetX` / `targetY` の範囲検証（`z.number().int().min(0).max(N)`）を含めることで対処する。マップサイズは定数ファイルで管理する。

---

### M-4: API レイヤーのエラーログ追加

`api.ts` の各エンドポイントに `try/catch` ブロックを追加し、予期しないエラーを `console.error` でログに記録した上で 500 を返す。

```typescript
try {
  // ... 既存のロジック
} catch (err) {
  console.error('POST /api/reservations: unexpected error', err)
  return jsonResponse(500, { error: 'サーバー内部エラーが発生しました' })
}
```

---

### L-1: ターンログ ID の衝突回避

```typescript
// Date.now() の代わりに Firestore auto-ID を使用
const logRef = db().collection('turnLogs').doc()  // auto-ID
const logId = logRef.id
```

---

### L-2: onAuthStateChanged のアンサブスクライブ

```typescript
initialize: () => {
  // 既存のリスナーを解除してから再登録
  const unsubscribe = onAuthStateChanged(auth, ...)
  return unsubscribe  // 呼び出し側で保持・クリーンアップ
}
```

---

## 5. Phase 2 以降への推奨事項

### 優先度: 高（Phase 2 開始前に対処）

1. **actionData の厳密な型バリデーション実装**（H-1 修正を先行実施）
2. **1スライムあたりの予約数上限実装**（H-2 修正を先行実施）
3. **二重ターン処理防止の status フィールド実装**（H-3 修正を先行実施。設計書との乖離を解消）
4. **Firestore Security Rules のユニットテスト整備**（`@firebase/rules-unit-testing` を使用し、CI で自動実行）

### 優先度: 中（Phase 2 中に実装）

5. **レート制限の実装**：Netlify の Built-in Rate Limiting またはカスタム実装で、1ユーザーあたりの予約作成頻度を制限する（設計書 L193 で言及済み）。
6. **Firebase App Check の導入**：Firestore への直接アクセスを正規クライアントからのみに制限し、M-2 のリスクを低減する。
7. **API レイヤーの構造化ログ整備**：エラーの重大度・リクエスト ID・uid を含む構造化ログを実装し、Cloud Logging での追跡を容易にする。
8. **マップ境界定数の一元管理**：マップサイズ（X/Y の最大値）をサーバー・クライアント共有の定数ファイルで管理し、バリデーションに使用する。

### 優先度: 低（Phase 3 前に対処）

9. **ターン処理の障害回復ロジック実装**：`status == 'processing'` のまま長時間放置されたワールドを自動復旧させるジョブを追加する。
10. **battle アクションの実装または禁止処理追加**：現状 `default: break` でサイレントスキップされる battle アクションについて、実装するか受付時点で 422 を返すよう修正する。
11. **ペネトレーションテストの実施**：公開前に外部業者または社内レッドチームによる検証を行う（設計書 Phase 3 項目）。
12. **Cloud Armor / Firebase App Check によるボット対策**：マルチプレイヤー公開後は大量リクエストを送るボットへの対策が必須。
