/**
 * speciesId → アイコン画像URL のマッピング
 *
 * illustrationUrl がある種族はそれを使用（立ち絵をサムネイルとして流用）。
 * ない種族は slime-base.png にフォールバック。
 */
import { slimeSpecies } from '../../../shared/data/slimeSpecies'

const FALLBACK = '/assets/slimes/slime-base.png'

const speciesMap = new Map(slimeSpecies.map((s) => [s.id, s.illustrationUrl ?? FALLBACK]))

export function getSlimeIconUrl(speciesId: string): string {
  return speciesMap.get(speciesId) ?? FALLBACK
}
