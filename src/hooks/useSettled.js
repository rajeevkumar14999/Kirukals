import { useEffect, useRef, useState } from 'react';

/**
 * A copy of something that stops changing while somebody is busy.
 *
 * The panels — the scene list, the cast, the locations — are derived from the
 * whole script. React's own deferring runs them at low priority, but low
 * priority is still the same single thread: at a hundred and twenty pages
 * every keystroke was rebuilding six and a half thousand elements' worth of
 * derivations behind the writing.
 *
 * Nobody reads a scene list while typing a word. So it settles: the panels see
 * a version of the script that catches up a third of a second after the
 * typing stops, and the writing has the thread to itself in between.
 */
export function useSettled(value, ms = 300) {
  const [settled, setSettled] = useState(value);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer.current);
  }, [value, ms]);

  return settled;
}
