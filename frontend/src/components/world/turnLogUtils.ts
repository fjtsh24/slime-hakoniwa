/**
 * ターンログ表示ユーティリティ
 * TurnLogList / WorldLogPanel で共用するフォーマット関数とカラーマップ
 */

import { foods } from '../../../../shared/data/foods'
import { slimeSpecies } from '../../../../shared/data/slimeSpecies'
import { skillDefinitions } from '../../../../shared/data/skillDefinitions'
import type { TurnEventType } from '../../../../shared/types/turnLog'

export function formatEvent(eventType: TurnEventType, eventData: Record<string, unknown>): string {
  switch (eventType) {
    case 'eat': {
      const foodId = eventData.foodId as string | undefined
      const foodName = foodId ? (foods.find((f) => f.id === foodId)?.name ?? foodId) : '不明'
      return `食事した（${foodName}）`
    }
    case 'move': {
      const x = eventData.targetX as number | undefined
      const y = eventData.targetY as number | undefined
      return x !== undefined && y !== undefined ? `(${x}, ${y}) に移動した` : '移動した'
    }
    case 'rest':
      return '休息した（hunger +10）'
    case 'battle_win': {
      const monsterName = eventData.monsterName as string | undefined
      return `戦闘に勝利した${monsterName ? `（${monsterName}）` : ''}`
    }
    case 'battle_lose': {
      const loseMonsterName = eventData.monsterName as string | undefined
      return `戦闘に敗北した${loseMonsterName ? `（${loseMonsterName}）` : ''}`
    }
    case 'evolve': {
      const newSpeciesName = eventData.newSpeciesName as string | undefined
      const newSpeciesId = eventData.newSpeciesId as string | undefined
      const name = newSpeciesName ?? slimeSpecies.find((s) => s.id === newSpeciesId)?.name ?? newSpeciesId
      return `★ 進化した！${name ? `（→ ${name}）` : ''}`
    }
    case 'split': {
      const splitSpeciesId = eventData.speciesId as string | undefined
      const splitSpeciesName = slimeSpecies.find((s) => s.id === splitSpeciesId)?.name ?? splitSpeciesId
      return `分裂した${splitSpeciesName ? `（${splitSpeciesName}の子を生成）` : ''}`
    }
    case 'merge': {
      const atkAbsorb = eventData.atkAbsorb as number | undefined
      const defAbsorb = eventData.defAbsorb as number | undefined
      return `融合した${atkAbsorb !== undefined ? `（ATK+${atkAbsorb}, DEF+${defAbsorb}）` : ''}`
    }
    case 'autonomous': {
      const action = eventData.action as string | undefined
      if (action === 'walk') return '自律：歩き回った'
      if (action === 'rest') return '自律：HP微回復'
      if (action === 'weak') return '自律：空腹で動けなかった'
      return '自律行動'
    }
    case 'hunger_decrease': {
      const before = eventData.before as number | undefined
      const after = eventData.after as number | undefined
      const delta = before !== undefined && after !== undefined ? before - after : undefined
      return `hunger が ${delta !== undefined ? delta : '?'} 減少した`
    }
    case 'skill_grant': {
      const skillId = eventData.skillId as string | undefined
      const skillName = skillId ? (skillDefinitions.find((s) => s.id === skillId)?.name ?? skillId) : undefined
      return `✨ スキルを習得した${skillName ? `（${skillName}）` : ''}`
    }
    case 'gather_success': {
      const foodId = eventData.foodId as string | undefined
      const foodName = foodId ? (foods.find((f) => f.id === foodId)?.name ?? foodId) : undefined
      return `採集成功${foodName ? `（${foodName}）` : ''}`
    }
    case 'gather_fail':
      return '採集失敗'
    case 'fish_success': {
      const fishFoodId = eventData.foodId as string | undefined
      const fishFoodName = fishFoodId ? (foods.find((f) => f.id === fishFoodId)?.name ?? fishFoodId) : undefined
      return `釣り成功${fishFoodName ? `（${fishFoodName}）` : ''}`
    }
    case 'fish_fail':
      return '釣り失敗'
    case 'hunt_success': {
      const huntMonsterName = eventData.monsterName as string | undefined
      return `狩猟成功${huntMonsterName ? `（${huntMonsterName}）` : ''}`
    }
    case 'hunt_fail':
      return '狩猟失敗'
    case 'inventory_full':
      return 'インベントリが満杯'
    case 'inventory_not_found':
      return '食料が見つからない'
    case 'battle_incapacitated':
      return '⚡ 戦闘不能（2ターン行動停止）'
    default:
      return String(eventType)
  }
}

export const EVENT_COLORS: Record<TurnEventType, string> = {
  eat: 'bg-green-100 text-green-700',
  move: 'bg-blue-100 text-blue-700',
  rest: 'bg-yellow-100 text-yellow-700',
  battle_win: 'bg-purple-100 text-purple-700',
  battle_lose: 'bg-red-100 text-red-700',
  evolve: 'bg-yellow-200 text-orange-800 font-bold border border-orange-300',
  split: 'bg-pink-100 text-pink-700 font-bold border border-pink-300',
  merge: 'bg-indigo-100 text-indigo-700 font-bold border border-indigo-300',
  autonomous: 'bg-gray-100 text-gray-600',
  hunger_decrease: 'bg-red-50 text-red-500',
  skill_grant: 'bg-purple-50 text-purple-600',
  gather_success: 'bg-green-100 text-green-700',
  gather_fail: 'bg-gray-100 text-gray-500',
  fish_success: 'bg-blue-100 text-blue-600',
  fish_fail: 'bg-gray-100 text-gray-500',
  hunt_success: 'bg-orange-100 text-orange-700',
  hunt_fail: 'bg-gray-100 text-gray-500',
  inventory_full: 'bg-yellow-100 text-yellow-700',
  inventory_not_found: 'bg-red-100 text-red-500',
  battle_incapacitated: 'bg-red-100 text-red-700',
  season_change: 'bg-teal-100 text-teal-700',
  weather_change: 'bg-sky-100 text-sky-700',
  area_unlock: 'bg-emerald-100 text-emerald-700',
  item_spawn: 'bg-amber-100 text-amber-700',
  plant_success: 'bg-green-100 text-green-700',
  plant_fail: 'bg-gray-100 text-gray-500',
  season_tile_change: 'bg-teal-50 text-teal-600',
}

/** WorldLogPanel「重要のみ」プリセットのイベント種別 */
export const IMPORTANT_EVENT_TYPES: TurnEventType[] = [
  'evolve',
  'split',
  'merge',
  'battle_win',
  'battle_lose',
  'skill_grant',
]

/** スライムのデフォルトカラー（color フィールドがない既存スライム用） */
export const DEFAULT_SLIME_COLOR = '#4CAF50'
