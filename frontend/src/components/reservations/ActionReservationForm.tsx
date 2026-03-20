import { useEffect, useState } from 'react'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { db, auth } from '../../lib/firebase'
import { foods } from '../../../../shared/data/foods'
import type { Slime } from '../../../../shared/types/slime'
import type { Tile, TileAttributes } from '../../../../shared/types/map'
import type { ActionType } from '../../../../shared/types/action'
import {
  MAX_PENDING_RESERVATIONS,
  MAX_RESERVATION_TURN_DISTANCE,
} from '../../../../shared/constants/game'

/** タイル属性から支配属性と期待できる食料カテゴリを返す */
function getGatherHint(attrs: TileAttributes): { dominant: string; label: string; category: string } {
  const entries = [
    { key: 'fire', label: '火', category: '獣系・精霊系（ATK・spirit 種族値）' },
    { key: 'water', label: '水', category: '魚系・植物系（water・fish 種族値）' },
    { key: 'earth', label: '土', category: '植物系（DEF・plant 種族値）' },
    { key: 'wind', label: '風', category: '精霊系・植物系（spirit 種族値）' },
  ] as const
  const dominant = entries.reduce((a, b) =>
    attrs[a.key] >= attrs[b.key] ? a : b
  )
  return { dominant: dominant.key, label: dominant.label, category: dominant.category }
}

