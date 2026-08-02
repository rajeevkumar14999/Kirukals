import './migrateKeys.js' // must run before any module reads storage
import './install.js' // must run before the browser fires beforeinstallprompt
import './update.js' // watches for a newer build and offers to reload into it
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
