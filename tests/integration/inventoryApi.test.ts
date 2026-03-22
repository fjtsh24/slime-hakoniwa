// 実行前提: Firebase Emulatorが起動していること
// FIRESTORE_EMULATOR_HOST=localhost:8080 npx jest tests/integration/inventoryApi.test.ts

/**
 * インベントリ API 統合テスト（Phase 4 Week 3）
 *
 * gather → eat の一連フローをエミュレーター上でテスト。
 * 実際の Firestore に対してインベントリの読み書きが正しく行われることを検証。
 *
 * 実行方法:
 *   1. firebase emulators:start --only firestore を起動
 *   2. FIRESTORE_EMULATOR_HOST=localhost:8080 npx jest tests/integration/inventoryApi.test.ts --forceExit
 */

import * as admin from 'firebase-admin'
import { processDueTurns } from '../../functions/src/scheduled/turnProcessor'
import type { World } from '../../shared/types/world'
import type { Slime } from '../../shared/types/slime'
import type { ActionReservation } from '../../shared/types/action'
import type { TurnLog } from '../../shared/types/turnLog'
import { INVENTORY_MAX_SLOTS } from '../../shared/constants/game'

// ---- Emulator 接続設定 ----
const PROJECT_ID = 'slime-hakoniwa-test'

function initTestApp(): admin.app.App {
  try {
    return admin.app('inventory-api-test')
  } catch {
    return admin.initializeApp(
      { projectId: PROJECT_ID, credential: admin.credential.applicationDefault() },
      'inventory-api-test'
    )
  }
}

let app: admin.app.App
let db: admin.firestore.Firestore

// ---- ヘルパー ----

async function seedWorld(world: World): Promise<void> {
  await db.collection('worlds').doc(world.id).set({
    ...world,
    nextTurnAt: admin.firestore.Timestamp.fromDate(world.nextTurnAt),
    createdAt: admin.firestore.Timestamp.fromDate(world.createdAt),
  })
}

async function seedSlime(slime: Slime): Promise<void> {
  await db.collection('slimes').doc(slime.id).set({
    ...slime,
    createdAt: admin.firestore.Timestamp.fromDate(slime.createdAt),
    updatedAt: admin.firestore.Timestamp.fromDate(slime.updatedAt),
  })
}

async function seedTile(mapId: string, x: number, y: number, attributes: Record<string, number>): Promise<void> {
  const id = `tile-${mapId}-${x}-${y}`
  await db.collection('tiles').doc(id).set({ id, mapId, x, y, attributes })
}

async function seedReservation(reservation: ActionReservation): Promise<void> {
  await db.collection('actionReservations').doc(reservation.id).set({
    ...reservation,
    createdAt: admin.firestore.Timestamp.fromDate(reservation.createdAt),
    executedAt: reservation.executedAt ? admin.firestore.Timestamp.fromDate(reservation.executedAt) : null,
  })
}

async function clearCollections(...names: string[]): Promise<void> {
  for (const name of names) {
    const snap = await db.collection(name).get()
    const batch = db.batch()
    snap.docs.forEach((doc) => batch.delete(doc.ref))
    await batch.commit()
  }
}

// ---- フィクスチャ ----

const WORLD_ID = 'world-inv-test-001'
const SLIME_ID = 'slime-inv-test-001'
const MAP_ID = 'map-inv-test-001'

