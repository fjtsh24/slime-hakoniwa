# A2/Sec レビュー — Phase 6 Week 1（ソーシャル基盤・公開ページ）

**レビュー日**: 2026-03-22
**対象**: Phase 6 Week 1 実装全体
**判定**: 承認 ✅（MUST 事項全達成・Minor Issues は次フェーズ対応）

---

## MUST 事項チェックリスト

| 項目 | ステータス | 実装箇所 |
|------|-----------|---------|
| **MUST-1**: ホワイトリスト方式フィルタリング（GET /public/players/:handle） | ✅ | api.ts:457-477 |
| **MUST-2**: racialValues/exp/hunger/skillIds/incapacitatedUntilTurn 非公開 | ✅ | api.ts + slimeTrigger.ts |
| **MUST-3**: publicProfiles 書き込みは Admin SDK のみ | ✅ | firestore.rules:119-130 + slimeTrigger.ts |
| **MUST-4**: publicHandle バリデーション・30日制限・lowercase正規化 | ✅ | validation.ts + api.ts:610-671 |
| **MUST-5**: eventData ホワイトリスト（GET /public/live） | ✅ | api.ts:519-540 |

---

## Critical（ブロッカーなし）

新規公開APIは Firebase UID を一切レスポンスに含まない設計を確認。publicHandle のみで識別。

---

## Medium Priority（Phase 6 Week 2 対応）

### [SEC-M-1] CDN キャッシュパージ未実装

POST /users/handle 成功後、CDN キャッシュ（最大 300 秒）が旧データを返す可能性。Netlify Edge Cache パージの設定を Phase 6 Week 2 で検討。

### [SEC-M-2] slimeTrigger 削除時の挙動（設計明文化）

全スライム削除後も publicProfiles は残存（slimeSummaries=[]）。publicHandle を解除するには別途ハンドル変更 API が必要。この挙動を想定設計として implementation_plan.md に明記済み。

### [SEC-M-3] Firebase App Check（Phase 4 持ち越し）

引き続き Phase 6 Week 2 以降での対応を推奨。

---

## 承認コメント

MUST-1〜5 すべての要件実装と 21 件のセキュリティテストカバレッジを確認。非公開フィールド漏洩・UID露出・30日変更制限バイパスに対する防御が多層実装されており、Phase 6 Week 1 のセキュリティ要件を満たしている。
