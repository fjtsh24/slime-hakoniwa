import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { processDueTurns } from './scheduled/turnProcessor'

if (admin.apps.length === 0) {
  admin.initializeApp()
}

// ターン進行: 毎分起動し、nextTurnAt <= now() のワールドを処理する
export const scheduledTurnProcessor = functions
  .region('asia-northeast1')
  .pubsub.schedule('every 1 minutes')
  .onRun(async () => {
    await processDueTurns()
  })

export { onUserCreate } from './triggers/authTrigger'
