import { useEffect, useRef, useState } from 'react';
import { incomingMessagesSince } from '../community/store';

const POLL_MS = 3000;
const LIFETIME_MS = 30_000;
const MAX_VISIBLE = 3;

/**
 * Incoming chat, surfaced on the writing page.
 *
 * A message that arrives while you are writing pops up in the corner and
 * clears itself after 30 seconds — long enough to read and act on, short
 * enough that it never becomes furniture. Clicking one opens that
 * conversation; dismissing one is permanent for that message.
 *
 * Only messages that arrive *after* this mounts are shown: signing in should
 * not dump a week of history over the page. The unread badge on the bell is
 * what carries the backlog.
 */
export default function ChatToasts({ session, onOpen }) {
  const [toasts, setToasts] = useState([]);
  const since = useRef(Date.now());
  const seen = useRef(new Set());

  useEffect(() => {
    const check = () => {
      const fresh = incomingMessagesSince(session.uid, since.current)
        .filter((m) => !seen.current.has(m.id));
      if (!fresh.length) return;

      const now = Date.now();
      for (const m of fresh) {
        seen.current.add(m.id);
        since.current = Math.max(since.current, m.createdAt);
      }
      // Each toast carries its own deadline, so a later arrival never extends
      // or cuts short one that is already on screen.
      setToasts((list) =>
        [...list, ...fresh.map((m) => ({ ...m, expiresAt: now + LIFETIME_MS }))]
          .slice(-MAX_VISIBLE),
      );
    };

    const timer = setInterval(check, POLL_MS);
    // A second tab writing to storage is worth reacting to immediately.
    window.addEventListener('storage', check);
    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', check);
    };
  }, [session.uid]);

  // One sweep retires whatever is past its own deadline.
  useEffect(() => {
    if (!toasts.length) return undefined;
    const sweep = setInterval(() => {
      const now = Date.now();
      setToasts((list) => list.filter((t) => t.expiresAt > now));
    }, 500);
    return () => clearInterval(sweep);
  }, [toasts.length]);

  const dismiss = (id) => setToasts((list) => list.filter((t) => t.id !== id));

  if (!toasts.length) return null;

  return (
    <div className="toasts" role="region" aria-label="New messages">
      {toasts.map((t) => (
        <article className="toast" key={t.id} role="status">
          <button
            className="toast__body"
            onClick={() => {
              dismiss(t.id);
              onOpen(t.threadId);
            }}
          >
            <span className="toast__from">{t.fromName}</span>
            <span className="toast__about">about {t.postTitle}</span>
            <span className="toast__text">{t.body}</span>
            <span className="toast__cta">Open the conversation</span>
          </button>
          <button className="toast__close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
            ✕
          </button>
          {/* The bar runs down over the 30 seconds so the countdown is visible
              rather than the toast vanishing without warning. */}
          <span className="toast__life" />
        </article>
      ))}
    </div>
  );
}
