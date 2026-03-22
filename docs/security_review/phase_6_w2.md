# A2/Sec レビュー — Phase 6 Week 2（ソーシャル拡張・ワールドイベント）

**レビュー日**: 2026-03-22
**対象**: Phase 6 Week 2 実装全体
**判定**: 承認 ✅（MUST 事項全達成・Minor Issues は次フェーズ対応）

---

## MUST 事項チェックリスト

| 項目 | ステータス | 実装箇所 |
|------|-----------|---------|
| **MUST-1**: spirit/slime カテゴリの入力バリデーション（zod strict） | ✅ | validation.ts huntBattleDataSchema |
| **MUST-2**: 非公開フィールド（hunger/racialValues/ownerUid）の公開API除外 | ✅ | api.ts PUBLIC_EVENT_TYPES_SET + ホワイトリスト |
| **MUST-3**: worlds への書き込みが Admin SDK（Cloud Functions）のみ | ✅ | firestore.rules + turnProcessor.ts |

---

## Critical（ブロッカーなし）

- `checkWeatherTransition` / `checkSeasonTransition` は Admin SDK 経由の `batch.update()` のみ使用。クライアントからの直接書き込みパスは存在しない。
- `huntBattleDataSchema` の `.strict()` により余分なキーは拒否される。
- `worldContext.season` の未知値は `seasonHungerBonus ?? 0` フォールバックで安全に処理される。

---

## Medium Priority（Phase 6 Week 3 対応）

### [SEC-M-1] world.ts の `weather` フィールド型を強化することを推奨

現状: `weather?: string`
推奨: `weather?: 'sunny' | 'rainy' | 'stormy' | 'foggy'`

`WEATHER_DEFINITIONS` の ID と型を同期させることで将来のコード変更時の型安全性が向上する。
ブロッカーではない（実際の書き込みは WEATHER_DEFINITIONS 配列からのみ行われるため）。

### [SEC-M-2] Rate Limiting の将来的導入推奨

`GET /public/live` は認証不要。DoS 対策として Netlify Edge Functions での Rate Limiting を Phase 7 以降で検討することを推奨。

### [SEC-M-3] Firebase App Check（Phase 4 持ち越し）

引き続き Phase 6 Week 3 以降での対応を推奨。

---

## 承認コメント

ワールドイベント（天候・季節）の書き込みパスは完全に Admin SDK に閉じており、クライアントからの直接書き込みパスは存在しない。公開 API のレスポンスフィルタリングはホワイトリスト方式で二重防御されており、UID・hunger・racialValues 等の秘密情報の漏洩リスクはない。`spirit`/`slime` カテゴリの追加は既存の zod strict スキーマに正しく統合されており、Phase 6 Week 2 のセキュリティ要件を満たしている。
