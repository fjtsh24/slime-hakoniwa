import { useEffect, useState, useRef } from 'react'
import { useWorldStore } from '../../stores/worldStore'

interface TurnTimerProps {
  worldId: string
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
    </div>
  )
}
