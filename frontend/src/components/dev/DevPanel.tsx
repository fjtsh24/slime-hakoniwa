/**
 * 開発者用チートパネル（DEV モード専用）
 *
 * import.meta.env.DEV === true（Vite 開発サーバー）の場合のみ表示される。
 * 本番ビルドでは tree-shaking により除去される。
 *
 * 機能:
 *   - スライムの stats / 種族値 をプリセットまたは手動で上書き
 *   - ターン処理を即時実行
 */

import { useState } from 'react'
import { slimeSpecies } from '../../../../shared/data/slimeSpecies'

// 相対URLにすることで Vite プロキシ (/dev-cheat → localhost:8888) を経由し CORS を回避
const DEV_API = '/dev-cheat'

const WORLD_ID = 'world-001'

// よく使うプリセット
const STAT_PRESETS = [
  { label: '進化直前 (exp=490, fire=0.5)', stats: { exp: 490 }, racialValues: { fire: 0.5 } },
  { label: '分裂直前 (exp=500, beast=0.71)', stats: { exp: 500 }, racialValues: { beast: 0.71 } },
  { label: '融合テスト用 (atk=100, def=80)', stats: { atk: 100, def: 80 } },
  { label: 'hunger=0 (空腹)', stats: { hunger: 0 } },
  { label: 'HP=1 (瀕死)', stats: { hp: 1 } },
  { label: 'スキルリセット', skillIds: [] },
] as const

type Preset = (typeof STAT_PRESETS)[number]

interface SlimeSummary {
  id: string
  name: string
  speciesId: string
  stats: Record<string, number>
  racialValues: Record<string, number>
  skillIds: string[]
}

const SEASONS = [
  { value: 'spring', label: '春' },
  { value: 'summer', label: '夏' },
  { value: 'autumn', label: '秋' },
  { value: 'winter', label: '冬' },
] as const

const WEATHERS = [
  { value: 'sunny',  label: '晴れ' },
  { value: 'rainy',  label: '雨' },
  { value: 'stormy', label: '嵐' },
  { value: 'foggy',  label: '霧' },
] as const

