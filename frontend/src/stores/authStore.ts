import { create } from 'zustand'
import {
  onAuthStateChanged,
  signOut as firebaseSignOut,
  type User as FirebaseUser,
} from 'firebase/auth'
import { auth } from '../lib/firebase'

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
        set({ user, isLoading: false })
      },
      (error) => {
        console.error('authStore: onAuthStateChanged error', error)
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
    try {
      await firebaseSignOut(auth)
      set({ user: null })
    } catch (error) {
      console.error('authStore: signOut error', error)
    }
  },
}))
