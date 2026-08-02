/**
 * The community board.
 *
 * Someone posts a requirement ("dialogue writer wanted") together with an
 * enquiry sheet — the questions an applicant must answer. Everyone gets a
 * notification, interested writers fill in the sheet, and the poster reads the
 * answers side by side and picks one person.
 *
 * Like everything else here it lives in localStorage, so the board is shared
 * between accounts **on this browser** and nowhere else. See the README.
 */

const POSTS_KEY = 'kirukals.community.posts';
const APPS_KEY = 'kirukals.community.applications';
const NOTES_KEY = 'kirukals.notifications';
const THREADS_KEY = 'kirukals.community.threads';
const MESSAGES_KEY = 'kirukals.community.messages';

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || [];
  } catch {
    return [];
  }
};

const write = (key, list) => {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    /* full or private: the board is best-effort */
  }
};

const newId = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ------------------------------- roles ------------------------------ */

export const ROLES = [
  'Screenwriter',
  'Co-writer',
  'Dialogue writer',
  'Story / concept',
  'Translator',
  'Script doctor',
  'Reader / feedback',
  'Other',
];

/**
 * The enquiry sheet a poster starts from. These are the questions that decide
 * whether someone can actually take the job — where they are, when they are
 * free, and how much time they have — and every one of them is editable.
 */
export const DEFAULT_QUESTIONS = [
  { id: 'q_place', label: 'Which city are you based in?', type: 'text', required: true },
  { id: 'q_available', label: 'When can you start?', type: 'date', required: true },
  {
    id: 'q_hours',
    label: 'How much time can you give this each week?',
    type: 'select',
    options: ['Under 10 hours', '10–20 hours', '20–40 hours', 'Full time'],
    required: true,
  },
  {
    id: 'q_language',
    label: 'Which languages do you write in?',
    type: 'text',
    required: true,
  },
  { id: 'q_work', label: 'Share a sample, credit or link', type: 'textarea', required: false },
];

export const newQuestion = () => ({
  id: newId('q'),
  label: '',
  type: 'text',
  required: false,
});

/* ------------------------------- posts ------------------------------ */

export const listPosts = () => read(POSTS_KEY).sort((a, b) => b.createdAt - a.createdAt);

export const getPost = (id) => read(POSTS_KEY).find((p) => p.id === id) || null;

export function createPost({ session, title, role, description, location, budget, deadline, questions }) {
  const post = {
    id: newId('post'),
    authorUid: session.uid,
    authorName: session.name,
    title: title.trim(),
    role,
    description: description.trim(),
    location: location.trim(),
    budget: budget.trim(),
    deadline,
    questions: questions.filter((q) => q.label.trim()),
    status: 'open',
    selectedApplicationId: null,
    createdAt: Date.now(),
  };
  write(POSTS_KEY, [...read(POSTS_KEY), post]);

  notifyEveryone({
    kind: 'post',
    title: `${post.role} wanted — ${post.title}`,
    body: `${post.authorName} posted a requirement. Open it to see the enquiry sheet.`,
    postId: post.id,
    exceptUid: session.uid,
  });

  return post;
}

export function closePost(postId) {
  const posts = read(POSTS_KEY);
  const i = posts.findIndex((p) => p.id === postId);
  if (i === -1) return;
  posts[i] = { ...posts[i], status: 'closed' };
  write(POSTS_KEY, posts);
}

/* --------------------------- applications --------------------------- */

export const listApplications = () => read(APPS_KEY);

export const applicationsFor = (postId) =>
  read(APPS_KEY).filter((a) => a.postId === postId).sort((a, b) => a.createdAt - b.createdAt);

export const myApplication = (postId, uid) =>
  read(APPS_KEY).find((a) => a.postId === postId && a.applicantUid === uid) || null;

export function apply({ session, post, answers, note }) {
  if (myApplication(post.id, session.uid)) return null; // one reply per person

  const application = {
    id: newId('app'),
    postId: post.id,
    applicantUid: session.uid,
    applicantName: session.name,
    applicantEmail: session.email || '',
    answers,
    note: (note || '').trim(),
    status: 'submitted',
    createdAt: Date.now(),
  };
  write(APPS_KEY, [...read(APPS_KEY), application]);

  notifyUser(post.authorUid, {
    kind: 'application',
    title: `${session.name} answered your enquiry sheet`,
    body: `For “${post.title}”. Open it to read their answers.`,
    postId: post.id,
  });

  return application;
}

/**
 * The poster picks someone. The chosen applicant is told; everyone else is
 * told too, rather than being left waiting — that is the part boards usually
 * skip and applicants always resent.
 */
export function chooseApplicant(postId, applicationId) {
  const posts = read(POSTS_KEY);
  const pi = posts.findIndex((p) => p.id === postId);
  if (pi === -1) return;
  const post = posts[pi];

  posts[pi] = { ...post, status: 'filled', selectedApplicationId: applicationId };
  write(POSTS_KEY, posts);

  const apps = read(APPS_KEY).map((a) => {
    if (a.postId !== postId) return a;
    return { ...a, status: a.id === applicationId ? 'selected' : 'declined' };
  });
  write(APPS_KEY, apps);

  for (const a of apps.filter((x) => x.postId === postId)) {
    notifyUser(a.applicantUid, a.id === applicationId
      ? {
          kind: 'selected',
          title: `You were picked for “${post.title}”`,
          body: `${post.authorName} chose you. They can reach you at the email on your account.`,
          postId,
        }
      : {
          kind: 'declined',
          title: `“${post.title}” has been filled`,
          body: 'Someone else was picked this time. Your answers stay on your profile.',
          postId,
        });
  }
}

