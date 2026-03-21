/**
 * slimeTrigger.ts — slimes ドキュメント書き込み時に publicProfiles を自動同期
 *
 * MUST-3（Phase 6 設計書）: publicProfiles.slimeSummaries は Cloud Functions（Admin SDK）のみ更新可。
 * slimes/{slimeId} の create / update / delete いずれでも発火し、該当オーナーの
 * publicProfiles/{uid}.slimeSummaries を全件再構築してホワイトリスト方式で書き込む。
 */

import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'

interface ChangeSnapshot {
  before: { exists: boolean; id: string; data(): Record<string, unknown> | undefined }
  after: { exists: boolean; id: string; data(): Record<string, unknown> | undefined }
}

/**
 * slimes ドキュメント書き込み時の処理本体。
 * テスト容易性のためトリガー登録から分離してエクスポートする。
 */
export async function syncSlimeToPublicProfile(change: ChangeSnapshot): Promise<void> {
  // 削除時は before、作成・更新時は after から ownerUid を取得する
  const afterData = change.after.exists ? change.after.data() : null
  const beforeData = change.before.exists ? change.before.data() : null
  const ownerUid = (afterData?.['ownerUid'] ?? beforeData?.['ownerUid']) as string | undefined

  if (!ownerUid) {
    functions.logger.warn('onSlimeWrite: ownerUid が取得できませんでした', {
      slimeId: change.after.id || change.before.id,
    })
    return
  }

  const db = admin.firestore()
  const profileRef = db.collection('publicProfiles').doc(ownerUid)

  // publicProfile が存在しない場合はスキップ（ハンドル未登録ユーザーは対象外）
  const profileSnap = await profileRef.get()
  if (!profileSnap.exists) {
    return
  }

  // オーナーの全スライムを再取得してサマリーを再構築
  const slimesSnap = await db
    .collection('slimes')
    .where('ownerUid', '==', ownerUid)
    .where('isWild', '==', false)
    .get()

  // ホワイトリスト方式: exp / hunger / racialValues / skillIds / incapacitatedUntilTurn は含めない
  const slimeSummaries = slimesSnap.docs.map((doc) => {
    const data = doc.data()
    const stats = data['stats'] as Record<string, number> | null | undefined
    return {
      id: doc.id,
      name: data['name'] as string,
      speciesId: data['speciesId'] as string,
      stats: {
        hp: stats?.['hp'] ?? 0,
        atk: stats?.['atk'] ?? 0,
        def: stats?.['def'] ?? 0,
        spd: stats?.['spd'] ?? 0,
      },
      color: (data['color'] as string | undefined) ?? null,
    }
  })

  await profileRef.update({
    slimeSummaries,
    updatedAt: FieldValue.serverTimestamp(),
  })

  functions.logger.info('onSlimeWrite: publicProfile 同期完了', {
    ownerUid,
    slimeCount: slimeSummaries.length,
  })
}

export const onSlimeWrite = functions
  .region('asia-northeast1')
  .firestore.document('slimes/{slimeId}')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  .onWrite(syncSlimeToPublicProfile as any)
