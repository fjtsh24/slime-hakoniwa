/**
 * 融合アクション ユニットテスト（Phase 4 Week 3）
 *
 * テスト対象:
 *   functions/src/scheduled/turnProcessor.ts — executeReservedAction (merge)
 *
 * 実行方法:
 *   npx jest --config functions/jest.config.js tests/unit/mergeAction.test.ts
 */

// ---- ターゲットスライムのフィクスチャデータ ----
const TARGET_SLIME_ID = 'slime-target-001'
const OWNER_UID = 'user-test-001'
const OTHER_OWNER_UID = 'user-other-002'

const targetSlimeData = {
  id: TARGET_SLIME_ID,
  ownerUid: OWNER_UID,
  mapId: 'map-test-001',
  worldId: 'world-test-001',
  speciesId: 'slime-001',
  tileX: 5,
  tileY: 5,
  name: 'ターゲットスライム',
  stats: { hp: 60, atk: 40, def: 30, spd: 10, exp: 0, hunger: 60 },
  racialValues: { fire: 0, water: 0, earth: 0, wind: 0, slime: 0, plant: 0, human: 0, beast: 0, spirit: 0, fish: 0 },
  inventory: [],
  isWild: false,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
}

jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn((collectionName: string) => ({
      doc: jest.fn((docId: string) => ({
        get: jest.fn().mockResolvedValue(
          // ターゲットスライム ID の場合はデータを返す
          docId === TARGET_SLIME_ID && collectionName === 'slimes'
            ? { exists: true, id: TARGET_SLIME_ID, data: () => targetSlimeData }
            : { exists: false, data: () => undefined }
        ),
        collection: jest.fn(() => ({
          doc: jest.fn(() => ({
            get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
          })),
        })),
      })),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({ empty: true, docs: [] }),
    })),
    batch: jest.fn(() => ({
      set: jest.fn(),
      update: jest.fn(),
      commit: jest.fn().mockResolvedValue(undefined),
    })),
  })),
  initializeApp: jest.fn(),
  apps: [],
  app: jest.fn(),
}))

import { executeReservedAction } from '../../functions/src/scheduled/turnProcessor'
import type { Slime, SlimeStats, RacialValues } from '../../shared/types/slime'
import type { ActionReservation } from '../../shared/types/action'
import { foods } from '../../shared/data/foods'

// ================================================================
// テスト用フィクスチャ
// ================================================================

function makeStats(overrides?: Partial<SlimeStats>): SlimeStats {
  return { hp: 50, atk: 20, def: 15, spd: 10, exp: 0, hunger: 50, ...overrides }
}

function makeRacialValues(overrides?: Partial<RacialValues>): RacialValues {
  return {
    fire: 0, water: 0, earth: 0, wind: 0,
    slime: 0, plant: 0, human: 0, beast: 0, spirit: 0, fish: 0,
    ...overrides,
  }
}

