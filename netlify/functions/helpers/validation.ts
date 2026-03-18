import { z } from 'zod'
import { MAP_WIDTH_MAX, MAP_HEIGHT_MAX } from '../../../shared/constants/map'

/**
 * 行動予約作成リクエストのバリデーションスキーマ
 *
 * actionType に応じた actionData の厳密なバリデーションを superRefine で実施：
 *   eat    : actionData.foodId が string かつ非空
 *   move   : actionData.targetX / targetY が 0〜MAP_WIDTH_MAX-1 / MAP_HEIGHT_MAX-1 の整数
 *   rest   : actionData は空オブジェクト
 *   battle : actionData が object であることのみ検証（将来実装）
 */
export const createReservationSchema = z
  .object({
    slimeId: z.string().min(1, 'slimeId は必須です'),
    worldId: z.string().min(1, 'worldId は必須です'),
    turnNumber: z
      .number()
      .int('turnNumber は整数でなければなりません')
      .positive('turnNumber は正の整数でなければなりません'),
    actionType: z.enum(['eat', 'move', 'rest', 'battle'], {
      errorMap: () => ({
        message: 'actionType は "eat" | "move" | "rest" | "battle" のいずれかです',
      }),
    }),
    actionData: z.union([
      // eat: foodId が必須
      z.object({ foodId: z.string().min(1, 'foodId は必須です') }),
      // move: targetX / targetY が 0〜MAP_WIDTH_MAX-1 / MAP_HEIGHT_MAX-1 の整数
      z.object({
        targetX: z.number().int().min(0).max(MAP_WIDTH_MAX - 1),
        targetY: z.number().int().min(0).max(MAP_HEIGHT_MAX - 1),
      }),
      // rest / battle: 空オブジェクトを許容
      z.object({}),
    ]),
  })
  .refine(
    (data) => {
      if (data.actionType === 'eat') {
        return (
          'foodId' in data.actionData &&
          typeof (data.actionData as { foodId?: unknown }).foodId === 'string'
        )
      }
      if (data.actionType === 'move') {
        return 'targetX' in data.actionData && 'targetY' in data.actionData
      }
      // rest / battle はそのまま許可
      return true
    },
    { message: 'actionData が actionType と一致しません' }
  )

export type CreateReservationInput = z.infer<typeof createReservationSchema>

/**
 * 予約キャンセルのパスパラメータ検証スキーマ
 */
export const deleteReservationSchema = z.object({
  id: z.string().min(1, 'id は必須です'),
})

export type DeleteReservationInput = z.infer<typeof deleteReservationSchema>
