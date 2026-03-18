# A2/Sec レビュー: アクション拡張・食料獲得システム

**レビュー担当**: A2/Sec
**レビュー日**: 2026-03-18
**対象**: Phase 4 設計レビュー（battle_design.md / アクション拡張・食料獲得システム）
**参照**:
- `docs/fun_review/battle_design.md` — A1/Fun 設計書
- `firestore.rules` — 現在のセキュリティルール
- `netlify/functions/helpers/validation.ts` — 現在のバリデーション実装
- `netlify/functions/helpers/auth.ts` — 認証ヘルパー
- `shared/types/action.ts` — 型定義
- `functions/src/scheduled/turnProcessor.ts` — ターン処理コア
- `docs/security_review/phase_3.md` — 前フェーズレビュー
**ステータス**: レビュー完了（Phase 4 実装着手前の設計段階レビュー）

---

## リスク評価サマリー

### HIGH

| ID | 項目 | 概要 |
|----|------|------|
| SEC-H-1 | インベントリ格納先の選択ミスによるアクセス制御漏れ | 案Aのドキュメント内配列を採用した場合、Firestore ルールで「自分のスライムのみ書き込み可」という制御が実質不可能になる |
| SEC-H-2 | eatアクションのインベントリ消費における TOCTTOU 競合 | 在庫チェックと消費操作が非アトミックの場合、同時リクエストで在庫がゼロ未満に減るまたは不正重複消費が発生する |
| SEC-H-3 | battle報酬の改ざん経路の存在（現設計の未定義部分） | battle の勝敗判定と報酬付与がサーバーサイドのみで完結する設計になっていないと、クライアントから勝利を不正申告できる |

### MEDIUM

| ID | 項目 | 概要 |
|----|------|------|
| SEC-M-1 | `targetStrength` 未検証による不正な報酬取得 | `BattleActionData.targetStrength` を厳密にバリデーションしないと、実装段階で解放されていない strong 相手の報酬を先取りされうる |
| SEC-M-2 | インベントリ上限チェックと食料追加（gather/fish/hunt）の TOCTTOU 競合 | 上限チェックと追加がアトミックでない場合、上限を超えた在庫を蓄積させる攻撃が成立する |
| SEC-M-3 | gather/fish/hunt アクションの実行頻度に上限がない | 同一ターンに複数のアクション予約が実行された場合の食料取得が設計仕様と乖離する可能性 |
| SEC-M-4 | 種族値上昇 (+0.05〜+0.20) に対するサーバーサイド上限検証の欠如 | battle 報酬の種族値加算に上限ガードが実装されていない場合、バグや将来の実装漏れで racialValues が無限上昇する |

### LOW

| ID | 項目 | 概要 |
|----|------|------|
| SEC-L-1 | dropTable マスタデータのクライアント可視リスク | Firestore の foods コレクションは認証済み全員が読み取り可能であり、ドロップ確率がクライアントに全公開される |
| SEC-L-2 | gather/fish は `actionData` が空オブジェクトだが現行 zod スキーマで区別不能 | rest と同じ扱いになり、将来的に gather/fish 固有データを追加した際のバリデーション漏れの温床になる |
| SEC-L-3 | 前フェーズ継続: Firebase App Check 未導入 | IDトークンを取得できる任意のクライアントから API 操作が可能な状態が Phase 4 に持ち越される |
| SEC-L-4 | `POST /api/slimes/initial` TOCTTOU 対策（SEC-H-1 from phase_3）は対応済みだが、Phase 4 の新 API エンドポイントに同種のリスクが持ち込まれないか要注意 | 継続監視 |

---

## 各リスクの詳細と推奨対策

---

### [SEC-H-1] インベントリ格納先の選択ミスによるアクセス制御漏れ

**関連ファイル**: `firestore.rules`（66〜75行目）、新設計のインベントリスキーマ

#### 案A（`slimes/{slimeId}` 内配列フィールド）の問題

現在の `slimes/{slimeId}` ルールは以下のとおりである。

```
match /slimes/{slimeId} {
  allow read:  if request.auth != null;
  allow write: if false;  // Admin SDK のみ
}
```

案A でインベントリを `slimes/{slimeId}.inventory` フィールドに格納した場合、
`allow write: if false` の制約は維持しなければならない。
つまりクライアントからのインベントリ参照は read のみ許可され、
更新はすべて Admin SDK（turnProcessor）経由となる。

