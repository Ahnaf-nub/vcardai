import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import { inject } from '@vercel/analytics'
import App from './App.jsx'
import './index.css'

// Inject Vercel Analytics
inject()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Analytics />
  </StrictMode>,
)
