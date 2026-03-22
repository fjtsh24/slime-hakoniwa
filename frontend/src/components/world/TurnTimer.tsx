import { useEffect, useState, useRef } from 'react'
import { useWorldStore } from '../../stores/worldStore'

interface TurnTimerProps {
  worldId: string
}

const SEASON_DURATION_TURNS = 120

const SEASON_LABELS: Record<string, string> = {
  spring: '春', summer: '夏', autumn: '秋', winter: '冬',
}
const SEASON_COLORS: Record<string, string> = {
  spring: 'bg-green-100 text-green-700',
  summer: 'bg-orange-100 text-orange-700',
  autumn: 'bg-amber-100 text-amber-700',
  winter: 'bg-blue-100 text-blue-700',
}
const SEASON_HUNGER_NOTE: Record<string, string> = {
  summer: '空腹+2/ターン',
  winter: '空腹+1/ターン',
}

const WEATHER_LABELS: Record<string, string> = {
  sunny: '晴れ', rainy: '雨', stormy: '嵐', foggy: '霧',
}
const WEATHER_COLORS: Record<string, string> = {
  sunny: 'bg-yellow-50 text-yellow-700',
  rainy: 'bg-sky-100 text-sky-700',
  stormy: 'bg-slate-100 text-slate-700',
  foggy: 'bg-gray-100 text-gray-600',
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':')
}

export function TurnTimer({ worldId: _worldId }: TurnTimerProps) {
  const world = useWorldStore((s) => s.world)
  const isLoading = useWorldStore((s) => s.isLoading)

  const [remainingSec, setRemainingSec] = useState<number>(0)
  const [turnAdvancedMsg, setTurnAdvancedMsg] = useState(false)
  const prevTurnRef = useRef<number | null>(null)

  useEffect(() => {
    if (!world) return

    // ターン進行検出
    if (prevTurnRef.current !== null && prevTurnRef.current !== world.currentTurn) {
      setTurnAdvancedMsg(true)
      const timer = setTimeout(() => setTurnAdvancedMsg(false), 5000)
      return () => clearTimeout(timer)
    }
    prevTurnRef.current = world.currentTurn
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [world?.currentTurn])

  useEffect(() => {
    if (!world) return

    const tick = () => {
      const diff = Math.max(0, Math.floor((world.nextTurnAt.getTime() - Date.now()) / 1000))
      setRemainingSec(diff)
    }

    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [world])

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow p-4 flex items-center gap-3 text-gray-400">
        <span className="animate-spin h-5 w-5 border-2 border-gray-300 border-t-green-500 rounded-full" />
        <span>ワールド情報を読み込み中...</span>
      </div>
    )
  }

  if (!world) {
    return (
      <div className="bg-white rounded-xl shadow p-4 text-gray-400">
        ワールド情報が取得できません
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 font-medium">現在のターン</span>
        <span className="text-lg font-bold text-green-700">Turn {world.currentTurn}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500 font-medium">次のターンまで</span>
        {remainingSec === 0 ? (
          <span className="text-sm font-medium text-gray-400 animate-pulse">ターン処理中...</span>
        ) : (
          <span className="text-2xl font-mono font-bold text-gray-800">
            {formatCountdown(remainingSec)}
          </span>
        )}
      </div>
      {turnAdvancedMsg && (
        <div className="mt-1 text-center text-green-600 font-semibold animate-pulse">
          ターンが進行しました！
        </div>
      )}

      {/* 季節・天候 */}
      {(world.season || world.weather) && (
        <div className="mt-2 pt-2 border-t border-gray-100 flex flex-col gap-1.5">
          {world.season && (() => {
            const remainingTurns = world.seasonStartTurn !== undefined
              ? Math.max(0, (world.seasonStartTurn + SEASON_DURATION_TURNS) - world.currentTurn)
              : null
            const hungerNote = SEASON_HUNGER_NOTE[world.season]
            return (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${SEASON_COLORS[world.season] ?? 'bg-gray-100 text-gray-600'}`}>
                    {SEASON_LABELS[world.season] ?? world.season}
                  </span>
                  {hungerNote && (
                    <span className="text-xs text-orange-500 font-medium">{hungerNote}</span>
                  )}
                </div>
                {remainingTurns !== null && (
                  <span className="text-xs text-gray-400">あと{remainingTurns}ターン</span>
                )}
              </div>
            )
          })()}

          {world.weather && (() => {
            const remainingTurns = world.weatherEndsAtTurn !== undefined
              ? Math.max(0, world.weatherEndsAtTurn - world.currentTurn)
              : null
            return (
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${WEATHER_COLORS[world.weather] ?? 'bg-gray-100 text-gray-600'}`}>
                  {WEATHER_LABELS[world.weather] ?? world.weather}
                </span>
                {remainingTurns !== null && (
                  <span className="text-xs text-gray-400">あと{remainingTurns}ターン</span>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}
