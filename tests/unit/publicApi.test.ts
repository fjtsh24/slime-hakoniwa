/**
 * 公開API 非公開フィールド漏洩テスト（Phase 6 Week 1）
 *
 * テスト観点:
 *   MUST-1: GET /public/players/:handle のホワイトリスト実装
 *   MUST-5: GET /public/live の eventData フィルタリング
 *
 * 実行方法:
 *   cd functions && npx jest tests/unit/publicApi.test.ts --verbose
 */

// ================================================================
// firebase-admin モック
// ================================================================

const mockHandleDocGet = jest.fn()
const mockProfileDocGet = jest.fn()
const mockSlimeDocGet = jest.fn()
const mockLiveQuery = {
  where: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  get: jest.fn(),
}

jest.mock('firebase-admin', () => {
  const firestoreInst = {
    collection: jest.fn((name: string) => {
      if (name === 'publicHandles') {
        return { doc: jest.fn(() => ({ get: mockHandleDocGet })) }
      }
      if (name === 'publicProfiles') {
        return { doc: jest.fn(() => ({ get: mockProfileDocGet })) }
      }
      if (name === 'slimes') {
        return { doc: jest.fn(() => ({ get: mockSlimeDocGet })) }
      }
      if (name === 'turnLogs') {
        return mockLiveQuery
      }
      return { doc: jest.fn(() => ({ get: jest.fn().mockResolvedValue({ exists: false }) })) }
    }),
    runTransaction: jest.fn(),
    batch: jest.fn(() => ({ set: jest.fn(), update: jest.fn(), delete: jest.fn(), commit: jest.fn() })),
  }

  return {
    firestore: jest.fn(() => firestoreInst),
    initializeApp: jest.fn(),
    apps: ['mock'], // 初期化済みにしてinitializeAppを呼ばせない
    credential: { cert: jest.fn() },
  }
})

jest.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: jest.fn() },
}))

jest.mock('../../netlify/functions/helpers/auth', () => ({
  verifyIdToken: jest.fn().mockResolvedValue({ uid: 'test-uid' }),
}))

