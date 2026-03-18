import { useEffect, useState } from 'react'
import { useUserStore } from '../stores/userStore'

const SETUP_TIMEOUT_MS = 12000

export function SetupPage() {
  const { userProfile, isLoading } = useUserStore()
  const [showError, setShowError] = useState(false)

  // Auth Triggerの処理には通常数秒かかる。十分な待機後にのみエラーを表示する
  // 遷移は AppRoutes のルートガード（hasMap）が担当するためここでは行わない
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!userProfile?.mapId) setShowError(true)
    }, SETUP_TIMEOUT_MS)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50">
      <div className="text-center">
        <div className="animate-spin h-12 w-12 border-4 border-green-300 border-t-green-600 rounded-full mx-auto mb-4" />
        <p className="text-green-800 font-medium">スライムの箱庭を準備しています...</p>
        <p className="text-green-600 text-sm mt-2">はじめてのマップを生成中です</p>
        {!isLoading && showError && !userProfile && (
          <p className="text-red-500 text-sm mt-4">
            初期化に時間がかかっています。ページを再読み込みしてください。
          </p>
        )}
      </div>
    </div>
  )
}