export function DevPanel() {
  const [slimes, setSlimes] = useState<SlimeSummary[]>([])
  const [selectedSlimeId, setSelectedSlimeId] = useState('')
  const [log, setLog] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedSeason, setSelectedSeason] = useState<string>('spring')
  const [selectedWeather, setSelectedWeather] = useState<string>('sunny')
  const [minimized, setMinimized] = useState(true)
  const [targetSpeciesId, setTargetSpeciesId] = useState('')

  function addLog(msg: string) {
    setLog((prev) => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 19)])
  }

  async function fetchSlimes() {
    setLoading(true)
    try {
      const res = await fetch(`${DEV_API}/slimes?worldId=${WORLD_ID}`)
      const data = await res.json()
      setSlimes(data.slimes ?? [])
      addLog(`スライム一覧取得: ${(data.slimes ?? []).length} 件`)
    } catch (e) {
      addLog(`エラー: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  async function applyPreset(preset: Preset) {
    if (!selectedSlimeId) { addLog('スライムを選択してください'); return }
    setLoading(true)
    try {
      const body: Record<string, unknown> = { slimeId: selectedSlimeId }
      if ('stats' in preset && preset.stats) body['stats'] = preset.stats
      if ('racialValues' in preset && preset.racialValues) body['racialValues'] = preset.racialValues
      if ('skillIds' in preset) body['skillIds'] = preset.skillIds

      const res = await fetch(`${DEV_API}/set-slime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      addLog(data.message ?? JSON.stringify(data))
      await fetchSlimes()
    } catch (e) {
      addLog(`エラー: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  async function changeSpecies() {
    if (!selectedSlimeId) { addLog('スライムを選択してください'); return }
    if (!targetSpeciesId) { addLog('進化先を選択してください'); return }
    setLoading(true)
    try {
      const res = await fetch(`${DEV_API}/set-slime`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slimeId: selectedSlimeId, speciesId: targetSpeciesId }),
      })
      const data = await res.json()
      addLog(data.message ?? JSON.stringify(data))
      await fetchSlimes()
    } catch (e) {
      addLog(`エラー: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  async function setWorld(type: 'season' | 'weather') {
    setLoading(true)
    try {
      const body: Record<string, unknown> = { worldId: WORLD_ID }
      if (type === 'season') body['season'] = selectedSeason
      if (type === 'weather') body['weather'] = selectedWeather

      const res = await fetch(`${DEV_API}/set-world`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      addLog(data.message ?? JSON.stringify(data))
    } catch (e) {
      addLog(`エラー: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  async function forceTurn() {
    setLoading(true)
    try {
      const res = await fetch(`${DEV_API}/force-turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worldId: WORLD_ID }),
      })
      const data = await res.json()
      addLog(data.message ?? JSON.stringify(data))
      await fetchSlimes()
    } catch (e) {
      addLog(`エラー: ${e}`)
    } finally {
      setLoading(false)
    }
  }

  const selected = slimes.find((s) => s.id === selectedSlimeId)

  return (
    <div className={`fixed bottom-4 right-16 z-50 bg-gray-900 text-white rounded-xl shadow-2xl text-xs border border-yellow-500 transition-all duration-200 ${minimized ? 'w-auto' : 'w-80'}`}>
      {/* ヘッダー */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-yellow-500 text-gray-900 rounded-t-xl cursor-pointer select-none"
        onClick={() => setMinimized((v) => !v)}
        title={minimized ? '展開' : '最小化'}
      >
        <span className="font-bold text-sm">🛠 Dev Panel</span>
        <div className="flex items-center gap-2">
          {!minimized && (
            <button
              onClick={(e) => { e.stopPropagation(); fetchSlimes() }}
              disabled={loading}
              className="text-gray-900 underline text-xs disabled:opacity-50"
            >
              更新
            </button>
          )}
          <span className="text-gray-900 font-bold leading-none">{minimized ? '▲' : '▼'}</span>
        </div>
      </div>

      {!minimized && <div className="p-3 flex flex-col gap-3">
        {/* スライム選択 */}
        <div>
          <div className="text-gray-400 mb-1">スライム選択</div>
          {slimes.length === 0 ? (
            <button
              onClick={fetchSlimes}
              className="w-full bg-gray-700 hover:bg-gray-600 rounded px-2 py-1"
            >
              スライム一覧を読み込む
            </button>
          ) : (
            <select
              value={selectedSlimeId}
              onChange={(e) => setSelectedSlimeId(e.target.value)}
              className="w-full bg-gray-700 rounded px-2 py-1 text-white"
            >
              <option value="">-- 選択 --</option>
              {slimes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.speciesId}) exp={s.stats.exp}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* 現在のステータス */}
        {selected && (
          <div className="bg-gray-800 rounded p-2 text-gray-300 leading-relaxed">
            <div>ATK:{selected.stats.atk} DEF:{selected.stats.def} EXP:{selected.stats.exp}</div>
            <div>
              beast:{selected.racialValues.beast?.toFixed(2)}
              {' '}plant:{selected.racialValues.plant?.toFixed(2)}
              {' '}fish:{selected.racialValues.fish?.toFixed(2)}
            </div>
            {selected.skillIds.length > 0 && (
              <div className="text-purple-400">skills: {selected.skillIds.join(', ')}</div>
            )}
          </div>
        )}

        {/* プリセット */}
        <div>
          <div className="text-gray-400 mb-1">プリセット適用</div>
          <div className="flex flex-col gap-1">
            {STAT_PRESETS.map((preset) => (
              <button
                key={preset.label}
                onClick={() => applyPreset(preset)}
                disabled={loading || !selectedSlimeId}
                className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded px-2 py-1 text-left"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* 種族変更 */}
        <div>
          <div className="text-gray-400 mb-1">種族変更</div>
          <div className="flex gap-1">
            <select
              value={targetSpeciesId}
              onChange={(e) => setTargetSpeciesId(e.target.value)}
              className="flex-1 bg-gray-700 rounded px-2 py-1 text-white"
            >
              <option value="">-- 進化先を選択 --</option>
              {slimeSpecies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
            <button
              onClick={changeSpecies}
              disabled={loading || !selectedSlimeId || !targetSpeciesId}
              className="bg-purple-700 hover:bg-purple-600 disabled:opacity-40 rounded px-2 py-1 whitespace-nowrap"
            >
              変更
            </button>
          </div>
          {selected && targetSpeciesId && targetSpeciesId !== selected.speciesId && (
            <div className="mt-1 text-yellow-400">
              {selected.speciesId} → {targetSpeciesId}
            </div>
          )}
        </div>

        {/* 季節・天候変更 */}
        <div>
          <div className="text-gray-400 mb-1">ワールド状態変更</div>
          <div className="flex gap-1 mb-1">
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="flex-1 bg-gray-700 rounded px-2 py-1 text-white"
            >
              {SEASONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <button
              onClick={() => setWorld('season')}
              disabled={loading}
              className="bg-green-700 hover:bg-green-600 disabled:opacity-40 rounded px-2 py-1"
            >
              季節変更
            </button>
          </div>
          <div className="flex gap-1">
            <select
              value={selectedWeather}
              onChange={(e) => setSelectedWeather(e.target.value)}
              className="flex-1 bg-gray-700 rounded px-2 py-1 text-white"
            >
              {WEATHERS.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
            <button
              onClick={() => setWorld('weather')}
              disabled={loading}
              className="bg-sky-700 hover:bg-sky-600 disabled:opacity-40 rounded px-2 py-1"
            >
              天候変更
            </button>
          </div>
        </div>

        {/* ターン強制実行 */}
        <button
          onClick={forceTurn}
          disabled={loading}
          className="bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded px-3 py-1.5 font-bold w-full"
        >
          {loading ? '実行中...' : '⚡ ターン強制実行'}
        </button>

        {/* ログ */}
        {log.length > 0 && (
          <div className="bg-black rounded p-2 max-h-24 overflow-y-auto text-gray-400 leading-snug">
            {log.map((l, i) => (
              <div key={i}>{l}</div>
            ))}
          </div>
        )}
      </div>}
    </div>
  )
}