jest.mock('../../shared/lib/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}))

// ================================================================
// ハンドラのインポート（モック設定後）
// ================================================================

import { handler } from '../../netlify/functions/api'
import type { HandlerEvent, HandlerResponse } from '@netlify/functions'

/** void になることはないが型上 void | HandlerResponse になるのでキャストするヘルパー */
async function callHandler(event: HandlerEvent): Promise<HandlerResponse> {
  const res = await handler(event, {} as never)
  return res as HandlerResponse
}

// ================================================================
// テスト用ユーティリティ
// ================================================================

function makeEvent(overrides: Partial<HandlerEvent>): HandlerEvent {
  return {
    httpMethod: 'GET',
    path: '/api/public/players/testuser',
    headers: {},
    multiValueHeaders: {},
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    body: null,
    isBase64Encoded: false,
    rawUrl: 'http://localhost',
    rawQuery: '',
    ...overrides,
  }
}

function docSnap(exists: boolean, data: Record<string, unknown> = {}) {
  return { exists, id: data['id'] ?? 'mock-id', data: () => (exists ? data : undefined) }
}

/** Firestore Timestamp 風モック */
function makeTimestamp(date: Date) {
  return {
    toDate: () => date,
    seconds: Math.floor(date.getTime() / 1000),
    _isTimestamp: true,
    constructor: { name: 'Timestamp' },
  }
}

// ================================================================
// Firestoreモックのリセット用ヘルパー
// ================================================================

/** publicHandles → uid の逆引きをモック */
function mockPublicHandlesDoc(uid: string | null) {
  if (uid) {
    mockHandleDocGet.mockResolvedValue(docSnap(true, { uid }))
  } else {
    mockHandleDocGet.mockResolvedValue(docSnap(false))
  }
}

/** publicProfiles/{uid} をモック */
function mockPublicProfile(data: Record<string, unknown> | null) {
  if (data) {
    mockProfileDocGet.mockResolvedValue(docSnap(true, data))
  } else {
    mockProfileDocGet.mockResolvedValue(docSnap(false))
  }
}

// Firestore に格納される汚染済みプロフィールデータ（非公開フィールドが混入した最悪ケース）
const MOCK_UID = 'uid-secret-player-001'
const POLLUTED_PROFILE: Record<string, unknown> = {
  publicHandle: 'testuser',
  displayName: 'テストプレイヤー',
  ownerUid: MOCK_UID, // 非公開: UID が混入
  slimeSummaries: [
    {
      id: 'slime-001',
      name: 'テストスライム',
      speciesId: 'slime-001',
      stats: {
        hp: 100,
        atk: 10,
        def: 8,
        spd: 6,
        exp: 1500,     // 非公開: 経験値が混入
        hunger: 75,    // 非公開: 満腹度が混入
      },
      racialValues: {  // 非公開: 種族値が混入
        fire: 0.8, water: 0.1, earth: 0.0, wind: 0.0,
        slime: 0.3, plant: 0.0, human: 0.0, beast: 0.5, spirit: 0.0, fish: 0.0,
      },
      skillIds: ['skill-fire-001', 'skill-heal-001'], // 非公開: スキルが混入
      incapacitatedUntilTurn: 42,                     // 非公開: 戦闘不能情報が混入
      color: '#ef4444',
    },
  ],
}

// ================================================================
// MUST-1: GET /public/players/:handle ホワイトリストテスト
// ================================================================

describe('MUST-1: GET /public/players/:handle — 非公開フィールド漏洩テスト', () => {
  const validEvent = makeEvent({
    httpMethod: 'GET',
    path: '/api/public/players/testuser',
  })

  beforeEach(() => {
    jest.clearAllMocks()
    mockPublicHandlesDoc(MOCK_UID)
    mockPublicProfile(POLLUTED_PROFILE)
  })

  it('TC-1-01: レスポンス最上位に ownerUid が含まれない', async () => {
    const res = await callHandler(validEvent)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body).not.toHaveProperty('ownerUid')
  })

  it('TC-1-02: slimeSummaries[].stats に exp が含まれない', async () => {
    const res = await callHandler(validEvent)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.slimeSummaries[0].stats).not.toHaveProperty('exp')
  })

  it('TC-1-03: slimeSummaries[].stats に hunger が含まれない', async () => {
    const res = await callHandler(validEvent)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.slimeSummaries[0].stats).not.toHaveProperty('hunger')
  })

  it('TC-1-04: slimeSummaries[] に racialValues が含まれない', async () => {
    const res = await callHandler(validEvent)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.slimeSummaries[0]).not.toHaveProperty('racialValues')
  })

  it('TC-1-05: slimeSummaries[] に skillIds が含まれない', async () => {
    const res = await callHandler(validEvent)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.slimeSummaries[0]).not.toHaveProperty('skillIds')
  })

  it('TC-1-06: slimeSummaries[] に incapacitatedUntilTurn が含まれない', async () => {
    const res = await callHandler(validEvent)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.slimeSummaries[0]).not.toHaveProperty('incapacitatedUntilTurn')
  })

  it('TC-1-07: 公開フィールド（publicHandle/displayName/stats4項目/color）は正しく返される', async () => {
    const res = await callHandler(validEvent)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.publicHandle).toBe('testuser')
    expect(body.displayName).toBe('テストプレイヤー')
    expect(body.slimeSummaries[0]).toMatchObject({
      id: 'slime-001',
      name: 'テストスライム',
      speciesId: 'slime-001',
      stats: { hp: 100, atk: 10, def: 8, spd: 6 },
      color: '#ef4444',
    })
  })

  it('TC-1-08: slimeSummaries[].stats が null のときでも 500 にならない', async () => {
    mockPublicProfile({
      publicHandle: 'testuser',
      displayName: 'テスト',
      slimeSummaries: [
        { id: 'slime-broken', name: '壊れたスライム', speciesId: 'slime-001', stats: null, color: null },
      ],
    })
    const res = await callHandler(validEvent)
    expect(res.statusCode).not.toBe(500)
    if (res.statusCode === 200) {
      const body = JSON.parse(res.body!)
      expect(body.slimeSummaries[0].stats).toEqual({ hp: 0, atk: 0, def: 0, spd: 0 })
    }
  })

  it('TC-1-09: 存在しないハンドルに対して 404 を返す', async () => {
    mockPublicHandlesDoc(null)
    const res = await callHandler(validEvent)
    expect(res.statusCode).toBe(404)
  })

  it('TC-1-10: 2文字以下のハンドルに対して 400 を返す', async () => {
    const shortEvent = makeEvent({ path: '/api/public/players/ab' })
    const res = await callHandler(shortEvent)
    expect(res.statusCode).toBe(400)
  })

  it('TC-1-11: ハンドルに特殊文字が含まれる場合 400 を返す', async () => {
    const xssEvent = makeEvent({ path: '/api/public/players/<script>alert(1)</script>' })
    const res = await callHandler(xssEvent)
    expect(res.statusCode).toBe(400)
  })
})

