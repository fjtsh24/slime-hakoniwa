---
description: 現在フェーズのレビューをA1(Fun)・A2(Sec)・A7(QA)で実施する
---

# フェーズレビュー実施

現在の実装状態に対してレビューエージェントを起動します。

## 手順

1. `implementation_plan.md` を Read して現在のPhaseを確認する
2. 以下の3エージェントを **並列** で起動する：

### A7/QA レビュー観点
- テストカバレッジが80%以上か
- 未テストのエッジケースはないか
- テストレポート（`tests/reports/`）は最新か

### A2/Sec レビュー観点
- OWASP Top 10 対応状況
- 新しいAPIに認証・バリデーションが実装されているか
- Firestoreルールに抜け漏れはないか
- 前回レビュー（`docs/security_review/`）の指摘が修正されているか

### A1/Fun レビュー観点
- ゲームパラメータがバランス的に適切か
- 「まったり楽しめる」体験になっているか
- 前回レビュー（`docs/fun_review/`）の指摘が修正されているか

## 成果物

- `docs/fun_review/phase_N.md`
- `docs/security_review/phase_N.md`
- `tests/reports/` 更新

レビュー完了後、指摘事項を修正し `implementation_plan.md` のレビュー済みチェックボックスを更新すること。
