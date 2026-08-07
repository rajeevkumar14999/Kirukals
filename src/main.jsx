import './migrateKeys.js' // must run before any module reads storage
import './install.js' // must run before the browser fires beforeinstallprompt
import './update.js' // watches for a newer build and offers to reload into it
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { acceptHandover, welcomeOver } from './backend/supabase.js'
import { loadPlans } from './billing/plans.js'
import { refreshLicence } from './billing/licence.js'

/*
  Somebody arriving from the shop carries their session in the fragment.

  Taken before React mounts, so the first thing the app renders already knows
  who it is talking to — mounting signed-out and then correcting itself shows
  the writer a sign-in screen that flashes away, which reads as a fault.

  It never blocks: a hand-off that fails leaves the app exactly as it would
  have been, which is signed out and asking politely.
*/
/* Asked for early and not waited on: a price that arrives a moment after the
   editor does is fine, a blank screen waiting for one is not. */
loadPlans()

const boot = async () => {
  const uid = await acceptHandover().catch(() => null)

  /*
    Somebody who has just paid on the website arrives here with a licence that
    is seconds old, and the app's cached answer may be six hours old. Asked
    again before anything is drawn, so the first screen already knows they have
    paid rather than offering to sell them what they just bought.

    Only on an arrival. An ordinary start keeps the cache, which is what lets
    the app open on a train.
  */
  if (uid) await refreshLicence(uid).catch(() => null)

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  // Does nothing unless a welcome screen was put up in the first place.
  welcomeOver()
}

boot()
