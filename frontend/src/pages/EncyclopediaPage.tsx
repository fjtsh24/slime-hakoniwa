import { Link } from 'react-router-dom'
import { slimeSpecies } from '../../../shared/data/slimeSpecies'

/** Tier ごとの列定義（SVGレイアウト用） */
const TIER_COLUMNS = [
  { ids: ['slime-001'] },
  { ids: ['slime-002', 'slime-003', 'slime-004', 'slime-005'] },
  { ids: ['slime-006', 'slime-007', 'slime-008', 'slime-009', 'slime-010'] },
]

/** ノードの座標を計算する */
function buildNodePositions(): Record<string, { x: number; y: number }> {
  const COL_X = [80, 240, 400]
  const NODE_H = 36
  const NODE_GAP = 12
  const positions: Record<string, { x: number; y: number }> = {}
  TIER_COLUMNS.forEach((col, colIdx) => {
    const totalH = col.ids.length * NODE_H + (col.ids.length - 1) * NODE_GAP
    const startY = (220 - totalH) / 2
    col.ids.forEach((id, rowIdx) => {
      positions[id] = {
        x: COL_X[colIdx],
        y: startY + rowIdx * (NODE_H + NODE_GAP) + NODE_H / 2,
      }
    })
  })
  return positions
}

const NODE_FILL: Record<string, string> = {
  'slime-001': '#dcfce7', 'slime-002': '#fee2e2', 'slime-003': '#dbeafe',
  'slime-004': '#fef9c3', 'slime-005': '#d1fae5', 'slime-006': '#f3e8ff',
  'slime-007': '#ffedd5', 'slime-008': '#cffafe', 'slime-009': '#ffe4e6',
  'slime-010': '#ede9fe',
}
const NODE_STROKE: Record<string, string> = {
  'slime-001': '#86efac', 'slime-002': '#fca5a5', 'slime-003': '#93c5fd',
  'slime-004': '#fde047', 'slime-005': '#6ee7b7', 'slime-006': '#d8b4fe',
  'slime-007': '#fdba74', 'slime-008': '#67e8f9', 'slime-009': '#fda4af',
  'slime-010': '#c4b5fd',
}
const SHORT_NAME: Record<string, string> = {
  'slime-001': 'スライム', 'slime-002': 'ファイア', 'slime-003': 'アクア',
  'slime-004': 'アース', 'slime-005': 'ウィンド', 'slime-006': 'ダーク',
  'slime-007': 'ライト', 'slime-008': 'ドラゴン', 'slime-009': 'マリン',
  'slime-010': 'フォレスト',
}

const NODE_W = 70
const NODE_H_SVG = 28