**案Aの問題点**:
- `slimes/{slimeId}` のドキュメント全体を読み取るルールが認証済み全員に開放されているため、
  他プレイヤーのスライムのインベントリ（食料在庫）も全公開される。
  「ゲームバランス上のスパイ行為」として悪用は軽微だが、情報設計上の問題になる。
- インベントリが大きくなると（アイテム種類 × 数量のマップ）、ドキュメントサイズが
  Firestore の 1MB 上限に近づくリスクがある（長期的なリスク）。
- フィールド単位でのロール別アクセス制御（「管理者は種族値は見るが在庫は見ない」等）が
  Firestore Rules の制約上、ドキュメント単位でしか行えないため将来の拡張性が低い。

#### 案B（`slimes/{slimeId}/inventory` サブコレクション）の問題

```
// 追加が必要なルール例
match /slimes/{slimeId}/inventory/{itemId} {
  allow read:  if request.auth != null
               && get(/databases/$(database)/documents/slimes/$(slimeId)).data.ownerUid
                  == request.auth.uid;
  allow write: if false;  // Admin SDK のみ
}
```

**案Bの利点**:
- 所有者のみ読み取り可能にできる（`get()` による ownerUid チェック）。
- ドキュメントサイズの制約を受けにくい。
- 将来的にアイテム単位の読み取り制御が可能。

**案Bの問題点**:
- Firestore Rules の `get()` による読み取りが評価ごとに1回発生し、コストが増加する。
  ただし `skills` サブコレクション（69〜74行目）と同様のパターンであり、既存設計と整合する。
- サブコレクションへのアクセスは Admin SDK でも有効なため、turnProcessor の書き込みは変更不要。

**推奨**: 案B（サブコレクション）を採用する。理由は情報の最小公開原則（他プレイヤーの在庫を公開しない）と将来の拡張性。`slimes/{slimeId}/skills/{skillId}` と同じパターンで実装できるため既存設計との整合性も高い。

---

### [SEC-H-2] eatアクションのインベントリ消費における TOCTTOU 競合

**関連ファイル**: `functions/src/scheduled/turnProcessor.ts`（394〜482行目）

#### 現在の問題

`turnProcessor.ts` の `executeReservedAction` は eat アクションで `foods` コレクションのマスタデータから食料を参照している（Phase 3 では在庫管理なし）。

Phase 4 で「eatアクションがインベントリから消費する」仕様に変更した場合、以下のフローが生じる。

```
[1] インベントリ読み取り（在庫チェック: qty > 0 を確認）
    ↕ ここに別の処理が割り込める
[2] インベントリ書き込み（qty -= 1）
```

ターンは1ワールドにつき1プロセスで処理されるが、`processSlimeTurn` は
`for (const slimeDoc of slimeDocs)` のループ内で逐次実行されるため、
同一ユーザーが複数スライムを所持する設計になった場合（Phase 6 以降）や、
テストで複数ワールドを並列実行した場合に TOCTTOU 競合が発生しうる。

また現在の `processWorldTurn` は `db().runTransaction` でワールドのステータスをアトミックに更新するが、
個々のスライム処理（バッチ書き込み）にはトランザクション保護がない。
クライアントが行動予約を通じてインベントリを間接操作する以上、
インベントリの消費操作は **Firestore トランザクションで囲む必要がある**。

#### 推奨対策

以下の2箇所でトランザクションを必須とする。

**1. eatアクションのインベントリ消費（必須）**

```
// turnProcessor.ts の executeReservedAction 内 (eat ケース)
// db.runTransaction で以下を原子的に実行:
//   a. slimes/{slimeId}/inventory/{foodId} の qty を読み取る
//   b. qty <= 0 の場合は「在庫なし」イベントとしてスキップ（エラーではない）
//   c. qty > 0 の場合は qty -= 1 を書き込み、stats/racialValues を更新する
```

**2. gather/fish/hunt による食料追加（必須）**

```
// db.runTransaction で以下を原子的に実行:
//   a. 現在の在庫合計を読み取る
//   b. 上限（例: 50個）を超える場合はドロップを減らすまたはスキップ
//   c. 上限以内なら qty += ドロップ数 を書き込む
```

---

### [SEC-H-3] battle 報酬の改ざん経路

