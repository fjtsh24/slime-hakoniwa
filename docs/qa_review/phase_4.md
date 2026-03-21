# A7/QA レビュー — Phase 4 (Week 3: 進化UI・分裂・融合・スキル確認UI)

**レビュー日**: 2026-03-21
**対象PR**: #22 `feat(phase4-w3): 進化UI強化・分裂・融合・スキル確認UI`
**判定**: 条件付き承認（H-1 修正後にマージ可）

---

## カバレッジサマリー

| 対象 | 状況 |
|------|------|
| Functions テスト | 85.85% (lines) — CI ✅ |
| `checkEvolution` | テスト3件 ✅ |
| `checkSplit` | **テスト0件** ❌ |
| `executeReservedAction (battle)` | `battleAction.test.ts` で10件 ✅ |
| `executeReservedAction (merge)` | `mergeAction.test.ts` で実装済み ✅ |
| `processSlimeTurn (battle + incapacitation)` | `battleAction.test.ts` で実装済み ✅ |

---

## High Priority（マージ前に修正必須）

### [QA-H-1] `checkSplit` のユニットテストがゼロ

`checkSplit` は `exp >= 500` / `racialMax >= 0.7` / `15%確率` の3条件と、生成スライムの親フィールド継承を含む重要なロジックだが、テストが一切ない。

- **必要なテストケース**:
  1. `exp < 500`（EXP 不足で分裂しない）
  2. `exp = 499`（境界値：分裂しない）
  3. `exp >= 500 かつ racialMax < 0.7`（種族値不足で分裂しない）
  4. `racialMax = 0.699`（境界値：分裂しない）
  5. 条件を満たすが確率で外れた（`Math.random` モック）
  6. 全条件を満たし分裂する（`Math.random` モック）
  7. 生成スライムが親の `speciesId` を継承する
  8. 生成スライムの `stats` が `parentSpecies.baseStats`
  9. 生成スライムの `racialValues` が全て 0
  10. 生成スライムの `inventory` が空配列
- **対応**: `tests/unit/functions/turnProcessor.test.ts` に `describe('checkSplit')` ブロックを追加すること

---

## Medium Priority（Phase 5 対応可）

### [QA-M-1] `battle_incapacitated` の境界値テストがない

`incapacitatedUntilTurn === currentTurn` の境界値（ちょうどそのターンに回復するケース）のテストがない。

### [QA-M-2] `jest.config.js` に `branches: 70` 閾値が未追加

Phase 4 実装計画のバックログに記載されていた項目。条件分岐のカバレッジが低い関数が存在する可能性がある。

### [QA-M-3] 統合テストのCI除外が不明確

`tests/integration/` が CI（GitHub Actions）から除外されているか確認が必要。エミュレータなしで実行するとタイムアウトする。

### [QA-M-4] `cooking` スキル効果ロジックのテストがゼロ

`executeReservedAction (eat)` で `cooking` スキル所持時のボーナス計算ロジックは実装済みだが、テストがない。

---

## 実装計画チェックリスト未完了項目

以下は `implementation_plan.md` の Week 3 チェックリストで未チェックのまま：

- [ ] `tests/unit/battleAction.test.ts` — RED → GREEN 確認（実装完了だが明示的にチェックされていない）
- [ ] `tests/integration/inventoryApi.test.ts` — 未実装
- [ ] `tests/integration/battleHunt.test.ts` — 未実装
- [ ] battle ハンドラチェックボックス（Week 3 バックエンド実装）

---

## 承認コメント

`battleAction.test.ts` / `mergeAction.test.ts` の追加により主要ロジックのテストは充実している。カバレッジ 85.85% は目標 80% を超過。`checkSplit` テスト追加後にマージ可。
