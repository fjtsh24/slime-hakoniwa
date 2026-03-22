/**
 * WorldMapPanel — SVGアイソメトリックタイルマップ（Phase 7 Step 2）
 *
 * 設計方針:
 * - CSS Grid → SVG ベースのアイソメトリック描画に移行
 * - 座標変換: isoX = (x - y) * TW, isoY = (x + y) * TH（菱形タイル配置）
 * - <polygon onClick> でタイルクリック判定（CSS Grid より精度が高い）
 * - タイルソート順は y → x のまま（painter's algorithm が成立）
 * - viewBox でレスポンシブ対応
 * - .slime-idle / .slime-selected CSS アニメーションを <circle> で維持
 *   （transform-box: fill-box で SVG 座標系に対応）
 * - ライブラリ追加ゼロ、Firestore 購読・onTileClick・選択ハイライトは無変更
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

/** アイソメトリック座標変換定数（単位: SVG ユーザー座標） */
const TW = 20  // タイル半幅
const TH = 10  // タイル半高さ（2:1 比率）

/** タイル属性ごとの RGB 値（ブレンド計算用に事前定義） */
type RGB = { r: number; g: number; b: number }

const TILE_RGB: Record<'fire' | 'water' | 'earth' | 'wind', RGB> = {
  fire:  { r: 0xfe, g: 0xca, b: 0xca },  // red-200   #fecaca
  water: { r: 0xbf, g: 0xdb, b: 0xfe },  // blue-200  #bfdbfe
  earth: { r: 0xfe, g: 0xf0, b: 0x8a },  // yellow-200 #fef08a
  wind:  { r: 0xd1, g: 0xfa, b: 0xe5 },  // emerald-100 #d1fae5
}

const TILE_RGB_HOVER: Record<'fire' | 'water' | 'earth' | 'wind', RGB> = {
  fire:  { r: 0xfc, g: 0xa5, b: 0xa5 },  // red-300   #fca5a5
  water: { r: 0x93, g: 0xc5, b: 0xfd },  // blue-300  #93c5fd
  earth: { r: 0xfd, g: 0xe0, b: 0x47 },  // yellow-300 #fde047
  wind:  { r: 0xa7, g: 0xf3, b: 0xd0 },  // emerald-200 #a7f3d0
}

/** 全属性が実質ゼロの場合のニュートラル色 */
const NEUTRAL_FILL       = '#e5e7eb'  // gray-200
const NEUTRAL_FILL_HOVER = '#d1d5db'  // gray-300

const TILE_ICONS: Record<'fire' | 'water' | 'earth' | 'wind', string> = {
  fire:  '🔥',
  water: '💧',
  earth: '🌍',
  wind:  '💨',
}

/**
 * 複数スライムの表示オフセット（タイル中心からの相対位置）
 * インデックス = slimesOnTile.length - 1 (max 3)
 */
const SLIME_OFFSETS: [number, number][][] = [
  [[0, 0]],
  [[-6, 0], [6, 0]],
  [[-6, -3], [6, -3], [0, 4]],
]

/**
 * タイルの支配属性を返す（アイコン表示用）
 * - 全属性が実質ゼロ（合計 < 0.01）の場合は null を返す
 * - タイブレークは座標ベースで決定論的に解決（レンダリング毎に変わらない）
 */
function getDominantAttr(tile: Tile): 'fire' | 'water' | 'earth' | 'wind' | null {
  const attrs = tile.attributes
  const keys = ['fire', 'water', 'earth', 'wind'] as const
  const total = keys.reduce((s, k) => s + attrs[k], 0)
  if (total < 0.01) return null
  const maxVal = Math.max(...keys.map((k) => attrs[k]))
  const candidates = keys.filter((k) => attrs[k] === maxVal)
  return candidates[(tile.x * 3 + tile.y * 7) % candidates.length]
}

/**
 * タイルの fill 色を属性値の重み付きブレンドで返す
 * - 全属性が実質ゼロ → ニュートラルグレー
 * - 混合属性タイルは複数色を属性比でブレンド
 */
