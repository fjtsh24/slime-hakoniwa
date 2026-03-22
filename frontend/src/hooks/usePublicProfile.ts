/**
 * 公開プロフィール取得フック（Phase 7: A7/QA H-03 対応）
 *
 * PlayerProfilePage と PlayerMapPage で共通利用する。
 * /api/public/players/:handle を呼び出し、プロフィール・スライム一覧・mapId を返す。
 */

import { useEffect, useState } from 'react'
import type { SlimeSummary } from '../../../shared/types/publicProfile'

export interface PublicProfileData {
  publicHandle: string
  displayName: string
  slimeSummaries: SlimeSummary[]
  mapId: string | null
}

interface UsePublicProfileResult {
  profile: PublicProfileData | null
  isLoading: boolean
  error: string | null
}

export function usePublicProfile(handle: string | undefined): UsePublicProfileResult {
  const [profile, setProfile] = useState<PublicProfileData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!handle) {
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    setProfile(null)

    fetch(`/api/public/players/${encodeURIComponent(handle)}`)
      .then(async (res) => {
        if (res.status === 404) {
          setError('プレイヤーが見つかりません')
          return
        }
        if (!res.ok) {
          setError('プロフィールの取得に失敗しました')
          return
        }
        const data = await res.json() as PublicProfileData
        setProfile(data)
      })
      .catch(() => setError('通信エラーが発生しました'))
      .finally(() => setIsLoading(false))
  }, [handle])

  return { profile, isLoading, error }
}
