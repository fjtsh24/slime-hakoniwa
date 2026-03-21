import { create } from 'zustand'
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { auth } from '../lib/firebase'
import { createLogger } from '../lib/logger'

const logger = createLogger('authStore')

interface AuthState {
  user: FirebaseUser | null
  isLoading: boolean
  _unsubscribe: (() => void) | null
  initialize: () => void
  cleanup: () => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  _unsubscribe: null,

  initialize: () => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        logger.debug('認証状態変化', { uid: user?.uid ?? null, email: user?.email ?? null })
        set({ user, isLoading: false })
      },
      (error) => {
        logger.error('onAuthStateChanged error', { error: error.message })
        set({ user: null, isLoading: false })
      }
    )
    set({ _unsubscribe: unsubscribe })
  },

  cleanup: () => {
    const { _unsubscribe } = get()
    if (_unsubscribe) {
      _unsubscribe()
      set({ _unsubscribe: null })
    }
  },

  signOut: async () => {
    logger.debug('サインアウト開始')
    try {
      await firebaseSignOut(auth)
      set({ user: null })
      logger.debug('サインアウト完了')
    } catch (error) {
      logger.error('signOut error', { error: error instanceof Error ? error.message : String(error) })
    }
  },
}))
