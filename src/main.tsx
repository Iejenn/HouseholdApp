import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startSplashTimer } from './lib/splash'
import { startUpdates } from './lib/updates'

// Loading screen stays at most a few seconds, whatever happens
startSplashTimer()
// Service worker + getting new versions in without closing the app twice
startUpdates()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
