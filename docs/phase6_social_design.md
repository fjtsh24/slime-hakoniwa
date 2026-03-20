# Phase 6 ソーシャル機能 設計書

**作成日**: 2026-03-20
**担当**: A1/Fun（ゲームデザイン）+ A2/Sec（セキュリティ）
**総合判定**: **条件付き承認**（MUST-1〜5 を実装前に確定すること）

---

## 課題認識

現状のゲームは「アカウント登録しないとゲームの面白さが全く分からない」問題がある。

- トップページ = ログイン画面のみ
- 進化・分裂・融合などのビジュアルインパクトがログイン前に一切見えない
- 「行動予約→1時間放置→結果確認」というサイクルは**仕組みを理解した後に面白さがわかる**構造

→ Phase 6 ソーシャル機能でこの課題を解決する。

---

## 実装するページ（優先順位順）

### [1] スライム図鑑 `/encyclopedia`（Week 1・最優先）

- 全10種族の画像・名前・説明・ベースステータス
- 進化ルートツリー（分岐図）
- 各種族の「現在育成中プレイヤー数」バッジ
- **完全ログイン不要・静的コンテンツ中心**
- 進化条件（racialValues閾値）は**非公開**（ログイン後のみ）
- 実装コスト最小・Firestoreルール変更不要

**設計意図**: 進化後スライムの存在を見せることで「あそこまで育てたい」動機を先に作る。

### [2] プレイヤー公開プロフィール `/players/{publicHandle}`（Week 1）

- プレイヤーの公開ハンドルネーム（※`displayName` は本名含む可能性があるため、専用の `publicHandle` フィールドを別途設ける）
- 所持スライム一覧（名前・種族名・HP/ATK/DEF/SPD）
- 最近の特別イベント（evolve/split/merge/battle_win）直近5件
- **ログイン不要**で閲覧可能
- 「このゲームを始める」CTAボタンを最下部に配置

### [3] 他プレイヤーのマップ閲覧 `/players/{publicHandle}/map`（Week 2）

- Phase 5 マップ描画完了が前提
- スライムの現在位置・種族表示（読み取り専用）
- `tiles` サブコレクションの読み取り権限拡張が必要（A2/Sec 確認必須）

### [4] ライブ観戦フィード `/live`（Week 2・後半）

- 全プレイヤーの直近ターンイベントフィード
- 進化・分裂・融合をハイライト表示
- 野生スライム・ワールドイベント実装後のほうが映える

---

## 公開/非公開フィールド仕分け

| データ | 公開可否 | 理由 |
|--------|---------|------|
| スライム名・種族・HP/ATK/DEF/SPD | **公開OK** | ゲームの見せ所 |
| 進化/分裂/融合イベント（一部） | **公開OK** | 最大の興味喚起素材 |
| スライムの現在位置（プロフィール表示のみ） | **公開OK** | 世界観の伝達 |
| racialValues（種族値） | **非公開** | 進化条件の核心・戦略情報 |
| exp（経験値） | **非公開** | 進化タイミングの推測に直結 |
| hunger（満腹度） | **非公開** | 「世話不足」の晒し上げ防止（Tamagotchi問題） |
| インベントリ・アクション予約 | **非公開** | 戦略情報 |
| スキルID | **非公開** | 戦略情報 |
| skillIds | **非公開** | 戦略情報 |
| incapacitatedUntilTurn | **非公開** | 脆弱性情報 |
| gather/fish/hunt/inventory系ログ | **非公開** | 戦略情報 |
| move ログ（ライブフィード） | **非公開** | 行動パターン推測に繋がる |
| メールアドレス・Firebase UID | **非公開** | 個人情報・GDPR |

---

## セキュリティ設計（MUST事項）

### MUST-1: ホワイトリスト方式のフィールドフィルタリング（Critical）

Admin SDK は全フィールドを取得できるため、**公開APIは必ずホワイトリスト方式**（返すフィールドを明示的に列挙）で実装すること。

```typescript
// 危険なブラックリスト方式（採用禁止）
const { hunger, ...publicData } = slimeDoc.data()

// 必須のホワイトリスト方式
const data = slimeDoc.data()
return {
  id: slimeDoc.id,
  name: data.name,
  speciesId: data.speciesId,
  stats: { hp: data.stats.hp, atk: data.stats.atk, def: data.stats.def, spd: data.stats.spd },
  // exp・hunger・racialValues・skillIds・incapacitatedUntilTurn は含めない
}
```

