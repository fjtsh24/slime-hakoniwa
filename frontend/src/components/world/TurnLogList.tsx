import { useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { foods } from '../../../../shared/data/foods'
import type { TurnLog, TurnEventType } from '../../../../shared/types/turnLog'

interface TurnLogListProps {
  slimeId: string
  worldId: string
  slimeName?: string
}

function convertTurnLog(id: string, data: Record<string, unknown>): TurnLog {
  const processedAt =
    data.processedAt instanceof Timestamp
      ? data.processedAt.toDate()
      : (data.processedAt as Date)
  return {
    id,
    worldId: data.worldId as string,
    slimeId: data.slimeId as string,
    turnNumber: data.turnNumber as number,
    eventType: data.eventType as TurnEventType,
    eventData: data.eventData as Record<string, unknown>,
    processedAt,
  }
}

function formatEvent(eventType: TurnEventType, eventData: Record<string, unknown>): string {
  switch (eventType) {
    case 'eat': {
      const foodId = eventData.foodId as string | undefined
      const foodName = foodId ? (foods.find((f) => f.id === foodId)?.name ?? foodId) : '不明'
      return `食事した（${foodName}）`
    }
    case 'move': {
      const x = eventData.targetX as number | undefined
      const y = eventData.targetY as number | undefined
      return x !== undefined && y !== undefined ? `(${x}, ${y}) に移動した` : '移動した'
    }
    case 'rest':
      return '休息した（hunger +10）'
    case 'battle_win':
      return '戦闘に勝利した'
    case 'battle_lose':
      return '戦闘に敗北した'
    case 'evolve': {
      const to = eventData.toSpeciesId as string | undefined
      return `進化した${to ? `（→ ${to}）` : ''}`
    }
    case 'split':
      return '分裂した'
    case 'merge':
      return '融合した'
    case 'autonomous': {
      const action = eventData.action as string | undefined
      if (action === 'wander') return '自律：歩き回った'
      if (action === 'recover') return '自律：HP微回復'
      if (action === 'starving') return '自律：空腹で動けなかった'
      return '自律行動'
    }
    case 'hunger_decrease': {
      const before = eventData.before as number | undefined
      const after = eventData.after as number | undefined
      const delta = before !== undefined && after !== undefined ? before - after : undefined
      return `hunger が ${delta !== undefined ? delta : '?'} 減少した`
    }
    case 'skill_grant': {
      const skillId = eventData.skillId as string | undefined
      return `スキルを習得した${skillId ? `（${skillId}）` : ''}`
    }
    default:
      return String(eventType)
  }
}

const EVENT_COLORS: Record<TurnEventType, string> = {
  eat: 'bg-green-100 text-green-700',
  move: 'bg-blue-100 text-blue-700',
  rest: 'bg-yellow-100 text-yellow-700',
  battle_win: 'bg-purple-100 text-purple-700',
  battle_lose: 'bg-red-100 text-red-700',
  evolve: 'bg-orange-100 text-orange-700',
  split: 'bg-pink-100 text-pink-700',
  merge: 'bg-indigo-100 text-indigo-700',
  autonomous: 'bg-gray-100 text-gray-600',
  hunger_decrease: 'bg-red-50 text-red-500',
  skill_grant: 'bg-purple-50 text-purple-600',
}

export function TurnLogList({ slimeId, worldId, slimeName }: TurnLogListProps) {
  const [logs, setLogs] = useState<TurnLog[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const q = query(
      collection(db, 'turnLogs'),
      where('slimeId', '==', slimeId),
      where('worldId', '==', worldId),
      orderBy('turnNumber', 'desc'),
      limit(20)
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) =>
          convertTurnLog(d.id, d.data() as Record<string, unknown>)
        )
        setLogs(items)
        setIsLoading(false)
      },
      (err) => {
        console.error('TurnLogList: snapshot error', err)
        setIsLoading(false)
      }
    )

    return () => unsubscribe()
  }, [slimeId, worldId])

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow p-4 text-sm text-gray-400">
        ターンログを読み込み中...
      </div>
    )
  }

  if (logs.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow p-4 text-sm text-gray-400">
        まだターンログがありません
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-3">
      <h2 className="text-base font-bold text-gray-700">
        {slimeName ? `${slimeName} のターンログ` : 'ターンログ'}
        <span className="text-sm font-normal text-gray-400 ml-1">（直近{logs.length}件）</span>
      </h2>
      <ul className="flex flex-col gap-2">
        {logs.map((log) => (
          <li key={log.id} className="flex items-start gap-2 text-sm">
            <span className="text-gray-400 whitespace-nowrap text-xs mt-0.5">
              Turn {log.turnNumber}
            </span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${EVENT_COLORS[log.eventType] ?? 'bg-gray-100 text-gray-600'}`}
            >
              {formatEvent(log.eventType, log.eventData)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
