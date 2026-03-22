import { useState } from 'react'
import { getIdToken } from 'firebase/auth'
import { useAuthStore } from '../../stores/authStore'

interface HandleSetupModalProps {
  onComplete: (handle: string) => void
  onDismiss: () => void
}

export function HandleSetupModal({ onComplete, onDismiss }: HandleSetupModalProps) {
  const user = useAuthStore((s) => s.user)
  const [handle, setHandle] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handlePattern = /^[a-zA-Z0-9_-]{3,32}$/

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !handlePattern.test(handle)) return

    setIsSubmitting(true)
    setError(null)

    try {
      const idToken = await getIdToken(user)
      const res = await fetch('/api/users/handle', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ handle }),
      })

      if (res.status === 409) {
        setError('このハンドルは既に使用されています。別のハンドルをお試しください。')
        return
      }
      if (res.status === 429) {
        const data = await res.json() as { error: string }
        setError(data.error)
        return
      }
      if (!res.ok) {
        setError('エラーが発生しました。もう一度お試しください。')
        return
      }

      const data = await res.json() as { publicHandle: string }
      onComplete(data.publicHandle)
    } catch {
      setError('通信エラーが発生しました。')
    } finally {
      setIsSubmitting(false)
    }
  }

  const isValidHandle = handlePattern.test(handle)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <h2 className="text-lg font-bold text-gray-800 mb-2">ハンドル名を設定する</h2>
        <p className="text-sm text-gray-500 mb-4">
          他のプレイヤーがあなたのスライムを見るときに表示される名前です。
          英数字・ハイフン・アンダースコアのみ使用できます（3〜32文字）。<br />
          <span className="font-medium">※ 設定後、ハンドル名は30日に1回までの変更となります。</span>
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <div className="flex items-center border rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-green-400">
              <span className="px-3 py-2 bg-gray-50 text-gray-400 text-sm border-r select-none">@</span>
              <input
                type="text"
                value={handle}
                onChange={(e) => {
                  setHandle(e.target.value)
                  setError(null)
                }}
                placeholder="my-handle"
                maxLength={32}
                className="flex-1 px-3 py-2 text-sm outline-none"
                autoFocus
                autoComplete="off"
                autoCapitalize="off"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              例: slime_taro, green-hunter01
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={!isValidHandle || isSubmitting}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-bold py-2 rounded-lg transition-colors text-sm"
          >
            {isSubmitting ? '登録中...' : '設定する'}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="w-full text-gray-400 hover:text-gray-600 text-sm py-1"
          >
            あとで設定する
          </button>
        </form>
      </div>
    </div>
  )
}
