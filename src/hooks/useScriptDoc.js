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

  /**
   * A moment worth returning to.
   *
   * Not just what the document said, but where the caret was when it said it.
   * Undoing without that is the part people notice: the text comes back and
   * the writer is somewhere else in it, usually at the top, mid-sentence.
   */
  const snapshot = (d, caret) => ({ elements: d.elements, titlePage: d.titlePage, caret });

  // Where the caret is right now, kept up to date by the editor. Held in a ref
  // rather than state because reading it must not cause a render.
  const caret = useRef(null);
  const noteCaret = useCallback((where) => { caret.current = where; }, []);

  const update = useCallback((producer, { coalesceKey = null } = {}) => {
    setDocState((prev) => {
      const next = typeof producer === 'function' ? producer(prev) : producer;
      if (next === prev) return prev;

      const now = Date.now();
      const sameRun =
        coalesceKey !== null && coalesceKey === lastKey.current && now - lastTime.current < COALESCE_MS;

      if (!sameRun) {
        past.current = [...past.current.slice(-LIMIT + 1), snapshot(prev, caret.current)];
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

  /**
   * Undo, and go back to where it happened.
   *
   * The place is handed to the caller rather than acted on here — this hook
   * knows about documents, not about which textarea has focus. The screen does
   * that part.
   */
  const undo = useCallback(() => {
    let goTo = null;
    setDocState((prev) => {
      if (!past.current.length) return prev;
      const snap = past.current[past.current.length - 1];
      past.current = past.current.slice(0, -1);
      future.current = [snapshot(prev, caret.current), ...future.current];
      lastKey.current = null;
      goTo = snap.caret || null;
      bump((n) => n + 1);
      const { caret: _ignored, ...doc } = snap;
      return { ...prev, ...doc };
    });
    return goTo;
  }, []);

  const redo = useCallback(() => {
    let goTo = null;
    setDocState((prev) => {
      if (!future.current.length) return prev;
      const snap = future.current[0];
      future.current = future.current.slice(1);
      past.current = [...past.current, snapshot(prev, caret.current)];
      lastKey.current = null;
      goTo = snap.caret || null;
      bump((n) => n + 1);
      const { caret: _ignored, ...doc } = snap;
      return { ...prev, ...doc };
    });
    return goTo;
  }, []);

  return {
    doc,
    update,
    noteCaret,
    reset,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
  };
}
