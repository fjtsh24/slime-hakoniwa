// 実行前提: Firebase Emulatorが起動していること
// FIRESTORE_EMULATOR_HOST=localhost:8080 npx jest tests/integration

/**
 * ターン進行フロー 統合テスト
 *
 * Firebase Emulator Suite を使ったエンドツーエンドのターン進行テスト。
 * 実際の Firestore Emulator に対して読み書きを行い、
 * processDueTurns の動作を全体的に検証する。
 *
 * 実行方法:
 *   1. firebase emulators:start --only firestore を起動
 *   2. FIRESTORE_EMULATOR_HOST=localhost:8080 npx jest tests/integration --forceExit
 */

import * as admin from 'firebase-admin'
import { processDueTurns } from '../../functions/src/scheduled/turnProcessor'
import type { World } from '../../shared/types/world'
import type { Slime, SlimeStats, RacialValues } from '../../shared/types/slime'
import type { ActionReservation } from '../../shared/types/action'
import type { TurnLog } from '../../shared/types/turnLog'

// ---- Emulator 接続設定 ----
const PROJECT_ID = 'slime-hakoniwa-test'

function initTestApp(): admin.app.App {
  // 既存のアプリがあれば返す
  try {
    return admin.app('integration-test')
  } catch {
    return admin.initializeApp(
      {
        projectId: PROJECT_ID,
        credential: admin.credential.applicationDefault(),
      },
      'integration-test'
    )
  }
}

let app: admin.app.App
let db: admin.firestore.Firestore

// ---- テスト用データ投入ヘルパー ----

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
    executedAt: reservation.executedAt
      ? admin.firestore.Timestamp.fromDate(reservation.executedAt)
      : null,
  })
}

async function clearCollection(collectionName: string): Promise<void> {
  const snap = await db.collection(collectionName).get()
  const batch = db.batch()
  snap.docs.forEach((doc) => batch.delete(doc.ref))
  await batch.commit()
}

// ---- テスト用フィクスチャ ----

