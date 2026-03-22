// 使用方法: FIRESTORE_EMULATOR_HOST=localhost:8080 ts-node src/scripts/seed.ts
// 本番環境では絶対に実行しないこと

import * as admin from "firebase-admin";
import { foods as masterFoods } from "../../../shared/data/foods";

// Firebase Admin SDK の初期化
// エミュレータ環境では credential は不要
admin.initializeApp({
  projectId: "slime-sim-prototype",
});

const db = admin.firestore();

/**
 * ランダムなノイズ値（0〜0.25）を生成する
 */
function randomNoise(): number {
  return Math.round(Math.random() * 0.25 * 100) / 100;
}

/**
 * バイオームゾーンに基づいてタイル属性を生成する
 *
 * ゾーン分割（10×10マップ）:
 *   左上 (x<5, y<5): fire 優勢（溶岩台地）
 *   右上 (x>=5, y<5): wind 優勢（高原）
 *   左下 (x<5, y>=5): water 優勢（湿地・川）
 *   右下 (x>=5, y>=5): earth 優勢（森林）
 *
 * 境界付近はノイズが多く混合する。
 */
function generateTileAttributes(x: number, y: number): {
  fire: number; water: number; earth: number; wind: number;
} {
  // ゾーン中心からの距離で支配属性を決定
  const isTop = y < 5;
  const isLeft = x < 5;

  // 各ゾーンの支配属性
  const dominant: 'fire' | 'water' | 'earth' | 'wind' =
    isLeft && isTop ? 'fire' :
    !isLeft && isTop ? 'wind' :
    isLeft && !isTop ? 'water' :
    'earth';

  // 境界からの距離（0=境界, 4=中心）
  const distX = isLeft ? 4 - x : x - 5;
  const distY = isTop ? 4 - y : y - 5;
  const borderFactor = Math.min(distX, distY); // 0~4

  // 支配属性値: 境界では低め(0.4~0.6)、中心では高め(0.6~0.9)
  const dominantBase = 0.4 + borderFactor * 0.1;
  const dominantValue = Math.min(0.99, dominantBase + randomNoise());

  // 非支配属性値: 低め(0~0.25)にノイズ
  const attrs = {
    fire: randomNoise(),
    water: randomNoise(),
    earth: randomNoise(),
    wind: randomNoise(),
  };
  attrs[dominant] = Math.round(dominantValue * 100) / 100;

  return attrs;
}

/**
 * デフォルトの種族値（全て 0）を返す
 */
function defaultRacialValues() {
  return {
    fire: 0,
    water: 0,
    earth: 0,
    wind: 0,
    slime: 0,
    plant: 0,
    human: 0,
    beast: 0,
    spirit: 0,
    fish: 0,
  };
}

