# Phase 8: タイル属性育成システム 設計書

**設計日**: 2026-03-22
**決定者**: ユーザー承認済み
**チームレビュー**: A1/Fun・A2/Sec・A3/BE・A5/DB

---

## 1. 概要と設計方針

### 目的

プレイヤーが自分のマップのタイル属性（fire/water/earth/wind）を能動的に変化させられる仕組みを導入する。

### 採用メカニズム

| メカニズム | 内容 |
|-----------|------|
| **案B: `plant` アクション** | スライムがインベントリの食料をタイルに「植える」。食料カテゴリに応じた属性が変化する |
| **案C: 季節自動変化** | `processWorldTurn()` で季節ごとにすべてのタイル属性が微量変化する |

### プレイヤー体験の核心

```
季節（自動）でタイルが少しずつ汚染される
  ↓
plant（能動）で望む属性を強化 / 不要な属性を削る
  ↓
「マップを季節と格闘しながら育てる」長期戦略
```

- **属性は各々独立して 0.0〜1.0**（合計の正規化なし）
- **food の `tileAttributeDelta` は −1.0〜+1.0** の範囲で定義
  - 正の値: 属性を強化（通常の植え付け）
  - 負の値: 属性を弱化（不要な属性を「浄化」する用途）

---

## 2. plant アクション仕様

### ActionType 追加

```typescript
// shared/types/action.ts
export type ActionType =
  | "eat" | "move" | "rest" | "battle" | "gather"
  | "fish" | "hunt" | "merge"
  | "plant"   // ← 追加

export interface PlantActionData {
  foodId: string   // 消費する食料ID（インベントリから1個消費）
  // タイル座標はスライムの現在地（tileX/tileY）を使用
  // gather/fish と同じく「現在いるタイルに作用する」
}
```

### ターン処理ロジック（turnProcessor.ts）

```
case 'plant':
  1. スライムのインベントリに foodId が存在するか確認
     → なければ plant_fail { reason: 'food_not_found' }
  2. food.tileAttributeDelta を参照
     → tileAttributeDelta がないか全ゼロであれば plant_fail { reason: 'no_tile_effect' }
  3. スライム現在タイルを worldTiles から検索
     → タイルが見つからなければ plant_fail { reason: 'tile_not_found' }
  4. インベントリから食料を1個消費（removeFromInventory）
  5. tileAttributeDelta の各属性を現在値に加算し clamp(0, 1.0)
  6. batch.update(tileRef, { 'attributes.fire': newFire, ... }) で更新
  7. plant_success イベント記録
```

### コスト・報酬

| 項目 | 値 |
|------|---|
| インベントリ消費 | food 1個 |
| hunger 消費 | なし（gather と同じ扱い） |
| EXP 獲得 | なし（土地改良はスライム成長とは別軸） |

---

## 3. 食料 → タイル属性 デルタ マッピング

### `Food` 型への追加（shared/types/food.ts）

```typescript
export interface Food {
  // 既存フィールド...
  /** タイルに植えたときの属性変化量。未定義の食料は plant 不可 */
  tileAttributeDelta?: Partial<TileAttributes>   // 各値 -1.0〜+1.0
}
```

### 初期マッピング案（foods.ts への追加）

| 食料カテゴリ | 代表食料 | tileAttributeDelta |
|------------|---------|-------------------|
| `beast` | 獣の肉・魔獣の心臓 | `{ fire: +0.05 }` |
| `fish` | 川魚・深海魚 | `{ water: +0.05 }` |
| `plant` | 野草・薬草・フルーツ・キノコ | `{ earth: +0.05 }` |
| `spirit` | 精霊の涙・精霊の欠片 | `{ wind: +0.05 }` |
| `human` | 人間系食料 | `{ fire: +0.01, water: +0.01, earth: +0.01, wind: +0.01 }` |
| `slime` | スライムのかけら類 | なし（plant 不可） |

### 浄化用アイテム（新規追加・Phase 8 W2）

属性を**下げる**ことに特化した食料を新規追加。
各属性につき1種（計4種）。

