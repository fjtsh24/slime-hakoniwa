# Phase 6 Week 2 ゲームデザイン設計書

**作成**: A1/Fun（ゲームデザイン担当）
**対象フェーズ**: Phase 6 Week 2 — ソーシャル拡張・野生スライム・ワールドイベント
**前提**: Phase 6 Week 1（公開API・図鑑・プロフィールページ）完了済み

---

## 1. ワールドイベントシステム設計

### 1.1 設計方針

ワールドイベントは「プレイヤーが毎日ログインしたくなる外部刺激」として機能させる。イベントはゲームの流れを変えるが、壊滅的なダメージを与えない「チャンス増幅型」を基本方針とする。

- **天候イベント**: gather/fish/hunt の成功率・ドロップ量を変動させる（プラスマイナス両方）
- **季節イベント**: 進化条件に関わる種族値の蓄積スピードを変動させる（長期的な戦略変化）
- **特別イベント**: 稀に発生し、ログを賑わせてプレイヤーの会話の種になる

### 1.2 イベント種類定義

#### 天候イベント（Weather）

| id | 名前 | 効果 | 発生確率（毎ターン） | 継続ターン数 |
|----|------|------|------------------|------------|
| `weather-sunny` | 快晴 | gather成功率 +20%、hunt成功率 +10% | 35% | 6〜12ターン（6〜12時間） |
| `weather-rainy` | 大雨 | fish成功率 +30%、gather成功率 -20%、hunt成功率 -10% | 25% | 4〜8ターン |
| `weather-storm` | 嵐 | gather/hunt成功率 -30%、スライムhunger消費 +3（1ターンで-8相当） | 10% | 2〜4ターン |
| `weather-foggy` | 濃霧 | 全アクション成功率 -10%、battle/hunt対象に `spirit` 系が出現しやすくなる（遭遇確率2倍） | 15% | 3〜6ターン |
| `weather-clear` | 穏やか（デフォルト） | 効果なし | 15% | 常時（他イベントがない場合） |

**重要**: 嵐中でも hunger がゼロになることはなく、単に減りが速くなるだけ。プレイヤーへのペナルティは「機会損失」止まりとする（A1方針: 破壊的ペナルティは採用しない）。

#### 季節イベント（Season）

1ワールド = 120ターン（約5日）を1季節とする。進行は固定順。

| 季節 | 継続ターン数 | 主な効果 |
|------|-----------|---------|
| 春（Spring） | 120ターン | plant系食料のdrop量 +25%、スライムの分裂確率 +5%（checkSplit） |
| 夏（Summer） | 120ターン | beast系hunt成功率 +15%、全スライムのhunger消費 +2（活発） |
| 秋（Autumn） | 120ターン | gather成功率 +20%（実りの秋）、EXP獲得量 +10% |
| 冬（Winter） | 120ターン | fish系食料のdrop量 +20%（冬の海）、gather成功率 -15%、hunger消費 +3（寒さ） |

季節は `worlds/{worldId}` の `season` フィールドで管理し、120ターン経過ごとに `turnProcessor.ts` が自動更新する。

#### 特別イベント（Special）

| id | 名前 | 発生条件 | 効果 | 継続 |
|----|------|---------|------|------|
| `event-meteor` | 流星群 | 30ターンに1回・15%の確率 | spirit系遭遇率 3倍、spirit系dropから稀少食料 | 1ターン |
| `event-harvest` | 豊穣祭 | 春の終わりターン（120の倍数-5ターン以内）に30%の確率 | gather/fishドロップ量 2倍 | 3ターン |
| `event-heatwave` | 熱波 | 夏の50ターン目以降に20%の確率 | fire系タイルでのATK+種族値上昇 +50%加速 | 2ターン |

### 1.3 Firestoreデータ構造

#### `worlds/{worldId}` フィールド追加

```
weather: string              // 現在の天候ID（例: "weather-rainy"）
weatherEndsAtTurn: number    // この天候が終了するターン番号
season: "spring" | "summer" | "autumn" | "winter"
seasonStartTurn: number      // 現在の季節が始まったターン番号
activeSpecialEvent?: string  // 特別イベントID（null = なし）
specialEventEndsAtTurn?: number
```

#### `turnLogs/{logId}` — ワールドイベントログ

既存のスキーマ（Phase 4で設計済み）をそのまま活用:

```
slimeId: null
actorType: "world"
eventType: "weather_change" | "season_change" | "item_spawn"
eventData: {
  from?: string          // 前の天候/季節
  to: string             // 新しい天候/季節
  effectSummary: string  // "大雨: fish成功率+30%、gather成功率-20%"
}
turnNumber: number
worldId: string
```

**イベントログは既存の `WorldLogPanel` がそのまま表示できる**（`actorType: 'world'` のスタイル対応済み）。

### 1.4 turnProcessor.ts への組み込み

各ターン開始時に以下の順序で処理:

1. `checkWeatherTransition(world)` — 天候終了ターンを過ぎていたら新天候を抽選
2. `checkSeasonTransition(world)` — 120ターン経過で次の季節へ
3. `checkSpecialEvent(world)` — 特別イベント発生判定
4. ワールド状態の変化があれば `turnLogs` に `actorType: 'world'` で記録
5. 以降は既存のスライム処理（この時点で `world.weather` / `world.season` を参照して成功率補正をかける）

---

## 2. spirit / slime モンスター設計

### 2.1 設計方針

Phase 6 Week 2 では `"strong"` 強度の zodスキーマ解放も行う。spirit/slime 両カテゴリで weak/normal/strong を揃え、ゲーム後半の目標になるよう設計する。

**バランス原則**:
- `weak` (power=10): 基本種スライム（hp=50, atk=10, spd=10）でほぼ確実に勝てる
- `normal` (power=30): 第1進化スライム（atk=20〜25相当）で5〜6割の勝率
- `strong` (power=70): 第2進化スライム（atk=30〜35相当）でようやく拮抗

勝敗式: `(slime.stats.atk + Math.random() * slime.stats.spd * 0.5) > monsterPower`

### 2.2 spirit 系モンスター

スライムの霊体・精霊・アンデッドが「spirit 系」。**濃霧・流星群イベント中に出現率が増加**するのが特徴。

| id | 名前 | 強度 | power | 特徴 | dropTableId |
|----|------|------|-------|------|------------|
| `monster-spirit-weak-001` | さまよう光 | weak | 10 | 光の球が浮かぶだけの弱い霊体 | `drop-spirit-weak` |
| `monster-spirit-weak-002` | ちびポルターガイスト | weak | 10 | 物を動かすのが好きな小さな霊 | `drop-spirit-weak` |
| `monster-spirit-weak-003` | 迷子の魂 | weak | 10 | 成仏できずにさまよう魂 | `drop-spirit-weak` |
| `monster-spirit-normal-001` | 幽鬼の剣士 | normal | 30 | かつては腕利きの剣士だった幽霊 | `drop-spirit-normal` |
| `monster-spirit-normal-002` | 精霊の守護者 | normal | 30 | 古い森の精霊。侵入者を試練で試す | `drop-spirit-normal` |
| `monster-spirit-normal-003` | 怨念の塊 | normal | 30 | 強い怨念が凝縮した霊体 | `drop-spirit-normal` |
| `monster-spirit-strong-001` | 大霊魔 | strong | 70 | 数千年をかけて力を蓄えた上位霊体 | `drop-spirit-strong` |
| `monster-spirit-strong-002` | 霊王フォルサン | strong | 70 | 滅びた王国の王が霊体として復活 | `drop-spirit-strong` |
| `monster-spirit-strong-003` | 混沌の精霊 | strong | 70 | 属性の境界が崩れた場所に生まれる存在 | `drop-spirit-strong` |

**spirit 系ドロップ食料の方向性**:
- weak: 「霊魂の欠片」「精霊の露」（spirit種族値 +0.02）
- normal: 「幻想果」「魂の結晶」（spirit種族値 +0.05）
- strong: 「大霊魂珠」「精霊王の加護」（spirit種族値 +0.1 + ATK系stat bonus）

### 2.3 slime 系モンスター

野生のスライム形態をした敵。静的マスタ（wildMonsters.ts）から生成する方式を採用。

