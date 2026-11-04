import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { startSplashTimer } from './lib/splash'

// Loading screen stays at most a few seconds, whatever happens
startSplashTimer()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