| 食料ID | 名称（案） | tileAttributeDelta |
|--------|----------|-------------------|
| `food-purify-fire` | 消炎草 | `{ fire: -0.08 }` |
| `food-purify-water` | 乾燥砂 | `{ water: -0.08 }` |
| `food-purify-earth` | 溶岩石 | `{ earth: -0.08 }` |
| `food-purify-wind` | 重石 | `{ wind: -0.08 }` |

浄化食料の入手方法: hunt / battle のドロップテーブルに低確率追加。

---

## 4. 季節自動変化（案C）仕様

### processWorldTurn() への追加

```typescript
// 季節ごとの属性ブースト（全タイルに一律適用）
const SEASON_TILE_DELTA_PER_TURN: Record<string, Partial<TileAttributes>> = {
  spring: { water: +0.005 },
  summer: { fire:  +0.005 },
  autumn: { wind:  +0.005 },
  winter: { earth: +0.005 },
}
```

**選定根拠（+0.005/ターン）:**
- SEASON_DURATION_TURNS = 120 のとき: +0.005 × 120 = +0.6 / season
- 春だけ放置すると water が 0 → 0.6（1.0には届かない）
- プレイヤーが1〜2回 plant(earth) すれば打ち消せる程度の「緩やかな汚染」
- `currentVal + 0.005` は clamp(0, 1.0) で上限保証

### タイル更新処理

```typescript
// processWorldTurn の季節処理ブロック
async function applySeasonTileChanges(
  world: World,
  batch: FirebaseFirestore.WriteBatch
): Promise<void> {
  const delta = SEASON_TILE_DELTA_PER_TURN[world.season ?? 'spring']
  if (!delta) return

  // 全タイルをバルク取得（mapId 単位）
  const tilesSnap = await db().collection('tiles')
    .where('mapId', '==', world.mapId)  // または全ワールドのmapIdリスト
    .get()

  for (const doc of tilesSnap.docs) {
    const tile = doc.data() as Tile
    const updates: Record<string, number> = {}
    for (const [attr, d] of Object.entries(delta)) {
      const current = tile.attributes[attr as keyof TileAttributes] ?? 0
      updates[`attributes.${attr}`] = clamp(current + (d as number), 0, 1.0)
    }
    batch.update(doc.ref, updates)
  }
}
```

### ターンログ記録

```typescript
// 季節変化ログ（既存 season_change に追記）
{
  eventType: 'season_tile_change',
  actorType: 'world',
  eventData: { season: 'spring', attribute: 'water', delta: 0.005, tilesAffected: 100 }
}
```

---

## 5. データモデル変更

### 5-1. `/tiles/` 統一（最重要・A5/DB 推奨）

**現状の問題:**
- `/tiles/{tileId}`: turnProcessor が使用（top-level）
- `/maps/{mapId}/tiles/{tileId}`: フロントエンドが使用（subcollection）
- plant アクションと季節変化でタイルを更新する際、**両パスを更新しないと不整合が起きる**

**対応方針: `/tiles/` に統一する**

```
変更前:
  /tiles/{tileId}              ← turnProcessor 読み取り（Admin SDK）
  /maps/{mapId}/tiles/{tileId} ← フロントエンド読み取り

変更後:
  /tiles/{tileId}              ← turnProcessor・フロントエンド 両方が読む
```

**影響ファイル:**

| ファイル | 変更内容 |
|---------|---------|
| `firestore.rules` | `/tiles/{tileId}` に認証済み読み取り許可を追加。`/maps/{mapId}/tiles/{tileId}` ルールは削除 |
| `firestore.indexes.json` | `/tiles` への `mapId + x` / `mapId + y` 複合インデックス追加 |
| `frontend/src/components/world/WorldMapPanel.tsx` | `collection(db, 'maps', mapId, 'tiles')` → `query(collection(db, 'tiles'), where('mapId', '==', mapId))` |
| `frontend/src/components/reservations/ActionReservationForm.tsx` | 同上 |
| `functions/src/scripts/seed.ts` | `/maps/map-001/tiles/` への書き込みを削除、`/tiles/` のみに統一 |
| `functions/src/triggers/authTrigger.ts` | `/maps/{mapId}/tiles/` → `/tiles/` に変更 |
| `netlify/functions/api.ts` | タイル参照箇所を確認・修正 |