function makeTestWorld(overrides?: Partial<World>): World {
  return {
    id: 'world-integration-001',
    name: '統合テストワールド',
    currentTurn: 0,
    nextTurnAt: new Date(Date.now() - 60_000), // 1分前（期限切れ）
    turnIntervalSec: 300,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeTestSlimeStats(overrides?: Partial<SlimeStats>): SlimeStats {
  return { hp: 80, atk: 20, def: 15, spd: 10, exp: 0, hunger: 60, ...overrides }
}

function makeTestRacialValues(overrides?: Partial<RacialValues>): RacialValues {
  return {
    fire: 0, water: 0, earth: 0, wind: 0,
    slime: 0, plant: 0, human: 0, beast: 0, spirit: 0, fish: 0,
    ...overrides,
  }
}

function makeTestSlime(overrides?: Partial<Slime>): Slime {
  return {
    id: 'slime-integration-001',
    ownerUid: 'user-integration-001',
    mapId: 'map-001',
    worldId: 'world-integration-001',
    speciesId: 'species-normal',
    tileX: 5,
    tileY: 5,
    name: '統合テストスライム',
    stats: makeTestSlimeStats(),
    racialValues: makeTestRacialValues(),
    isWild: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeTestReservation(overrides?: Partial<ActionReservation>): ActionReservation {
  return {
    id: 'reservation-integration-001',
    slimeId: 'slime-integration-001',
    ownerUid: 'user-integration-001',
    worldId: 'world-integration-001',
    turnNumber: 1, // currentTurn が 0 → 1 になるので turnNumber=1 で実行される
    actionType: 'rest',
    actionData: {},
    status: 'pending',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    executedAt: null,
    ...overrides,
  }
}

// ================================================================
// テストスイート
// ================================================================
describe('ターン進行フロー統合テスト', () => {
  beforeAll(async () => {
    // Emulator への接続を設定
    process.env['FIRESTORE_EMULATOR_HOST'] = process.env['FIRESTORE_EMULATOR_HOST'] ?? 'localhost:8080'

    app = initTestApp()
    db = app.firestore()

    // Emulator の接続確認（タイムアウト付き）
    await db.collection('_health').doc('check').set({ ok: true })
  }, 30_000)

  afterAll(async () => {
    // Emulator のデータをクリア
    await Promise.all([
      clearCollection('worlds'),
      clearCollection('slimes'),
      clearCollection('actionReservations'),
      clearCollection('turnLogs'),
      clearCollection('_health'),
    ])

    // アプリを削除
    if (app) {
      await app.delete()
    }
  }, 30_000)

  beforeEach(async () => {
    // 各テスト前にデータをクリア
    await Promise.all([
      clearCollection('worlds'),
      clearCollection('slimes'),
      clearCollection('actionReservations'),
      clearCollection('turnLogs'),
    ])
  }, 15_000)

  // ----------------------------------------------------------------
  // テスト 1: currentTurn が +1 される
  // ----------------------------------------------------------------
  it('processDueTurns を実行すると Firestore の currentTurn が +1 される', async () => {
    const world = makeTestWorld({ currentTurn: 0 })
    await seedWorld(world)

    await processDueTurns()

    const updatedWorldDoc = await db.collection('worlds').doc(world.id).get()
    const updatedWorld = updatedWorldDoc.data()

    expect(updatedWorld).toBeDefined()
    expect(updatedWorld?.['currentTurn']).toBe(1)
  }, 20_000)

  // ----------------------------------------------------------------
  // テスト 2: 予約した行動がターン進行後に 'executed' になる
  // ----------------------------------------------------------------
  it('予約した行動がターン進行後に executed になる', async () => {
    const world = makeTestWorld({ currentTurn: 0 })
    const slime = makeTestSlime()
    const reservation = makeTestReservation({
      turnNumber: 1, // currentTurn 0 → 1 のターンで実行
      actionType: 'rest',
      status: 'pending',
    })

    await seedWorld(world)
    await seedSlime(slime)
    await seedReservation(reservation)

    await processDueTurns()

    const updatedReservationDoc = await db
      .collection('actionReservations')
      .doc(reservation.id)
      .get()
    const updatedReservation = updatedReservationDoc.data()

    expect(updatedReservation).toBeDefined()
    expect(updatedReservation?.['status']).toBe('executed')
    expect(updatedReservation?.['executedAt']).not.toBeNull()
  }, 20_000)

  // ----------------------------------------------------------------
  // テスト 3: ターンログ(turnLogs)が正しく記録される
  // ----------------------------------------------------------------
  it('ターンログ(turnLogs)が正しく記録される', async () => {
    const world = makeTestWorld({ currentTurn: 0 })
    const slime = makeTestSlime()
    const reservation = makeTestReservation({
      turnNumber: 1,
      actionType: 'rest',
      status: 'pending',
    })

    await seedWorld(world)
    await seedSlime(slime)
    await seedReservation(reservation)

    await processDueTurns()

    // ターン 1 に作成されたログを取得
    const logsSnap = await db
      .collection('turnLogs')
      .where('worldId', '==', world.id)
      .where('slimeId', '==', slime.id)
      .where('turnNumber', '==', 1)
      .get()

    expect(logsSnap.empty).toBe(false)

    const logs = logsSnap.docs.map((doc) => doc.data() as TurnLog)

    // rest アクションのログが含まれること
    const hasRestLog = logs.some((log) => log.eventType === 'rest')
    expect(hasRestLog).toBe(true)

    // ターン番号が正しいこと
    logs.forEach((log) => {
      expect(log.turnNumber).toBe(1)
      expect(log.worldId).toBe(world.id)
      expect(log.slimeId).toBe(slime.id)
    })
  }, 20_000)

  // ----------------------------------------------------------------
  // テスト 4: 予約がないスライムは自律行動が実行される
  // ----------------------------------------------------------------
  it('予約がないスライムは自律行動が実行される', async () => {
    const world = makeTestWorld({ currentTurn: 0 })
    // hunger < 30 のスライム（自律行動で HP 回復が発生する）
    const slime = makeTestSlime({
      stats: makeTestSlimeStats({ hunger: 20, hp: 50 }),
    })

    await seedWorld(world)
    await seedSlime(slime)
    // 予約は投入しない

    await processDueTurns()

    // ターンログに autonomous イベントが記録されること
    const logsSnap = await db
      .collection('turnLogs')
      .where('worldId', '==', world.id)
      .where('slimeId', '==', slime.id)
      .where('turnNumber', '==', 1)
      .get()

    expect(logsSnap.empty).toBe(false)

    const logs = logsSnap.docs.map((doc) => doc.data() as TurnLog)
    const hasAutonomousLog = logs.some(
      (log) => log.eventType === 'autonomous' || log.eventType === 'rest'
    )
    expect(hasAutonomousLog).toBe(true)
  }, 20_000)
})