### MUST-2: racialValues の非公開化（High）

A1/Fun・A5/DB・A2/Sec で合意済み。進化条件の核心データのため公開禁止。

### MUST-3: publicProfiles への書き込みは Cloud Functions のみ（Critical）

- `firestore.rules` で `publicProfiles` コレクションは `allow write: if false` とする
- `slimes` ドキュメントの更新をトリガーに、Cloud Functions（Admin SDK）が自動更新

```
publicProfiles/{uid}
  publicHandle: string        (一意、英数字・ハイフン・アンダースコアのみ、3〜32文字)
  displayName: string         (プレイヤーが任意設定)
  slimeSummaries: [...]       (Cloud Functions が自動同期・ユーザーは直接書き込み不可)
  updatedAt: Timestamp
```

### MUST-4: publicHandle のバリデーション（High）

- 文字種: `^[a-zA-Z0-9_-]{3,32}$`（英数字・ハイフン・アンダースコアのみ）
- 大文字小文字を lowercase に正規化（`PlayerA` と `playera` は同一として扱う）
- 変更頻度制限: 30日に1回まで（旧URLが他者に取得されるのを防止）
- XSS対策: `validation.ts` に `publicHandle` 専用 zod スキーマを追加

### MUST-5: eventData のホワイトリストフィルタリング（Critical）

`eventType` が公開OKでも `eventData` の中身に非公開情報が混入する可能性がある。

```typescript
const PUBLIC_EVENT_DATA_KEYS: Partial<Record<TurnEventType, string[]>> = {
  evolve:      ['previousSpeciesId', 'newSpeciesId'],
  split:       [],  // 子スライムIDは公開しない
  merge:       [],  // ターゲットIDは公開しない
  battle_win:  [],  // 相手HP等は公開しない
  battle_lose: [],
  // eat, skill_grant, autonomous, move は公開フィードに含めない
}
```

---

## 公開APIの実装方針

**方法A（採用）**: Netlify Functions に認証不要の読み取り専用エンドポイントを作成し、Admin SDK でデータを取得・フィルタリング後に返す。**Firestoreルールは変更不要。**

```
GET /api/public/encyclopedia     — スライム図鑑（認証不要）
GET /api/public/players/:handle  — プレイヤープロフィール（認証不要）
GET /api/public/live             — ライブフィード（認証不要）
```

- `Cache-Control: public, max-age=60, s-maxage=300` でCDNキャッシュを活用
- レスポンスに Firebase UID を一切含めない（識別子は `publicHandle` のみ）

---

## レート制限（A6/Infra と連携）

| エンドポイント | 推奨値 |
|---|---|
| `GET /api/public/encyclopedia` | 30 req/min/IP（CDNキャッシュ推奨） |
| `GET /api/public/players/:handle` | 20 req/min/IP |
| `GET /api/public/live` | 10 req/min/IP |

インメモリのレート制限はサーバーレス環境では無効。Netlify Edge Functions + KV Store または CDNキャッシュによる対応を検討（A6/Infra 担当）。

---

## Phase 6 実装スコープ（確定版）

```
Phase 6 Week 1:
  [1] スライム図鑑ページ（/encyclopedia）
  [2] publicProfiles コレクション設計（A5/DB・A2/Sec）
  [3] 公開API エンドポイント新規作成（Netlify Functions）
  [4] プレイヤー公開プロフィールページ（/players/{publicHandle}）
  [5] publicHandle 登録フロー追加（初回ゲーム画面）

Phase 6 Week 2:
  [6] 他プレイヤーのマップ閲覧（/players/{publicHandle}/map）
  [7] ライブ観戦フィード（/live）
  [8] 野生スライム AI 自律行動（既存計画）
  [9] ワールドイベント実装（既存計画）
```

---

## 期待効果（A1/Fun）

- **「見るだけ」ユーザーの存在**がログイン済みプレイヤーの育成継続動機になる
- **進化・分裂・融合**は SNS シェア素材として自然流入を生む
- **スライム図鑑**がゲームの説明書を兼ね、登録後の離脱率を下げる

---

*実装着手前に A5/DB（publicProfiles スキーマ確定）→ A2/Sec（Firestoreルール確認）→ A3/BE（API実装）→ A7/QA（非公開フィールド漏洩テスト）の順序で進めること。*