**関連ファイル**: `netlify/functions/api.ts`（予約 CRUD API）、`turnProcessor.ts`

#### 現設計の確認

`battle_design.md` に記載された `BattleActionData` は以下のみを持つ。

```typescript
interface BattleActionData {
  targetCategory: "slime" | "plant" | "human" | "beast" | "spirit" | "fish";
  targetStrength: "weak" | "normal" | "strong";
}
```

クライアントはこのデータを `actionReservations` に書き込む（`POST /api/reservations`）。
**勝敗判定は行動予約の時点では行わない**。判定は turnProcessor が実行するターン処理時に行う。

これは正しい設計であり、クライアントから「勝った」と申告することはできない。

#### リスクが残る点

**1. `targetStrength: "strong"` の Phase 4 段階での悪用**

`battle_design.md` の Phase 4 では `weak / normal` のみ実装予定であり、
`strong` 相手は Phase 6 以降の解放とされている。
しかし `BattleActionData` の型と zod スキーマに `strong` が含まれる場合、
Phase 4 実装時点でクライアントから `targetStrength: "strong"` を送信できる。

turnProcessor が `strong` を未実装として扱う（`default: break`）か、
バリデーション層で拒否するかを明示的に設計しなければ、
未実装コードパスに意図しないリクエストが入り込む。

**2. 将来の対人戦（Phase 7 以降）における別の改ざん経路**

Phase 7 以降で対人戦（`raid` / `duel`）を実装する場合、
「相手プレイヤーのスライムIDを指定」する入力が生じる。
このとき「実際より弱いスライムIDを指定した勝利」を防ぐロジックをサーバーサイドに実装することが必須になる。
Phase 4 の段階では直接のリスクはないが、設計時に記録しておく。

**推奨対策**:
- Phase 4 では zod スキーマで `targetStrength: z.enum(["weak", "normal"])` に限定する（`strong` を除外）。
  Phase 6 着手前に `strong` を追加する設計変更を行う。
- turnProcessor の battle ハンドラは `targetStrength` が既知の値以外の場合に
  `battle_invalid` イベントを記録してスキップする防御的実装とする。

---

### [SEC-M-1] `targetStrength` 未検証による不正な報酬取得

**関連ファイル**: `netlify/functions/helpers/validation.ts`（21〜53行目）

現在の `createReservationSchema` は `battle` の `actionData` を `z.object({})` で受け入れており、
`BattleActionData` の内容を一切バリデーションしていない。

```typescript
// 現在の実装（validation.ts 34〜35行目）
// rest / battle: 空オブジェクトを許容
z.object({}),
```

Phase 4 で `BattleActionData` と `HuntActionData` を追加する際、
以下の問題が発生する入力に対して現行実装は無防備である。

| 不正入力 | リスク |
|---------|------|
| `targetCategory: "unknown"` | turnProcessor が未知のカテゴリを処理しようとしてエラーまたはスキップ |
| `targetStrength: "strong"` | Phase 4 未実装のコードパスに到達（SEC-H-3 に直結） |
| `targetCategory` を省略 | turnProcessor が undefined アクセスで例外を投げる可能性 |
| `targetStrength: 999` | 型が `string` ではなく `number` の場合に undefined ルートに入る |

**推奨 zod スキーマ（Phase 4 実装時）**:

```typescript
// BattleActionData のバリデーション
const battleActionSchema = z.object({
  targetCategory: z.enum(["beast", "plant"]),  // Phase 4 では beast/plant のみ
  targetStrength: z.enum(["weak", "normal"]),  // Phase 4 では strong 未実装のため除外
})

// HuntActionData のバリデーション
const huntActionSchema = z.object({
  targetCategory: z.enum(["beast", "plant", "fish"]),
})
```

`actionType` に応じた `actionData` の厳密な分岐は、
既存の `.refine()` パターン（現在の validation.ts 38〜52行目）を拡張して実装する。

---

### [SEC-M-2] インベントリ上限チェックと食料追加の TOCTTOU 競合

**関連ファイル**: `functions/src/scheduled/turnProcessor.ts`

gather / fish / hunt で食料を追加するとき、
「現在の在庫合計カウントの読み取り」と「食料アイテムの追加書き込み」の間に競合が生じる場合がある。

turnProcessor のターン処理は1ワールドにつき1プロセスのバッチ処理で実行されているが、
同一ターン内で同一スライムに複数のアクション（gather + gather 等）が予約されている場合、
現在の実装では `pendingReservations[0]` の1件のみ実行するため実際には発生しにくい。