/* ------------------------------- chat ------------------------------- */

/**
 * Conversations are always about one post, between its poster and one other
 * person — the shape OLX uses, and the reason a thread never gets confusing:
 * both sides always know which requirement they are talking about.
 */

export function openThread({ post, meUid, meName, otherUid, otherName }) {
  const isPoster = meUid === post.authorUid;
  const posterUid = post.authorUid;
  const guestUid = isPoster ? otherUid : meUid;
  if (!guestUid || guestUid === posterUid) return null;

  const threads = read(THREADS_KEY);
  const existing = threads.find((t) => t.postId === post.id && t.guestUid === guestUid);
  if (existing) return existing;

  const thread = {
    id: newId('t'),
    postId: post.id,
    postTitle: post.title,
    posterUid,
    posterName: post.authorName,
    guestUid,
    guestName: isPoster ? otherName : meName,
    createdAt: Date.now(),
  };
  write(THREADS_KEY, [...threads, thread]);
  return thread;
}

export const getThread = (id) => read(THREADS_KEY).find((t) => t.id === id) || null;

export const messagesIn = (threadId) =>
  read(MESSAGES_KEY).filter((m) => m.threadId === threadId).sort((a, b) => a.createdAt - b.createdAt);

export function sendMessage({ thread, fromUid, fromName, body }) {
  const text = String(body || '').trim();
  if (!text) return null;

  const message = {
    id: newId('m'),
    threadId: thread.id,
    fromUid,
    fromName,
    body: text,
    createdAt: Date.now(),
    readBy: [fromUid],
  };
  write(MESSAGES_KEY, [...read(MESSAGES_KEY), message]);

  const toUid = fromUid === thread.posterUid ? thread.guestUid : thread.posterUid;
  notifyUser(toUid, {
    kind: 'message',
    title: `${fromName} sent you a message`,
    body: `About “${thread.postTitle}”: ${text.slice(0, 80)}${text.length > 80 ? '…' : ''}`,
    postId: thread.postId,
    threadId: thread.id,
  });

  return message;
}

/** Every conversation this user is part of, most recently active first. */
export function threadsFor(uid) {
  const messages = read(MESSAGES_KEY);
  return read(THREADS_KEY)
    .filter((t) => t.posterUid === uid || t.guestUid === uid)
    .map((t) => {
      const mine = messages.filter((m) => m.threadId === t.id);
      const last = mine[mine.length - 1] || null;
      return {
        ...t,
        // Who you are talking to depends on which side of the post you are on.
        otherName: t.posterUid === uid ? t.guestName : t.posterName,
        otherUid: t.posterUid === uid ? t.guestUid : t.posterUid,
        iAmPoster: t.posterUid === uid,
        last,
        unread: mine.filter((m) => m.fromUid !== uid && !m.readBy.includes(uid)).length,
      };
    })
    .sort((a, b) => (b.last?.createdAt || b.createdAt) - (a.last?.createdAt || a.createdAt));
}

/**
 * Messages sent *to* this user after a given moment — what the editor polls to
 * decide whether to pop a toast. Your own messages never come back to you.
 */
export function incomingMessagesSince(uid, since) {
  const threads = read(THREADS_KEY);
  return read(MESSAGES_KEY)
    .filter((m) => m.createdAt > since && m.fromUid !== uid)
    .map((m) => {
      const thread = threads.find((t) => t.id === m.threadId);
      if (!thread) return null;
      if (thread.posterUid !== uid && thread.guestUid !== uid) return null;
      return { ...m, postTitle: thread.postTitle, threadId: thread.id };
    })
    .filter(Boolean)
    .sort((a, b) => a.createdAt - b.createdAt);
}

export function markThreadRead(threadId, uid) {
  write(
    MESSAGES_KEY,
    read(MESSAGES_KEY).map((m) =>
      m.threadId === threadId && !m.readBy.includes(uid)
        ? { ...m, readBy: [...m.readBy, uid] }
        : m,
    ),
  );
  // Opening the conversation is reading the notification too.
  write(
    NOTES_KEY,
    read(NOTES_KEY).map((n) =>
      n.threadId === threadId && n.audience === uid && !n.readBy.includes(uid)
        ? { ...n, readBy: [...n.readBy, uid] }
        : n,
    ),
  );
}

/* --------------------------- notifications -------------------------- */

const pushNote = (note) => write(NOTES_KEY, [...read(NOTES_KEY), note].slice(-500));

function notifyEveryone({ kind, title, body, postId, exceptUid }) {
  pushNote({
    id: newId('n'),
    audience: 'all',
    exceptUid,
    kind,
    title,
    body,
    postId,
    createdAt: Date.now(),
    readBy: [],
  });
}

function notifyUser(uid, { kind, title, body, postId, threadId }) {
  pushNote({
    id: newId('n'),
    audience: uid,
    kind,
    title,
    body,
    postId,
    threadId,
    createdAt: Date.now(),
    readBy: [],
  });
}

/** Everything this user should see, newest first. */
export function notificationsFor(uid) {
  return read(NOTES_KEY)
    .filter((n) => (n.audience === 'all' ? n.exceptUid !== uid : n.audience === uid))
    .map((n) => ({ ...n, read: n.readBy.includes(uid) }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export const unreadCount = (uid) => notificationsFor(uid).filter((n) => !n.read).length;

export function markAllRead(uid) {
  write(
    NOTES_KEY,
    read(NOTES_KEY).map((n) => {
      const mine = n.audience === 'all' ? n.exceptUid !== uid : n.audience === uid;
      if (!mine || n.readBy.includes(uid)) return n;
      return { ...n, readBy: [...n.readBy, uid] };
    }),
  );
}