// ================================================================
// MUST-5: GET /public/live — eventData フィルタリングテスト
// ================================================================

describe('MUST-5: GET /public/live — 非公開イベントタイプ・eventData 漏洩テスト', () => {
  const liveEvent = makeEvent({ httpMethod: 'GET', path: '/api/public/live' })

  /** Firestore の slimes/{id} に格納される完全なスライムドキュメント */
  const FULL_SLIME_DOC = {
    id: 'slime-abc',
    name: 'バトルスライム',
    speciesId: 'slime-fire-001',
    ownerUid: 'uid-secret-001', // 非公開
    color: '#ef4444',
    racialValues: { fire: 0.9, water: 0, earth: 0, wind: 0, slime: 0, plant: 0, human: 0, beast: 0, spirit: 0, fish: 0 },
    stats: { hp: 200, atk: 50, def: 30, spd: 20, exp: 9999, hunger: 50 },
    skillIds: ['skill-inferno'],
    incapacitatedUntilTurn: 0,
    tileX: 5, tileY: 5, mapId: 'map-001', worldId: 'world-001', isWild: false,
  }

  function setupLive(
    logDocs: Array<{ id: string; data: Record<string, unknown> }>,
    slimeDoc = FULL_SLIME_DOC
  ) {
    mockLiveQuery.get.mockResolvedValue({
      docs: logDocs.map((d) => ({ id: d.id, data: () => d.data })),
      empty: logDocs.length === 0,
    })
    mockSlimeDocGet.mockResolvedValue(docSnap(true, slimeDoc))
  }

  function makeLog(
    eventType: string,
    eventData: Record<string, unknown>,
    slimeId: string | null = 'slime-abc'
  ) {
    return {
      id: `log-${eventType}`,
      data: {
        worldId: 'world-001',
        turnNumber: 10,
        eventType,
        actorType: 'slime',
        slimeId,
        eventData,
        processedAt: makeTimestamp(new Date('2026-03-21T12:00:00Z')),
      },
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('TC-5-01: evolve の eventData は previousSpeciesId・newSpeciesId のみ', async () => {
    setupLive([
      makeLog('evolve', {
        previousSpeciesId: 'slime-001',
        newSpeciesId: 'slime-fire-001',
        internalField: 'MUST_NOT_APPEAR', // 混入フィールド
      }),
    ])
    const res = await callHandler(liveEvent)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.events).toHaveLength(1)
    const evt = body.events[0]
    expect(evt.eventData).toEqual({
      previousSpeciesId: 'slime-001',
      newSpeciesId: 'slime-fire-001',
    })
    expect(evt.eventData).not.toHaveProperty('internalField')
  })

  it.each(['split', 'merge', 'battle_win'])(
    'TC-5-02: %s の eventData は {} になる（内部フィールドを除去）',
    async (eventType) => {
      setupLive([
        makeLog(eventType, { loserSlimeId: 'loser-123', damageDealt: 999 }),
      ])
      const res = await callHandler(liveEvent)
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body!)
      expect(body.events[0].eventData).toEqual({})
    }
  )

  it('TC-5-03: slimeSummary に ownerUid が含まれない', async () => {
    setupLive([makeLog('battle_win', {})])
    const res = await callHandler(liveEvent)
    const body = JSON.parse(res.body!)
    expect(body.events[0].slimeSummary).not.toHaveProperty('ownerUid')
  })

  it('TC-5-04: slimeSummary に racialValues が含まれない', async () => {
    setupLive([makeLog('evolve', { previousSpeciesId: 'slime-001', newSpeciesId: 'slime-002' })])
    const res = await callHandler(liveEvent)
    const body = JSON.parse(res.body!)
    expect(body.events[0].slimeSummary).not.toHaveProperty('racialValues')
  })

  it('TC-5-05: slimeSummary に stats（exp/hunger 含む）が含まれない', async () => {
    setupLive([makeLog('merge', {})])
    const res = await callHandler(liveEvent)
    const body = JSON.parse(res.body!)
    const summary = body.events[0].slimeSummary
    expect(summary).not.toHaveProperty('stats')
    expect(summary).not.toHaveProperty('exp')
    expect(summary).not.toHaveProperty('hunger')
  })

  it('TC-5-06: slimeSummary に skillIds・incapacitatedUntilTurn が含まれない', async () => {
    setupLive([makeLog('split', {})])
    const res = await callHandler(liveEvent)
    const body = JSON.parse(res.body!)
    const summary = body.events[0].slimeSummary
    expect(summary).not.toHaveProperty('skillIds')
    expect(summary).not.toHaveProperty('incapacitatedUntilTurn')
  })

  it('TC-5-07: slimeId が null のとき slimeSummary は null', async () => {
    setupLive([makeLog('evolve', { previousSpeciesId: 'slime-001', newSpeciesId: 'slime-002' }, null)])
    const res = await callHandler(liveEvent)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    expect(body.events[0].slimeSummary).toBeNull()
  })

  it('TC-5-08: 公開イベントが0件のとき events は []', async () => {
    setupLive([])
    const res = await callHandler(liveEvent)
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body!).events).toEqual([])
  })

  it('TC-5-09: 深層防御 — 非公開 eventType が混入しても eventData の機密情報が漏洩しない', async () => {
    // DBクエリフィルタをすり抜けた eat イベントを想定
    setupLive([makeLog('eat', { foodId: 'food-herb-secret', hungerGain: 30 })])
    const res = await callHandler(liveEvent)
    // 200 で返った場合でも機密情報が含まれないこと
    const bodyStr = res.body ?? ''
    expect(bodyStr).not.toContain('food-herb-secret')
    expect(bodyStr).not.toContain('hungerGain')
    // イベントが除去されるか eventData が空であること
    if (res.statusCode === 200) {
      const body = JSON.parse(bodyStr)
      const hasSecret = body.events?.some(
        (e: { eventData?: Record<string, unknown> }) =>
          e.eventData?.['foodId'] != null || e.eventData?.['hungerGain'] != null
      ) ?? false
      expect(hasSecret).toBe(false)
    }
  })

  it('TC-5-10: slimeSummary には name・speciesId・color・slimeId のみ含まれる', async () => {
    setupLive([makeLog('battle_win', {})])
    const res = await callHandler(liveEvent)
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body!)
    const summary = body.events[0].slimeSummary
    expect(summary).toHaveProperty('name', 'バトルスライム')
    expect(summary).toHaveProperty('speciesId', 'slime-fire-001')
    expect(summary).toHaveProperty('color', '#ef4444')
    expect(summary).toHaveProperty('slimeId', 'slime-abc')
  })
})