ただし将来的にマルチアクション（複数アクション同時実行）を実装した場合や、
バグによって複数アクションが同一ターンに処理された場合のリスクとして記録する。

**推奨対策**:
- インベントリへの追加操作は Firestore トランザクションで原子的に実装する（SEC-H-2 と共通）。
- インベントリの上限値（スロット数・個数上限）をサーバーサイドで明示的に定義し、
  上限チェックをトランザクション内で行う。設計段階で A5/DB と上限値を合意すること。

---

### [SEC-M-3] gather/fish/hunt アクションの実行頻度制御

**関連ファイル**: `netlify/functions/helpers/validation.ts`、`firestore.rules`（80〜106行目）

現在の `actionReservations` ルールは、同一ターンに同一スライムで複数の予約を作成できるかどうかを制約していない。

```
// firestore.rules 現状（90〜101行目）
allow create: if request.auth != null
              && request.resource.data.ownerUid == request.auth.uid
              && request.resource.data.status == 'pending'
              ...
```

turnProcessor は `pendingReservations[0]` の1件のみを実行するため、
複数予約を送っても現在は最初の1件のみが処理される。
しかし、gather / hunt は「アクション実行だけで食料を入手できる」という設計上、
1ターンに10件の gather を予約して「最初の1件だけ実行する」という現行動作を悪用し、
「毎ターン大量の gather 予約を送り込んでサーバーリソースを消費させる」という DoS 的利用が成立しうる。

**推奨対策**:
- `actionReservations` ルールの `allow create` に「同一スライム・同一ターンの予約が1件以内」という制約を追加することを検討する（Firestore Rules で件数制限を行うのは困難なため、API 層でチェックする方が現実的）。
- `netlify/functions/api.ts` の予約作成エンドポイントで、同一スライム・同一ターンの既存予約件数をチェックしてから新規作成する実装を追加する。

---

### [SEC-M-4] 種族値上昇に対するサーバーサイド上限検証の欠如

**関連ファイル**: `functions/src/scheduled/turnProcessor.ts`（435〜456行目）、`shared/types/slime.ts`

現在の `executeReservedAction` の eat 処理では racialValues に `Math.max(0, ...)` の下限ガードのみ実装されており、上限ガードは存在しない。

```typescript
// 現在の実装例（turnProcessor.ts 447行目）
if (racialDeltas.fire !== undefined)
  updatedSlime.racialValues.fire = Math.max(0, updatedSlime.racialValues.fire + racialDeltas.fire)
```

battle 報酬で種族値を直接加算する実装を追加する際、
上限ガードがない場合、理論上は `racialValues.beast` が無制限に増加する。
`RacialValues` の型定義（`shared/types/slime.ts` 23〜45行目）にも上限値の定義はない。

**影響評価**:
- 現在の進化条件は `racialValues.xxx >= 0.5` という閾値チェックであり、
  0.5 を大きく超えても進化への影響は閾値判定を満たすだけで問題は少ない。
- ただし将来的に種族値が進化段階の判定（Phase 4 以降の第2進化、第3進化）や
  スキル習得確率の計算に使われる場合、無制限上昇がゲームバランスを崩壊させる。
- バグや実装ミスで1回の battle で +999 が付与されるリスクを防ぐ意味でも上限ガードは必要。

**推奨対策**:
- `shared/types/slime.ts` の `RacialValues` に上限値の定数（例: `RACIAL_VALUE_MAX = 10.0`）を定義し、
  turnProcessor の battle 報酬付与処理で `Math.min(RACIAL_VALUE_MAX, ...)` による上限クランプを必須とする。
- 上限値の具体的な数値は A1/Fun との協議で決定する。

---

### [SEC-L-1] dropTable マスタデータのクライアント可視リスク

**関連ファイル**: `firestore.rules`（116〜119行目）

```
match /foods/{foodId} {
  allow read:  if request.auth != null;
  allow write: if false;
}
```

battle / gather / hunt のドロップ確率（dropTable）が `foods` コレクションに格納される場合、
認証済みユーザー全員がこのデータを読み取れる。
「どの相手を倒せばどの食料が何%でドロップするか」が完全に公開される。

