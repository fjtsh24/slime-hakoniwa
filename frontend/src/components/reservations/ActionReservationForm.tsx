import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db, auth } from '../../lib/firebase'
import { foods } from '../../../../shared/data/foods'
import type { Slime } from '../../../../shared/types/slime'
import type { ActionType } from '../../../../shared/types/action'

function nextFreeTurn(from: number, reserved: number[]): number {
  const set = new Set(reserved)
  let t = from
  while (set.has(t)) t++
  return t
}

interface ActionReservationFormProps {
  slimes: Slime[]
  worldId: string
  currentTurn: number
  onSuccess?: () => void
}

const ACTION_LABELS: Record<ActionType, string> = {
  eat: '食事',
  move: '移動',
  rest: '休息',
  battle: '戦闘',
  gather: '採集',
  fish: '釣り',
  hunt: '狩猟',
}

const STAT_LABELS: Record<string, string> = {
  hp: 'HP',
  atk: '攻撃力',
  def: '防御力',
  spd: '素早さ',
  exp: 'EXP',
  hunger: '満腹度',
}

const AVAILABLE_ACTIONS: ActionType[] = ['eat', 'move', 'rest']

export function ActionReservationForm({
  slimes,
  worldId,
  currentTurn,
  onSuccess,
}: ActionReservationFormProps) {
  const [selectedSlimeId, setSelectedSlimeId] = useState<string>(slimes[0]?.id ?? '')
  const [actionType, setActionType] = useState<ActionType>('eat')
  const [turnNumber, setTurnNumber] = useState<number>(currentTurn + 1)
  const [reservedTurns, setReservedTurns] = useState<number[]>([])
  const [foodId, setFoodId] = useState<string>(foods[0]?.id ?? '')
  const [targetX, setTargetX] = useState<number>(0)
  const [targetY, setTargetY] = useState<number>(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 選択中スライムのpending予約ターン番号を購読し、次の空きターンを自動セット
  useEffect(() => {
    const currentUser = auth.currentUser
    if (!currentUser || !selectedSlimeId) return

    const q = query(
      collection(db, 'actionReservations'),
      where('ownerUid', '==', currentUser.uid),
      where('slimeId', '==', selectedSlimeId),
      where('status', '==', 'pending')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const turns = snapshot.docs.map((d) => d.data().turnNumber as number)
      setReservedTurns(turns)
      setTurnNumber(nextFreeTurn(currentTurn + 1, turns))
    })

    return () => unsubscribe()
  }, [selectedSlimeId, currentTurn])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      const currentUser = auth.currentUser
      if (!currentUser) throw new Error('ログインが必要です')

      const idToken = await currentUser.getIdToken()

      let actionData: Record<string, unknown> = {}
      if (actionType === 'eat') {
        actionData = { foodId }
      } else if (actionType === 'move') {
        actionData = { targetX, targetY }
      }

      const body = {
        slimeId: selectedSlimeId,
        worldId,
        turnNumber,
        actionType,
        actionData,
      }

      const res = await fetch('/api/reservations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error ?? `サーバーエラー: ${res.status}`)
      }

      // フォームリセット（予約済みターンを除いた次の空きターンへ）
      setTurnNumber(nextFreeTurn(currentTurn + 1, [...reservedTurns, turnNumber]))
      setActionType('eat')
      setFoodId(foods[0]?.id ?? '')
      setTargetX(0)
      setTargetY(0)
      onSuccess?.()
    } catch (err) {
      console.error('ActionReservationForm: submit error', err)
      setError(err instanceof Error ? err.message : '予約に失敗しました')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow p-4 flex flex-col gap-4">
      <h2 className="text-base font-bold text-gray-700">アクション予約</h2>

      {error && (
        <div className="bg-red-100 text-red-700 rounded px-3 py-2 text-sm">{error}</div>
      )}

      {/* スライム選択 */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-600">スライム</label>
        <select
          value={selectedSlimeId}
          onChange={(e) => setSelectedSlimeId(e.target.value)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          required
        >
          {slimes.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* アクション種別 */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-600">アクション種別</label>
        <select
          value={actionType}
          onChange={(e) => setActionType(e.target.value as ActionType)}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        >
          {AVAILABLE_ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
      </div>

      {/* ターン番号（相対ターン選択） */}
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-gray-600">実行タイミング</label>
        <select
          value={turnNumber}
          onChange={(e) => setTurnNumber(Number(e.target.value))}
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
          required
        >
          {[1, 2, 3, 4, 5].map((offset) => {
            const t = currentTurn + offset
            const isReserved = reservedTurns.includes(t)
            return (
              <option key={offset} value={t} disabled={isReserved}>
                {offset}ターン後（Turn {t}）{isReserved ? ' ─ 予約済み' : ''}
              </option>
            )
          })}
        </select>
      </div>

      {/* アクション別追加入力 */}
      {actionType === 'eat' && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-600">食料</label>
          <select
            value={foodId}
            onChange={(e) => setFoodId(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
            required
          >
            {foods.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}（{f.category}）
              </option>
            ))}
          </select>
          {/* 選択中の食料の詳細パネル */}
          {(() => {
            const selected = foods.find((f) => f.id === foodId)
            if (!selected) return null
            const statLines = Object.entries(selected.statDeltas)
              .filter(([, v]) => v !== undefined && v !== 0)
              .map(([k, v]) => `${STAT_LABELS[k] ?? k}+${v}`)
            const racialLines = Object.entries(selected.racialDeltas)
              .filter(([, v]) => v !== undefined && v !== 0)
              .map(([k, v]) => `${k}+${v}`)
            return (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-gray-600 flex flex-col gap-1">
                <p className="text-gray-500 italic">{selected.description}</p>
                {statLines.length > 0 && (
                  <p><span className="font-medium text-green-700">ステータス: </span>{statLines.join(' / ')}</p>
                )}
                {racialLines.length > 0 && (
                  <p><span className="font-medium text-blue-700">種族値: </span>{racialLines.join(' / ')}</p>
                )}
                {selected.skillGrantProb > 0 && (
                  <p><span className="font-medium text-purple-700">スキル習得確率: </span>{Math.round(selected.skillGrantProb * 100)}%</p>
                )}
              </div>
            )
          })()}
        </div>
      )}

      {actionType === 'move' && (() => {
        const currentSlime = slimes.find((s) => s.id === selectedSlimeId)
        return (
          <>
            {currentSlime && (
              <p className="text-xs text-gray-500">
                現在地: ({currentSlime.tileX}, {currentSlime.tileY})
              </p>
            )}
            <div className="flex gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-sm font-medium text-gray-600">目標X</label>
                <input
                  type="number"
                  value={targetX}
                  onChange={(e) => setTargetX(Number(e.target.value))}
                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  required
                />
              </div>
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-sm font-medium text-gray-600">目標Y</label>
                <input
                  type="number"
                  value={targetY}
                  onChange={(e) => setTargetY(Number(e.target.value))}
                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  required
                />
              </div>
            </div>
          </>
        )
      })()}

      <button
        type="submit"
        disabled={isSubmitting || slimes.length === 0}
        className="w-full bg-green-600 text-white rounded-lg py-2 font-medium hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? '予約中...' : '予約する'}
      </button>
    </form>
  )
}
