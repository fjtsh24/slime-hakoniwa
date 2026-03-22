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
import { createLogger } from '../../lib/logger'

/** カテゴリの日本語ラベル */
const CATEGORY_LABELS: Record<string, string> = {
  slime: 'スライム', plant: '植物', human: '人間', beast: '獣', spirit: '精霊', fish: '魚',
}

const logger = createLogger('ActionReservationForm')

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
  /** 融合対象スライム選択用。省略時は slimes と同じ */
  allSlimes?: Slime[]
  worldId: string
  currentTurn: number
  onSuccess?: () => void
  /** マップタイルクリックで渡される座標（move フォームへの自動セット用） */
  clickedTile?: { x: number; y: number } | null
}

const ACTION_LABELS: Record<ActionType, string> = {
  eat: '食事',
  move: '移動',
  rest: '休息',
  battle: '戦闘',
  gather: '採集',
  fish: '釣り',
  hunt: '狩猟',
  merge: '融合',
  plant: '植え付け',
}

const STAT_LABELS: Record<string, string> = {
  hp: 'HP',
  atk: '攻撃力',
  def: '防御力',
  spd: '素早さ',
  exp: 'EXP',
  hunger: '満腹度',
}

const AVAILABLE_ACTIONS: ActionType[] = ['eat', 'gather', 'fish', 'hunt', 'plant', 'battle', 'merge', 'move', 'rest']

const HUNT_CATEGORIES = [
  { value: 'beast', label: '獣系' },
  { value: 'plant', label: '植物系' },
  { value: 'fish', label: '水棲系' },
  { value: 'human', label: '人間系' },
] as const

const HUNT_STRENGTHS = [
  { value: 'weak', label: '弱い（power 10）' },
  { value: 'normal', label: '普通（power 30）' },
] as const

