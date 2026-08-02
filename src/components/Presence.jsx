import { useEffect, useState } from 'react';
import { presenceOf } from '../auth/activity';

const REFRESH_MS = 15_000;

function ago(ts) {
  if (!ts) return 'not seen yet';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const LABEL = {
  online: 'online',
  away: 'away',
  offline: (p) => `last seen ${ago(p.lastSeen)}`,
  hidden: '',
};

/**
 * Someone's presence, as a dot and optionally a label.
 *
 * Status is never colour-alone: the dot is paired with a `title`, and with
 * visible text wherever there is room for it.
 */
export default function Presence({ uid, withLabel = false, className = '' }) {
  const [p, setP] = useState(() => presenceOf(uid));

  useEffect(() => {
    setP(presenceOf(uid));
    const timer = setInterval(() => setP(presenceOf(uid)), REFRESH_MS);
    return () => clearInterval(timer);
  }, [uid]);

  if (p.status === 'hidden') return null;

  const label = typeof LABEL[p.status] === 'function' ? LABEL[p.status](p) : LABEL[p.status];

  return (
    <span className={`presence presence--${p.status} ${className}`.trim()} title={label}>
      <i aria-hidden="true" />
      {withLabel && <span className="presence__label">{label}</span>}
      {/* A leading space keeps it from running into the name it follows. */}
      {!withLabel && <span className="sr-only"> ({label})</span>}
    </span>
  );
}
