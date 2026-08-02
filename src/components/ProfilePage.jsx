import { useEffect, useMemo, useState } from 'react';
import { ApplyDialog, PostComposer } from './CommunityDialogs';
import ChatPanel from './ChatPanel';
import Presence from './Presence';
import { onlineUids, setSharePresence, sharesPresence } from '../auth/activity';
import {
  applicationsFor,
  chooseApplicant,
  closePost,
  listApplications,
  listPosts,
  markAllRead,
  myApplication,
  notificationsFor,
  openThread,
  threadsFor,
} from '../community/store';
import SubscribeDialog from './SubscribeDialog';
import AppUpdate from './AppUpdate';
import { PLAN, subscriptionFor } from '../billing/subscription';
import { formatLeft, trialLeft } from '../billing/trial';
import { scriptCountFor } from '../screenplay/storage';
import '../styles/community.css';

const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const fmtAgo = (ts) => {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return fmtDate(ts);
};

const TABS = [
  { id: 'board', label: 'Community' },
  { id: 'mine', label: 'My posts' },
  { id: 'applied', label: 'My replies' },
  { id: 'chat', label: 'Messages' },
  { id: 'alerts', label: 'Notifications' },
  { id: 'plan', label: 'Membership' },
  { id: 'update', label: 'Updates' },
];

