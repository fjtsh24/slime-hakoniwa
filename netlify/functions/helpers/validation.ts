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
 *   hunt    : actionData に targetCategory（"beast"|"plant"|"fish"|"human"）と targetStrength（"weak"|"normal"）が必須
 *   battle  : actionData に targetCategory（"beast"|"plant"|"fish"|"human"）と targetStrength（"weak"|"normal"）が必須
 *   merge   : actionData に targetSlimeId（非空文字列）が必須（Phase 4 追加）
 *   plant   : actionData に foodId（非空文字列）が必須（Phase 8 追加）
 */

/** gather / fish 用: 追加データなし */
const emptyDataSchema = z.object({}).strict()

/** hunt / battle 用: targetCategory + targetStrength */
const huntBattleDataSchema = z
  .object({
    targetCategory: z.enum(['beast', 'plant', 'fish', 'human', 'spirit', 'slime']),
    targetStrength: z.enum(['weak', 'normal', 'strong']),
  })
  .strict()

/** merge（融合）用: targetSlimeId が必須（Phase 4 追加） */
const mergeDataSchema = z
  .object({
    targetSlimeId: z.string().min(1, 'targetSlimeId は必須です'),
  })
  .strict()

/** plant（植え付け）用: foodId が必須（Phase 8 追加） */
const plantDataSchema = z
  .object({
    foodId: z.string().min(1, 'foodId は必須です').max(128, 'foodId が長すぎます'),
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
    actionType: z.enum(['eat', 'move', 'rest', 'battle', 'gather', 'fish', 'hunt', 'merge', 'plant'], {
      errorMap: () => ({
        message:
          'actionType は "eat" | "move" | "rest" | "battle" | "gather" | "fish" | "hunt" | "merge" | "plant" のいずれかです',
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
      // merge: targetSlimeId が必須
      mergeDataSchema,
      // plant: foodId が必須（Phase 8 追加）
      plantDataSchema,
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

    if (actionType === 'merge') {
      const result = mergeDataSchema.safeParse(actionData)
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'merge アクションには actionData.targetSlimeId（非空文字列）が必要です',
        })
      }
      return
    }

    if (actionType === 'plant') {
      const result = plantDataSchema.safeParse(actionData)
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'plant アクションには actionData.foodId（非空文字列）が必要です',
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

/**
 * publicHandle 登録・変更リクエストのバリデーションスキーマ（Phase 6）
 * - 3〜32文字・英数字・ハイフン・アンダースコアのみ
 * - lowercase に正規化
 */
export const registerHandleSchema = z.object({
  handle: z
    .string()
    .min(3, '3文字以上必要です')
    .max(32, '32文字以下にしてください')
    .regex(/^[a-zA-Z0-9_-]+$/, '英数字・ハイフン・アンダースコアのみ使用できます')
    .transform((s) => s.toLowerCase()),
})

export type RegisterHandleInput = z.infer<typeof registerHandleSchema>

/**
 * /api/worlds/:worldId/status パスパラメータのバリデーションスキーマ（S-1: A2/Sec）
 * Firestore ドキュメントID: 1〜128文字・スラッシュ不可
 */
export const worldIdParamSchema = z.object({
  worldId: z
    .string()
    .min(1, 'worldId は必須です')
    .max(128, 'worldId が長すぎます')
    .regex(/^[^/]+$/, 'worldId にスラッシュは使用できません'),
})

export type WorldIdParam = z.infer<typeof worldIdParamSchema>

/**
 * スライム改名リクエストのバリデーションスキーマ（PATCH /api/slimes/:slimeId/name）
 * - 1〜20文字・前後の空白を除去
 */
export const renameSlimeSchema = z.object({
  name: z
    .string()
    .min(1, '名前は1文字以上必要です')
    .max(20, '名前は20文字以下にしてください')
    .transform((s) => s.trim())
    .refine((s) => s.length >= 1, '名前は空白のみでは設定できません'),
})

export type RenameSlimeInput = z.infer<typeof renameSlimeSchema>

/**
 * /api/public/players/:handle パスパラメータのバリデーションスキーマ
 */
export const publicHandleParamSchema = z.object({
  handle: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_-]+$/, 'handleは英数字・ハイフン・アンダースコアのみ')
    .transform((s) => s.toLowerCase()),
})

export type PublicHandleParam = z.infer<typeof publicHandleParamSchema>
