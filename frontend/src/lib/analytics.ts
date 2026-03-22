declare global {
  function gtag(...args: unknown[]): void
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
  }
}

export function initGA(measurementId: string): void {
  if (!measurementId) return

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  document.head.appendChild(script)

  window.dataLayer = window.dataLayer ?? []
  window.gtag = function (...args: unknown[]) {
    window.dataLayer.push(args)
  }
  gtag('js', new Date())
  gtag('config', measurementId, { send_page_view: false })
}

export function trackPageView(pagePath: string): void {
  if (typeof gtag === 'undefined') return
  gtag('event', 'page_view', { page_path: pagePath })
}

export function trackEvent(eventName: string, params?: Record<string, unknown>): void {
  if (typeof gtag === 'undefined') return
  gtag('event', eventName, params)
}