function nextAvailableTurns(from: number, reserved: number[], count: number, maxTurn?: number): number[] {
  const set = new Set(reserved)
  const turns: number[] = []
  let t = from
  while (turns.length < count) {
    if (maxTurn !== undefined && t > maxTurn) break
    if (!set.has(t)) turns.push(t)
    t++
  }
  return turns
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

const AVAILABLE_ACTIONS: ActionType[] = ['eat', 'gather', 'fish', 'hunt', 'move', 'rest']

const HUNT_CATEGORIES = [
  { value: 'beast', label: '獣系' },
  { value: 'plant', label: '植物系' },
] as const

const HUNT_STRENGTHS = [
  { value: 'weak', label: '弱い（power 10）' },
  { value: 'normal', label: '普通（power 30）' },
] as const

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
  const [huntCategory, setHuntCategory] = useState<string>('beast')
  const [huntStrength, setHuntStrength] = useState<string>('weak')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentTile, setCurrentTile] = useState<Tile | null>(null)

  // 選択中スライムの現在タイル属性を購読
  useEffect(() => {
    const slime = slimes.find((s) => s.id === selectedSlimeId)
    if (!slime) { setCurrentTile(null); return }

    const unsubscribe = onSnapshot(
      collection(db, 'maps', slime.mapId, 'tiles'),
      (snap) => {
        const tile = snap.docs
          .map((d) => d.data() as Tile)
          .find((t) => t.x === slime.tileX && t.y === slime.tileY) ?? null
        setCurrentTile(tile)
      }
    )
    return () => unsubscribe()
  }, [selectedSlimeId, slimes])

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
      setTurnNumber(nextAvailableTurns(currentTurn + 1, turns, 1, currentTurn + MAX_RESERVATION_TURN_DISTANCE)[0])
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
      } else if (actionType === 'hunt') {
        actionData = { targetCategory: huntCategory, targetStrength: huntStrength }
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
      setTurnNumber(nextAvailableTurns(currentTurn + 1, [...reservedTurns, turnNumber], 1, currentTurn + MAX_RESERVATION_TURN_DISTANCE)[0])
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
          {nextAvailableTurns(currentTurn + 1, reservedTurns, MAX_PENDING_RESERVATIONS, currentTurn + MAX_RESERVATION_TURN_DISTANCE).map((t) => (
            <option key={t} value={t}>
              {t - currentTurn}ターン後（Turn {t}）
            </option>
          ))}
        </select>
      </div>

      {/* アクション別追加入力 */}
      {actionType === 'eat' && (
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-gray-600">食料</label>
          {(() => {
            const selectedSlime = slimes.find((s) => s.id === selectedSlimeId)
            // inventory フィールドが Firestore に存在しない既存スライムは [] として扱う
            const inventory = selectedSlime?.inventory ?? []
            return (
              <>
                <p className="text-xs text-gray-500 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  インベントリに所持している食料のみ食べられます。
                  gather・fish・hunt で食料を獲得してから食べましょう。
                </p>
                <select
                  value={foodId}
                  onChange={(e) => setFoodId(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
                  required
                >
                  {foods.map((f) => {
                    const qty = inventory.find((s) => s.foodId === f.id)?.quantity ?? 0
                    const hasItem = qty > 0 || f.alwaysAvailable === true
                    return (
                      <option key={f.id} value={f.id} disabled={!hasItem}>
                        {f.name}（{f.category}）{f.alwaysAvailable ? ' ×∞' : ` ×${qty}`}
                        {!hasItem ? ' ─ 未所持' : ''}
                      </option>
                    )
                  })}
                </select>
              </>
            )
          })()}
          {/* 選択中の食料の詳細パネル */}
          {actionType === 'eat' && (() => {
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

      {actionType === 'gather' && (
        <div className="flex flex-col gap-1 text-xs bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
          <p className="text-gray-600">現在地のタイル属性に応じた食料を採集します。</p>
          {currentTile ? (() => {
            const { label, category } = getGatherHint(currentTile.attributes)
            const attrs = currentTile.attributes
            return (
              <>
                <div className="flex gap-2 mt-1">
                  {(['fire','water','earth','wind'] as const).map((k) => (
                    <span key={k} className="flex flex-col items-center">
                      <span className="text-gray-400">{{ fire:'火', water:'水', earth:'土', wind:'風' }[k]}</span>
                      <span className="font-mono font-medium text-gray-700">{attrs[k].toFixed(2)}</span>
                    </span>
                  ))}
                </div>
                <p className="text-yellow-700 mt-1">
                  支配属性: <span className="font-medium">{label}属性</span> → {category}が期待できます
                </p>
              </>
            )
          })() : (
            <p className="text-gray-400">タイル情報を読み込み中...</p>
          )}
        </div>
      )}

      {actionType === 'fish' && (
        <div className="flex flex-col gap-1 text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <p className="text-gray-600">水属性のタイルで釣りをします。成功すると魚系食料（fish 種族値・SPD 強化）が手に入ります。</p>
          {currentTile ? (() => {
            const water = currentTile.attributes.water
            const canFish = water >= 0.3
            return (
              <p className={canFish ? 'text-blue-700 font-medium' : 'text-red-600'}>
                水属性: {water.toFixed(2)}{' '}
                {canFish
                  ? '✓ 釣り可能'
                  : '✗ 水が足りません — 水属性 0.3 以上のタイルで釣りができます'}
              </p>
            )
          })() : (
            <p className="text-gray-400">タイル情報を読み込み中...</p>
          )}
          <p className="text-gray-500">失敗した場合はターンを消費するだけになります。</p>
        </div>
      )}

      {actionType === 'hunt' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1 text-xs bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            <p className="text-gray-600">モンスターを狩猟します。勝利するとドロップアイテムと種族値が得られます。敗北した場合は HP が減少します。</p>
            <p className="text-orange-700">獣系 → 獣の肉・魔獣の心臓（ATK・HP・beast 種族値）</p>
            <p className="text-orange-700">植物系 → 野草・薬草・世界樹の葉（DEF・plant 種族値）</p>
            <p className="text-gray-500">HP が低い状態での挑戦は危険です。eat アクションで HP を回復してから挑みましょう。</p>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-sm font-medium text-gray-600">モンスター種別</label>
              <select
                value={huntCategory}
                onChange={(e) => setHuntCategory(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                {HUNT_CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-sm font-medium text-gray-600">強さ</label>
              <select
                value={huntStrength}
                onChange={(e) => setHuntStrength(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
              >
                {HUNT_STRENGTHS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
          {huntStrength === 'normal' && (() => {
            const selectedSlime = slimes.find((s) => s.id === selectedSlimeId)
            const estimatedMax = selectedSlime
              ? selectedSlime.stats.atk + Math.floor(selectedSlime.stats.spd * 0.75)
              : 0
            if (estimatedMax <= 30) {
              return (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  ⚠️ 普通強度のモンスター（power 30）は現在のステータスでは勝てない可能性が高いです。
                  ATK + SPD をさらに上げてから挑戦することをおすすめします。
                </p>
              )
            }
            return null
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
