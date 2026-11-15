import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/index.css'
import App from './App.tsx'
import { applyMotion } from './lib/motion'
import { applyTheme } from './lib/theme'

// Before the first paint: the visitor's theme (else the system's) and their choice of animations.
applyTheme()
applyMotion()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
