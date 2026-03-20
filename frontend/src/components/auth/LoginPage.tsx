import { useState } from 'react'
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword } from 'firebase/auth'
import { auth, USE_EMULATOR } from '../../lib/firebase'

// 開発用テストアカウント（Auth Emulator + seed.ts で作成）
const DEV_EMAIL = 'test@slime.local'
const DEV_PASSWORD = 'test1234'

export function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
    } catch (err) {
      console.error('LoginPage: signInWithPopup error', err)
      setError(err instanceof Error ? err.message : 'ログインに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDevLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await signInWithEmailAndPassword(auth, DEV_EMAIL, DEV_PASSWORD)
    } catch (err) {
      console.error('LoginPage: dev login error', err)
      setError(
        `開発ログイン失敗: ${err instanceof Error ? err.message : String(err)}\n` +
          'Firebase Emulator (port 9099) が起動しているか、npm run seed を実行済みか確認してください。'
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-green-50">
      <div className="bg-white rounded-2xl shadow-lg p-10 max-w-sm w-full flex flex-col items-center gap-6">
        <div className="text-5xl">🟢</div>
        <h1 className="text-2xl font-bold text-green-700">スライム箱庭</h1>

        {USE_EMULATOR && (
          <div className="w-full bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
            🔧 開発環境（Firebase Emulator）
          </div>
        )}

        <p className="text-gray-500 text-sm text-center">
          {USE_EMULATOR
            ? 'テストアカウントでログインするか、Googleアカウント（エミュレータ）でログインしてください'
            : 'Googleアカウントでログインしてゲームを始めましょう'}
        </p>

        {error && (
          <div className="w-full bg-red-100 text-red-700 rounded-lg px-4 py-2 text-sm whitespace-pre-line">
            {error}
          </div>
        )}

        {/* 開発環境専用: テストアカウントでワンクリックログイン */}
        {USE_EMULATOR && (
          <button
            onClick={handleDevLogin}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 text-white rounded-lg py-3 px-4 font-medium hover:bg-amber-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              '🧪'
            )}
            {isLoading ? 'ログイン中...' : 'テストユーザーでログイン（開発専用）'}
          </button>
        )}

        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-lg py-3 px-4 text-gray-700 font-medium shadow-sm hover:bg-gray-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? (
            <span className="animate-spin h-5 w-5 border-2 border-gray-400 border-t-transparent rounded-full" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.77c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          {isLoading ? 'ログイン中...' : 'Googleでログイン'}
        </button>
      </div>
    </div>
  )
}
