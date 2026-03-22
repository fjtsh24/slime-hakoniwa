import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { initGA } from './lib/analytics'

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined
const useEmulator = import.meta.env.VITE_USE_EMULATOR === 'true'

if (measurementId && !useEmulator) {
  initGA(measurementId)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
