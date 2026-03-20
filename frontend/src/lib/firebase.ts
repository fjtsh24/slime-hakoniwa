import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth, connectAuthEmulator } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// initializeApp は1回だけ呼ばれるよう getApps() チェックを行う
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

export const auth = getAuth(app)
export const db = getFirestore(app)

// VITE_USE_EMULATOR=true のときエミュレーターに接続する
//
// import.meta.env.DEV（Viteのビルドモード）ではなく明示フラグを使う理由:
//   DEV は「Vite dev serverで起動中か」を示すが、
//   production ビルドを netlify dev で配信した場合 DEV=false になり
//   connectAuthEmulator が呼ばれず本番 Firebase に繋がる事故が起きる。
//   VITE_USE_EMULATOR=true を frontend/.env.local に設定することで
//   ビルドモードと独立してエミュレータ接続を制御できる。
export const USE_EMULATOR = import.meta.env.VITE_USE_EMULATOR === 'true'

if (USE_EMULATOR) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
}