function makeSlime(overrides?: Partial<Slime>): Slime {
  return {
    id: 'slime-merge-test-001',
    ownerUid: OWNER_UID,
    mapId: 'map-test-001',
    worldId: 'world-test-001',
    speciesId: 'slime-001',
    tileX: 5,
    tileY: 5,
    name: '融合テストスライム',
    stats: makeStats(),
    racialValues: makeRacialValues(),
    inventory: [],
    isWild: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeMergeReservation(targetSlimeId: string, overrides?: Partial<ActionReservation>): ActionReservation {
  return {
    id: 'reservation-merge-test-001',
    slimeId: 'slime-merge-test-001',
    ownerUid: OWNER_UID,
    worldId: 'world-test-001',
    turnNumber: 5,
    actionType: 'merge',
    actionData: { targetSlimeId },
    status: 'pending',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    executedAt: null,
    ...overrides,
  }
}

// ================================================================
// テストスイート
// ================================================================

describe('executeMergeAction', () => {
  // ----------------------------------------------------------------
  // テスト1: 融合成功 — merge イベントが記録される
  // ----------------------------------------------------------------
  it('同オーナーのスライムとの融合で merge イベントが記録される', async () => {
    const slime = makeSlime()
    const reservation = makeMergeReservation(TARGET_SLIME_ID)

    const result = await executeReservedAction(slime, reservation, foods)

    const mergeEvent = result.events.find((e) => e.eventType === 'merge')
    expect(mergeEvent).toBeDefined()
    expect(mergeEvent?.eventData['targetSlimeId']).toBe(TARGET_SLIME_ID)
  })

  // ----------------------------------------------------------------
  // テスト2: 融合成功 — ATK の 30% が加算される
  // ターゲット ATK=40 → +12
  // ----------------------------------------------------------------
  it('融合成功で ATK が targetSlime.atk の 30% 加算される', async () => {
    const slime = makeSlime({ stats: makeStats({ atk: 20 }) })
    const reservation = makeMergeReservation(TARGET_SLIME_ID)

    const result = await executeReservedAction(slime, reservation, foods)

    // ターゲット ATK=40 の 30% = floor(12) = 12
    expect(result.updatedSlime.stats.atk).toBe(20 + 12) // 32
    const mergeEvent = result.events.find((e) => e.eventType === 'merge')
    expect(mergeEvent?.eventData['atkAbsorb']).toBe(12)
  })

  // ----------------------------------------------------------------
  // テスト3: 融合成功 — DEF の 30% が加算される
  // ターゲット DEF=30 → +9
  // ----------------------------------------------------------------
  it('融合成功で DEF が targetSlime.def の 30% 加算される', async () => {
    const slime = makeSlime({ stats: makeStats({ def: 15 }) })
    const reservation = makeMergeReservation(TARGET_SLIME_ID)

    const result = await executeReservedAction(slime, reservation, foods)

    // ターゲット DEF=30 の 30% = floor(9) = 9
    expect(result.updatedSlime.stats.def).toBe(15 + 9) // 24
    const mergeEvent = result.events.find((e) => e.eventType === 'merge')
    expect(mergeEvent?.eventData['defAbsorb']).toBe(9)
  })

  // ----------------------------------------------------------------
  // テスト4: 融合成功 — slimesToDelete にターゲット ID が含まれる
  // ----------------------------------------------------------------
  it('融合成功で slimesToDelete にターゲットスライム ID が含まれる', async () => {
    const slime = makeSlime()
    const reservation = makeMergeReservation(TARGET_SLIME_ID)

    const result = await executeReservedAction(slime, reservation, foods)

    expect(result.slimesToDelete).toBeDefined()
    expect(result.slimesToDelete).toContain(TARGET_SLIME_ID)
  })

  // ----------------------------------------------------------------
  // テスト5: 自己融合は拒否される
  // ----------------------------------------------------------------
  it('自分自身との融合は拒否され merge イベントが発火しない', async () => {
    // slimeId と targetSlimeId が同じ場合
    const slime = makeSlime({ id: TARGET_SLIME_ID })
    const reservation = makeMergeReservation(TARGET_SLIME_ID, {
      slimeId: TARGET_SLIME_ID,
    })

    const result = await executeReservedAction(slime, reservation, foods)

    const mergeEvent = result.events.find((e) => e.eventType === 'merge')
    expect(mergeEvent).toBeUndefined()
    expect(result.slimesToDelete).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // テスト6: 異なるオーナーのスライムとの融合は拒否される
  // ----------------------------------------------------------------
  it('異なるオーナーのスライムとの融合は拒否される', async () => {
    // ownerUid が違うスライムでリクエスト
    const slime = makeSlime({ ownerUid: OTHER_OWNER_UID })
    const reservation = makeMergeReservation(TARGET_SLIME_ID, {
      ownerUid: OTHER_OWNER_UID,
    })

    const result = await executeReservedAction(slime, reservation, foods)

    // targetSlime.ownerUid (OWNER_UID) !== slime.ownerUid (OTHER_OWNER_UID) → 拒否
    const mergeEvent = result.events.find((e) => e.eventType === 'merge')
    expect(mergeEvent).toBeUndefined()
    expect(result.slimesToDelete).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // テスト7: targetSlimeId が空の場合スキップ
  // ----------------------------------------------------------------
  it('actionData に targetSlimeId がない場合アクションがスキップされる', async () => {
    const slime = makeSlime()
    const reservation = makeMergeReservation('')

    const result = await executeReservedAction(slime, reservation, foods)

    const mergeEvent = result.events.find((e) => e.eventType === 'merge')
    expect(mergeEvent).toBeUndefined()
    // ATK・DEF は変化しない
    expect(result.updatedSlime.stats.atk).toBe(slime.stats.atk)
    expect(result.updatedSlime.stats.def).toBe(slime.stats.def)
  })
})