function getBlendedFill(tile: Tile, hovered: boolean): string {
  const { fire, water, earth, wind } = tile.attributes
  const total = fire + water + earth + wind
  if (total < 0.01) return hovered ? NEUTRAL_FILL_HOVER : NEUTRAL_FILL

  const palette = hovered ? TILE_RGB_HOVER : TILE_RGB
  const r = Math.round((fire * palette.fire.r + water * palette.water.r + earth * palette.earth.r + wind * palette.wind.r) / total)
  const g = Math.round((fire * palette.fire.g + water * palette.water.g + earth * palette.earth.g + wind * palette.wind.g) / total)
  const b = Math.round((fire * palette.fire.b + water * palette.water.b + earth * palette.earth.b + wind * palette.wind.b) / total)
  return `rgb(${r},${g},${b})`
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
  const [hoveredTile, setHoveredTile] = useState<string | null>(null)
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

  /**
   * SVG viewBox: 10×10 タイルがすべて収まる範囲
   * isoX ∈ [-(N-1)*TW, (N-1)*TW], isoY ∈ [0, (2N-2)*TH]
   * ± TW/TH のマージンを加えてタイル端を切り抜かない
   */
  const N = 10
  const vbX = -(N - 1) * TW - TW   // -200
  const vbY = -TH                   // -10
  const vbW = 2 * ((N - 1) * TW + TW)  // 400
  const vbH = (2 * (N - 1)) * TH + 2 * TH  // 200

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

      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        className="w-full mx-auto transition-[filter] duration-700"
        style={{
          maxWidth: 400,
          filter: getMapFilter(world?.season, world?.weather),
        }}
        aria-label="スライムマップ"
      >
        {tiles.map((tile) => {
          const dominant = getDominantAttr(tile)
          const tileKey = `${tile.x},${tile.y}`
          const slimesOnTile = slimesByTile[tileKey] ?? []
          const isSelected = slimesOnTile.some((s) => s.id === selectedSlimeId)
          const isHovered = hoveredTile === tileKey

          // アイソメトリック中心座標
          const cx = (tile.x - tile.y) * TW
          const cy = (tile.x + tile.y) * TH

          // ダイアモンド形タイルの頂点（上→右→下→左）
          const points = [
            `${cx},${cy - TH}`,
            `${cx + TW},${cy}`,
            `${cx},${cy + TH}`,
            `${cx - TW},${cy}`,
          ].join(' ')

          const fill = getBlendedFill(tile, isHovered)

          return (
            <g
              key={tile.id}
              onClick={() => onTileClick?.(tile.x, tile.y)}
              onMouseEnter={() => setHoveredTile(tileKey)}
              onMouseLeave={() => setHoveredTile(null)}
              style={{ cursor: onTileClick ? 'pointer' : 'default' }}
            >
              {/* ツールチップ */}
              <title>
                ({tile.x},{tile.y}) 火:{tile.attributes.fire.toFixed(2)} 水:{tile.attributes.water.toFixed(2)} 土:{tile.attributes.earth.toFixed(2)} 風:{tile.attributes.wind.toFixed(2)}
              </title>

              {/* タイルポリゴン */}
              <polygon
                points={points}
                fill={fill}
                stroke={isSelected ? '#22c55e' : 'rgba(255,255,255,0.6)'}
                strokeWidth={isSelected ? 1.5 : 0.5}
              />

              {/* 属性アイコン（スライムがいない場合のみ・全属性ゼロは非表示） */}
              {slimesOnTile.length === 0 && dominant !== null && (
                <text
                  x={cx}
                  y={cy + 4}
                  textAnchor="middle"
                  fontSize={8}
                  style={{ userSelect: 'none', pointerEvents: 'none' }}
                >
                  {TILE_ICONS[dominant]}
                </text>
              )}

              {/* スライムアイコン（最大3体） */}
              {slimesOnTile.slice(0, 3).map((s, i) => {
                const offsets = SLIME_OFFSETS[Math.min(slimesOnTile.length, 3) - 1]
                const [ox, oy] = offsets[i]
                const iconSize = 10
                const ix = cx + ox - iconSize / 2
                const iy = cy + oy - iconSize   // 足元をタイル中心に合わせる
                const slimeColor = s.color ?? DEFAULT_SLIME_COLOR
                return (
                  <image
                    key={s.id}
                    href="/assets/slimes/slime-base.png"
                    x={ix}
                    y={iy}
                    width={iconSize}
                    height={iconSize}
                    className={s.id === selectedSlimeId ? 'slime-selected' : 'slime-idle'}
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: 'center bottom',
                      filter: `drop-shadow(0 0 2px ${slimeColor}) drop-shadow(0 0 1px ${slimeColor})`,
                    }}
                  />
                )
              })}

              {/* 4体以上いる場合の +N 表示 */}
              {slimesOnTile.length > 3 && (
                <text
                  x={cx + 9}
                  y={cy + 2}
                  fontSize={5}
                  fill="#4b5563"
                  fontWeight="bold"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  +{slimesOnTile.length - 3}
                </text>
              )}
            </g>
          )
        })}
      </svg>

      {onTileClick && (
        <p className="text-xs text-gray-400 text-center">
          タイルをクリックして目標地点に設定できます
        </p>
      )}
    </div>
  )
}
