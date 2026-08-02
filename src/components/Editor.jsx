import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ElementRow from './ElementRow';
import CommentThread from './CommentThread';
import {
  TYPES,
  TYPE_ORDER,
  autoDetectType,
  cycleType,
  makeElement,
  nextTypeAfterEnter,
} from '../screenplay/elements';
import { remap, toggleStyle } from '../screenplay/markup';
import { canPair, groupDual } from '../screenplay/dual';
import { suggestFor } from '../screenplay/suggest';
import { caretColumn, isOnFirstRow, isOnLastRow } from '../hooks/caret';

export default function Editor({
  doc, update, prefs, pages, vocab, jump, author, commentTick, dualTick, watermark, onNotice, onActiveChange,
}) {
  const [active, setActive] = useState(0);
  const [sugIndex, setSugIndex] = useState(0);
  const [sugOpen, setSugOpen] = useState(true);
  const [sugBox, setSugBox] = useState(null);
  const [thread, setThread] = useState(null); // element id whose notes are open
  const [threadBox, setThreadBox] = useState(null);
  const refs = useRef(new Map());
  const pending = useRef(null);
  const pageRef = useRef(null);

  const elements = doc.elements;
  const activeEl = elements[active];

  // Pagination hands back element ids grouped per page; fall back to a single
  // sheet so the editor still renders if it has not run yet.
  const sheets = useMemo(
    () => (pages?.length ? pages : [elements.map((el) => el.id)]),
    [pages, elements],
  );
  const indexOf = useMemo(
    () => new Map(elements.map((el, i) => [el.id, i])),
    [elements],
  );

  const registerRef = useCallback((id, node) => {
    if (node) refs.current.set(id, node);
    else refs.current.delete(id);
  }, []);

  const focusAt = (id, pos = 'end') => {
    pending.current = { id, pos };
  };

  // Apply queued focus after the DOM catches up with the new element list.
  useLayoutEffect(() => {
    const req = pending.current;
    if (!req) return;
    pending.current = null;
    const node = refs.current.get(req.id);
    if (!node) return;
    node.focus({ preventScroll: true });
    const len = node.value.length;
    const pos = req.pos === 'end' ? len : req.pos === 'start' ? 0 : Math.min(req.pos, len);
    node.setSelectionRange(pos, pos);
    node.scrollIntoView({ block: 'nearest' });
  });

  // Jump requests from the scene navigator / search results.
  useEffect(() => {
    if (!jump) return;
    const i = elements.findIndex((e) => e.id === jump.id);
    if (i === -1) return;
    setActive(i);
    const node = refs.current.get(jump.id);
    if (node) {
      node.focus({ preventScroll: true });
      node.setSelectionRange(jump.pos ?? 0, jump.pos ?? 0);
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [jump]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onActiveChange?.(activeEl, active);
  }, [activeEl, active, onActiveChange]);

  /* ---------------- document mutations ---------------- */

  const setElements = (producer, opts) =>
    update((d) => ({ ...d, elements: typeof producer === 'function' ? producer(d.elements) : producer }), opts);

  const replaceAt = (i, patch, opts) =>
    setElements((els) => els.map((el, idx) => (idx === i ? { ...el, ...patch } : el)), opts);

  const handleChange = (i, raw) => {
    const el = elements[i];
    const text = TYPES[el.type].uppercase ? raw.toUpperCase() : raw;
    const type = autoDetectType(el.type, text);
    setSugOpen(true);
    setSugIndex(0);
    // Styles are ranges into the text, so every edit has to move them.
    const styles = remap(el.styles, el.text, text);
    replaceAt(i, { text, type, styles }, { coalesceKey: `text:${el.id}` });
  };

  const setType = (i, type) => {
    const el = elements[i];
    const text = TYPES[type].uppercase ? el.text.toUpperCase() : el.text;
    replaceAt(i, { type, text });
    focusAt(el.id, 'end');
  };

  /** Style ranges clipped to [from, to) and shifted — used by split and merge. */
  const sliceStyles = (styles = [], from, to, shift) =>
    styles
      .map((s) => ({
        ...s,
        from: Math.max(s.from, from) + shift,
        to: Math.min(s.to, to) + shift,
      }))
      .filter((s) => s.to > s.from);

  const splitAt = (i, caret) => {
    const el = elements[i];
    const before = el.text.slice(0, caret);
    const after = el.text.slice(caret);
    // At the end of a line, Enter advances the type (Character -> Dialogue).
    // Splitting mid-line keeps the remainder in the same element type.
    const created = makeElement(after ? el.type : nextTypeAfterEnter(el.type), after);
    // Split the style ranges at the caret: the head keeps what is left of it,
    // the tail keeps the rest, rebased to its own start.
    created.styles = sliceStyles(el.styles, caret, el.text.length, -caret);

    setElements((els) => [
      ...els.slice(0, i),
      { ...el, text: before, styles: sliceStyles(el.styles, 0, caret, 0) },
      created,
      ...els.slice(i + 1),
    ]);
    setActive(i + 1);
    focusAt(created.id, 'start');
  };

  const insertBelow = (i, type) => {
    const created = makeElement(type, '');
    setElements((els) => [...els.slice(0, i + 1), created, ...els.slice(i + 1)]);
    setActive(i + 1);
    focusAt(created.id, 'start');
  };

  const mergeIntoPrev = (i) => {
    if (i === 0) return;
    const prev = elements[i - 1];
    const cur = elements[i];
    const caret = prev.text.length;
    const text = TYPES[prev.type].uppercase ? (prev.text + cur.text).toUpperCase() : prev.text + cur.text;
    // Joining two lines joins their styling: the second one's ranges shift
    // along by the length of the first.
    const styles = [
      ...sliceStyles(prev.styles, 0, prev.text.length, 0),
      ...sliceStyles(cur.styles, 0, cur.text.length, caret),
    ];
    setElements((els) => [
      ...els.slice(0, i - 1),
      { ...prev, text, styles },
      ...els.slice(i + 1),
    ]);
    setActive(i - 1);
    focusAt(prev.id, caret);
  };

  const removeAt = (i) => {
    if (elements.length === 1) return;
    const target = elements[Math.max(0, i - 1)];
    const gone = elements[i];
    // A deleted line goes to the graveyard rather than nowhere — writers cut
    // things they turn out to want back. Empty lines are not worth keeping.
    update((d) => ({
      ...d,
      elements: d.elements.filter((_, idx) => idx !== i),
      graveyard: gone.text.trim()
        ? [
            { ...gone, buriedId: `g_${Date.now().toString(36)}`, at: Date.now() },
            ...(d.graveyard || []),
          ].slice(0, 60)
        : d.graveyard || [],
    }));
    setActive(Math.max(0, i - 1));
    focusAt(target.id, 'end');
  };

  const moveBy = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= elements.length) return;
    setElements((els) => {
      const copy = [...els];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    setActive(j);
    focusAt(elements[i].id, 'end');
  };

  /**
   * Make a cue simultaneous with the speech above it, or separate again. Only
   * a character cue with another speech before it can pair, so the shortcut
   * says so rather than doing nothing quietly.
   */
  const toggleDual = (i) => {
    const el = elements[i];
    if (!el || el.type !== 'character') return;
    if (!el.dual && !canPair(elements, i)) {
      onNotice?.({
        kind: 'warn',
        text: 'Dual dialogue needs a speech above it — put the cue directly after another character’s lines.',
      });
      return;
    }
    replaceAt(i, { dual: !el.dual });
  };

  /* ---------------- comments ---------------- */

  const commentsOn = (id) => elements.find((el) => el.id === id)?.comments || [];

  const addComment = (id, body) =>
    setElements((els) =>
      els.map((el) =>
        el.id === id
          ? {
              ...el,
              comments: [
                ...(el.comments || []),
                { id: `c_${Date.now().toString(36)}`, author, body, at: Date.now() },
              ],
            }
          : el,
      ),
    );

  const deleteComment = (id, commentId) =>
    setElements((els) =>
      els.map((el) =>
        el.id === id ? { ...el, comments: (el.comments || []).filter((c) => c.id !== commentId) } : el,
      ),
    );

  // The toolbar's Comment button, which only knows that it was pressed.
  useEffect(() => {
    if (commentTick) setThread(activeEl?.id ?? null);
  }, [commentTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // The menu's dual-dialogue command, likewise.
  useEffect(() => {
    if (dualTick) toggleDual(active);
  }, [dualTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // Park the thread beside the line it belongs to, like a margin note.
  useLayoutEffect(() => {
    if (!thread) return setThreadBox(null);
    const place = () => {
      const node = refs.current.get(thread);
      const page = pageRef.current;
      if (!node || !page) return setThreadBox(null);
      const a = node.getBoundingClientRect();
      const b = page.getBoundingClientRect();
      const z = prefs.zoom || 1;
      // Notes belong on the left, beside the line. Park the panel on the desk
      // next to the page when there is room for it there, and only tuck it
      // into the page's left margin when the window is too narrow for that.
      const canvas = page.closest('.canvas');
      const desk = canvas ? (b.left - canvas.getBoundingClientRect().left) / z : 0;
      const width = 264;
      setThreadBox({
        top: (a.top - b.top) / z - 8,
        left: desk > width + 12 ? -(width + 12) : 6,
      });
    };
    place();
    // Narrowing the window — or opening the sidebar — can take the desk away,
    // so where the panel sits has to be decided again, not once.
    const canvas = pageRef.current?.closest('.canvas');
    const ro = canvas ? new ResizeObserver(place) : null;
    if (ro && canvas) ro.observe(canvas);
    window.addEventListener('resize', place);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [thread, prefs.zoom, elements]);

  /* ---------------- autocomplete ---------------- */

  const suggestions = useMemo(() => {
    if (!activeEl || !sugOpen) return [];
    return suggestFor(activeEl, vocab);
  }, [activeEl, sugOpen, vocab]);

  // Park the dropdown just under the active element.
  useLayoutEffect(() => {
    if (!suggestions.length || !activeEl) return setSugBox(null);
    const node = refs.current.get(activeEl.id);
    const page = pageRef.current;
    if (!node || !page) return setSugBox(null);
    const a = node.getBoundingClientRect();
    const b = page.getBoundingClientRect();
    // Rects come back in zoomed pixels; the dropdown is positioned inside the
    // zoomed box, so divide the offsets back out.
    const z = prefs.zoom || 1;
    setSugBox({ top: (a.bottom - b.top) / z + 4, left: (a.left - b.left) / z });
  }, [suggestions, activeEl, prefs.zoom]);

  const applySuggestion = (i, item) => {
    const el = elements[i];
    replaceAt(i, { text: item.value, type: autoDetectType(el.type, item.value) });
    setSugOpen(false);
    focusAt(el.id, 'end');
  };

  /* ---------------- keyboard ---------------- */

  const handleKeyDown = (e, i) => {
    const ta = e.target;
    const el = elements[i];
    const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
    const atEnd = ta.selectionStart === ta.value.length && ta.selectionEnd === ta.value.length;
    const hasSuggestions = suggestions.length > 0;

    // Ctrl+Alt+D — this character speaks over the one before them.
    if ((e.ctrlKey || e.metaKey) && e.altKey && (e.code === 'KeyD' || e.key.toLowerCase() === 'd')) {
      e.preventDefault();
      toggleDual(i);
      return;
    }

    // Ctrl+Shift+K — take this line out. It goes to the graveyard, so the
    // only way to lose writing outright is to empty it first.
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) {
      e.preventDefault();
      removeAt(i);
      return;
    }

    // Ctrl+Alt+M — a comment on this line, the shortcut Word has used forever.
    // e.key can be anything on a layout where Ctrl+Alt is AltGr, so trust the
    // physical key when the browser reports one.
    if ((e.ctrlKey || e.metaKey) && e.altKey && (e.code === 'KeyM' || e.key.toLowerCase() === 'm')) {
      e.preventDefault();
      setThread(el.id);
      return;
    }

    // Inline emphasis over the selection, the way every editor does it.
    const EMPHASIS = { b: 'bold', i: 'italic', u: 'underline' };
    if ((e.ctrlKey || e.metaKey) && !e.altKey && EMPHASIS[e.key.toLowerCase()]) {
      e.preventDefault();
      const { selectionStart: from, selectionEnd: to } = ta;
      replaceAt(i, {
        styles: toggleStyle(el.styles, from, to, EMPHASIS[e.key.toLowerCase()]),
      });
      // The text never changes, so the selection simply stays put.
      requestAnimationFrame(() => {
        const node = refs.current.get(el.id);
        node?.setSelectionRange(from, to);
      });
      return;
    }

    // Element type shortcuts: Ctrl/Cmd + 1..7
    if ((e.ctrlKey || e.metaKey) && /^[1-7]$/.test(e.key)) {
      e.preventDefault();
      setType(i, TYPE_ORDER[Number(e.key) - 1]);
      return;
    }

    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      moveBy(i, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }

    if (hasSuggestions) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSugIndex((n) => (n + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSugIndex((n) => (n - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSugOpen(false);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
        e.preventDefault();
        applySuggestion(i, suggestions[sugIndex] || suggestions[0]);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if ((e.ctrlKey || e.metaKey)) {
        insertBelow(i, 'scene_heading');
        return;
      }
      splitAt(i, ta.selectionStart);
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      setType(i, cycleType(el.type, e.shiftKey));
      return;
    }

    if (e.key === 'Backspace' && atStart) {
      if (el.text === '') {
        e.preventDefault();
        if (el.type !== 'action') setType(i, 'action');
        else removeAt(i);
        return;
      }
      if (i > 0) {
        e.preventDefault();
        mergeIntoPrev(i);
        return;
      }
    }

    if (e.key === 'Delete' && atEnd && i < elements.length - 1) {
      e.preventDefault();
      mergeIntoPrev(i + 1);
      focusAt(el.id, el.text.length);
      return;
    }

    if (e.key === 'ArrowUp' && i > 0 && isOnFirstRow(ta)) {
      e.preventDefault();
      setActive(i - 1);
      focusAt(elements[i - 1].id, 'end');
      return;
    }

    if (e.key === 'ArrowDown' && i < elements.length - 1 && isOnLastRow(ta)) {
      e.preventDefault();
      setActive(i + 1);
      focusAt(elements[i + 1].id, Math.min(caretColumn(ta), elements[i + 1].text.length));
    }
  };

  const handleFocus = (i) => {
    setActive(i);
    setSugIndex(0);
    setSugOpen(true);
  };

  /* ---------------- render ---------------- */

  return (
    <div className="editor" style={{ zoom: prefs.zoom }}>
      {/* Real sheets, not one long roll: each page is its own piece of paper
          with the page number in its top margin, exactly where a printed
          script carries it. */}
      <div className="pages" ref={pageRef} onMouseDown={() => setSugOpen(true)}>
        {sheets.map((ids, pageIndex) => (
          <section className="page" key={pageIndex} aria-label={`Page ${pageIndex + 1}`}>
            {/* Page one carries no number, by convention. */}
            {pageIndex > 0 && (
              <span className="page__number" aria-hidden="true">{pageIndex + 1}.</span>
            )}
            {watermark?.enabled && watermark.text && (
              <span
                className="page__watermark"
                style={{ opacity: watermark.opacity ?? 0.12 }}
                aria-hidden="true"
              >
                {watermark.text}
              </span>
            )}

            {(() => {
              // Rows, not elements: a pair of simultaneous speeches is one row
              // holding two columns, and everything else is a row of one.
              const onPage = ids.map((id) => elements[indexOf.get(id)]).filter(Boolean);
              const row = (el, first) => (
                <ElementRow
                  key={el.id}
                  element={el}
                  index={indexOf.get(el.id)}
                  // The first element on every sheet sits at the top margin.
                  isFirst={first}
                  isActive={indexOf.get(el.id) === active}
                  dimmed={prefs.focusMode && indexOf.get(el.id) !== active}
                  comments={el.comments}
                  spellcheck={prefs.spellcheck !== false}
                  threadOpen={thread === el.id}
                  onOpenComments={setThread}
                  registerRef={registerRef}
                  onChange={handleChange}
                  onKeyDown={handleKeyDown}
                  onFocus={handleFocus}
                />
              );

              return groupDual(onPage).map((group, n) =>
                group.kind === 'dual' ? (
                  <div className="dual" key={group.left[0].id}>
                    <div className="dual__col">{group.left.map((el, k) => row(el, n === 0 && k === 0))}</div>
                    <div className="dual__col">{group.right.map((el, k) => row(el, n === 0 && k === 0))}</div>
                  </div>
                ) : (
                  row(group.el, n === 0)
                ),
              );
            })()}
          </section>
        ))}

        {thread && threadBox && (
          <CommentThread
            comments={commentsOn(thread)}
            author={author}
            style={{ top: threadBox.top, left: threadBox.left }}
            onAdd={(body) => addComment(thread, body)}
            onDelete={(commentId) => deleteComment(thread, commentId)}
            onClose={() => {
              setThread(null);
              const node = refs.current.get(thread);
              node?.focus({ preventScroll: true });
            }}
          />
        )}

        {suggestions.length > 0 && sugBox && (
          <ul className="autocomplete" style={{ top: sugBox.top, left: sugBox.left }} role="listbox">
            {suggestions.map((item, n) => (
              <li
                key={item.value + n}
                role="option"
                aria-selected={n === sugIndex}
                className={n === sugIndex ? 'is-selected' : ''}
                onMouseDown={(e) => {
                  e.preventDefault();
                  applySuggestion(active, item);
                }}
                onMouseEnter={() => setSugIndex(n)}
              >
                {item.label}
              </li>
            ))}
            <li className="autocomplete__hint">Tab or Enter to accept · Esc to dismiss</li>
          </ul>
        )}
      </div>
    </div>
  );
}
