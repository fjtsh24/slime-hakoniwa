import { create } from 'zustand'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { User } from '../../../shared/types/user'

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

    const unsubscribe = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          set({ userProfile: snap.data() as User, isLoading: false })
        } else {
          set({ userProfile: null, isLoading: false })
        }
      },
      (error) => {
        console.error('userStore: onSnapshot error', error)
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
