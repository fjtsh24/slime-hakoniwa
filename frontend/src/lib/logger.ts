/**
 * フロントエンド用ロガー
 *
 * 開発環境 (VITE_USE_EMULATOR=true): DEBUG/INFO/WARN/ERROR すべて出力
 * 本番環境: ERROR のみ出力
 *
 * 使い方:
 *   const logger = createLogger('authStore')
 *   logger.debug('認証状態変化', { uid: user?.uid })
 *   logger.error('onAuthStateChanged error', { error: err.message })
 */

const IS_DEV = import.meta.env.VITE_USE_EMULATOR === 'true'

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

function emit(
  level: LogLevel,
  scope: string,
  message: string,
  context?: Record<string, unknown>
): void {
  if (!IS_DEV && level !== 'ERROR') return

  const prefix = `[${level}][${scope}]`
  const ctx = context && Object.keys(context).length > 0 ? context : undefined

  if (level === 'ERROR') {
    console.error(prefix, message, ...(ctx ? [ctx] : []))
  } else if (level === 'WARN') {
    console.warn(prefix, message, ...(ctx ? [ctx] : []))
  } else if (level === 'INFO') {
    console.info(prefix, message, ...(ctx ? [ctx] : []))
  } else {
    console.debug(prefix, message, ...(ctx ? [ctx] : []))
  }
}

export function createLogger(scope: string) {
  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      emit('DEBUG', scope, message, context),
    info: (message: string, context?: Record<string, unknown>) =>
      emit('INFO', scope, message, context),
    warn: (message: string, context?: Record<string, unknown>) =>
      emit('WARN', scope, message, context),
    error: (message: string, context?: Record<string, unknown>) =>
      emit('ERROR', scope, message, context),
  }
}