### 5-2. Tile 型拡張（shared/types/map.ts）

```typescript
export interface Tile {
  id: string
  mapId: string
  x: number
  y: number
  attributes: TileAttributes
  /** 初期生成時の属性値（不変。リセット・差分表示用） */
  baseAttributes: TileAttributes   // ← 追加
}
```

`baseAttributes` は seed.ts / authTrigger.ts の初期書き込み時に `attributes` と同値でセット。
以後 plant / 季節変化では `baseAttributes` を変更しない。

### 5-3. Food 型拡張（shared/types/food.ts）

```typescript
export interface Food {
  // 既存フィールドはそのまま
  tileAttributeDelta?: Partial<TileAttributes>  // ← 追加（未定義なら plant 不可）
}
```

### 5-4. Firestore インデックス追加（firestore.indexes.json）

```json
{
  "collectionGroup": "tiles",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "mapId", "order": "ASCENDING" },
    { "fieldPath": "x",     "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "tiles",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "mapId", "order": "ASCENDING" },
    { "fieldPath": "y",     "order": "ASCENDING" }
  ]
},
{
  "collectionGroup": "tiles",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "mapId", "order": "ASCENDING" },
    { "fieldPath": "x",     "order": "ASCENDING" },
    { "fieldPath": "y",     "order": "ASCENDING" }
  ]
}
```

### 5-5. TurnEventType 追加（shared/types/turnLog.ts）

```typescript
| 'plant_success'      // 食料を植えてタイル属性変化
| 'plant_fail'         // 食料なし / タイルなし / tile_effect なし
| 'season_tile_change' // 季節によるタイル自動変化
```

### 5-6. 定数追加（shared/constants/game.ts）

```typescript
/** plant アクション: 食料の tileAttributeDelta の上限 */
export const TILE_DELTA_MAX = 1.0
export const TILE_DELTA_MIN = -1.0

/** 季節自動変化: 1ターンあたりのタイル属性変化量 */
export const SEASON_TILE_DELTA_PER_TURN = 0.005
```

---

## 6. セキュリティ設計（A2/Sec 承認事項）

| 優先度 | 対策 | 実装箇所 |
|--------|------|---------|
| **MUST-1** | 属性値 clamp(0, 1.0) を Admin SDK 層で保証（API 層でも二重バリデーション） | turnProcessor.ts + validation.ts |
| **MUST-2** | スライムのオーナー確認（slime.ownerUid == request.auth.uid）は既存予約APIで保証済み | api.ts（既存） |
| **MUST-3** | plant の食料存在確認（インベントリにない food を plant 不可） | turnProcessor.ts |
| **MUST-4** | Firestore ルールは現状維持（`allow write: if false`）。Admin SDK 経由のみ書き込み可 | firestore.rules |
| **MEDIUM** | plant_fail / plant_success のターンログ記録（異常検知の材料） | turnProcessor.ts |

**Firestore ルール変更（最小限）:**

```diff
// firestore.rules
- match /maps/{mapId}/tiles/{tileId} {
-   allow read: if request.auth != null
-               && get(...maps/$(mapId)).data.ownerUid == request.auth.uid;
-   allow write: if false;
- }

+ match /tiles/{tileId} {
+   allow read: if request.auth != null;  // 認証済み全員読み取り可
+   allow write: if false;                // Admin SDK のみ
+ }
```

---

## 7. フロントエンド UI 設計

### ActionReservationForm への追加

```tsx
{actionType === 'plant' && (
  <div className="flex flex-col gap-2 text-xs bg-green-50 ...">
    <p>食料をタイルに植えて属性を変化させます。</p>
    {/* 植えられる食料のみ表示（tileAttributeDelta が定義された食料） */}
    <div className="grid grid-cols-4 gap-1.5">
      {plantableFoods.map((f) => (
        <button key={f.id} onClick={() => setFoodId(f.id)}>
          <img src={f.imageUrl} />
          {Object.entries(f.tileAttributeDelta).map(([k, v]) => (
            <span className={v > 0 ? 'text-green-600' : 'text-red-500'}>
              {ATTR_ICONS[k]}{v > 0 ? '+' : ''}{(v * 100).toFixed(0)}%
            </span>
          ))}
        </button>
      ))}
    </div>
    {/* 現在タイルの属性値表示（ActionReservationForm の既存 currentTile を流用） */}
    {currentTile && <TileAttributeBar attrs={currentTile.attributes} />}
  </div>
)}
```

