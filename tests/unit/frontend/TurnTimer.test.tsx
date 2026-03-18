import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TurnTimer } from '../../../frontend/src/components/world/TurnTimer'
import { useWorldStore } from '../../../frontend/src/stores/worldStore'
import type { World } from '../../../shared/types/world'

// worldStore をモック
vi.mock('../../../frontend/src/stores/worldStore', () => ({
  useWorldStore: vi.fn(),
}))

const mockUseWorldStore = vi.mocked(useWorldStore)

const buildWorldState = (overrides: Partial<World> = {}) => {
  const nextTurnAt = new Date(Date.now() + 3661 * 1000) // 約1時間1分1秒後
  const world: World = {
    id: 'world-001',
    name: 'テストワールド',
    currentTurn: 42,
    nextTurnAt,
    turnIntervalSec: 3600,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    ...overrides,
  }
  return world
}

describe('TurnTimer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('currentTurn が表示されること', () => {
    const world = buildWorldState({ currentTurn: 42 })

    // useWorldStore の各セレクタ呼び出しに応じて値を返す
    mockUseWorldStore.mockImplementation((selector: (s: { world: World | null; isLoading: boolean; error: string | null }) => unknown) => {
      const state = { world, isLoading: false, error: null }
      return selector(state) as ReturnType<typeof useWorldStore>
    })

    render(<TurnTimer worldId="world-001" />)

    expect(screen.getByText(/Turn 42/)).toBeTruthy()
  })

  it('カウントダウンが表示されること（nextTurnAt が未来の場合）', () => {
    const world = buildWorldState()

    mockUseWorldStore.mockImplementation((selector: (s: { world: World | null; isLoading: boolean; error: string | null }) => unknown) => {
      const state = { world, isLoading: false, error: null }
      return selector(state) as ReturnType<typeof useWorldStore>
    })

    render(<TurnTimer worldId="world-001" />)

    // HH:MM:SS 形式のカウントダウンが存在すること
    const countdownEl = screen.getByText(/\d{2}:\d{2}:\d{2}/)
    expect(countdownEl).toBeTruthy()

    // 00:00:00 ではないこと（未来の nextTurnAt のため）
    expect(countdownEl.textContent).not.toBe('00:00:00')
  })

  it('isLoading=true のときローディング表示されること', () => {
    mockUseWorldStore.mockImplementation((selector: (s: { world: World | null; isLoading: boolean; error: string | null }) => unknown) => {
      const state = { world: null, isLoading: true, error: null }
      return selector(state) as ReturnType<typeof useWorldStore>
    })

    render(<TurnTimer worldId="world-001" />)

    expect(screen.getByText(/ワールド情報を読み込み中/)).toBeTruthy()
  })

  it('world が null のとき取得失敗メッセージが表示されること', () => {
    mockUseWorldStore.mockImplementation((selector: (s: { world: World | null; isLoading: boolean; error: string | null }) => unknown) => {
      const state = { world: null, isLoading: false, error: null }
      return selector(state) as ReturnType<typeof useWorldStore>
    })

    render(<TurnTimer worldId="world-001" />)

    expect(screen.getByText(/ワールド情報が取得できません/)).toBeTruthy()
  })
})
