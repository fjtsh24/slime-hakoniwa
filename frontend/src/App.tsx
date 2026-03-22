import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './stores/authStore'
import { useUserStore } from './stores/userStore'
import { trackPageView } from './lib/analytics'
import { LoginPage } from './components/auth/LoginPage'
import { GamePage } from './pages/GamePage'
import { SetupPage } from './pages/SetupPage'
import { MapSettingsPage } from './pages/MapSettingsPage'
import { CreditsPage } from './pages/CreditsPage'
import { EncyclopediaPage } from './pages/EncyclopediaPage'
import { PlayerProfilePage } from './pages/PlayerProfilePage'
import { LiveFeedPage } from './pages/LiveFeedPage'
import { PlayerMapPage } from './pages/PlayerMapPage'

function AppRoutes() {
  const user = useAuthStore((s) => s.user)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const { userProfile, isLoading: isUserLoading, subscribe, cleanup } = useUserStore()
  const location = useLocation()

  useEffect(() => {
    trackPageView(location.pathname)
  }, [location.pathname])

  // 認証状態が確定したらuserProfileの購読を開始・停止する
  useEffect(() => {
    if (!user) {
      cleanup()
      return
    }
    subscribe(user.uid)
    return () => cleanup()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  // 1. 認証ロード中 → スピナー
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <span className="animate-spin h-8 w-8 border-4 border-green-300 border-t-green-600 rounded-full" />
      </div>
    )
  }

  // 2. 未認証 → 公開ページはそのまま表示、それ以外は /login にリダイレクト
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/encyclopedia" element={<EncyclopediaPage />} />
        <Route path="/players/:handle" element={<PlayerProfilePage />} />
        <Route path="/players/:handle/map" element={<PlayerMapPage />} />
        <Route path="/live" element={<LiveFeedPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }

  // 3. 認証済み・userProfileロード中 → スピナー
  if (isUserLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <span className="animate-spin h-8 w-8 border-4 border-green-300 border-t-green-600 rounded-full" />
      </div>
    )
  }

  // 4. 認証済み・userProfileなし（mapId未設定）→ /setup
  // 5. 認証済み・userProfileあり → /game
  const hasMap = Boolean(userProfile?.mapId)

  return (
    <Routes>
      <Route
        path="/login"
        element={<Navigate to={hasMap ? '/game' : '/setup'} replace />}
      />
      <Route
        path="/setup"
        element={hasMap ? <Navigate to="/game" replace /> : <SetupPage />}
      />
      <Route
        path="/game"
        element={hasMap ? <GamePage /> : <Navigate to="/setup" replace />}
      />
      <Route
        path="/map-settings"
        element={hasMap ? <MapSettingsPage /> : <Navigate to="/setup" replace />}
      />
      <Route
        path="/"
        element={<Navigate to={hasMap ? '/game' : '/setup'} replace />}
      />
      <Route path="/credits" element={<CreditsPage />} />
      <Route path="/encyclopedia" element={<EncyclopediaPage />} />
      <Route path="/players/:handle" element={<PlayerProfilePage />} />
      <Route path="/players/:handle/map" element={<PlayerMapPage />} />
      <Route path="/live" element={<LiveFeedPage />} />
      <Route
        path="*"
        element={<Navigate to={hasMap ? '/game' : '/setup'} replace />}
      />
    </Routes>
  )
}

function App() {
  const initialize = useAuthStore((s) => s.initialize)

  useEffect(() => {
    initialize()
  }, [initialize])

  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}

export default App
