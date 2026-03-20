/**
 * 戦闘アクション ユニットテスト（Phase 4 Week 3）
 *
 * テスト対象:
 *   functions/src/scheduled/turnProcessor.ts
 *   — executeReservedAction (battle) [テスト1-6, 9-10]
 *   — processSlimeTurn (battle + incapacitation) [テスト7-8]
 *
 * 実行方法:
 *   cd functions && npx jest tests/unit/battleAction.test.ts --verbose
 */

jest.mock('firebase-admin', () => ({
  firestore: jest.fn(() => ({
    collection: jest.fn(() => ({
      doc: jest.fn(() => ({
        get: jest.fn().mockResolvedValue({ exists: false, data: () => undefined }),
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

import { executeReservedAction, processSlimeTurn } from '../../functions/src/scheduled/turnProcessor'
import type { Slime, SlimeStats, RacialValues, InventorySlot } from '../../shared/types/slime'
import type { ActionReservation } from '../../shared/types/action'
import { foods } from '../../shared/data/foods'
import { RACIAL_VALUE_MAX, INVENTORY_MAX_SLOTS } from '../../shared/constants/game'

// ================================================================
// テスト用フィクスチャ
// ================================================================

function makeStats(overrides?: Partial<SlimeStats>): SlimeStats {
  return { hp: 50, atk: 10, def: 10, spd: 10, exp: 0, hunger: 50, ...overrides }
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
    id: 'slime-battle-test-001',
    ownerUid: 'user-test-001',
    mapId: 'map-test-001',
    worldId: 'world-test-001',
    speciesId: 'slime-001',
    tileX: 5,
    tileY: 5,
    name: '戦闘テストスライム',
    stats: makeStats(),
    racialValues: makeRacialValues(),
    inventory: [],
    isWild: false,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
}

function makeBattleReservation(
  targetCategory: string,
  targetStrength: string,
  overrides?: Partial<ActionReservation>
): ActionReservation {
  return {
    id: 'reservation-battle-test-001',
    slimeId: 'slime-battle-test-001',
    ownerUid: 'user-test-001',
    worldId: 'world-test-001',
    turnNumber: 5,
    actionType: 'battle',
    actionData: { targetCategory, targetStrength },
    status: 'pending',
    createdAt: new Date('2024-01-01T00:00:00Z'),
    executedAt: null,
    ...overrides,
  }
}

// ================================================================
// テストスイート
// ================================================================

describe('executeBattleAction', () => {
  // ----------------------------------------------------------------
  // テスト1: atk が十分高ければ battle_win イベントが記録される
  // atk=100, spd=0 → attackRoll=100 > monster.power(10) → 勝利確定
  // ----------------------------------------------------------------
  it('atk が十分高い場合 battle_win イベントが記録される', async () => {
    const slime = makeSlime({ stats: makeStats({ atk: 100, spd: 0 }) })
    const reservation = makeBattleReservation('beast', 'weak')

    const result = await executeReservedAction(slime, reservation, foods)

    const winEvent = result.events.find((e) => e.eventType === 'battle_win')
    expect(winEvent).toBeDefined()
    expect(winEvent?.eventData['monsterId']).toBeDefined()
    const loseEvent = result.events.find((e) => e.eventType === 'battle_lose')
    expect(loseEvent).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // テスト2: atk が十分低ければ battle_lose イベントが記録されHP が減少する
  // atk=1, spd=0 → attackRoll=1 ≤ monster.power(30) → 敗北確定
  // ----------------------------------------------------------------
  it('atk が十分低い場合 battle_lose イベントが記録され HP が減少する', async () => {
    const slime = makeSlime({ stats: makeStats({ atk: 1, spd: 0, hp: 50 }) })
    const reservation = makeBattleReservation('beast', 'normal')

    const result = await executeReservedAction(slime, reservation, foods)

    const loseEvent = result.events.find((e) => e.eventType === 'battle_lose')
    expect(loseEvent).toBeDefined()
    expect(loseEvent?.eventData['damage']).toBeGreaterThan(0)
    expect(result.updatedSlime.stats.hp).toBeLessThan(slime.stats.hp)
    const winEvent = result.events.find((e) => e.eventType === 'battle_win')
    expect(winEvent).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // テスト3: 敗北ダメージが power そのもの（hunt の倍）
  // normal モンスター power=30 → damage=30（hunt は 15）
  // ----------------------------------------------------------------
  it('敗北ダメージが monster.power（hunt の倍）になる', async () => {
    const slime = makeSlime({ stats: makeStats({ atk: 1, spd: 0, hp: 50 }) })
    const reservation = makeBattleReservation('beast', 'normal') // power=30

    const result = await executeReservedAction(slime, reservation, foods)

    const loseEvent = result.events.find((e) => e.eventType === 'battle_lose')
    expect(loseEvent).toBeDefined()
    expect(loseEvent?.eventData['damage']).toBe(30) // power そのもの
    expect(result.updatedSlime.stats.hp).toBe(20)   // 50 - 30 = 20
  })

  // ----------------------------------------------------------------
  // テスト4: 勝利時に EXP が加算される（power × 1.5〜2）
  // weak モンスター power=10 → EXP ボーナス 15〜20
  // ----------------------------------------------------------------
  it('battle 勝利時に EXP が加算される（power * 1.5〜2 の範囲）', async () => {
    const slime = makeSlime({ stats: makeStats({ atk: 100, spd: 0, exp: 0 }) })
    const reservation = makeBattleReservation('beast', 'weak') // power=10

    const result = await executeReservedAction(slime, reservation, foods)

    const winEvent = result.events.find((e) => e.eventType === 'battle_win')
    expect(winEvent).toBeDefined()
    const expBonus = winEvent?.eventData['expBonus'] as number
    expect(expBonus).toBeGreaterThanOrEqual(15) // 10 * 1.5
    expect(expBonus).toBeLessThanOrEqual(20)    // 10 * 2.0
    expect(result.updatedSlime.stats.exp).toBe(expBonus)
  })

  // ----------------------------------------------------------------
  // テスト5: 勝利時に種族値が加算され RACIAL_VALUE_MAX でクランプされる
  // beast racialValue が 0.95 の状態で beast 系ドロップ → 1.0 にクランプ
  // ----------------------------------------------------------------
  it('battle 勝利時に種族値が加算され RACIAL_VALUE_MAX(1.0) でクランプされる', async () => {
    const slime = makeSlime({
      stats: makeStats({ atk: 100, spd: 0 }),
      racialValues: makeRacialValues({ beast: 0.95 }),
    })
    const reservation = makeBattleReservation('beast', 'weak')

    const result = await executeReservedAction(slime, reservation, foods)

    expect(result.updatedSlime.racialValues.beast).toBeLessThanOrEqual(RACIAL_VALUE_MAX)
    expect(result.updatedSlime.racialValues.fire).toBe(0)
    expect(result.updatedSlime.racialValues.water).toBe(0)
  })

  // ----------------------------------------------------------------
  // テスト6: 勝利時に食料ドロップが発生しインベントリに追加される
  // ----------------------------------------------------------------
  it('battle 勝利時にインベントリにドロップアイテムが追加される', async () => {
    const slime = makeSlime({ stats: makeStats({ atk: 100, spd: 0 }), inventory: [] })
    const reservation = makeBattleReservation('beast', 'weak')

    const result = await executeReservedAction(slime, reservation, foods)

    const winEvent = result.events.find((e) => e.eventType === 'battle_win')
    expect(winEvent).toBeDefined()
    expect(result.updatedSlime.inventory!.length).toBeGreaterThan(0)
    const droppedFoodId = result.updatedSlime.inventory![0].foodId
    // drop-battle-beast-weak の drops: food-beast-001, food-human-001
    expect(['food-beast-001', 'food-human-001']).toContain(droppedFoodId)
  })

  // ----------------------------------------------------------------
  // テスト7: HP=0 になったとき incapacitatedUntilTurn が設定される
  // processSlimeTurn 経由でテスト（currentTurn=5 → incapacitatedUntilTurn=7）
  // ----------------------------------------------------------------
  it('HP=0 になったとき processSlimeTurn 後に incapacitatedUntilTurn が currentTurn+2 に設定される', async () => {
    // power=30 のダメージで HP=1 → HP=0 になる設定
    const slime = makeSlime({ stats: makeStats({ atk: 1, spd: 0, hp: 1 }) })
    const reservation = makeBattleReservation('beast', 'normal', { turnNumber: 5 })

    const result = await processSlimeTurn(slime, [reservation], 5)

    expect(result.updatedSlime.stats.hp).toBe(0)
    expect(result.updatedSlime.incapacitatedUntilTurn).toBe(7) // 5 + 2
    const battleLoseEvent = result.events.find((e) => e.eventType === 'battle_lose')
    expect(battleLoseEvent).toBeDefined()
  })

  // ----------------------------------------------------------------
  // テスト8: HP > 0 の敗北では incapacitatedUntilTurn は設定されない
  // HP=50, damage=30 → HP=20 > 0 → 戦闘不能にならない
  // ----------------------------------------------------------------
  it('HP が残っている敗北では incapacitatedUntilTurn は設定されない', async () => {
    const slime = makeSlime({ stats: makeStats({ atk: 1, spd: 0, hp: 50 }) })
    const reservation = makeBattleReservation('beast', 'normal', { turnNumber: 5 })

    const result = await processSlimeTurn(slime, [reservation], 5)

    expect(result.updatedSlime.stats.hp).toBe(20) // 50 - 30 = 20
    expect(result.updatedSlime.incapacitatedUntilTurn).toBeUndefined()
  })

  // ----------------------------------------------------------------
  // テスト9: インベントリ満杯でも battle_win は記録される（+ inventory_full）
  // ----------------------------------------------------------------
  it('インベントリ満杯でも battle_win が記録され inventory_full も発生する', async () => {
    const fullInventory: InventorySlot[] = Array.from(
      { length: INVENTORY_MAX_SLOTS },
      (_, i) => ({ foodId: `food-filler-${String(i).padStart(3, '0')}`, quantity: 1 })
    )
    const slime = makeSlime({ stats: makeStats({ atk: 100, spd: 0 }), inventory: fullInventory })
    const reservation = makeBattleReservation('beast', 'weak')

    const result = await executeReservedAction(slime, reservation, foods)

    const winEvent = result.events.find((e) => e.eventType === 'battle_win')
    expect(winEvent).toBeDefined()
    const fullEvent = result.events.find((e) => e.eventType === 'inventory_full')
    expect(fullEvent).toBeDefined()
    expect(result.updatedSlime.inventory!.length).toBe(INVENTORY_MAX_SLOTS)
  })

  // ----------------------------------------------------------------
  // テスト10: targetCategory / targetStrength がない場合スキップされる
  // ----------------------------------------------------------------
  it('actionData に targetCategory がない場合アクションがスキップされる', async () => {
    const slime = makeSlime()
    const reservation = makeBattleReservation('', '')

    const result = await executeReservedAction(slime, reservation, foods)

    const battleEvent = result.events.find(
      (e) => e.eventType === 'battle_win' || e.eventType === 'battle_lose'
    )
    expect(battleEvent).toBeUndefined()
    expect(result.updatedSlime.stats.hp).toBe(slime.stats.hp)
    expect(result.updatedSlime.stats.exp).toBe(slime.stats.exp)
    expect(result.updatedSlime.incapacitatedUntilTurn).toBeUndefined()
  })
})
