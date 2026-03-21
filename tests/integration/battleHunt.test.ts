// 実行前提: Firebase Emulatorが起動していること
// FIRESTORE_EMULATOR_HOST=localhost:8080 npx jest tests/integration/battleHunt.test.ts

/**
 * battle / hunt 統合テスト（Phase 4 Week 3）
 *
 * hunt 成功/失敗・battle 勝利/敗北の各フローを
 * Firebase Emulator 上で検証する。
 *
 * 実行方法:
 *   1. firebase emulators:start --only firestore を起動
 *   2. FIRESTORE_EMULATOR_HOST=localhost:8080 npx jest tests/integration/battleHunt.test.ts --forceExit
 */

import * as admin from 'firebase-admin'
import { processDueTurns } from '../../functions/src/scheduled/turnProcessor'
import type { World } from '../../shared/types/world'
import type { Slime } from '../../shared/types/slime'
import type { ActionReservation } from '../../shared/types/action'

// ---- Emulator 接続設定 ----
const PROJECT_ID = 'slime-hakoniwa-test'

function initTestApp(): admin.app.App {
  try {
    return admin.app('battle-hunt-test')
  } catch {
    return admin.initializeApp(
      { projectId: PROJECT_ID, credential: admin.credential.applicationDefault() },
      'battle-hunt-test'
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

const WORLD_ID = 'world-bh-test-001'
const SLIME_ID = 'slime-bh-test-001'

function makeWorld(overrides?: Partial<World>): World {
  return {
    id: WORLD_ID,
    name: 'バトルハントテストワールド',
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
    ownerUid: 'user-bh-test-001',
    mapId: 'map-bh-001',
    worldId: WORLD_ID,
    speciesId: 'slime-001',
    tileX: 5,
    tileY: 5,
    name: 'バトルハントテストスライム',
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
    ownerUid: 'user-bh-test-001',
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
  await clearCollections('worlds', 'slimes', 'actionReservations', 'turnLogs')
})

// ================================================================
// フロー1: hunt 成功フロー — アイテムがインベントリに入る
// ================================================================

it('hunt 成功: インベントリにアイテムが追加され hunt_success が記録される', async () => {
  // atk=100 で必ず勝てる状態
  await seedWorld(makeWorld())
  await seedSlime(makeSlime({ stats: { hp: 80, atk: 100, def: 15, spd: 0, exp: 0, hunger: 60 }, inventory: [] }))
  await seedReservation(
    makeReservation({
      id: 'res-hunt-win',
      turnNumber: 1,
      actionType: 'hunt',
      actionData: { targetCategory: 'beast', targetStrength: 'weak' },
    })
  )

  await processDueTurns()

  const slimeDoc = await db.collection('slimes').doc(SLIME_ID).get()
  const inventory = slimeDoc.data()?.['inventory'] ?? []
  expect(inventory.length).toBeGreaterThan(0)

  const logs = await db.collection('turnLogs').where('slimeId', '==', SLIME_ID).get()
  const eventTypes = logs.docs.map((d) => d.data()['eventType'] as string)
  expect(eventTypes).toContain('hunt_success')
}, 30_000)

// ================================================================
// フロー2: hunt 失敗フロー — HP が減少する
// ================================================================

it('hunt 失敗: HP が減少し hunt_fail が記録される', async () => {
  // atk=1, spd=0 で normal モンスター（power=30）に負ける
  await seedWorld(makeWorld())
  await seedSlime(makeSlime({ stats: { hp: 80, atk: 1, def: 15, spd: 0, exp: 0, hunger: 60 }, inventory: [] }))
  await seedReservation(
    makeReservation({
      id: 'res-hunt-lose',
      turnNumber: 1,
      actionType: 'hunt',
      actionData: { targetCategory: 'beast', targetStrength: 'normal' },
    })
  )

  await processDueTurns()

  const slimeDoc = await db.collection('slimes').doc(SLIME_ID).get()
  const hp = slimeDoc.data()?.['stats']?.['hp'] as number
  // hp = 80 - 15(damage=ceil(30*0.5)) - 0(hunger_decrease はHP非影響) = 65
  expect(hp).toBe(65)

  const logs = await db.collection('turnLogs').where('slimeId', '==', SLIME_ID).get()
  const eventTypes = logs.docs.map((d) => d.data()['eventType'] as string)
  expect(eventTypes).toContain('hunt_fail')
}, 30_000)

// ================================================================
// フロー3: battle 勝利フロー — EXP・種族値が Firestore に保存される
// ================================================================

it('battle 勝利: EXP・種族値が加算されインベントリにアイテムが追加される', async () => {
  await seedWorld(makeWorld())
  await seedSlime(
    makeSlime({
      stats: { hp: 80, atk: 100, def: 15, spd: 0, exp: 0, hunger: 60 },
      racialValues: { fire: 0, water: 0, earth: 0, wind: 0, slime: 0, plant: 0, human: 0, beast: 0, spirit: 0, fish: 0 },
      inventory: [],
    })
  )
  await seedReservation(
    makeReservation({
      id: 'res-battle-win',
      turnNumber: 1,
      actionType: 'battle',
      actionData: { targetCategory: 'beast', targetStrength: 'weak' },
    })
  )

  await processDueTurns()

  const slimeDoc = await db.collection('slimes').doc(SLIME_ID).get()
  const exp = slimeDoc.data()?.['stats']?.['exp'] as number
  const beastRacial = slimeDoc.data()?.['racialValues']?.['beast'] as number
  const inventory = slimeDoc.data()?.['inventory'] ?? []

  expect(exp).toBeGreaterThan(0)       // EXP 加算
  expect(beastRacial).toBeGreaterThan(0) // 種族値加算
  expect(inventory.length).toBeGreaterThan(0) // ドロップアイテム

  const logs = await db.collection('turnLogs').where('slimeId', '==', SLIME_ID).get()
  const eventTypes = logs.docs.map((d) => d.data()['eventType'] as string)
  expect(eventTypes).toContain('battle_win')
}, 30_000)

// ================================================================
// フロー4: battle 敗北で HP=0 → incapacitatedUntilTurn が Firestore に保存される
// ================================================================

it('battle 敗北で HP=0 → incapacitatedUntilTurn が Firestore に書き込まれる', async () => {
  // currentTurn=10 → 次ターン=11、hp=1 で normal(power=30,damage=30) に負けて HP=0
  await seedWorld(makeWorld({ currentTurn: 10 }))
  await seedSlime(makeSlime({ stats: { hp: 1, atk: 1, def: 15, spd: 0, exp: 0, hunger: 60 }, inventory: [] }))
  await seedReservation(
    makeReservation({
      id: 'res-battle-lose',
      turnNumber: 11,
      actionType: 'battle',
      actionData: { targetCategory: 'beast', targetStrength: 'normal' },
    })
  )

  await processDueTurns()

  const slimeDoc = await db.collection('slimes').doc(SLIME_ID).get()
  const hp = slimeDoc.data()?.['stats']?.['hp'] as number
  const incapacitatedUntilTurn = slimeDoc.data()?.['incapacitatedUntilTurn'] as number | undefined

  expect(hp).toBe(0)
  expect(incapacitatedUntilTurn).toBe(13) // 11 + 2

  const logs = await db.collection('turnLogs').where('slimeId', '==', SLIME_ID).get()
  const eventTypes = logs.docs.map((d) => d.data()['eventType'] as string)
  expect(eventTypes).toContain('battle_lose')
}, 30_000)
