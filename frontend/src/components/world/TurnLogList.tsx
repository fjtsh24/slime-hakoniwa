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
import type { TurnLog } from '../../../../shared/types/turnLog'
import { createLogger } from '../../lib/logger'
import { formatEvent, EVENT_COLORS } from './turnLogUtils'

const logger = createLogger('TurnLogList')

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
    slimeId: (data.slimeId as string | null) ?? null,
    actorType: (data.actorType as 'slime' | 'world') ?? 'slime',
    turnNumber: data.turnNumber as number,
    eventType: data.eventType as TurnLog['eventType'],
    eventData: data.eventData as Record<string, unknown>,
    processedAt,
  }
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
        logger.error('snapshot error', { slimeId, worldId, error: err.message })
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
