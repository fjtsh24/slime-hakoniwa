import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { FieldValue } from 'firebase-admin/firestore'
import { GameMap, Tile } from '../../../shared/types/map'
import { User } from '../../../shared/types/user'
import { MAP_WIDTH_DEFAULT, MAP_HEIGHT_DEFAULT } from '../../../shared/constants/map'

const MAP_WIDTH = MAP_WIDTH_DEFAULT
const MAP_HEIGHT = MAP_HEIGHT_DEFAULT

export const onUserCreate = functions
  .region('asia-northeast1')
  .auth.user()
  .onCreate(async (userRecord) => {
    const db = admin.firestore()
    const uid = userRecord.uid

    // 冪等性チェック: 既存ユーザーの場合は早期リターン
    const userRef = db.collection('users').doc(uid)
    const userSnap = await userRef.get()
    if (userSnap.exists) {
      functions.logger.info(`onUserCreate: user ${uid} already exists, skipping`)
      return
    }

    // マップIDを生成
    const mapId = db.collection('maps').doc().id
    const now = FieldValue.serverTimestamp()

    // WriteBatchでusers + maps + tiles(100件)を一括書き込み
    const batch = db.batch()

    // usersドキュメント作成
    const userDoc: Omit<User, 'createdAt' | 'updatedAt'> & { createdAt: any; updatedAt: any } = {
      uid,
      displayName: userRecord.displayName ?? '',
      email: userRecord.email ?? '',
      mapId,
      createdAt: now,
      updatedAt: now,
    }
    batch.set(userRef, userDoc)

    // mapsドキュメント作成
    const mapRef = db.collection('maps').doc(mapId)
    const mapDoc: Omit<GameMap, 'createdAt'> & { createdAt: any } = {
      id: mapId,
      worldId: 'world-default', // Phase 2ではデフォルトワールドに所属
      ownerUid: uid,
      name: `${userRecord.displayName ?? 'Player'}のマップ`,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
      createdAt: now,
    }
    batch.set(mapRef, mapDoc)

    // tiles(10x10=100件)をバッチ作成
    for (let x = 0; x < MAP_WIDTH; x++) {
      for (let y = 0; y < MAP_HEIGHT; y++) {
        const tileId = `${mapId}-${x}-${y}`
        const tileRef = db.collection('maps').doc(mapId).collection('tiles').doc(tileId)
        const tileDoc: Tile = {
          id: tileId,
          mapId,
          x,
          y,
          attributes: { fire: 0, water: 0, earth: 0, wind: 0 },
        }
        batch.set(tileRef, tileDoc)
      }
    }

    await batch.commit()
    functions.logger.info(`onUserCreate: initialized user ${uid} with map ${mapId}`)
  })
