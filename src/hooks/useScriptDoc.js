import { useCallback, useRef, useState } from 'react';

const LIMIT = 200;
const COALESCE_MS = 800;

/**
 * Document state with undo/redo.
 *
 * Consecutive edits that share a `coalesceKey` (e.g. typing into one element)
 * collapse into a single undo step, so Ctrl+Z rewinds a phrase rather than a
 * keystroke.
 */
export function useScriptDoc(initialDoc) {
  const [doc, setDocState] = useState(initialDoc);
  const past = useRef([]);
  const future = useRef([]);
  const lastKey = useRef(null);
  const lastTime = useRef(0);
  const [, bump] = useState(0);

  const snapshot = (d) => ({ elements: d.elements, titlePage: d.titlePage });

  const update = useCallback((producer, { coalesceKey = null } = {}) => {
    setDocState((prev) => {
      const next = typeof producer === 'function' ? producer(prev) : producer;
      if (next === prev) return prev;

      const now = Date.now();
      const sameRun =
        coalesceKey !== null && coalesceKey === lastKey.current && now - lastTime.current < COALESCE_MS;

      if (!sameRun) {
        past.current = [...past.current.slice(-LIMIT + 1), snapshot(prev)];
        future.current = [];
      }
      lastKey.current = coalesceKey;
      lastTime.current = now;
      bump((n) => n + 1);
      return { ...next, updatedAt: now };
    });
  }, []);

  // Replace the document wholesale (open / import / new) and clear history.
  const reset = useCallback((newDoc) => {
    past.current = [];
    future.current = [];
    lastKey.current = null;
    setDocState(newDoc);
    bump((n) => n + 1);
  }, []);

  const undo = useCallback(() => {
    setDocState((prev) => {
      if (!past.current.length) return prev;
      const snap = past.current[past.current.length - 1];
      past.current = past.current.slice(0, -1);
      future.current = [snapshot(prev), ...future.current];
      lastKey.current = null;
      bump((n) => n + 1);
      return { ...prev, ...snap };
    });
  }, []);

  const redo = useCallback(() => {
    setDocState((prev) => {
      if (!future.current.length) return prev;
      const snap = future.current[0];
      future.current = future.current.slice(1);
      past.current = [...past.current, snapshot(prev)];
      lastKey.current = null;
      bump((n) => n + 1);
      return { ...prev, ...snap };
    });
  }, []);

  return {
    doc,
    update,
    reset,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
