import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { slimeSpecies } from '../../../shared/data/slimeSpecies'

interface LiveSlimeSummary {
  slimeId: string
  name: string
  speciesId: string
  color: string | null
}

interface LiveEvent {
  id: string
  worldId: string
  turnNumber: number
  eventType: 'evolve' | 'split' | 'merge' | 'battle_win'
  eventData: {
    previousSpeciesId?: string
    newSpeciesId?: string
  }
  slimeSummary: LiveSlimeSummary | null
  processedAt: string
}

interface LiveFeedResponse {
  events: LiveEvent[]
}

const AUTO_REFRESH_MS = 30_000

function getEventLabel(eventType: LiveEvent['eventType']): string {
  switch (eventType) {
    case 'evolve':     return '進化'
    case 'split':      return '分裂'
    case 'merge':      return '合体'
    case 'battle_win': return '戦闘勝利'
  }
}

function getEventColors(eventType: LiveEvent['eventType']): { badge: string; border: string } {
  switch (eventType) {
    case 'evolve':     return { badge: 'bg-purple-100 text-purple-700', border: 'border-purple-200' }
    case 'split':      return { badge: 'bg-blue-100 text-blue-700',   border: 'border-blue-200' }
    case 'merge':      return { badge: 'bg-teal-100 text-teal-700',   border: 'border-teal-200' }
    case 'battle_win': return { badge: 'bg-orange-100 text-orange-700', border: 'border-orange-200' }
  }
}

function getSpeciesName(speciesId: string): string {
  return slimeSpecies.find((s) => s.id === speciesId)?.name ?? speciesId
}

function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1)  return 'たった今'
  if (minutes < 60) return `${minutes}分前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)   return `${hours}時間前`
  return `${Math.floor(hours / 24)}日前`
}

function buildEventDescription(event: LiveEvent): string {
  const slimeName = event.slimeSummary?.name ?? '不明なスライム'
  switch (event.eventType) {
    case 'evolve': {
      const from = event.eventData.previousSpeciesId ? getSpeciesName(event.eventData.previousSpeciesId) : '不明'
      const to = event.eventData.newSpeciesId ? getSpeciesName(event.eventData.newSpeciesId) : '不明'
      return `${slimeName} が ${from} から ${to} に進化した！`
    }
    case 'split':      return `${slimeName} が分裂した！`
    case 'merge':      return `${slimeName} が他のスライムと合体した！`
    case 'battle_win': return `${slimeName} が戦闘に勝利した！`
  }
}

export function LiveFeedPage() {
  const [events, setEvents] = useState<LiveEvent[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/public/live')
      if (!res.ok) {
        setError('データの取得に失敗しました')
        return
      }
      const data = await res.json() as LiveFeedResponse
      setEvents(data.events)
      setLastUpdated(new Date())
      setError(null)
    } catch {
      setError('通信エラーが発生しました')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
    intervalRef.current = setInterval(fetchEvents, AUTO_REFRESH_MS)
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [])

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-700 text-white shadow px-4 py-3 flex items-center gap-3">
        <Link to="/game" className="text-sm opacity-80 hover:opacity-100">← ゲームに戻る</Link>
        <h1 className="text-xl font-bold">ライブ観戦</h1>
        <span className="ml-auto text-xs opacity-70">
          {lastUpdated
            ? `最終更新: ${lastUpdated.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
            : '読み込み中...'}
        </span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-xl shadow p-4 mb-6 flex items-start gap-3">
          <div className="flex-1">
            <p className="text-sm text-gray-600">
              世界中のスライムが起こした注目イベントをリアルタイムで観戦できます。進化・分裂・合体・戦闘勝利の瞬間をお見逃しなく。
            </p>
            <p className="text-xs text-gray-400 mt-1">30秒ごとに自動更新。ログインなしで閲覧できます。</p>
          </div>
          <button
            onClick={() => { setIsLoading(true); fetchEvents() }}
            className="flex-shrink-0 text-xs bg-green-100 hover:bg-green-200 text-green-700 font-medium px-3 py-1.5 rounded transition"
          >
            今すぐ更新
          </button>
        </div>

        {isLoading && (
          <div className="flex justify-center py-16">
            <span className="animate-spin h-8 w-8 border-4 border-green-300 border-t-green-600 rounded-full" />
          </div>
        )}

        {!isLoading && error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center text-red-600 text-sm">{error}</div>
        )}

        {!isLoading && !error && events.length === 0 && (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-400 text-sm">
            まだイベントがありません。スライムたちが行動するのを待ちましょう。
          </div>
        )}

        {!isLoading && events.length > 0 && (
          <ol className="flex flex-col gap-3">
            {events.map((event) => {
              const colors = getEventColors(event.eventType)
              const slimeColor = event.slimeSummary?.color ?? '#86efac'
              return (
                <li key={event.id} className={`bg-white rounded-xl shadow-sm border ${colors.border} p-4 flex items-start gap-3`}>
                  <div className="w-10 h-10 rounded-full flex-shrink-0 mt-0.5" style={{ backgroundColor: slimeColor }} aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${colors.badge}`}>{getEventLabel(event.eventType)}</span>
                      <span className="text-xs text-gray-400">ターン {event.turnNumber}</span>
                    </div>
                    <p className="text-sm text-gray-800 font-medium">{buildEventDescription(event)}</p>
                    {event.eventType === 'evolve' && event.eventData.previousSpeciesId && event.eventData.newSpeciesId && (
                      <p className="text-xs text-gray-500 mt-1">
                        {getSpeciesName(event.eventData.previousSpeciesId)}
                        <span className="mx-1 text-purple-400">→</span>
                        {getSpeciesName(event.eventData.newSpeciesId)}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-400">
                      {event.slimeSummary && <span>{getSpeciesName(event.slimeSummary.speciesId)}</span>}
                      <span>·</span>
                      <time dateTime={event.processedAt}>{formatRelativeTime(event.processedAt)}</time>
                    </div>
                  </div>
                </li>
              )
            })}
          </ol>
        )}

        <div className="mt-8 bg-white rounded-xl shadow p-6 text-center">
          <p className="text-gray-700 font-medium mb-3">あなたもスライムを育ててみませんか？</p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Link to="/login" className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg transition-colors">
              ゲームを始める
            </Link>
            <Link to="/encyclopedia" className="inline-block bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-6 py-2 rounded-lg transition-colors">
              スライム図鑑を見る
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
