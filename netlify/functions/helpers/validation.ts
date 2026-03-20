import { z } from 'zod'
import { MAP_WIDTH_MAX, MAP_HEIGHT_MAX } from '../../../shared/constants/map'

/**
 * 行動予約作成リクエストのバリデーションスキーマ
 *
 * actionType に応じた actionData の厳密なバリデーションを superRefine で実施：
 *   eat     : actionData.foodId が string かつ非空
 *   move    : actionData.targetX / targetY が 0〜MAP_WIDTH_MAX-1 / MAP_HEIGHT_MAX-1 の整数
 *   rest    : actionData は空オブジェクト
 *   gather  : actionData は空オブジェクト
 *   fish    : actionData は空オブジェクト
 *   hunt    : actionData に targetCategory（"beast"|"plant"）と targetStrength（"weak"|"normal"）が必須
 *   battle  : actionData に targetCategory（"beast"|"plant"）と targetStrength（"weak"|"normal"）が必須
 */

/** gather / fish 用: 追加データなし */
const emptyDataSchema = z.object({}).strict()

/** hunt / battle 用: targetCategory + targetStrength */
const huntBattleDataSchema = z
  .object({
    targetCategory: z.enum(['beast', 'plant']),
    targetStrength: z.enum(['weak', 'normal']),
  })
  .strict()

export const createReservationSchema = z
  .object({
    slimeId: z.string().min(1, 'slimeId は必須です'),
    worldId: z.string().min(1, 'worldId は必須です'),
    turnNumber: z
      .number()
      .int('turnNumber は整数でなければなりません')
      .positive('turnNumber は正の整数でなければなりません'),
    actionType: z.enum(['eat', 'move', 'rest', 'battle', 'gather', 'fish', 'hunt'], {
      errorMap: () => ({
        message:
          'actionType は "eat" | "move" | "rest" | "battle" | "gather" | "fish" | "hunt" のいずれかです',
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
      // hunt / battle: targetCategory + targetStrength
      huntBattleDataSchema,
      // rest / gather / fish: 空オブジェクト（strict）
      emptyDataSchema,
    ]),
  })
  .superRefine((data, ctx) => {
    const { actionType, actionData } = data

    if (actionType === 'eat') {
      if (
        !('foodId' in actionData) ||
        typeof (actionData as { foodId?: unknown }).foodId !== 'string' ||
        (actionData as { foodId: string }).foodId.length === 0
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'eat アクションには actionData.foodId（非空文字列）が必要です',
        })
      }
      return
    }

    if (actionType === 'move') {
      if (!('targetX' in actionData) || !('targetY' in actionData)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'move アクションには actionData.targetX と actionData.targetY が必要です',
        })
      }
      return
    }

    if (actionType === 'rest' || actionType === 'gather' || actionType === 'fish') {
      const result = emptyDataSchema.safeParse(actionData)
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${actionType} アクションの actionData は空オブジェクトでなければなりません`,
        })
      }
      return
    }

    if (actionType === 'hunt' || actionType === 'battle') {
      const result = huntBattleDataSchema.safeParse(actionData)
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${actionType} アクションには actionData.targetCategory と actionData.targetStrength が必要です`,
        })
      }
      return
    }
  })

export type CreateReservationInput = z.infer<typeof createReservationSchema>

/**
 * 予約キャンセルのパスパラメータ検証スキーマ
 */
export const deleteReservationSchema = z.object({
  id: z.string().min(1, 'id は必須です'),
})

export type DeleteReservationInput = z.infer<typeof deleteReservationSchema>