### MapSettingsPage の属性ゲージ（既存画面を活用）

- タイル属性の現在値と `baseAttributes` の差分を表示（「初期値から +0.3」など）
- 季節ボーナスの「次ターン予測」を表示

---

## 8. 実装ロードマップ

### Week 1: データ基盤 + /tiles/ 統一

- [ ] `shared/types/` 拡張（Tile に baseAttributes、Food に tileAttributeDelta、ActionType に plant）
- [ ] `shared/constants/game.ts` 定数追加
- [ ] `firestore.rules` 更新（/tiles/ 認証済み読み取り許可・/maps/{mapId}/tiles/ 削除）
- [ ] `firestore.indexes.json` インデックス3件追加
- [ ] `seed.ts` 更新（/maps/map-001/tiles/ 廃止・baseAttributes 追加）
- [ ] `authTrigger.ts` 更新（/maps/{mapId}/tiles/ → /tiles/、baseAttributes 追加）
- [ ] フロントエンドの Firestore 読み取りパス変更（WorldMapPanel・ActionReservationForm）

### Week 2: plant アクション実装（TDD）

- [ ] `tests/unit/plantAction.test.ts` 先行作成（8件）
  - 通常植え付け（fire beast 食料 → fire +0.05）
  - 浄化植え付け（fire purify → fire -0.08）
  - インベントリに食料なし → plant_fail
  - tileAttributeDelta 未定義食料 → plant_fail
  - 上限クランプ（属性が 0.95 のとき +0.1 → 1.0）
  - 下限クランプ（属性が 0.05 のとき -0.1 → 0.0）
  - 複数属性変化（human food で fire/water/earth/wind 各 +0.01）
  - タイルが見つからない → plant_fail
- [ ] `validation.ts`: plant アクションの zod スキーマ追加
- [ ] `foods.ts`: 既存食料に `tileAttributeDelta` を追加
- [ ] `foods.ts`: 浄化食料 4種（food-purify-fire/water/earth/wind）追加
- [ ] `dropTable.ts`: 浄化食料を hunt/battle ドロップに低確率追加
- [ ] `turnProcessor.ts`: plant ハンドラ実装

### Week 3: 季節自動変化 + フロントエンド UI

- [ ] `turnProcessor.ts`: `applySeasonTileChanges()` 実装
- [ ] `tests/unit/seasonTileChange.test.ts`: 季節ごとの属性変化テスト（6件）
- [ ] `ActionReservationForm.tsx`: plant アクション UI 追加
- [ ] `MapSettingsPage.tsx`: baseAttributes との差分表示・次ターン予測追加

### Week 4: レビュー・統合テスト

- [ ] `tests/integration/tileAttributeFlow.test.ts`: plant → タイル属性確認 → gather 確率変化の一連フロー
- [ ] A7/QA レビュー → `docs/qa_review/phase_8.md`
- [ ] A2/Sec レビュー → `docs/security_review/phase_8.md`
- [ ] A1/Fun レビュー → `docs/fun_review/phase_8.md`

---

## 9. パラメータ一覧

| 定数 | 値 | 根拠 |
|------|---|------|
| `SEASON_TILE_DELTA_PER_TURN` | 0.005 | 120ターン(5日)で +0.6。1.0に届かずプレイヤー介入の余地あり |
| beast食料 tileAttributeDelta.fire | +0.05 | 20回植えると +1.0。週1回(7日)程度の集中育成で達成 |
| 浄化食料 tileAttributeDelta | -0.08 | 春5日間の自動増分(+0.6)を 8〜9回の浄化で打ち消せる |
| plant hunger消費 | 0 | 食料を消費する点でコストは十分 |
