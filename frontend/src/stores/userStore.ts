import { create } from 'zustand'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { User } from '../../../shared/types/user'
import { createLogger } from '../lib/logger'

const logger = createLogger('userStore')

interface UserState {
  userProfile: User | null
  isLoading: boolean
  _unsubscribe: (() => void) | null
  subscribe: (uid: string) => void
  cleanup: () => void
}

export const useUserStore = create<UserState>((set, get) => ({
  userProfile: null,
  isLoading: true,
  _unsubscribe: null,

  subscribe: (uid: string) => {
    const { _unsubscribe } = get()
    if (_unsubscribe) _unsubscribe()

    logger.debug('ユーザープロファイル購読開始', { uid })
    const unsubscribe = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          const profile = snap.data() as User
          logger.debug('ユーザープロファイル取得', { uid, mapId: profile.mapId, hasSlime: (profile as unknown as Record<string, unknown>)['hasSlime'] })
          set({ userProfile: profile, isLoading: false })
        } else {
          logger.debug('ユーザードキュメント未存在', { uid })
          set({ userProfile: null, isLoading: false })
        }
      },
      (error) => {
        logger.error('onSnapshot error', { uid, error: error.message })
        set({ userProfile: null, isLoading: false })
      }
    )
    set({ _unsubscribe: unsubscribe })
  },

  cleanup: () => {
    const { _unsubscribe } = get()
    if (_unsubscribe) {
      _unsubscribe()
      set({ _unsubscribe: null, userProfile: null, isLoading: true })
    }
  },
}))