| id | 名前 | 強度 | power | 特徴 | dropTableId |
|----|------|------|-------|------|------------|
| `monster-slime-weak-001` | ちびスライム | weak | 10 | 最も基本的な野生スライム | `drop-slime-weak` |
| `monster-slime-weak-002` | プチゼリー | weak | 10 | ゼリー状の半透明スライム | `drop-slime-weak` |
| `monster-slime-weak-003` | ヌメスライム | weak | 10 | 粘液を撒き散らすスライム | `drop-slime-weak` |
| `monster-slime-normal-001` | 分裂スライム | normal | 30 | 体を分裂させて数で圧倒するスライム | `drop-slime-normal` |
| `monster-slime-normal-002` | 溶解スライム | normal | 30 | 強力な溶解液を持つ緑色のスライム | `drop-slime-normal` |
| `monster-slime-normal-003` | 磁力スライム | normal | 30 | 磁力を操るスライム | `drop-slime-normal` |
| `monster-slime-strong-001` | 古代スライム | strong | 70 | 何千年も生き続けた原始スライム | `drop-slime-strong` |
| `monster-slime-strong-002` | スライムキング | strong | 70 | 多数のスライムを統率する王 | `drop-slime-strong` |
| `monster-slime-strong-003` | 無限再生体 | strong | 70 | どんなダメージも再生するスライム | `drop-slime-strong` |

**slime 系ドロップ食料の方向性**:
- weak: 「スライムコア（小）」「スライムゼリー」（slime種族値 +0.02）
- normal: 「スライムコア」「上位ゼリー塊」（slime種族値 +0.05）
- strong: 「原始スライムコア」「王の核」（slime種族値 +0.1 + 全stat bonus）

### 2.4 既存 fish/human モンスターとのバランス比較

| カテゴリ | weak power | normal power | strong power | 基本種スライムvs weak 勝率目安 |
|---------|-----------|-------------|-------------|-------------------------------|
| beast/plant/fish/human | 10 | 30 | — | 約75% |
| spirit（新規） | 10 | 30 | 70 | weak: 約75%、strong: 約20% |
| slime（新規） | 10 | 30 | 70 | weak: 約75%、strong: 約20% |

**strong 追加の理由**: 第2進化スライム（atk=30〜40）の長期育成目標として機能させる。

---

## 3. 野生スライムAI行動拡張

### 3.1 天候イベント時のAI変更

`worlds/{worldId}.weather` を `processSlimeTurn` 時に参照し、`isWild: true` のスライムに行動バイアスをかける:

| 天候 | AI変更内容 |
|------|----------|
| `weather-rainy` 大雨 | 水タイルへの移動を優先する確率 +50% |
| `weather-storm` 嵐 | 待機行動を選択する確率 70% |
| `weather-foggy` 濃霧 | 移動先を 20% の確率でランダムに±1ずらす |
| `weather-sunny` 快晴 | 2マス移動の確率 +20% |

### 3.2 季節に応じた行動パターン

| 季節 | AI行動変化 |
|------|----------|
| 春 | 分裂確率 +5%、earth属性タイルに引き寄せられる |
| 夏 | hunger 40以上でも歩き回る（活発化） |
| 秋 | 満腹でなくても gather を試みる頻度が増加 |
| 冬 | hunger 60以上でも休息優先、水タイルを避ける |

**実装方針**: `executeAutonomousAction(slime, world)` の引数に `world` を追加し、既存インターフェースへの変更を最小限に留める。

---

## 4. バランス試算・注意事項

### hunger 消費バランス（天候影響後）

| 状況 | hunger消費/ターン |
|------|----------------|
| 通常 | -5 |
| 嵐 | -8（通常 -5 + イベント補正 -3） |
| 冬 | -8（通常 -5 + 季節補正 -3） |
| 冬の嵐（最悪ケース） | -11 |

hunger=100 から換算すると、冬の嵐でも約9ターン（約9時間）は行動可能。**「1日1アクセス」でスライムが死なないこと**を設計方針として維持する。

### strong モンスター追加のリスク

戦闘不能になった場合、2ターン行動停止が発生する。フロントエンドでの「ステータス不足警告」（Phase 4 実装済み）を `strong` にも適用することを A4/FE に要請する。

---

## 5. 実装優先順位

1. **[最優先]** `worlds/{worldId}` スキーマ拡張（A5/DB）— weather/season フィールド追加
2. **[最優先]** spirit/slime モンスターマスタデータ追加（A3/BE）— `wildMonsters.ts` への追記
3. **[高優先]** ワールドイベント処理（A3/BE）— `turnProcessor.ts` への天候・季節処理追加
4. **[高優先]** battle zodスキーマ解放（A3/BE・A2/Sec確認）— `"strong"` 強度の追加
5. **[中優先]** `/players/:handle/map` ページ（A4/FE・A5/DB協議後）

---

*設計者: A1/Fun — 2026-03-22*
