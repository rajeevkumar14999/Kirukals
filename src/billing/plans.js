import { isConfigured, supabase } from '../backend/supabase';
import { PLAN, PRODUCTION_PLAN } from './subscription';

/**
 * What the plans cost, decided in one place.
 *
 * The price used to be written here and again on the website, which meant the
 * shop and the app could disagree about what a month costs — and the one a
 * customer believes is whichever they happened to read last. The website's
 * console is now the only place a price is set, and this reads the same table.
 *
 * Everything below is arranged so the app never gets worse for asking:
 *
 *   The answer is cached. A writer with no connection sees the price they saw
 *   last time rather than a spinner or a blank.
 *
 *   The built-in constants remain as the last resort. A brand-new install with
 *   no network and no cache still has something honest to show, and it is the
 *   figure this build shipped with.
 *
 * The rows are public by design — `read plans on sale` lets anybody select an
 * active plan, because somebody who has not signed in still has to be told
 * what it costs.
 */

const KEY = 'kirukals.plans';
const STALE_MS = 6 * 60 * 60 * 1000;

const listeners = new Set();
let state = { plan: PLAN, production: PRODUCTION_PLAN, from: 'built in', at: 0 };

const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
};

const keep = (value) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // A full store is not a reason to lose the price in this session.
  }
};

/**
 * One row from the website, in the shape this app already speaks.
 *
 * The features stay local. They describe what this build can actually do, and
 * a list typed into a shop admin could promise a tool that is not in the
 * version somebody has installed.
 */
const asPlan = (row, fallback) => ({
  ...fallback,
  id: row.id || fallback.id,
  name: row.name || fallback.name,
  amountPaise: Number(row.price_paise ?? fallback.amountPaise),
  days: Number(row.days ?? 30),
  devices: Number(row.devices ?? fallback.devices ?? 2),
  periodLabel: Number(row.days) === 365 ? 'year' : 'month',
});

/*
  Which row is which.

  The website's table has no column saying "this is the production one", so it
  is matched by name. Crude, and worth replacing with a slug column on that
  table the moment there are more than two plans — at which point both sides
  can agree explicitly rather than by spelling.
*/
const looksProduction = (row) => /produc/i.test(row.name || '');

const settle = (next, from) => {
  state = { ...next, from, at: Date.now() };

  /* The exported constants are updated in place as well as being handed out
     by the hook. Several screens import them directly, and a price that is
     right in one dialog and wrong in another is worse than one that is
     uniformly out of date. */
  Object.assign(PLAN, next.plan);
  Object.assign(PRODUCTION_PLAN, next.production);

  listeners.forEach((fn) => fn());
};

/** Ask the website, unless we asked recently. */
export async function loadPlans({ force = false } = {}) {
  const cached = read();
  if (cached?.plan) settle({ plan: cached.plan, production: cached.production }, 'cached');

  if (!isConfigured() || !supabase) return state;
  if (!force && cached?.at && Date.now() - cached.at < STALE_MS) return state;

  try {
    const { data, error } = await supabase
      .from('plans')
      .select('id, name, price_paise, days, devices, sort')
      .eq('active', true)
      .order('sort', { ascending: true });

    if (error || !data?.length) return state;

    const production = data.find(looksProduction);
    const writing = data.find((r) => !looksProduction(r)) || data[0];

    const next = {
      plan: writing ? asPlan(writing, PLAN) : state.plan,
      production: production ? asPlan(production, PRODUCTION_PLAN) : state.production,
    };

    settle(next, 'the website');
    keep({ ...next, at: Date.now() });
  } catch (err) {
    // Offline, or the table is not there yet. The cached or built-in answer
    // stands; a price is not worth an error message.
    console.warn('[plans]', err.message);
  }

  return state;
}

export const plansNow = () => state;

export function watchPlans(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
