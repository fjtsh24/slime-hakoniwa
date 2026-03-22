/**
 * WorldMapPanel — タイルマップ表示パネル（Phase 5）
 *
 * 設計方針:
 * - React + CSS Grid（外部ライブラリなし）
 * - 10×10 グリッド（32px/タイル）
 * - 支配属性を背景色で表現（fire→赤、water→青、earth→黄、wind→緑灰）
 * - スライム位置にカラーバー + 絵文字アイコン表示
 * - タイルクリック → onTileClick コールバックで外部に通知
 */

import { useEffect, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import type { Tile } from '../../../../shared/types/map'
import type { Slime } from '../../../../shared/types/slime'
import { createLogger } from '../../lib/logger'
import { DEFAULT_SLIME_COLOR } from './turnLogUtils'
import { useWorldStore } from '../../stores/worldStore'

const logger = createLogger('WorldMapPanel')

interface WorldMapPanelProps {
  mapId: string
  slimes: Slime[]
  selectedSlimeId?: string | null
  /** タイルクリック時のコールバック（gather/fish/move 予約フォームとの連動用） */
  onTileClick?: (x: number, y: number) => void
}

const TILE_COLORS: Record<'fire' | 'water' | 'earth' | 'wind', string> = {
  fire: 'bg-red-200 hover:bg-red-300',
  water: 'bg-blue-200 hover:bg-blue-300',
  earth: 'bg-yellow-200 hover:bg-yellow-300',
  wind: 'bg-emerald-100 hover:bg-emerald-200',
}

const TILE_ICONS: Record<'fire' | 'water' | 'earth' | 'wind', string> = {
  fire: '🔥',
  water: '💧',
  earth: '🌍',
  wind: '💨',
}

/** タイルの支配属性を返す（タイブレーク時はランダム） */
function getDominantAttr(tile: Tile): 'fire' | 'water' | 'earth' | 'wind' {
  const attrs = tile.attributes
  const keys = ['fire', 'water', 'earth', 'wind'] as const
  const maxVal = Math.max(...keys.map((k) => attrs[k]))
  const candidates = keys.filter((k) => attrs[k] === maxVal)
  return candidates[Math.floor(Math.random() * candidates.length)]
}

/** 季節・天候に応じた CSS filter 文字列を生成する */
function getMapFilter(season?: string, weather?: string): string {
  const filters: string[] = []

  switch (season) {
    case 'spring': filters.push('hue-rotate(10deg)', 'saturate(1.1)'); break
    case 'summer': filters.push('saturate(1.4)', 'brightness(1.05)'); break
    case 'autumn': filters.push('hue-rotate(-20deg)', 'saturate(0.9)', 'brightness(0.95)'); break
    case 'winter': filters.push('saturate(0.5)', 'brightness(0.9)'); break
  }

  switch (weather) {
    case 'rainy':  filters.push('brightness(0.85)', 'saturate(0.8)'); break
    case 'stormy': filters.push('brightness(0.75)', 'saturate(0.7)', 'contrast(1.1)'); break
    case 'foggy':  filters.push('brightness(0.9)', 'saturate(0.4)', 'contrast(0.9)'); break
  }

  return filters.length > 0 ? filters.join(' ') : 'none'
}

export function WorldMapPanel({ mapId, slimes, selectedSlimeId, onTileClick }: WorldMapPanelProps) {
  const [tiles, setTiles] = useState<Tile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const world = useWorldStore((s) => s.world)

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'maps', mapId, 'tiles'),
      (snap) => {
        const tileData = snap.docs
          .map((d) => d.data() as Tile)
          .sort((a, b) => a.y - b.y || a.x - b.x)
        logger.debug('マップタイル取得', { mapId, count: tileData.length })
        setTiles(tileData)
        setIsLoading(false)
      },
      (err) => {
        logger.error('WorldMapPanel tiles error', { mapId, error: err.message })
        setIsLoading(false)
      }
    )
    return () => unsubscribe()
  }, [mapId])

  // タイル座標 → 存在するスライムのリスト
  const slimesByTile = slimes.reduce<Record<string, Slime[]>>((acc, s) => {
    const key = `${s.tileX},${s.tileY}`
    if (!acc[key]) acc[key] = []
    acc[key].push(s)
    return acc
  }, {})

  if (isLoading) {
    return (
      <div className="bg-white rounded-xl shadow p-4 text-sm text-gray-400">
        マップを読み込み中...
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-gray-700">マップ</h2>
        <div className="flex gap-2 text-xs text-gray-500">
          <span>🔥火</span>
          <span>💧水</span>
          <span>🌍土</span>
          <span>💨風</span>
        </div>
      </div>

      <div
        className="grid gap-0.5 mx-auto transition-[filter] duration-700"
        style={{
          gridTemplateColumns: 'repeat(10, minmax(0, 1fr))',
          width: '100%',
          maxWidth: 360,
          filter: getMapFilter(world?.season, world?.weather),
        }}
      >
        {tiles.map((tile) => {
          const dominant = getDominantAttr(tile)
          const tileKey = `${tile.x},${tile.y}`
          const slimesOnTile = slimesByTile[tileKey] ?? []
          const isSelected = slimesOnTile.some((s) => s.id === selectedSlimeId)

          return (
            <div
              key={tile.id}
              className={`
                relative aspect-square rounded text-xs flex flex-col items-center justify-center cursor-pointer
                transition-colors select-none
                ${TILE_COLORS[dominant]}
                ${isSelected ? 'ring-2 ring-green-500 ring-inset' : ''}
              `}
              title={`(${tile.x},${tile.y}) 火:${tile.attributes.fire.toFixed(2)} 水:${tile.attributes.water.toFixed(2)} 土:${tile.attributes.earth.toFixed(2)} 風:${tile.attributes.wind.toFixed(2)}`}
              onClick={() => onTileClick?.(tile.x, tile.y)}
            >
              {/* 属性アイコン（スライムがいない場合のみ） */}
              {slimesOnTile.length === 0 && (
                <span className="text-base leading-none opacity-60">{TILE_ICONS[dominant]}</span>
              )}

              {/* スライム表示（最大3体） */}
              {slimesOnTile.length > 0 && (
                <div className="flex flex-wrap gap-px justify-center items-center w-full h-full p-0.5">
                  {slimesOnTile.slice(0, 3).map((s) => (
                    <span
                      key={s.id}
                      className={`w-2.5 h-2.5 rounded-full border border-white shadow-sm flex-shrink-0 ${
                        s.id === selectedSlimeId ? 'slime-selected' : 'slime-idle'
                      }`}
                      style={{ backgroundColor: s.color ?? DEFAULT_SLIME_COLOR }}
                      title={s.name}
                    />
                  ))}
                  {slimesOnTile.length > 3 && (
                    <span className="text-gray-600 font-bold" style={{ fontSize: 8 }}>
                      +{slimesOnTile.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 text-center">
        タイルをクリックして目標地点に設定できます
      </p>
    </div>
  )
}