**影響評価**: ゲームバランス上の「情報の非対称性」が失われるが、
本ゲームは「まったり育成」を設計思想としており、攻略情報の公開がゲーム体験を大きく損なうかは A1/Fun の判断次第。
セキュリティ脅威としては軽微（データ改ざんは不可、読み取りのみ）。

**推奨対策**: ゲームデザインの観点で A1/Fun に判断を委ねる。もし確率を非公開にしたい場合は、dropTable を `foods` ではなく別コレクション（`dropTables`）に分離し、そちらを `allow read: if false`（Admin SDK のみ参照）とする設計変更が必要。

---

### [SEC-L-2] gather/fish の `actionData` 区別不能

**関連ファイル**: `netlify/functions/helpers/validation.ts`（34〜35行目）

gather と fish は追加データを持たない設計（`GatherActionData / FishActionData` は空オブジェクト）だが、
現在の zod スキーマは rest / battle を `z.object({})` で一括受け入れしている。

Phase 4 で `hunt` と `gather` と `fish` を追加した際、
`actionType: "gather"` に `actionData: { targetX: 0, targetY: 0 }` のような
本来 `move` 用のデータを送っても現行スキーマでは通過してしまう。
（`z.object({})` は追加プロパティを許容するため）

**推奨対策**: zod の `.strict()` または `z.object({}).strict()` を使い、
空オブジェクト型の `actionData` には余分なキーを許容しない設計にする。
`superRefine` の `actionType` 別分岐に gather / fish / hunt を明示的に追加する。

---

### [SEC-L-3] Firebase App Check 未導入（前フェーズ継続）

前フェーズ（phase_3.md の Phase 4 への申し送り事項）から継続している課題。
新しい gather / fish / hunt / battle エンドポイントも App Check 未導入の状態で実装される。
IDトークンを取得できるスクリプトであれば、これらのアクションを自動化ツールで連続実行できる。

**特にリスクが高いケース**:
- gather/fish/hunt を自動スクリプトで毎ターン大量予約 → 食料インベントリを限界まで満たし続ける
- battle アクションを自動化して種族値上昇を機械的に最大効率で実行

---

## Phase 4 実装前に必須の対応事項

### 必須対応（実装着手前）

1. **[SEC-H-2] インベントリ消費の Firestore トランザクション化**

   eat アクションでインベントリから食料を消費する処理を `db.runTransaction` で原子的に実装すること。
   在庫チェックと消費書き込みを同一トランザクション内で行い、在庫不足の場合は「在庫なし」イベントとしてスキップする設計とする。

2. **[SEC-H-3] Phase 4 スコープ外の `targetStrength: "strong"` を zod で拒否**

   `createReservationSchema` の battle アクション向けバリデーションで、
   Phase 4 実装対象外の `targetStrength: "strong"` を enum から除外する。
   Phase 6 着手前に追加する設計変更を `implementation_plan.md` に記録すること。

3. **[SEC-M-1] BattleActionData / HuntActionData の zod スキーマ実装**

   `validation.ts` に `battleActionSchema` および `huntActionSchema` を追加し、
   `createReservationSchema` の `superRefine` 分岐に battle / hunt / gather / fish を明示的に記述する。
   特に `targetCategory` の enum を Phase 4 実装対象に限定すること。

4. **[SEC-H-1] インベントリ格納先を案B（サブコレクション）に決定し、Firestore ルールに反映**

   `slimes/{slimeId}/inventory/{itemId}` ルールを追加し、
   所有者のみ読み取り可（`get()` による ownerUid チェック）、書き込みは `if false` とする。
   `skills` サブコレクション（`firestore.rules` 71〜74行目）と同じパターンで実装する。

### 推奨対応（Phase 4 実装中）

5. **[SEC-M-4] 種族値上限定数の定義**

   `shared/types/slime.ts` または `shared/constants/` に `RACIAL_VALUE_MAX` 定数を定義し、
   battle 報酬の種族値加算処理で `Math.min(RACIAL_VALUE_MAX, current + delta)` によるクランプを実装する。
   上限値の具体的な数値は A1/Fun と協議して決定する。

6. **[SEC-M-2] gather/hunt の食料追加もトランザクション化**

   インベントリ上限チェックと食料追加書き込みを同一トランザクション内で実行する。
   上限値（最大スロット数・最大個数）を A5/DB と合意の上で定数化する。

---

## 実装方針の推奨（インベントリ格納場所）

