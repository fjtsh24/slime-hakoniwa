import { useEffect, useState } from 'react'
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore'
import { db, auth } from '../../lib/firebase'
import type { ActionReservation, ActionType, ActionData, EatActionData, MoveActionData } from '../../../../shared/types/action'
import { foods } from '../../../../shared/data/foods'

interface ReservationListProps {
  slimeId: string
  onDeleted?: () => void
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  eat: '食事',
  move: '移動',
  rest: '休息',
  battle: '戦闘',
}

// actionDataを表示用テキストに変換するヘルパー
function formatActionData(actionType: ActionType, actionData: ActionData): string {
  if (actionType === 'eat') {
    const food = foods.find(f => f.id === (actionData as EatActionData).foodId)
    return food ? `食料: ${food.name}` : `食料ID: ${(actionData as EatActionData).foodId}`
  }
  if (actionType === 'move') {
    const d = actionData as MoveActionData
    return `移動先: (${d.targetX}, ${d.targetY})`
  }
  if (actionType === 'rest') {
    return '休息'
  }
  return JSON.stringify(actionData)
}

function convertReservation(id: string, data: Record<string, unknown>): ActionReservation {
  const convert = (v: unknown) => (v instanceof Timestamp ? v.toDate() : (v as Date))
  return {
    id,
    slimeId: data.slimeId as string,
    ownerUid: data.ownerUid as string,
    worldId: data.worldId as string,
    turnNumber: data.turnNumber as number,
    actionType: data.actionType as ActionReservation['actionType'],
    actionData: data.actionData as ActionReservation['actionData'],
    status: data.status as ActionReservation['status'],
    createdAt: convert(data.createdAt),
    executedAt: data.executedAt ? convert(data.executedAt) : null,
  }
}

export function ReservationList({ slimeId, onDeleted }: ReservationListProps) {
  const [reservations, setReservations] = useState<ActionReservation[]>([])
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const currentUser = auth.currentUser
    if (!currentUser) return

    const q = query(
      collection(db, 'actionReservations'),
      where('ownerUid', '==', currentUser.uid),
      where('slimeId', '==', slimeId),
      where('status', '==', 'pending')
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) =>
          convertReservation(d.id, d.data() as Record<string, unknown>)
        )
        // ターン番号の昇順で表示
        items.sort((a, b) => a.turnNumber - b.turnNumber)
        setReservations(items)
      },
      (err) => {
        console.error('ReservationList: snapshot error', err)
        setError(err.message)
      }
    )

    return () => unsubscribe()
  }, [slimeId])

  const handleDelete = async (reservationId: string) => {
    setDeletingId(reservationId)
    setError(null)
    try {
      const currentUser = auth.currentUser
      if (!currentUser) throw new Error('ログインが必要です')

      const idToken = await currentUser.getIdToken()
      const res = await fetch(`/api/reservations/${reservationId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error ?? `サーバーエラー: ${res.status}`)
      }

      onDeleted?.()
    } catch (err) {
      console.error('ReservationList: delete error', err)
      setError(err instanceof Error ? err.message : '削除に失敗しました')
    } finally {
      setDeletingId(null)
    }
  }

  if (reservations.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow p-4 text-sm text-gray-400">
        予約されたアクションはありません
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-3">
      <h2 className="text-base font-bold text-gray-700">予約一覧</h2>

      {error && (
        <div className="bg-red-100 text-red-700 rounded px-3 py-2 text-sm">{error}</div>
      )}

      <ul className="flex flex-col gap-2">
        {reservations.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between border rounded-lg px-3 py-2 text-sm"
          >
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-gray-700">
                Turn {r.turnNumber} — {ACTION_TYPE_LABELS[r.actionType] ?? r.actionType}
              </span>
              <span className="text-xs text-gray-500">
                {formatActionData(r.actionType, r.actionData)}
              </span>
            </div>
            <button
                onClick={() => handleDelete(r.id)}
                disabled={deletingId === r.id}
                className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded border border-red-200 hover:bg-red-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingId === r.id ? '削除中...' : '削除'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
