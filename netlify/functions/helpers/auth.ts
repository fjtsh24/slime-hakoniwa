import * as admin from 'firebase-admin'

/**
 * Firebase Admin SDK で IDトークンを検証するヘルパー
 *
 * @param authHeader - "Authorization: Bearer <token>" 形式のヘッダー値
 * @returns 検証済みトークンの { uid } を返す
 * @throws トークンが不正・期限切れの場合は Error をスロー
 */
export async function verifyIdToken(
  authHeader: string | undefined
): Promise<{ uid: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Authorization header missing or invalid format')
  }

  const token = authHeader.slice(7) // "Bearer " の7文字を除去
  if (!token) {
    throw new Error('ID token is empty')
  }

  const decoded = await admin.auth().verifyIdToken(token)
  return { uid: decoded.uid }
}
