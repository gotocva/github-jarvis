import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { applyTheme, useTheme } from '@/store/theme'
import './index.css'

// Set the class before the first paint so there is no light flash.
applyTheme(useTheme.getState().theme)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
