import { useEffect, useRef, useState } from 'react';

const fmtWhen = (ts) => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/**
 * The note attached to one line.
 *
 * Enter posts, Shift+Enter breaks a line, Escape closes — the shape people
 * already expect from every comment box they have used.
 */
export default function CommentThread({ comments = [], author, style, onAdd, onDelete, onClose }) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [comments.length]);

  const post = () => {
    const body = draft.trim();
    if (!body) return;
    onAdd(body);
    setDraft('');
  };

  return (
    <aside
      className="thread"
      style={style}
      role="dialog"
      aria-label="Comments on this line"
      // Keep clicks inside from reaching the page and moving the caret.
      onMouseDown={(e) => e.stopPropagation()}
    >
      <header className="thread__head">
        <span>{comments.length ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : 'New comment'}</span>
        <button className="thread__close" onClick={onClose} aria-label="Close">✕</button>
      </header>

      {comments.length > 0 && (
        <ul className="thread__list">
          {comments.map((c) => (
            <li key={c.id}>
              <div className="thread__meta">
                <b>{c.author}</b>
                <span>{fmtWhen(c.at)}</span>
                <button
                  className="thread__delete"
                  onClick={() => onDelete(c.id)}
                  aria-label="Delete this comment"
                  title="Delete"
                >
                  ✕
                </button>
              </div>
              <p>{c.body}</p>
            </li>
          ))}
          <li ref={endRef} aria-hidden="true" />
        </ul>
      )}

      <textarea
        ref={inputRef}
        className="thread__input"
        rows={1}
        value={draft}
        placeholder="Press Enter to add comment…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            post();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
          // Everything else stays local — the editor must not act on it.
          e.stopPropagation();
        }}
      />
      <p className="thread__as">commenting as {author}</p>
    </aside>
  );
}