export default function ProfilePage({ session, onExit, initialTab = 'board', initialThreadId = null, onNotificationsSeen }) {
  const [tab, setTab] = useState(initialTab);
  const [tick, setTick] = useState(0);
  const [composing, setComposing] = useState(false);
  const [applyingTo, setApplyingTo] = useState(null);
  const [openPostId, setOpenPostId] = useState(null);
  const [openThreadId, setOpenThreadId] = useState(initialThreadId);
  const [shareMe, setShareMe] = useState(() => sharesPresence(session.uid));
  const [online, setOnline] = useState(() => onlineUids().length);

  const refresh = () => setTick((t) => t + 1);

  // Keep the headline count honest without hammering storage.
  useEffect(() => {
    const timer = setInterval(() => setOnline(onlineUids().length), 15000);
    return () => clearInterval(timer);
  }, []);

  /** Open (or create) the conversation about a post and jump to it. */
  const chatAbout = (post, otherUid, otherName) => {
    const thread = openThread({
      post,
      meUid: session.uid,
      meName: session.name,
      otherUid,
      otherName,
    });
    if (!thread) return;
    setOpenThreadId(thread.id);
    setTab('chat');
    refresh();
  };

  const { posts, myPosts, myApplications, notes, threads } = useMemo(() => {
    const all = listPosts();
    const mineApps = listApplications().filter((a) => a.applicantUid === session.uid);
    return {
      posts: all,
      myPosts: all.filter((p) => p.authorUid === session.uid),
      myApplications: mineApps
        .map((a) => ({ ...a, post: all.find((p) => p.id === a.postId) }))
        .filter((a) => a.post)
        .sort((a, b) => b.createdAt - a.createdAt),
      notes: notificationsFor(session.uid),
      threads: threadsFor(session.uid),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `tick` re-reads storage
  }, [session.uid, tick]);

  const sub = useMemo(() => subscriptionFor(session.uid), [session.uid, tick]);
  const [paying, setPaying] = useState(false);
  const trialMs = session.guest ? 0 : trialLeft(session.uid);

  const openAlerts = () => {
    setTab('alerts');
    markAllRead(session.uid);
    onNotificationsSeen?.();
    refresh();
  };

  return (
    <div className="profile">
      <header className="admin__bar">
        <button className="btn" onClick={onExit}>← Back to editor</button>
        <div className="admin__titles">
          <h1>{session.name}</h1>
          <p>
            {session.email || 'Guest session'} ·{' '}
            {sub.status === 'active' ? `Pro until ${fmtDate(sub.activeUntil)}` : 'Free account'} ·{' '}
            {scriptCountFor(session.uid)} scripts
          </p>
        </div>
        <div className="admin__actions">
          <span className="online-count" title="People with the app open right now">
            <i aria-hidden="true" />
            {online} online
          </span>
          <label className="presence-toggle" title="Others see whether you are online">
            <input
              type="checkbox"
              checked={shareMe}
              onChange={(e) => {
                setSharePresence(session.uid, e.target.checked);
                setShareMe(e.target.checked);
              }}
            />
            Show when I'm online
          </label>
          <button className="btn btn--primary" onClick={() => setComposing(true)}>
            Post a requirement
          </button>
        </div>
      </header>

      <p className="admin__scope">
        The community board lives in <b>this browser</b>, shared between the accounts on this
        device. With no server, a post cannot reach writers on other machines yet.
      </p>

      <nav className="cm-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? 'is-active' : ''}
            onClick={() => (t.id === 'alerts' ? openAlerts() : setTab(t.id))}
          >
            {t.label}
            {t.id === 'alerts' && notes.some((n) => !n.read) && (
              <i className="cm-dot" aria-label="unread" />
            )}
            {t.id === 'chat' && threads.some((th) => th.unread > 0) && (
              <i className="cm-dot" aria-label="unread" />
            )}
          </button>
        ))}
      </nav>

      {/* ------------------------------ board ----------------------------- */}
      {tab === 'board' && (
        <section className="cm-list">
          {posts.length === 0 && (
            <p className="admin__empty">
              Nothing posted yet. If you need a writer, post the requirement — everyone on this
              board is notified.
            </p>
          )}
          {posts.map((post) => {
            const mine = post.authorUid === session.uid;
            const replied = myApplication(post.id, session.uid);
            return (
              <article className="cm-post" key={post.id}>
                <header>
                  <div>
                    <h3>{post.title}</h3>
                    <p className="cm-post__meta">
                      <span className="tag tag--muted">{post.role}</span>
                      {post.location && <span>{post.location}</span>}
                      {post.budget && <span>{post.budget}</span>}
                      {post.deadline && <span>by {fmtDate(post.deadline)}</span>}
                      <span className="cm-poster">
                        · <Presence uid={post.authorUid} />
                        {post.authorName}, {fmtAgo(post.createdAt)}
                      </span>
                    </p>
                  </div>
                  <span className={`pill pill--${post.status === 'open' ? 'pending' : 'verified'}`}>
                    {post.status}
                  </span>
                </header>

                <p className="cm-post__body">{post.description}</p>

                <footer>
                  <span className="cm-post__count">
                    {applicationsFor(post.id).length} replied · {post.questions.length} questions
                  </span>
                  {mine ? (
                    <button className="btn" onClick={() => { setTab('mine'); setOpenPostId(post.id); }}>
                      Review replies
                    </button>
                  ) : replied ? (
                    <>
                      <span className={`pill pill--${replied.status === 'selected' ? 'verified' : replied.status === 'declined' ? 'rejected' : 'pending'}`}>
                        {replied.status === 'submitted' ? 'you replied' : replied.status}
                      </span>
                      {/* Having replied should not end the conversation. */}
                      <button className="btn" onClick={() => chatAbout(post)}>Chat</button>
                    </>
                  ) : post.status === 'open' ? (
                    <>
                      <button className="btn" onClick={() => chatAbout(post)}>Chat</button>
                      <button className="btn btn--primary" onClick={() => setApplyingTo(post)}>
                        I'm interested
                      </button>
                    </>
                  ) : (
                    <span className="cm-post__count">closed</span>
                  )}
                </footer>
              </article>
            );
          })}
        </section>
      )}

      {/* ---------------------------- my posts ---------------------------- */}
      {tab === 'mine' && (
        <section className="cm-list">
          {myPosts.length === 0 && (
            <p className="admin__empty">You have not posted anything yet.</p>
          )}
          {myPosts.map((post) => {
            const apps = applicationsFor(post.id);
            const open = openPostId === post.id;
            return (
              <article className="cm-post" key={post.id}>
                <header>
                  <div>
                    <h3>{post.title}</h3>
                    <p className="cm-post__meta">
                      <span className="tag tag--muted">{post.role}</span>
                      <span>{apps.length} replied</span>
                      <span>· posted {fmtAgo(post.createdAt)}</span>
                    </p>
                  </div>
                  <span className={`pill pill--${post.status === 'open' ? 'pending' : 'verified'}`}>
                    {post.status}
                  </span>
                </header>

                <footer>
                  <button className="btn" onClick={() => setOpenPostId(open ? null : post.id)}>
                    {open ? 'Hide replies' : `Read ${apps.length} repl${apps.length === 1 ? 'y' : 'ies'}`}
                  </button>
                  {post.status === 'open' && (
                    <button className="btn" onClick={() => { closePost(post.id); refresh(); }}>
                      Close post
                    </button>
                  )}
                </footer>

                {open && (
                  <div className="cm-replies">
                    {apps.length === 0 && <p className="admin__empty">Nobody has replied yet.</p>}
                    {apps.map((a) => (
                      <div className={`cm-reply${a.status === 'selected' ? ' is-chosen' : ''}`} key={a.id}>
                        <header>
                          <div>
                            <b>
                              <Presence uid={a.applicantUid} />
                              {a.applicantName}
                            </b>
                            {a.applicantEmail && <span className="cm-reply__mail">{a.applicantEmail}</span>}
                          </div>
                          <span className="cm-post__count">{fmtAgo(a.createdAt)}</span>
                        </header>

                        <dl className="cm-answers">
                          {post.questions.map((q) => (
                            <div key={q.id}>
                              <dt>{q.label}</dt>
                              <dd>{a.answers[q.id] || <i>no answer</i>}</dd>
                            </div>
                          ))}
                          {a.note && (
                            <div>
                              <dt>Also said</dt>
                              <dd>{a.note}</dd>
                            </div>
                          )}
                        </dl>

                        <div className="cm-reply__actions">
                        <button
                          className="btn"
                          onClick={() => chatAbout(post, a.applicantUid, a.applicantName)}
                        >
                          Chat with {a.applicantName.split(' ')[0]}
                        </button>
                        {post.status === 'open' ? (
                          <button
                            className="btn btn--primary"
                            onClick={() => {
                              if (!window.confirm(`Choose ${a.applicantName}? Everyone else is told the post is filled.`)) return;
                              chooseApplicant(post.id, a.id);
                              refresh();
                            }}
                          >
                            Choose {a.applicantName.split(' ')[0]}
                          </button>
                        ) : (
                          <span className={`pill pill--${a.status === 'selected' ? 'verified' : 'rejected'}`}>
                            {a.status}
                          </span>
                        )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {/* --------------------------- my replies --------------------------- */}
      {tab === 'applied' && (
        <section className="cm-list">
          {myApplications.length === 0 && (
            <p className="admin__empty">You have not replied to any requirement yet.</p>
          )}
          {myApplications.map((a) => (
            <article className="cm-post" key={a.id}>
              <header>
                <div>
                  <h3>{a.post.title}</h3>
                  <p className="cm-post__meta">
                    <span className="tag tag--muted">{a.post.role}</span>
                    <span>{a.post.authorName}</span>
                    <span>· replied {fmtAgo(a.createdAt)}</span>
                  </p>
                </div>
                <span className={`pill pill--${a.status === 'selected' ? 'verified' : a.status === 'declined' ? 'rejected' : 'pending'}`}>
                  {a.status === 'submitted' ? 'waiting' : a.status}
                </span>
              </header>
              {a.status === 'selected' && (
                <p className="cm-chosen">
                  You were chosen. {a.post.authorName} has your email and will be in touch.
                </p>
              )}
              <dl className="cm-answers">
                {a.post.questions.map((q) => (
                  <div key={q.id}>
                    <dt>{q.label}</dt>
                    <dd>{a.answers[q.id] || <i>no answer</i>}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </section>
      )}

      {/* ------------------------------ chat ------------------------------ */}
      {tab === 'chat' && (
        <ChatPanel
          session={session}
          openThreadId={openThreadId}
          onOpenPost={(postId) => { setOpenPostId(postId); setTab('board'); }}
        />
      )}

      {/* -------------------------- notifications ------------------------- */}
      {tab === 'alerts' && (
        <section className="cm-list">
          {notes.length === 0 && <p className="admin__empty">Nothing yet.</p>}
          {notes.map((n) => (
            <article className={`cm-note cm-note--${n.kind}`} key={n.id}>
              <div>
                <b>{n.title}</b>
                <p>{n.body}</p>
              </div>
              <div className="cm-note__side">
                <span className="cm-post__count">{fmtAgo(n.createdAt)}</span>
                {n.postId && (
                  <button
                    className="linkish"
                    onClick={() => {
                      if (n.threadId) {
                        setOpenThreadId(n.threadId);
                        setTab('chat');
                        return;
                      }
                      setOpenPostId(n.postId);
                      setTab(n.kind === 'application' ? 'mine' : 'board');
                    }}
                  >
                    open
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      )}

      {/* ----------------------------- updates ---------------------------- */}
      {tab === 'update' && <AppUpdate />}

      {/* --------------------------- membership --------------------------- */}
      {tab === 'plan' && (
        <section className="cm-list">
          <article className="plan-card">
            <header>
              <div>
                <h2>{PLAN.name}</h2>
                <p className="plan-card__price">
                  ₹{(PLAN.amountPaise / 100).toFixed(0)} <span>/ {PLAN.periodLabel}</span>
                </p>
              </div>
              <span
                className={[
                  'plan-card__state',
                  sub.status === 'active' ? 'is-active' : '',
                  sub.status === 'pending' ? 'is-pending' : '',
                ].filter(Boolean).join(' ')}
              >
                {sub.status === 'active'
                  ? `Active · ${sub.daysLeft} days left`
                  : sub.status === 'pending'
                    ? 'Waiting for approval'
                    : session.guest
                      ? 'Guest session'
                      : sub.status === 'expired'
                        ? 'Expired'
                        : trialMs > 0
                          ? `Free trial · ${formatLeft(trialMs)} left`
                          : 'Trial finished'}
              </span>
            </header>

            <ul className="plan-card__features">
              {PLAN.features.map((f) => <li key={f}>{f}</li>)}
            </ul>

            <footer>
              {session.guest ? (
                <p className="hint">
                  A guest session cannot hold a subscription — its work is erased when the ten
                  minutes are up. Create an account first, then come back here.
                </p>
              ) : sub.status === 'active' ? (
                <>
                  <p className="hint">
                    Paid up to {fmtDate(sub.activeUntil)}. Renewing early adds another month on
                    top of what is left, so nothing is lost by paying ahead.
                  </p>
                  <button className="btn" onClick={() => setPaying(true)}>Renew a month</button>
                </>
              ) : sub.status === 'pending' ? (
                <p className="hint">
                  Your payment is with the admin. The writing pad unlocks the moment it is
                  approved — you do not need to pay again.
                </p>
              ) : (
                <>
                  <p className="hint">
                    Pay by UPI, then the admin confirms it against the bank record. Until that
                    confirmation the writing pad stays locked.
                  </p>
                  <button className="btn btn--primary" onClick={() => setPaying(true)}>
                    {sub.status === 'expired' ? 'Renew' : 'Upgrade'} — ₹{(PLAN.amountPaise / 100).toFixed(0)} / {PLAN.periodLabel}
                  </button>
                </>
              )}
            </footer>
          </article>
        </section>
      )}

      {paying && (
        <SubscribeDialog
          session={session}
          onChanged={() => setTick((t) => t + 1)}
          onClose={() => {
            setPaying(false);
            setTick((t) => t + 1);
          }}
        />
      )}

      {composing && (
        <PostComposer
          session={session}
          onClose={() => setComposing(false)}
          onPosted={() => { setComposing(false); setTab('mine'); refresh(); }}
        />
      )}
      {applyingTo && (
        <ApplyDialog
          session={session}
          post={applyingTo}
          onClose={() => setApplyingTo(null)}
          onApplied={() => { setApplyingTo(null); setTab('applied'); refresh(); }}
        />
      )}
    </div>
  );
}
