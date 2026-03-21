/**
 * WorldLogPanel — 全スライム統合ターンログパネル（Phase 5）
 *
 * 設計方針:
 * - Firestore クエリ: worldId + turnNumber DESC + limit(100)
 * - ポーリング: onSnapshot ではなく world.currentTurn の変化で getDocs 再取得
 * - スライムフィルター: ≤3体→タブ、≥4体→ドロップダウン
 * - イベント種別フィルター: 全ON + 「重要のみ」プリセット
 */

import { useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../../lib/firebase'
import type { TurnLog } from '../../../../shared/types/turnLog'
import type { Slime } from '../../../../shared/types/slime'
import { createLogger } from '../../lib/logger'
import { formatEvent, EVENT_COLORS, IMPORTANT_EVENT_TYPES, DEFAULT_SLIME_COLOR } from './turnLogUtils'

const logger = createLogger('WorldLogPanel')

interface WorldLogPanelProps {
  worldId: string
  currentTurn: number
  slimes: Slime[]
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

export function WorldLogPanel({ worldId, currentTurn, slimes }: WorldLogPanelProps) {
  const [logs, setLogs] = useState<TurnLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedSlimeId, setSelectedSlimeId] = useState<string | 'all'>('all')
  const [importantOnly, setImportantOnly] = useState(false)

  // currentTurn 変化時に getDocs で再取得（ポーリング方式）
  useEffect(() => {
    const fetchLogs = async () => {
      setIsLoading(true)
      try {
        const q = query(
          collection(db, 'turnLogs'),
          where('worldId', '==', worldId),
          orderBy('turnNumber', 'desc'),
          limit(100)
        )
        const snap = await getDocs(q)
        const items = snap.docs.map((d) =>
          convertTurnLog(d.id, d.data() as Record<string, unknown>)
        )
        logger.debug('ワールドログ取得', { worldId, count: items.length, currentTurn })
        setLogs(items)
      } catch (err) {
        logger.error('WorldLogPanel fetch error', {
          worldId,
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        setIsLoading(false)
      }
    }

    void fetchLogs()
  }, [worldId, currentTurn])

  // スライムID → カラーマップ
  const colorMap = Object.fromEntries(
    slimes.map((s) => [s.id, s.color ?? DEFAULT_SLIME_COLOR])
  )

  // クライアントサイドフィルタリング
  const filteredLogs = logs.filter((log) => {
    if (selectedSlimeId !== 'all' && log.slimeId !== selectedSlimeId) return false
    if (importantOnly && !IMPORTANT_EVENT_TYPES.includes(log.eventType)) return false
    return true
  })

  const useTabLayout = slimes.length <= 3

  return (
    <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-bold text-gray-700">ワールドログ</h2>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={importantOnly}
            onChange={(e) => setImportantOnly(e.target.checked)}
            className="rounded"
          />
          重要のみ
        </label>
      </div>

      {/* スライムフィルター */}
      {useTabLayout ? (
        <div className="flex gap-1 flex-wrap">
          <button
            onClick={() => setSelectedSlimeId('all')}
            className={`px-2 py-1 rounded text-xs font-medium transition ${
              selectedSlimeId === 'all'
                ? 'bg-green-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            全員
          </button>
          {slimes.map((s) => (
            <button
              key={s.id}
              onClick={() => setSelectedSlimeId(s.id)}
              className={`px-2 py-1 rounded text-xs font-medium transition flex items-center gap-1 ${
                selectedSlimeId === s.id
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{ backgroundColor: colorMap[s.id] ?? DEFAULT_SLIME_COLOR }}
              />
              {s.name}
            </button>
          ))}
        </div>
      ) : (
        <select
          value={selectedSlimeId}
          onChange={(e) => setSelectedSlimeId(e.target.value)}
          className="border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          <option value="all">全員</option>
          {slimes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      )}

      {/* ログ一覧 */}
      {isLoading ? (
        <p className="text-sm text-gray-400">ログを読み込み中...</p>
      ) : filteredLogs.length === 0 ? (
        <p className="text-sm text-gray-400">
          {importantOnly ? '重要なイベントはまだありません' : 'まだターンログがありません'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5 max-h-72 overflow-y-auto">
          {filteredLogs.map((log) => {
            const slimeName = slimes.find((s) => s.id === log.slimeId)?.name
            const slimeColor = log.slimeId ? (colorMap[log.slimeId] ?? DEFAULT_SLIME_COLOR) : '#9CA3AF'
            return (
              <li key={log.id} className="flex items-start gap-2 text-sm relative pl-3">
                {/* スライムカラーバー */}
                <span
                  className="absolute left-0 top-0 w-1 h-full rounded-l"
                  style={{ backgroundColor: log.actorType === 'world' ? '#9CA3AF' : slimeColor }}
                />
                <span className="text-gray-400 whitespace-nowrap text-xs mt-0.5">
                  T{log.turnNumber}
                </span>
                {/* スライム名バッジ */}
                {log.actorType === 'world' ? (
                  <span className="text-xs text-gray-400">🌍</span>
                ) : slimeName ? (
                  <span className="text-xs text-gray-500 whitespace-nowrap">{slimeName}</span>
                ) : null}
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${EVENT_COLORS[log.eventType] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {formatEvent(log.eventType, log.eventData)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
      {!isLoading && filteredLogs.length > 0 && (
        <p className="text-xs text-gray-400 text-right">直近 {filteredLogs.length} 件 / 最大 100 件</p>
      )}
    </div>
  )
}
