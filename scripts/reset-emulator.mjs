/**
 * エミュレータをシードデータにリセットするスクリプト
 *
 * 動作:
 * 1. 既存の emulator-data を削除（または空にする）
 * 2. firebase emulators:start をバックグラウンドで起動
 * 3. Firestore エミュレータの起動を待機
 * 4. seed.ts を実行してデータ投入
 * 5. エミュレータをフォアグラウンドに戻す（Ctrl+C で終了 → emulator-data に保存）
 *
 * 使用方法: npm run emulator:reset
 */

import { spawn, execSync } from 'child_process'
import { rmSync, mkdirSync, existsSync } from 'fs'
import { setTimeout } from 'timers/promises'

const FIRESTORE_PORT = 8080
const AUTH_PORT = 9099
const MAX_WAIT_SEC = 60
const EMULATOR_DATA_DIR = './emulator-data'

// 1. 既存データを削除してクリーンな状態にする
console.log('既存のエミュレータデータを削除します...')
if (existsSync(EMULATOR_DATA_DIR)) {
  rmSync(EMULATOR_DATA_DIR, { recursive: true, force: true })
}
mkdirSync(EMULATOR_DATA_DIR, { recursive: true })

// 2. エミュレータをバックグラウンドで起動（--export-on-exit で終了時に保存）
console.log('エミュレータを起動します...')
const emulator = spawn(
  'firebase',
  ['emulators:start', `--export-on-exit=${EMULATOR_DATA_DIR}`],
  { stdio: 'inherit', detached: false }
)

emulator.on('error', (err) => {
  console.error('エミュレータの起動に失敗しました:', err.message)
  process.exit(1)
})

// 3. Firestore・Auth エミュレータの起動を待機
async function waitForPort(port, label) {
  console.log(`${label} (localhost:${port}) の起動を待機中...`)
  for (let i = 0; i < MAX_WAIT_SEC; i++) {
    await setTimeout(1000)
    try {
      execSync(`curl -sf http://localhost:${port}/ > /dev/null 2>&1`)
      console.log(`\n${label} 起動完了`)
      return true
    } catch {
      process.stdout.write('.')
    }
  }
  console.log('')
  return false
}

const firestoreReady = await waitForPort(FIRESTORE_PORT, 'Firestore エミュレータ')
const authReady = await waitForPort(AUTH_PORT, 'Auth エミュレータ')

if (!firestoreReady || !authReady) {
  console.error(`エミュレータが ${MAX_WAIT_SEC} 秒以内に起動しませんでした`)
  emulator.kill()
  process.exit(1)
}

// 4. シードデータを投入
console.log('シードデータを投入します...')
try {
  execSync('npm run seed', {
    stdio: 'inherit',
    env: {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: `localhost:${FIRESTORE_PORT}`,
      FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
    },
  })
  console.log('\nシード完了。Ctrl+C でエミュレータを終了すると emulator-data に保存されます。')
} catch (err) {
  console.error('シードデータの投入に失敗しました:', err.message)
  console.log('エミュレータは起動中のままです。手動で npm run seed を実行してください。')
}
