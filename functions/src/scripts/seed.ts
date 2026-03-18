// 使用方法: FIRESTORE_EMULATOR_HOST=localhost:8080 ts-node src/scripts/seed.ts
// 本番環境では絶対に実行しないこと

import * as admin from "firebase-admin";

// Firebase Admin SDK の初期化
// エミュレータ環境では credential は不要
admin.initializeApp({
  projectId: "slime-sim-prototype",
});

const db = admin.firestore();

/**
 * ランダムな属性値（0〜0.3）を生成する
 */
function randomAttr(): number {
  return Math.round(Math.random() * 0.3 * 100) / 100;
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
  console.log("タイルを作成中...");
  const tileBatch = db.batch();
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const tileId = `map-001-tile-${x}-${y}`;
      const tileRef = db.collection("tiles").doc(tileId);
      tileBatch.set(tileRef, {
        id: tileId,
        mapId: "map-001",
        x,
        y,
        attributes: {
          fire: randomAttr(),
          water: randomAttr(),
          earth: randomAttr(),
          wind: randomAttr(),
        },
      });
    }
  }
  await tileBatch.commit();
  console.log("タイルを100件作成しました");

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
