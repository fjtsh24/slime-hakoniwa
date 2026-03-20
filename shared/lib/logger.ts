/**
 * 構造化ロガー
 *
 * Firebase Cloud Functions: Google Cloud Logging が JSON を自動パース
 * Netlify Functions: Netlify function logs に JSON で記録
 *
 * 出力フォーマット（Cloud Logging 互換）:
 *   { severity, message, ...context }
 */

export type LogSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'

function emit(
  severity: LogSeverity,
  message: string,
  context?: Record<string, unknown>
): void {
  const entry = JSON.stringify({
    severity,
    message,
    ...context,
  })
  if (severity === 'ERROR') {
    console.error(entry)
  } else if (severity === 'WARNING') {
    console.warn(entry)
  } else {
    console.log(entry)
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) =>
    emit('DEBUG', message, context),
  info: (message: string, context?: Record<string, unknown>) =>
    emit('INFO', message, context),
  warn: (message: string, context?: Record<string, unknown>) =>
    emit('WARNING', message, context),
  error: (message: string, context?: Record<string, unknown>) =>
    emit('ERROR', message, context),
}