function makeWorld(overrides?: Partial<World>): World {
  return {
    id: WORLD_ID,
    name: 'インベントリテストワールド',
    currentTurn: 0,
    nextTurnAt: new Date(Date.now() - 60_000),
    turnIntervalSec: 300,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeSlime(overrides?: Partial<Slime>): Slime {
  return {
    id: SLIME_ID,
    ownerUid: 'user-inv-test-001',
    mapId: MAP_ID,
    worldId: WORLD_ID,
    speciesId: 'slime-001',
    tileX: 3,
    tileY: 3,
    name: 'インベントリテストスライム',
    stats: { hp: 80, atk: 20, def: 15, spd: 10, exp: 0, hunger: 60 },
    racialValues: { fire: 0, water: 0, earth: 0, wind: 0, slime: 0, plant: 0, human: 0, beast: 0, spirit: 0, fish: 0 },
    inventory: [],
    isWild: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeReservation(overrides: Partial<ActionReservation> & { id: string; turnNumber: number }): ActionReservation {
  return {
    slimeId: SLIME_ID,
    ownerUid: 'user-inv-test-001',
    worldId: WORLD_ID,
    actionType: 'rest',
    actionData: {},
    status: 'pending',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    executedAt: null,
    ...overrides,
  }
}

// ---- テスト前後処理 ----

beforeAll(() => {
  app = initTestApp()
  db = admin.firestore(app)
})

beforeEach(async () => {
  await clearCollections('worlds', 'slimes', 'actionReservations', 'turnLogs', 'tiles')
})

// ================================================================
// フロー1: gather → eat の一連フロー
// ================================================================

it('gather 後に eat するとインベントリが正しく更新される', async () => {
  await seedWorld(makeWorld())
  await seedSlime(makeSlime({ inventory: [] }))
  // earth=0.5 タイル: drop-gather-earth テーブルを選択（food-plant-001 が weight=50 で最有力）
  await seedTile(MAP_ID, 3, 3, { fire: 0, water: 0, earth: 0.5, wind: 0 })
  // ターン1: gather
  await seedReservation(makeReservation({ id: 'res-gather-001', turnNumber: 1, actionType: 'gather', actionData: {} }))

  await processDueTurns()

  // gather 後にインベントリを確認
  const slimeDoc1 = await db.collection('slimes').doc(SLIME_ID).get()
  const inventory1 = slimeDoc1.data()?.['inventory'] ?? []
  expect(inventory1.length).toBeGreaterThan(0)

  // gather で得た食料の foodId を取得して eat 予約を投入
  const gatheredFoodId = inventory1[0]['foodId'] as string

  // ターン2: eat（gatheredFoodId を指定）
  await seedReservation(
    makeReservation({
      id: 'res-eat-001',
      turnNumber: 2,
      actionType: 'eat',
      actionData: { foodId: gatheredFoodId },
    })
  )
  // ワールドの nextTurnAt を再度期限切れに設定してターン2を実行
  await db.collection('worlds').doc(WORLD_ID).update({
    nextTurnAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 60_000)),
  })

  await processDueTurns()

  // eat 後のステータス確認
  const slimeDoc2 = await db.collection('slimes').doc(SLIME_ID).get()
  const inventory2 = slimeDoc2.data()?.['inventory'] ?? []
  const hunger2 = slimeDoc2.data()?.['stats']?.['hunger'] as number

  // hunger が増加している（60 + 30 - 5 = 85）
  expect(hunger2).toBeGreaterThan(60)

  // gather で得た food が 1 減っている or スロットが消滅している
  const eatenSlot = inventory2.find((s: { foodId: string }) => s.foodId === gatheredFoodId)
  const qty1 = inventory1.find((s: { foodId: string; quantity: number }) => s.foodId === gatheredFoodId)?.quantity ?? 0
  const qty2 = eatenSlot?.quantity ?? 0
  expect(qty2).toBe(qty1 - 1)

  // turnLogs に gather_success と eat イベントが存在する
  const logs = await db.collection('turnLogs').where('slimeId', '==', SLIME_ID).get()
  const eventTypes = logs.docs.map((d) => d.data()['eventType'] as string)
  expect(eventTypes).toContain('gather_success')
  expect(eventTypes).toContain('eat')
}, 30_000)

// ================================================================
// フロー2: INVENTORY_MAX_SLOTS 境界値テスト
// ================================================================

it('インベントリが満杯のとき gather は inventory_full を記録しスロット数は変化しない', async () => {
  const fullInventory = Array.from({ length: INVENTORY_MAX_SLOTS }, (_, i) => ({
    foodId: `food-filler-${String(i).padStart(3, '0')}`,
    quantity: 1,
  }))
  await seedWorld(makeWorld())
  await seedSlime(makeSlime({ inventory: fullInventory }))
  await seedTile(MAP_ID, 3, 3, { fire: 0, water: 0, earth: 0.5, wind: 0 })
  await seedReservation(makeReservation({ id: 'res-gather-full', turnNumber: 1, actionType: 'gather', actionData: {} }))

  await processDueTurns()

  const slimeDoc = await db.collection('slimes').doc(SLIME_ID).get()
  const inventory = slimeDoc.data()?.['inventory'] ?? []
  expect(inventory.length).toBe(INVENTORY_MAX_SLOTS)

  const logs = await db.collection('turnLogs').where('slimeId', '==', SLIME_ID).get()
  const eventTypes = logs.docs.map((d) => d.data()['eventType'] as string)
  expect(eventTypes).toContain('inventory_full')
}, 30_000)

// ================================================================
// フロー3: eat でインベントリが空のとき inventory_not_found が記録される
// ================================================================

it('インベントリが空で eat を実行すると inventory_not_found が記録される', async () => {
  await seedWorld(makeWorld())
  await seedSlime(makeSlime({ inventory: [] }))
  await seedReservation(
    makeReservation({
      id: 'res-eat-empty',
      turnNumber: 1,
      actionType: 'eat',
      actionData: { foodId: 'food-plant-001' },
    })
  )

  await processDueTurns()

  const slimeDoc = await db.collection('slimes').doc(SLIME_ID).get()
  const hunger = slimeDoc.data()?.['stats']?.['hunger'] as number
  expect(hunger).toBeLessThanOrEqual(60) // hunger 変化なし（実際は -5 の hunger_decrease あり）

  const logs = await db.collection('turnLogs').where('slimeId', '==', SLIME_ID).get()
  const eventTypes = logs.docs.map((d) => d.data()['eventType'] as string)
  expect(eventTypes).toContain('inventory_not_found')

  const resDoc = await db.collection('actionReservations').doc('res-eat-empty').get()
  expect(resDoc.data()?.['status']).toBe('executed')
}, 30_000)