async function seed(): Promise<void> {
  console.log("シードデータの投入を開始します...");

  // ===== 0. Auth Emulator にテストユーザーを作成 =====
  try {
    await admin.auth().createUser({
      uid: "test-user-001",
      email: "test@slime.local",
      password: "test1234",
      displayName: "テストユーザー",
    });
    console.log("Auth Emulator にテストユーザーを作成しました: test@slime.local / test1234");
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "auth/uid-already-exists" || code === "auth/email-already-exists") {
      console.log("テストユーザーは既に存在します（スキップ）");
    } else {
      throw e;
    }
  }

  const now = new Date();
  const oneHourLater = new Date(now.getTime() + 3600 * 1000);

  // ===== 1. ワールド =====
  const worldRef = db.collection("worlds").doc("world-001");
  await worldRef.set({
    id: "world-001",
    name: "テストワールド",
    currentTurn: 0,
    nextTurnAt: admin.firestore.Timestamp.fromDate(oneHourLater),
    turnIntervalSec: 3600,
    createdAt: admin.firestore.Timestamp.fromDate(now),
  });
  console.log("ワールドを作成しました: world-001");

  // ===== 2. マップ =====
  const mapRef = db.collection("maps").doc("map-001");
  await mapRef.set({
    id: "map-001",
    worldId: "world-001",
    ownerUid: "test-user-001",
    name: "テストユーザーのマップ",
    width: 10,
    height: 10,
    createdAt: admin.firestore.Timestamp.fromDate(now),
  });
  console.log("マップを作成しました: map-001");

  // ===== 3. タイル（10×10 = 100件） =====
  // 注意: turnProcessor は /tiles/{id} (top-level) を読む
  //       フロントエンドは maps/{mapId}/tiles/{id} (subcollection) を読む
  //       開発用シードでは両パスに書き込む
  console.log("タイルを作成中...");
  const tileBatch = db.batch();
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const tileId = `map-001-tile-${x}-${y}`;
      const attrs = generateTileAttributes(x, y);
      const tileData = {
        id: tileId,
        mapId: "map-001",
        x,
        y,
        attributes: attrs,
      };
      // top-level（turnProcessor 用）
      tileBatch.set(db.collection("tiles").doc(tileId), tileData);
      // subcollection（フロントエンド用）
      tileBatch.set(
        db.collection("maps").doc("map-001").collection("tiles").doc(tileId),
        tileData
      );
    }
  }
  await tileBatch.commit();
  console.log("タイルを100件作成しました（/tiles/ および maps/map-001/tiles/ の両パス）");

  // ===== 4. テストスライム 3件（ownerUid: "test-user-001"） =====
  const slimesBatch = db.batch();

  const testSlimes = [
    {
      id: "slime-test-001",
      name: "ムコ",
      tileX: 2,
      tileY: 3,
      stats: { hp: 50, atk: 10, def: 10, spd: 10, exp: 0, hunger: 80 },
    },
    {
      id: "slime-test-002",
      name: "プル",
      tileX: 5,
      tileY: 5,
      stats: { hp: 50, atk: 10, def: 10, spd: 10, exp: 0, hunger: 75 },
    },
    {
      id: "slime-test-003",
      name: "ゴロ",
      tileX: 7,
      tileY: 1,
      stats: { hp: 50, atk: 10, def: 10, spd: 10, exp: 0, hunger: 90 },
    },
  ];

  for (const s of testSlimes) {
    const ref = db.collection("slimes").doc(s.id);
    slimesBatch.set(ref, {
      id: s.id,
      ownerUid: "test-user-001",
      mapId: "map-001",
      worldId: "world-001",
      speciesId: "slime-001",
      tileX: s.tileX,
      tileY: s.tileY,
      name: s.name,
      stats: s.stats,
      racialValues: defaultRacialValues(),
      inventory: [
        { foodId: "food-plant-001", quantity: 3 },
        { foodId: "food-fish-001", quantity: 2 },
      ],
      isWild: false,
      createdAt: admin.firestore.Timestamp.fromDate(now),
      updatedAt: admin.firestore.Timestamp.fromDate(now),
    });
  }
  console.log("テストスライム3件を作成します...");

  // ===== 5. 野生スライム 2件 =====
  const wildSlimes = [
    {
      id: "slime-wild-001",
      name: "野生スライムA",
      tileX: 0,
      tileY: 0,
      stats: { hp: 30, atk: 8, def: 8, spd: 8, exp: 0, hunger: 60 },
    },
    {
      id: "slime-wild-002",
      name: "野生スライムB",
      tileX: 9,
      tileY: 9,
      stats: { hp: 30, atk: 8, def: 8, spd: 8, exp: 0, hunger: 55 },
    },
  ];

  for (const s of wildSlimes) {
    const ref = db.collection("slimes").doc(s.id);
    slimesBatch.set(ref, {
      id: s.id,
      ownerUid: null,
      mapId: "map-001",
      worldId: "world-001",
      speciesId: "slime-001",
      tileX: s.tileX,
      tileY: s.tileY,
      name: s.name,
      stats: s.stats,
      racialValues: defaultRacialValues(),
      isWild: true,
      createdAt: admin.firestore.Timestamp.fromDate(now),
      updatedAt: admin.firestore.Timestamp.fromDate(now),
    });
  }

  await slimesBatch.commit();
  console.log("テストスライム3件 + 野生スライム2件を作成しました");

  // ===== 6. 食料マスタ（静的ファイルから upsert） =====
  // エミュレータでの開発・デバッグ用途。本番では Cloud Functions が staticFoods を直接参照するため不要だが、
  // Firestore コンソールでデータを確認したい場合に役立てる。
  const foodsBatch = db.batch();
  for (const food of masterFoods) {
    const ref = db.collection("foods").doc(food.id);
    foodsBatch.set(ref, food);
  }
  await foodsBatch.commit();
  console.log(`食料マスタ ${masterFoods.length} 件を投入しました`);

  console.log("\nシードデータの投入が完了しました！");
  console.log("投入件数:");
  console.log("  - ワールド: 1件");
  console.log("  - マップ: 1件");
  console.log("  - タイル: 100件");
  console.log("  - スライム（テストユーザー所有）: 3件");
  console.log("  - スライム（野生）: 2件");
}

seed()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("シードデータ投入中にエラーが発生しました:", err);
    process.exit(1);
  });
