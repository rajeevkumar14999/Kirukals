import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Presence from './Presence';
import { getThread, markThreadRead, messagesIn, sendMessage, threadsFor } from '../community/store';

const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

const fmtDay = (ts) => {
  const d = new Date(ts);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (d.getTime() >= today.getTime()) return 'Today';
  const yesterday = today.getTime() - 86_400_000;
  if (d.getTime() >= yesterday) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

/**
 * Conversations, in the shape a classifieds app uses: a list of threads on the
 * left, one conversation on the right, each pinned to the post it is about.
 * localStorage does not emit change events to its own tab, so the open thread
 * polls; the `storage` event covers a second tab.
 */
export default function ChatPanel({ session, openThreadId, onOpenPost }) {
  const [threads, setThreads] = useState(() => threadsFor(session.uid));
  const [activeId, setActiveId] = useState(openThreadId || null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);

  const active = activeId ? getThread(activeId) : null;

  const reload = () => {
    setThreads(threadsFor(session.uid));
    if (activeId) setMessages(messagesIn(activeId));
  };

  useEffect(() => {
    reload();
    const timer = setInterval(reload, 3000);
    window.addEventListener('storage', reload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('storage', reload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, session.uid]);

  // Opening a conversation is reading it.
  useEffect(() => {
    if (!activeId) return;
    markThreadRead(activeId, session.uid);
    setThreads(threadsFor(session.uid));
  }, [activeId, session.uid, messages.length]);

  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, activeId]);

  const send = (e) => {
    e.preventDefault();
    if (!active || !draft.trim()) return;
    sendMessage({ thread: active, fromUid: session.uid, fromName: session.name, body: draft });
    setDraft('');
    reload();
  };

  if (!threads.length) {
    return (
      <p className="admin__empty">
        No conversations yet. Open a requirement on the board and press <b>Chat</b> to ask the
        poster something — you do not have to fill the enquiry sheet first.
      </p>
    );
  }

  let lastDay = null;

  return (
    <div className="chat">
      <aside className="chat__list">
        {threads.map((t) => (
          <button
            key={t.id}
            className={`chat__item${t.id === activeId ? ' is-active' : ''}`}
            onClick={() => setActiveId(t.id)}
          >
            <span className="chat__who">
              <Presence uid={t.otherUid} />
              {t.otherName}
              {t.unread > 0 && <i className="chat__badge">{t.unread}</i>}
            </span>
            <span className="chat__about">{t.postTitle}</span>
            <span className="chat__preview">
              {t.last ? `${t.last.fromUid === session.uid ? 'You: ' : ''}${t.last.body}` : 'No messages yet'}
            </span>
          </button>
        ))}
      </aside>

      <section className="chat__pane">
        {!active ? (
          <p className="admin__empty">Pick a conversation.</p>
        ) : (
          <>
            <header className="chat__head">
              <div>
                {/* One presence indicator in the header — the labelled one
                    below — so a screen reader is not told the status twice. */}
                <b>{active.posterUid === session.uid ? active.guestName : active.posterName}</b>
                <span>
                  <Presence
                    uid={active.posterUid === session.uid ? active.guestUid : active.posterUid}
                    withLabel
                    className="presence--inline"
                  />
                  about {active.postTitle}
                  {active.posterUid === session.uid ? ' · your post' : ''}
                </span>
              </div>
              <button className="linkish" onClick={() => onOpenPost?.(active.postId)}>
                view post
              </button>
            </header>

            <div className="chat__log">
              {messages.length === 0 && (
                <p className="admin__empty">Say hello — they will get a notification.</p>
              )}
              {messages.map((m) => {
                const day = fmtDay(m.createdAt);
                const showDay = day !== lastDay;
                lastDay = day;
                return (
                  <div key={m.id}>
                    {showDay && <div className="chat__day">{day}</div>}
                    <div className={`chat__msg${m.fromUid === session.uid ? ' is-mine' : ''}`}>
                      <p>{m.body}</p>
                      <span>{fmtTime(m.createdAt)}</span>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <form className="chat__compose" onSubmit={send}>
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Write a message…"
                aria-label="Message"
              />
              <button className="btn btn--primary" type="submit" disabled={!draft.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
