import { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore'
import { getIdToken } from 'firebase/auth'
import { db } from '../lib/firebase'
import { useAuthStore } from '../stores/authStore'
import { useWorldStore } from '../stores/worldStore'
import { TurnTimer } from '../components/world/TurnTimer'
import { TurnLogList } from '../components/world/TurnLogList'
import { ActionReservationForm } from '../components/reservations/ActionReservationForm'
import { ReservationList } from '../components/reservations/ReservationList'
import type { Slime } from '../../../shared/types/slime'
import { skillDefinitions } from '../../../shared/data/skillDefinitions'

const WORLD_ID = 'world-001'

function convertSlime(id: string, data: Record<string, unknown>): Slime {
  const convert = (v: unknown) => (v instanceof Timestamp ? v.toDate() : (v as Date))
  return {
    ...(data as Omit<Slime, 'id' | 'createdAt' | 'updatedAt'>),
    id,
    createdAt: convert(data.createdAt),
    updatedAt: convert(data.updatedAt),
  }
}

export function GamePage() {
  const user = useAuthStore((s) => s.user)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const signOut = useAuthStore((s) => s.signOut)
  const world = useWorldStore((s) => s.world)
  const subscribeToWorld = useWorldStore((s) => s.subscribeToWorld)

  const [slimes, setSlimes] = useState<Slime[]>([])
  const [selectedSlimeId, setSelectedSlimeId] = useState<string | null>(null)
  const [reservationKey, setReservationKey] = useState(0)
  const [isSummoning, setIsSummoning] = useState(false)
  const [summonError, setSummonError] = useState<string | null>(null)

  // ワールド購読
  useEffect(() => {
    const unsubscribe = subscribeToWorld(WORLD_ID)
    return () => unsubscribe()
  }, [subscribeToWorld])

  // スライム一覧購読（オーナーUID でフィルタ）
  useEffect(() => {
    if (!user) return

    const q = query(
      collection(db, 'slimes'),
      where('ownerUid', '==', user.uid),
      where('worldId', '==', WORLD_ID)
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items = snapshot.docs.map((d) =>
          convertSlime(d.id, d.data() as Record<string, unknown>)
        )
        setSlimes(items)
        if (items.length > 0 && !selectedSlimeId) {
          setSelectedSlimeId(items[0].id)
        }
      },
      (err) => {
        console.error('GamePage: slimes snapshot error', err)
      }
    )

    return () => unsubscribe()
  }, [user, selectedSlimeId])

  const handleSummon = async () => {
    if (!user) return
    setIsSummoning(true)
    setSummonError(null)
    try {
      const idToken = await getIdToken(user)
      const res = await fetch('/api/slimes/initial', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' },
      })
      if (res.status === 409) {
        setSummonError('すでにスライムがいます')
      } else if (!res.ok) {
        setSummonError('エラーが発生しました')
      }
    } catch {
      setSummonError('エラーが発生しました')
    } finally {
      setIsSummoning(false)
    }
  }

  // 認証ロード中
  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50">
        <span className="animate-spin h-8 w-8 border-4 border-green-300 border-t-green-600 rounded-full" />
      </div>
    )
  }

  // 未ログイン → LoginPage にリダイレクト
  if (!user) {
    return <Navigate to="/" replace />
  }

  const selectedSlime = slimes.find((s) => s.id === selectedSlimeId) ?? null

  return (
    <div className="min-h-screen bg-green-50">
      {/* ヘッダー */}
      <header className="bg-green-700 text-white shadow px-4 py-3 flex items-center justify-between">
        <h1 className="text-xl font-bold">スライム箱庭</h1>
        <div className="flex items-center gap-3">
          <span className="text-sm opacity-90">{user.displayName ?? user.email}</span>
          <Link
            to="/map-settings"
            className="text-xs bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded transition"
          >
            マップ設定
          </Link>
          <button
            onClick={signOut}
            className="text-xs bg-green-600 hover:bg-green-500 px-3 py-1.5 rounded transition"
          >
            ログアウト
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* ターンタイマー */}
        <TurnTimer worldId={WORLD_ID} />

        {/* スライム一覧 */}
        <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-2">
          <h2 className="text-base font-bold text-gray-700">マイスライム</h2>
          {slimes.length === 0 ? (
            <div className="rounded-xl bg-green-50 border border-green-200 p-6 text-center flex flex-col gap-3">
              <p className="text-lg font-bold text-green-800">🌿 はじめての箱庭へようこそ</p>
              <p className="text-sm text-green-700">
                まだスライムがいません。<br />
                あなたの最初のスライムを迎えてみましょう。
              </p>
              <p className="text-sm text-green-700">
                スライムは毎時間行動します。<br />
                食事や移動を予約して、一緒に育てていきましょう。
              </p>
              {summonError && (
                <p className="text-sm text-red-500">{summonError}</p>
              )}
              <button
                onClick={handleSummon}
                disabled={isSummoning}
                className="mx-auto px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition"
              >
                {isSummoning ? '召喚中...' : 'はじめてのスライムを迎える'}
              </button>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {slimes.map((s) => (
                <li key={s.id}>
                  <button
                    onClick={() => setSelectedSlimeId(s.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition ${
                      selectedSlimeId === s.id
                        ? 'bg-green-100 text-green-800 font-semibold'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                          s.stats.hunger < 20
                            ? 'bg-red-100 text-red-700'
                            : s.stats.hunger < 50
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        満腹度: {s.stats.hunger}/100
                      </span>
                    </div>
                    {s.stats.hunger < 20 && (
                      <p className="text-xs text-red-600 font-medium mt-0.5">
                        ⚠️ 空腹です！食事を予約してください
                      </p>
                    )}
                    <div className="flex gap-3 mt-0.5">
                      <span className="text-xs text-gray-400">
                        HP:{s.stats.hp} ATK:{s.stats.atk} ({s.tileX},{s.tileY})
                      </span>
                      <span className="text-xs text-gray-400">
                        次ターン後: {Math.max(0, s.stats.hunger - 5)}
                      </span>
                    </div>
                    {s.inventory && s.inventory.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.inventory.map((slot) => (
                          <span key={slot.foodId} className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded px-1.5 py-0.5">
                            {slot.foodId} ×{slot.quantity}
                          </span>
                        ))}
                      </div>
                    )}
                    {s.skillIds && s.skillIds.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {s.skillIds.map((skillId) => {
                          const skill = skillDefinitions.find((d) => d.id === skillId)
                          return skill ? (
                            <span
                              key={skillId}
                              title={skill.description}
                              className="text-xs bg-purple-50 border border-purple-200 text-purple-700 rounded px-1.5 py-0.5 cursor-help"
                            >
                              ✨ {skill.name}
                            </span>
                          ) : null
                        })}
                      </div>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 選択中スライムのアクション予約フォーム */}
        {selectedSlime && world && (
          <ActionReservationForm
            slimes={[selectedSlime]}
            worldId={WORLD_ID}
            currentTurn={world.currentTurn}
            onSuccess={() => setReservationKey((k) => k + 1)}
          />
        )}

        {/* 選択中スライムの予約一覧 */}
        {selectedSlimeId && (
          <ReservationList
            key={reservationKey}
            slimeId={selectedSlimeId}
            onDeleted={() => setReservationKey((k) => k + 1)}
          />
        )}

        {/* 選択中スライムのターンログ */}
        {selectedSlimeId && (
          <TurnLogList slimeId={selectedSlimeId} worldId={WORLD_ID} slimeName={selectedSlime?.name} />
        )}
      </main>
    </div>
  )
}
