import { useCallback, useRef, useState } from 'react';

const LIMIT = 200;
const COALESCE_MS = 800;

/*
  How much typing one Ctrl+Z takes back.

  A step used to end only when somebody stopped typing for most of a
  second — which meant a writer in flow produced one enormous step, and a
  single undo swallowed three paragraphs. That is not what any editor does
  and not what anybody expects.

  A step now ends the way it does in a word processor: at a word, at a
  punctuation mark, after a couple of dozen characters, or when the writer
  pauses. Undo then takes back a word or a phrase, and pressing it again
  takes back the one before.
*/
const RUN_LIMIT = 24;

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
  const runChars = useRef(0);
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

  const update = useCallback((producer, { coalesceKey = null, endsRun = false } = {}) => {
    setDocState((prev) => {
      const next = typeof producer === 'function' ? producer(prev) : producer;
      if (next === prev) return prev;

      const now = Date.now();
      const sameRun =
        coalesceKey !== null &&
        coalesceKey === lastKey.current &&
        now - lastTime.current < COALESCE_MS &&
        runChars.current < RUN_LIMIT;

      if (!sameRun) {
        past.current = [...past.current.slice(-LIMIT + 1), snapshot(prev, caret.current)];
        future.current = [];
      }
      runChars.current = sameRun ? runChars.current + 1 : 1;
      lastKey.current = coalesceKey;
      lastTime.current = now;

      // A word has been finished, or something other than typing happened.
      // Either way the next edit starts a fresh step.
      if (endsRun) {
        lastKey.current = null;
        runChars.current = 0;
      }
      bump((n) => n + 1);
      return { ...next, updatedAt: now };
    });
  }, []);

  // Replace the document wholesale (open / import / new) and clear history.
  const reset = useCallback((newDoc) => {
    past.current = [];
    future.current = [];
    lastKey.current = null;
    runChars.current = 0;
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