function EvolutionTreeSVG() {
  const positions = buildNodePositions()
  const edges: Array<{ from: string; to: string }> = []
  for (const species of slimeSpecies) {
    for (const ec of species.evolutionConditions) {
      edges.push({ from: species.id, to: ec.targetSpeciesId })
    }
  }

  return (
    <svg viewBox="0 0 480 220" className="w-full h-auto" role="img" aria-label="スライム進化ツリー">
      <defs>
        <marker id="arrowhead" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#9ca3af" />
        </marker>
      </defs>

      {/* Tierラベル */}
      {[{ x: 80, label: '基本種' }, { x: 240, label: '第1進化' }, { x: 400, label: '第2進化' }].map(({ x, label }) => (
        <text key={label} x={x} y={12} textAnchor="middle" fontSize="8" fill="#9ca3af" fontWeight="500">{label}</text>
      ))}

      {/* エッジ */}
      {edges.map(({ from, to }) => {
        const src = positions[from]
        const dst = positions[to]
        if (!src || !dst) return null
        const x1 = src.x + NODE_W / 2
        const x2 = dst.x - NODE_W / 2
        const cx = x1 + (x2 - x1) * 0.5
        return (
          <path
            key={`${from}-${to}`}
            d={`M${x1},${src.y} C${cx},${src.y} ${cx},${dst.y} ${x2},${dst.y}`}
            stroke="#9ca3af" strokeWidth="1.5" fill="none" markerEnd="url(#arrowhead)"
          />
        )
      })}

      {/* ノード */}
      {slimeSpecies.map((species) => {
        const pos = positions[species.id]
        if (!pos) return null
        return (
          <g key={species.id} transform={`translate(${pos.x - NODE_W / 2}, ${pos.y - NODE_H_SVG / 2})`}>
            <rect width={NODE_W} height={NODE_H_SVG} rx={6}
              fill={NODE_FILL[species.id] ?? '#f3f4f6'}
              stroke={NODE_STROKE[species.id] ?? '#d1d5db'} strokeWidth="1.5" />
            <text x={NODE_W / 2} y={NODE_H_SVG / 2 + 4} textAnchor="middle" fontSize="9" fontWeight="600" fill="#374151">
              {SHORT_NAME[species.id] ?? species.name}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

/** 種族ごとのアクセントカラー */
const SPECIES_COLORS: Record<string, string> = {
  'slime-001': 'bg-green-100 border-green-300',
  'slime-002': 'bg-red-100 border-red-300',
  'slime-003': 'bg-blue-100 border-blue-300',
  'slime-004': 'bg-yellow-100 border-yellow-300',
  'slime-005': 'bg-emerald-100 border-emerald-300',
  'slime-006': 'bg-purple-100 border-purple-300',
  'slime-007': 'bg-orange-100 border-orange-300',
  'slime-008': 'bg-cyan-100 border-cyan-300',
  'slime-009': 'bg-rose-100 border-rose-300',
  'slime-010': 'bg-violet-100 border-violet-300',
}

const TIER_LABEL: Record<string, string> = {
  'slime-001': '基本種',
  'slime-002': '第1進化',
  'slime-003': '第1進化',
  'slime-004': '第1進化',
  'slime-005': '第1進化',
  'slime-006': '第2進化',
  'slime-007': '第2進化',
  'slime-008': '第2進化',
  'slime-009': '第2進化',
  'slime-010': '第2進化',
}

export function EncyclopediaPage() {
  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-700 text-white shadow px-4 py-3 flex items-center gap-3">
        <Link to="/game" className="text-sm opacity-80 hover:opacity-100">← ゲームに戻る</Link>
        <h1 className="text-xl font-bold">スライム図鑑</h1>
        <span className="ml-auto text-xs opacity-70">{slimeSpecies.length}種族</span>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        <p className="text-sm text-gray-600 mb-6">
          スライムは育てる食事・環境によって進化します。
          まずは基本種のスライムを召喚し、どの種族に育てるか計画してみましょう。
        </p>

        {/* 進化ルート概要（SVGツリー） */}
        <section className="bg-white rounded-xl shadow p-5 mb-6">
          <h2 className="text-base font-bold text-gray-700 mb-4">進化ルート</h2>
          <EvolutionTreeSVG />
          <p className="text-xs text-gray-400 mt-3">
            ※ 進化条件（必要な種族値など）はゲーム内でのみ確認できます。
          </p>
        </section>

        {/* 種族一覧 */}
        <div className="grid gap-4 sm:grid-cols-2">
          {slimeSpecies.map((species) => (
            <div
              key={species.id}
              className={`border-2 rounded-xl p-4 ${SPECIES_COLORS[species.id] ?? 'bg-gray-100 border-gray-300'}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-bold text-gray-800">{species.name}</h3>
                  <span className="text-xs text-gray-500">{TIER_LABEL[species.id] ?? ''}</span>
                </div>
                <span className="text-xs text-gray-400 font-mono">{species.id}</span>
              </div>

              <p className="text-xs text-gray-600 mb-3">{species.description}</p>

              {/* ベースステータス */}
              <div className="grid grid-cols-4 gap-1 text-xs text-center">
                {[
                  { label: 'HP', value: species.baseStats.hp },
                  { label: 'ATK', value: species.baseStats.atk },
                  { label: 'DEF', value: species.baseStats.def },
                  { label: 'SPD', value: species.baseStats.spd },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-white/60 rounded px-1 py-1">
                    <div className="font-bold text-gray-700">{value}</div>
                    <div className="text-gray-400">{label}</div>
                  </div>
                ))}
              </div>

              {/* 進化先 */}
              {species.evolutionConditions.length > 0 && (
                <div className="mt-3 text-xs text-gray-500">
                  <span className="font-medium">進化先: </span>
                  {species.evolutionConditions.map((ec) => {
                    const target = slimeSpecies.find((s) => s.id === ec.targetSpeciesId)
                    return target ? target.name : ec.targetSpeciesId
                  }).join(' / ')}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-8 text-center bg-white rounded-xl shadow p-6">
          <p className="text-gray-700 font-medium mb-3">スライムを育ててみよう</p>
          <Link
            to="/game"
            className="inline-block bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2 rounded-lg transition-colors"
          >
            ゲームに戻る
          </Link>
          <Link
            to="/login"
            className="inline-block ml-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-6 py-2 rounded-lg transition-colors"
          >
            はじめる（新規登録）
          </Link>
        </div>
      </main>
    </div>
  )
}
