import { create } from 'zustand'
import { doc, onSnapshot, Timestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { World } from '../../../shared/types/world'
import { createLogger } from '../lib/logger'

const logger = createLogger('worldStore')

interface WorldState {
  world: World | null
  isLoading: boolean
  error: string | null
  subscribeToWorld: (worldId: string) => () => void
  clearWorld: () => void
}

/**
 * Firestoreから取得したドキュメントデータの Timestamp フィールドを Date に変換する
 */
function convertTimestamps(data: Record<string, unknown>): World {
  const convert = (value: unknown): unknown => {
    if (value instanceof Timestamp) {
      return value.toDate()
    }
    return value
  }

  return {
    id: data.id as string,
    name: data.name as string,
    currentTurn: data.currentTurn as number,
    nextTurnAt: convert(data.nextTurnAt) as Date,
    turnIntervalSec: data.turnIntervalSec as number,
    createdAt: convert(data.createdAt) as Date,
  }
}

export const useWorldStore = create<WorldState>((set) => ({
  world: null,
  isLoading: false,
  error: null,

  subscribeToWorld: (worldId: string) => {
    set({ isLoading: true, error: null })

    logger.debug('ワールド購読開始', { worldId })
    const docRef = doc(db, 'worlds', worldId)
    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = { id: snapshot.id, ...snapshot.data() } as Record<string, unknown>
          const world = convertTimestamps(data)
          logger.debug('ワールド情報更新', {
            worldId,
            currentTurn: world.currentTurn,
            nextTurnAt: world.nextTurnAt instanceof Date ? world.nextTurnAt.toISOString() : String(world.nextTurnAt),
            turnIntervalSec: world.turnIntervalSec,
          })
          set({ world, isLoading: false, error: null })
        } else {
          logger.warn('ワールドドキュメント未存在', { worldId })
          set({ world: null, isLoading: false, error: `World ${worldId} not found` })
        }
      },
      (error) => {
        logger.error('Firestore snapshot error', { worldId, error: error.message })
        set({ error: error.message, isLoading: false })
      }
    )

    return unsubscribe
  },

  clearWorld: () => {
    set({ world: null, error: null })
  },
}))
