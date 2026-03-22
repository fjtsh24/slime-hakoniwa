import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { slimeSpecies } from '../../../shared/data/slimeSpecies'
import type { SlimeSummary } from '../../../shared/types/publicProfile'

interface PublicProfileData {
  publicHandle: string
  displayName: string
  slimeSummaries: SlimeSummary[]
}

function getSpeciesName(speciesId: string): string {
  return slimeSpecies.find((s) => s.id === speciesId)?.name ?? speciesId
}

export function PlayerMapPage() {
  const { handle } = useParams<{ handle: string }>()
  const [profile, setProfile] = useState<PublicProfileData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!handle) return
    setIsLoading(true)
    setError(null)

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

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <span className="animate-spin h-8 w-8 border-4 border-green-300 border-t-green-600 rounded-full" />
      </div>
    )
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-600">{error ?? 'プレイヤーが見つかりません'}</p>
        {handle && (
          <Link to={`/players/${handle}`} className="text-green-600 hover:underline text-sm">
            ← プロフィールに戻る
          </Link>
        )}
        <Link to="/encyclopedia" className="text-green-600 hover:underline text-sm">
          スライム図鑑を見る
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-700 text-white shadow px-4 py-3 flex items-center gap-3">
        <Link
          to={`/players/${profile.publicHandle}`}
          className="text-sm opacity-80 hover:opacity-100"
        >
          ← プロフィールに戻る
        </Link>
        <h1 className="text-xl font-bold">
          {profile.displayName || profile.publicHandle} のマップ
        </h1>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">

        {/* マップ表示エリア（準備中） */}
        {/* TODO(Phase7): mapId を公開APIに追加し WorldMapPanel を表示する */}
        {/* TODO(Phase7): fetch ロジック・スライム一覧を PlayerProfilePage と共通フック usePublicProfile(handle) に切り出す */}
        <section className="bg-white rounded-xl shadow p-8 text-center">
          <div className="text-4xl mb-3">🗺️</div>
          <p className="text-gray-600 font-medium mb-1">マップ閲覧機能は準備中です</p>
          <p className="text-xs text-gray-400">
            将来のアップデートでこのプレイヤーのワールドマップを閲覧できるようになります
          </p>
        </section>

        {/* スライム一覧 */}
        <section className="bg-white rounded-xl shadow p-5">
          <h3 className="font-bold text-gray-700 mb-4">
            所持スライム
            <span className="ml-2 text-sm font-normal text-gray-400">
              {profile.slimeSummaries.length}体
            </span>
          </h3>

          {profile.slimeSummaries.length === 0 ? (
            <p className="text-sm text-gray-400">スライムはまだいません</p>
          ) : (
            <div className="flex flex-col gap-3">
              {profile.slimeSummaries.map((slime) => (
                <div
                  key={slime.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 border border-gray-100"
                >
                  <div
                    className="w-8 h-8 rounded-full flex-shrink-0 slime-idle"
                    style={{ backgroundColor: slime.color ?? '#86efac' }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-800 truncate">{slime.name}</div>
                    <div className="text-xs text-gray-500">{getSpeciesName(slime.speciesId)}</div>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-xs text-center flex-shrink-0">
                    {[
                      { label: 'HP', value: slime.stats.hp },
                      { label: 'ATK', value: slime.stats.atk },
                      { label: 'DEF', value: slime.stats.def },
                      { label: 'SPD', value: slime.stats.spd },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white rounded px-1 py-0.5 border border-gray-100">
                        <div className="font-bold text-gray-700">{value}</div>
                        <div className="text-gray-400">{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* CTA */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 text-center">
          <p className="text-gray-700 font-medium mb-3">あなたもスライムを育ててみませんか？</p>
          <Link
            to="/login"
            className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg transition-colors"
          >
            このゲームを始める
          </Link>
          <div className="mt-3">
            <Link to="/encyclopedia" className="text-sm text-green-600 hover:underline">
              スライム図鑑を見る
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