export function ActionReservationForm({
  slimes,
  allSlimes,
  worldId,
  currentTurn,
  onSuccess,
  clickedTile,
}: ActionReservationFormProps) {
  const [selectedSlimeId, setSelectedSlimeId] = useState<string>(slimes[0]?.id ?? '')
  const [actionType, setActionType] = useState<ActionType>('eat')
  const [turnNumber, setTurnNumber] = useState<number>(currentTurn + 1)
  const [reservedTurns, setReservedTurns] = useState<number[]>([])
  const [reservedFoodQty, setReservedFoodQty] = useState<Record<string, number>>({})
  const [foodId, setFoodId] = useState<string>(foods[0]?.id ?? '')
  const [targetX, setTargetX] = useState<number>(0)
  const [targetY, setTargetY] = useState<number>(0)
  const [huntCategory, setHuntCategory] = useState<string>('beast')
  const [huntStrength, setHuntStrength] = useState<string>('weak')
  const [mergeTargetSlimeId, setMergeTargetSlimeId] = useState<string>('')
  const [plantFoodId, setPlantFoodId] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [currentTile, setCurrentTile] = useState<Tile | null>(null)
  const [tileLoading, setTileLoading] = useState(true)

  // マップタイルクリック → move 座標オートセット
  useEffect(() => {
    if (!clickedTile) return
    setActionType('move')
    setTargetX(clickedTile.x)
    setTargetY(clickedTile.y)
  }, [clickedTile])

  // plant アクション選択時: インベントリにある tileAttributeDelta 食料の先頭を初期選択
  useEffect(() => {
    if (actionType !== 'plant') return
    const slime = slimes.find((s) => s.id === selectedSlimeId)
    const inventory = slime?.inventory ?? []
    const first = foods.find((f) => {
      if (!f.tileAttributeDelta || !Object.values(f.tileAttributeDelta).some((v) => v !== 0)) return false
      if (f.alwaysAvailable) return true
      const rawQty = inventory.find((s) => s.foodId === f.id)?.quantity ?? 0
      return rawQty - (reservedFoodQty[f.id] ?? 0) > 0
    })
    if (first && plantFoodId !== first.id) {
      setPlantFoodId(first.id)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionType, selectedSlimeId, reservedFoodQty])

  // 選択中スライムの現在タイル属性を購読
  // 依存値はプリミティブのみ（slimes 配列全体を入れると毎回 unsubscribe が走りタイルが取得できない）
  const selectedSlime = slimes.find((s) => s.id === selectedSlimeId)
  const slimeMapId = selectedSlime?.mapId
  const slimeTileX = selectedSlime?.tileX
  const slimeTileY = selectedSlime?.tileY

  useEffect(() => {
    if (!slimeMapId || slimeTileX === undefined || slimeTileY === undefined) {
      setCurrentTile(null)
      setTileLoading(false)
      return
    }

    setTileLoading(true)
    const q = query(
      collection(db, 'tiles'),
      where('mapId', '==', slimeMapId),
      where('x', '==', slimeTileX),
      where('y', '==', slimeTileY),
    )
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const tile = snap.docs[0]?.data() as Tile | undefined
        setCurrentTile(tile ?? null)
        setTileLoading(false)
      },
      (err) => {
        logger.error('タイル購読エラー', { mapId: slimeMapId, x: slimeTileX, y: slimeTileY, error: err.message })
        setCurrentTile(null)
        setTileLoading(false)
      }
    )
    return () => unsubscribe()
  }, [slimeMapId, slimeTileX, slimeTileY])

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
      // eat / plant 予約の食料消費数を集計
      const foodQty: Record<string, number> = {}
      for (const doc of snapshot.docs) {
        const data = doc.data()
        if ((data.actionType === 'eat' || data.actionType === 'plant') && data.actionData?.foodId) {
          const fid = data.actionData.foodId as string
          foodQty[fid] = (foodQty[fid] ?? 0) + 1
        }
      }
      setReservedFoodQty(foodQty)
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
      } else if (actionType === 'hunt' || actionType === 'battle') {
        actionData = { targetCategory: huntCategory, targetStrength: huntStrength }
      } else if (actionType === 'merge') {
        if (!mergeTargetSlimeId) throw new Error('融合対象スライムを選択してください')
        actionData = { targetSlimeId: mergeTargetSlimeId }
      } else if (actionType === 'plant') {
        if (!plantFoodId) throw new Error('植え付ける食料を選択してください')
        actionData = { foodId: plantFoodId }
      }

      const body = {
        slimeId: selectedSlimeId,
        worldId,
        turnNumber,
        actionType,
        actionData,
      }

      logger.debug('予約送信', { slimeId: selectedSlimeId, worldId, turnNumber, actionType, actionData })

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
        logger.warn('予約APIエラー', { status: res.status, error: errData.error })
        throw new Error(errData.error ?? `サーバーエラー: ${res.status}`)
      }

      logger.debug('予約成功', { slimeId: selectedSlimeId, turnNumber, actionType })
      // フォームリセット（予約済みターンを除いた次の空きターンへ）
      setTurnNumber(nextAvailableTurns(currentTurn + 1, [...reservedTurns, turnNumber], 1, currentTurn + MAX_RESERVATION_TURN_DISTANCE)[0])
      setActionType('eat')
      setFoodId(foods[0]?.id ?? '')
      setTargetX(0)
      setTargetY(0)
      setPlantFoodId('')
      onSuccess?.()
    } catch (err) {
      logger.error('submit error', { error: err instanceof Error ? err.message : String(err) })
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
            // 予約消費後の実質利用可能数を計算するヘルパー
            const getAvailableQty = (f: typeof foods[number]) => {
              if (f.alwaysAvailable) return Infinity
              const raw = inventory.find((s) => s.foodId === f.id)?.quantity ?? 0
              return Math.max(0, raw - (reservedFoodQty[f.id] ?? 0))
            }
            // 所持あり → 先頭、未所持 → 末尾に並べ替え
            const sorted = [...foods].sort((a, b) => {
              const aHas = getAvailableQty(a) > 0
              const bHas = getAvailableQty(b) > 0
              return Number(bHas) - Number(aHas)
            })
            return (
              <>
                <p className="text-xs text-gray-500 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                  インベントリに所持している食料のみ食べられます。
                  gather・fish・hunt で食料を獲得してから食べましょう。
                </p>
                {/* 食料カードグリッド */}
                <div className="grid grid-cols-4 gap-1.5 max-h-56 overflow-y-auto pr-0.5">
                  {sorted.map((f) => {
                    const availQty = getAvailableQty(f)
                    const available = availQty > 0
                    const reserved = reservedFoodQty[f.id] ?? 0
                    const isSelected = foodId === f.id
                    return (
                      <button
                        key={f.id}
                        type="button"
                        disabled={!available}
                        onClick={() => setFoodId(f.id)}
                        className={[
                          'flex flex-col items-center gap-0.5 p-1.5 rounded-lg border text-center transition-all',
                          isSelected
                            ? 'border-green-500 bg-green-50 ring-2 ring-green-300 shadow-sm'
                            : available
                              ? 'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50'
                              : 'border-gray-100 bg-gray-50 opacity-35 cursor-not-allowed',
                        ].join(' ')}
                        title={f.name}
                      >
                        {f.imageUrl
                          ? <img src={f.imageUrl} alt={f.name} className="w-9 h-9 object-contain" loading="lazy" />
                          : <span className="w-9 h-9 flex items-center justify-center text-2xl">🍽️</span>
                        }
                        <span className="text-xs leading-tight text-gray-700 font-medium line-clamp-2 w-full">
                          {f.name}
                        </span>
                        <span className={`text-xs font-bold ${available ? 'text-green-700' : 'text-gray-400'}`}>
                          {f.alwaysAvailable ? '∞' : `×${availQty === Infinity ? '∞' : availQty}`}
                        </span>
                        {reserved > 0 && (
                          <span className="text-xs text-orange-500 leading-none">予約{reserved}</span>
                        )}
                      </button>
                    )
                  })}
                </div>
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
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-xs text-gray-600 flex gap-3">
                {selected.imageUrl && (
                  <img src={selected.imageUrl} alt={selected.name} className="w-12 h-12 object-contain flex-shrink-0" />
                )}
                <div className="flex flex-col gap-1 min-w-0">
                  <p className="font-medium text-gray-800">
                    {selected.name}
                    <span className="ml-1.5 text-gray-400 font-normal">{CATEGORY_LABELS[selected.category] ?? selected.category}</span>
                  </p>
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
              </div>
            )
          })()}
        </div>
      )}

      {actionType === 'gather' && (
        <div className="flex flex-col gap-1 text-xs bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
          <p className="text-gray-600">現在地のタイル属性に応じた食料を採集します。</p>
          {tileLoading ? (
            <p className="text-gray-400">タイル情報を読み込み中...</p>
          ) : currentTile ? (() => {
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
            <p className="text-red-500 text-xs">タイル情報を取得できませんでした</p>
          )}
        </div>
      )}

      {actionType === 'fish' && (
        <div className="flex flex-col gap-1 text-xs bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
          <p className="text-gray-600">水属性のタイルで釣りをします。成功すると魚系食料（fish 種族値・SPD 強化）が手に入ります。</p>
          {tileLoading ? (
            <p className="text-gray-400">タイル情報を読み込み中...</p>
          ) : currentTile ? (() => {
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
            <p className="text-red-500 text-xs">タイル情報を取得できませんでした</p>
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

      {actionType === 'battle' && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            <p className="text-gray-600">モンスターと戦闘します。hunt より難しく、敗北すると HP が大きく減り、HP=0 で2ターン行動不能になります。</p>
            <p className="text-red-700">勝利すると種族値と食料ドロップが得られます。</p>
            <p className="text-gray-500">十分に HP を回復してから挑みましょう。</p>
          </div>
          <div className="flex gap-3">
            <div className="flex flex-col gap-1 flex-1">
              <label className="text-sm font-medium text-gray-600">モンスター種別</label>
              <select
                value={huntCategory}
                onChange={(e) => setHuntCategory(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
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
                className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              >
                {HUNT_STRENGTHS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {actionType === 'merge' && (() => {
        const mergeTargets = (allSlimes ?? slimes).filter((s) => s.id !== selectedSlimeId)
        return (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 text-xs bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
              <p className="text-gray-600">別のスライムを吸収・融合します。</p>
              <p className="text-yellow-800 font-semibold">⚠️ 対象スライムは融合後に完全に削除されます。元に戻せません。</p>
              <p className="text-gray-500">融合成功: ATK・DEF が対象の 30% 分強化されます。</p>
            </div>
            {mergeTargets.length === 0 ? (
              <p className="text-sm text-gray-400">融合できる他のスライムがいません。</p>
            ) : (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-600">融合対象スライム</label>
                <select
                  value={mergeTargetSlimeId}
                  onChange={(e) => setMergeTargetSlimeId(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  required
                >
                  <option value="">-- 選択してください --</option>
                  {mergeTargets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}（HP:{s.stats.hp} ATK:{s.stats.atk} DEF:{s.stats.def}）
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )
      })()}

      {actionType === 'plant' && (() => {
        const plantSlime = slimes.find((s) => s.id === selectedSlimeId)
        const inventory = plantSlime?.inventory ?? []
        // tileAttributeDelta が定義されていてインベントリに1個以上ある食料のみ表示
        const plantableFoods = foods.filter((f) => {
          if (!f.tileAttributeDelta || !Object.values(f.tileAttributeDelta).some((v) => v !== 0)) return false
          if (f.alwaysAvailable) return true
          const raw = inventory.find((s) => s.foodId === f.id)?.quantity ?? 0
          return raw - (reservedFoodQty[f.id] ?? 0) > 0
        })
        const ATTR_LABELS: Record<string, string> = { fire: '🔥火', water: '💧水', earth: '🌍土', wind: '💨風' }
        const selectedFood = plantableFoods.find((f) => f.id === plantFoodId) ?? plantableFoods[0]
        return (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1 text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              <p className="text-gray-700 font-medium">🌱 植え付けアクション</p>
              <p className="text-gray-600">インベントリの食料を現在地のタイルに植えて、タイル属性を変化させます。食料は1個消費されます。</p>
              <p className="text-gray-500">土属性が高いタイルでは gather で植物系食料が出やすくなります。浄化食料（消炎草・乾燥砂など）は hunt/battle の強敵からレアドロップで入手できます。</p>
            </div>
            {plantableFoods.length === 0 ? (
              <p className="text-xs text-gray-400 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                植え付けに使える食料がインベントリにありません。gather・fish・hunt で食料を獲得してから植え付けましょう。浄化食料は hunt/battle の強敵からドロップします。
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-600">植える食料</label>
                  <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto pr-0.5">
                    {plantableFoods.map((f) => {
                      const raw = inventory.find((s) => s.foodId === f.id)?.quantity ?? 0
                      const reserved = f.alwaysAvailable ? 0 : (reservedFoodQty[f.id] ?? 0)
                      const qty = f.alwaysAvailable ? Infinity : Math.max(0, raw - reserved)
                      const isSelected = (plantFoodId || selectedFood?.id) === f.id
                      return (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setPlantFoodId(f.id)}
                          className={[
                            'flex flex-col items-center gap-0.5 p-1.5 rounded-lg border text-center transition-all',
                            isSelected
                              ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-300 shadow-sm'
                              : 'border-gray-200 bg-white hover:border-emerald-300 hover:bg-emerald-50',
                          ].join(' ')}
                          title={f.name}
                        >
                          {f.imageUrl
                            ? <img src={f.imageUrl} alt={f.name} className="w-9 h-9 object-contain" loading="lazy" />
                            : <span className="w-9 h-9 flex items-center justify-center text-2xl">🌿</span>
                          }
                          <span className="text-xs leading-tight text-gray-700 font-medium line-clamp-2 w-full">{f.name}</span>
                          <span className="text-xs font-bold text-emerald-700">{qty === Infinity ? '∞' : `×${qty}`}</span>
                          {reserved > 0 && (
                            <span className="text-xs text-orange-500 leading-none">予約{reserved}</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* 選択食料のタイル効果プレビュー */}
                {(() => {
                  const food = plantableFoods.find((f) => f.id === (plantFoodId || selectedFood?.id))
                  if (!food?.tileAttributeDelta) return null
                  const attrs = currentTile?.attributes
                  return (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-gray-600">
                      <p className="font-medium text-gray-800 mb-1">{food.name} を植えた場合のタイル変化:</p>
                      <div className="flex flex-wrap gap-2">
                        {(['fire', 'water', 'earth', 'wind'] as const).map((attr) => {
                          const delta = food.tileAttributeDelta?.[attr] ?? 0
                          if (delta === 0) return null
                          const current = attrs?.[attr] ?? 0
                          const next = Math.max(0, Math.min(1.0, current + delta))
                          return (
                            <span key={attr} className="flex items-center gap-1">
                              <span>{ATTR_LABELS[attr]}</span>
                              {attrs ? (
                                <span className="font-mono">
                                  {current.toFixed(2)}
                                  <span className={delta > 0 ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>
                                    {delta > 0 ? `+${delta.toFixed(2)}` : `${delta.toFixed(2)}`}
                                  </span>
                                  → {next.toFixed(2)}
                                </span>
                              ) : (
                                <span className="font-mono">
                                  <span className={delta > 0 ? 'text-emerald-700 font-bold' : 'text-red-600 font-bold'}>
                                    {delta > 0 ? `+${delta.toFixed(2)}` : `${delta.toFixed(2)}`}
                                  </span>
                                </span>
                              )}
                            </span>
                          )
                        })}
                      </div>
                      {tileLoading && <p className="text-gray-400 mt-1">タイル情報読み込み中...</p>}
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        )
      })()}

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
