import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../lib/firebase'
import { useUserStore } from '../stores/userStore'
import type { Tile } from '../../../shared/types/map'
import { createLogger } from '../lib/logger'

const logger = createLogger('MapSettingsPage')

export function MapSettingsPage() {
  const navigate = useNavigate()
  const { userProfile } = useUserStore()
  const [tiles, setTiles] = useState<Tile[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!userProfile?.mapId) return

    const unsubscribe = onSnapshot(
      query(collection(db, 'tiles'), where('mapId', '==', userProfile.mapId)),
      (snap) => {
        const tileData = snap.docs.map((d) => d.data() as Tile)
        logger.debug('タイル一覧取得', { mapId: userProfile?.mapId, count: tileData.length })
        setTiles(tileData.sort((a, b) => a.y - b.y || a.x - b.x))
        setIsLoading(false)
      },
      (err) => {
        logger.error('tiles snapshot error', { mapId: userProfile?.mapId, error: err.message })
        setIsLoading(false)
      }
    )
    return () => unsubscribe()
  }, [userProfile?.mapId])

  if (!userProfile?.mapId) {
    return <div className="p-4 text-gray-500">マップ情報を読み込み中...</div>
  }

  return (
    <div className="min-h-screen bg-green-50 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-green-800">マップ設定</h1>
          <button
            onClick={() => navigate('/game')}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            ゲームに戻る
          </button>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-green-600">タイル情報を読み込み中...</div>
        ) : (
          <div>
            {/* 属性説明カード */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-red-700 mb-1">🔥 火属性</p>
                <p className="text-xs text-red-600">攻撃力・スキル発動率に影響。炎系スライムの成長を促進</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-blue-700 mb-1">💧 水属性</p>
                <p className="text-xs text-blue-600">回復力・hunger持続に影響。水系スライムの成長を促進</p>
              </div>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-yellow-700 mb-1">🌍 土属性</p>
                <p className="text-xs text-yellow-600">防御力・HP上限に影響。土系スライムの成長を促進</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-sm font-semibold text-green-700 mb-1">💨 風属性</p>
                <p className="text-xs text-green-600">移動速度・回避率に影響。風系スライムの成長を促進</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              各タイルの属性値（0.0〜1.0）を確認できます。タイル属性の変更は今後のアップデートで対応予定です。
            </p>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(10, minmax(0, 1fr))` }}
            >
              {tiles.map((tile) => {
                const dominant = (['fire', 'water', 'earth', 'wind'] as const).reduce(
                  (max, attr) =>
                    tile.attributes[attr] > tile.attributes[max] ? attr : max,
                  'fire' as 'fire' | 'water' | 'earth' | 'wind'
                )
                const colorMap = {
                  fire: 'bg-red-200',
                  water: 'bg-blue-200',
                  earth: 'bg-yellow-200',
                  wind: 'bg-gray-200',
                }
                return (
                  <div
                    key={tile.id}
                    className={`aspect-square ${colorMap[dominant]} rounded text-xs flex items-center justify-center text-gray-600`}
                    title={`(${tile.x},${tile.y}) 火:${tile.attributes.fire} 水:${tile.attributes.water} 土:${tile.attributes.earth} 風:${tile.attributes.wind}`}
                  >
                    {tile.x},{tile.y}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