### 推奨: 案B（`slimes/{slimeId}/inventory` サブコレクション）

**根拠**:

| 観点 | 案A（ドキュメント内配列） | 案B（サブコレクション） | 推奨 |
|------|------------------------|----------------------|------|
| アクセス制御 | 認証済み全員が他プレイヤーの在庫を閲覧可能 | 所有者のみ閲覧可能（`get()` で ownerUid チェック） | **案B** |
| Firestore ルール実装 | `allow write: if false` のまま変更不要だが read が全公開 | サブコレクション追加が必要だが既存の `skills` と同パターン | **案B** |
| ドキュメントサイズ | アイテム数が増えると 1MB 上限に近づく | サブコレクションは上限なし | **案B** |
| 実装複雑度 | シンプル（フィールド追加のみ） | サブコレクション操作が必要 | 案A |
| turnProcessor 変更量 | 少ない | `slimes/{slimeId}/inventory` への操作が増える | 案A |
| 将来の拡張性 | フィールド単位の制御不可 | アイテム種別ごとの制御が可能 | **案B** |

情報の最小公開原則（他プレイヤーの在庫を公開しない）を最優先理由として案Bを推奨する。
実装上の追加コストは `skills` サブコレクションの実装パターンが既に存在するため軽微。

### インベントリの具体的スキーマ設計（A5/DB への推奨）

```
/slimes/{slimeId}/inventory/{foodId}
{
  foodId: string,     // 食料マスタ ID（例: "food-beast-001"）
  quantity: number,   // 所持数（0 以上）
  updatedAt: Timestamp
}
```

`{itemId}` はドキュメントIDとして `foodId` を使用することで、
同一食料の重複ドキュメントが生じず、トランザクションでの原子的更新が行いやすい。

---

## Phase 3 からの申し送り事項の対応状況（再確認）

| 項番 | Phase 3 申し送り内容 | Phase 4 設計段階での状況 |
|------|---------------------|------------------------|
| Phase 4 必須-1 | `POST /api/slimes/initial` TOCTTOU 修正 | **対応済** — `createInitialSlime` が `db.runTransaction` で `hasSlime` フラグを CAS 更新する実装に変更されている（`turnProcessor.ts` 695〜703行目） |
| Phase 4 必須-2 | Firebase App Check の導入 | **未対応** — 継続（SEC-L-3）。新アクション追加後はリスクが拡大するため優先度を上げることを推奨 |
| Phase 4 推奨-3 | `userStore.ts` の zod 型検証 | フロントエンドファイルは今回の調査範囲外。A4/FE で継続確認 |
| 継続-5 | Firestore Rules ユニットテスト追加 | 未対応継続。Phase 4 でインベントリルールが追加されるため、このタイミングで整備することを強く推奨 |
| 継続-6 | Auth Trigger 失敗時の Cloud Logging アラート設定 | 未対応継続 |

---

## 総合評価

**Phase 4 実装着手: 条件付き承認**

条件:
1. SEC-H-2（eatアクション インベントリ消費のトランザクション化）の実装を必須とする
2. SEC-H-3（`targetStrength: "strong"` の Phase 4 zod スキーマからの除外）を実装前に確定する
3. SEC-M-1（BattleActionData / HuntActionData の zod スキーマ実装）を validation.ts に追加する
4. SEC-H-1（インベントリを案B のサブコレクションで設計）に基づき `firestore.rules` を更新する

承認根拠:
- battle の勝敗判定と報酬付与はサーバーサイド（turnProcessor）のみで行われる設計であり、
  クライアントから勝利を不正申告できる経路は現設計には存在しない（SEC-H-3 は設計確認済み）。
- dropTable マスタデータは Firestore の `foods` コレクションに格納され、
  `allow write: if false` により改ざんは不可能。
- インベントリ格納先として案Bを採用することで、他プレイヤーの在庫情報の漏洩を防げる。

懸念事項:
- Firebase App Check が引き続き未導入であり、自動化ツールによる gather/hunt の繰り返し実行が可能な状態。Phase 5 着手前までに導入することを強く推奨する。
- 種族値の上限定数が未定義であり、battle 報酬実装時に上限ガードが漏れるリスクがある。Phase 4 実装前に A1/Fun と協議して定数化する。

以上。A1/Fun レビューへの引き渡しは上記4条件が確認されてから行う。
