import { useSyncExternalStore, useEffect } from 'react';
import { loadPlans, plansNow, watchPlans } from '../billing/plans';

/**
 * The current prices, for anything that draws one.
 *
 * Asks the website once per mount and then whenever the tab comes back, so a
 * price changed in the console reaches somebody who has had the app open all
 * day without them having to reload it.
 *
 * Never suspends and never returns nothing: there is always an answer, even if
 * it is the one this build shipped with.
 */
export function usePlans() {
  const state = useSyncExternalStore(watchPlans, plansNow, plansNow);

  useEffect(() => {
    loadPlans();

    const again = () => { if (document.visibilityState === 'visible') loadPlans(); };
    document.addEventListener('visibilitychange', again);
    return () => document.removeEventListener('visibilitychange', again);
  }, []);

  return state;
}
