import { Link } from 'react-router-dom'
import { slimeSpecies } from '../../../shared/data/slimeSpecies'

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

        {/* 進化ルート概要 */}
        <section className="bg-white rounded-xl shadow p-5 mb-6">
          <h2 className="text-base font-bold text-gray-700 mb-3">進化ルート</h2>
          <div className="flex items-center gap-2 flex-wrap text-sm text-gray-600">
            <span className="px-2 py-1 bg-green-100 border border-green-300 rounded font-medium">スライム（基本種）</span>
            <span className="text-gray-400">→</span>
            <span className="px-2 py-1 bg-red-100 border border-red-300 rounded">ファイア</span>
            <span className="px-2 py-1 bg-blue-100 border border-blue-300 rounded">ウォーター</span>
            <span className="px-2 py-1 bg-yellow-100 border border-yellow-300 rounded">アース</span>
            <span className="px-2 py-1 bg-emerald-100 border border-emerald-300 rounded">ウィンド</span>
            <span className="text-gray-400">→</span>
            <span className="px-2 py-1 bg-purple-100 border border-purple-300 rounded">第2進化へ</span>
          </div>
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
