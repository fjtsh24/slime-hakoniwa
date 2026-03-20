---
description: 次のフェーズの実装をエージェントチームで開始する
---

# 次フェーズ開始

`implementation_plan.md` を読み、現在完了しているPhaseを確認した上で、次のPhaseの実装をマルチエージェントチームで開始してください。

## 手順

1. `implementation_plan.md` を Read して現在の進捗を確認する
2. `agent_plan.md` を Read してエージェント構成を確認する
3. 次のPhaseの実装内容を確認し、Week単位のタスクに分解する
4. agent_plan.md の「Phase 1における担当分担」を参考に、各Weekの担当エージェントを決定する
5. TaskCreate でタスクを作成し、並列実行可能なエージェントを同時起動する
   - 各エージェントに担当ディレクトリ（例: `frontend/src/components/`）を明示し、ファイル衝突を防ぐ
   - サブエージェントには設計・実装・テスト生成を含めて委任してよい（Write/Edit権限は付与済み）
6. 各Week完了後にA7(QA)→A2(Sec)→A1(Fun)の順でレビューを実施する
7. レビュー指摘の修正後、implementation_plan.mdのチェックボックスを更新する
8. 実装完了後、コミット・プッシュ・PR作成まで行う（`develop → main`）
