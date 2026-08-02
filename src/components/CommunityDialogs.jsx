import { useState } from 'react';
import { Modal } from './Dialogs';
import { DEFAULT_QUESTIONS, ROLES, apply, createPost, newQuestion } from '../community/store';

/* ------------------------------------------------------------------ *
 * Posting a requirement, with the enquiry sheet attached
 * ------------------------------------------------------------------ */

export function PostComposer({ session, onPosted, onClose }) {
  const [form, setForm] = useState({
    title: '',
    role: ROLES[0],
    description: '',
    location: '',
    budget: '',
    deadline: '',
  });
  const [questions, setQuestions] = useState(DEFAULT_QUESTIONS);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const editQuestion = (id, patch) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, ...patch } : q)));

  const submit = () => {
    if (!form.title.trim()) return setError('Give the post a title — what are you looking for?');
    if (!form.description.trim()) return setError('Describe the work so people know what they are answering.');
    if (!questions.some((q) => q.label.trim())) return setError('Keep at least one question on the enquiry sheet.');
    const post = createPost({ session, ...form, questions });
    onPosted(post);
  };

  return (
    <Modal title="Post a requirement" onClose={onClose} wide>
      <div className="cm-form">
        <label className="cm-field">
          <span>What do you need?</span>
          <input
            value={form.title}
            onChange={set('title')}
            placeholder="Dialogue writer for a Tamil feature"
          />
        </label>

        <div className="cm-row">
          <label className="cm-field">
            <span>Role</span>
            <select value={form.role} onChange={set('role')}>
              {ROLES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
          <label className="cm-field">
            <span>Where</span>
            <input value={form.location} onChange={set('location')} placeholder="Chennai / remote" />
          </label>
        </div>

        <div className="cm-row">
          <label className="cm-field">
            <span>Budget (optional)</span>
            <input value={form.budget} onChange={set('budget')} placeholder="₹40,000 for the draft" />
          </label>
          <label className="cm-field">
            <span>Needed by (optional)</span>
            <input type="date" value={form.deadline} onChange={set('deadline')} />
          </label>
        </div>

        <label className="cm-field">
          <span>The work</span>
          <textarea
            rows={4}
            value={form.description}
            onChange={set('description')}
            placeholder="Genre, length, stage the project is at, what you want from this person."
          />
        </label>

        <section className="cm-sheet">
          <header>
            <h4>Enquiry sheet</h4>
            <p>Everyone who is interested answers these before you see them.</p>
          </header>

          {questions.map((q, i) => (
            <div className="cm-q" key={q.id}>
              <span className="cm-q__n">{i + 1}</span>
              <input
                className="cm-q__label"
                value={q.label}
                placeholder="Your question"
                onChange={(e) => editQuestion(q.id, { label: e.target.value })}
              />
              <select value={q.type} onChange={(e) => editQuestion(q.id, { type: e.target.value })}>
                <option value="text">Short answer</option>
                <option value="textarea">Long answer</option>
                <option value="date">Date</option>
                <option value="select">Choose one</option>
              </select>
              <label className="cm-q__req">
                <input
                  type="checkbox"
                  checked={q.required}
                  onChange={(e) => editQuestion(q.id, { required: e.target.checked })}
                />
                required
              </label>
              <button
                className="linkish"
                onClick={() => setQuestions((qs) => qs.filter((x) => x.id !== q.id))}
                aria-label={`Remove question ${i + 1}`}
              >
                remove
              </button>
              {q.type === 'select' && (
                <input
                  className="cm-q__options"
                  value={(q.options || []).join(', ')}
                  placeholder="Options, comma separated"
                  onChange={(e) =>
                    editQuestion(q.id, { options: e.target.value.split(',').map((o) => o.trim()) })
                  }
                />
              )}
            </div>
          ))}

          <button className="btn" onClick={() => setQuestions((qs) => [...qs, newQuestion()])}>
            Add a question
          </button>
        </section>

        {error && <p className="sub__error" role="alert">{error}</p>}

        <div className="cm-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={submit}>
            Post and notify everyone
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Answering someone's enquiry sheet
 * ------------------------------------------------------------------ */

export function ApplyDialog({ session, post, onApplied, onClose }) {
  const [answers, setAnswers] = useState({});
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    const missing = post.questions.find((q) => q.required && !String(answers[q.id] || '').trim());
    if (missing) return setError(`Please answer: ${missing.label}`);
    const created = apply({ session, post, answers, note });
    if (!created) return setError('You have already replied to this post.');
    onApplied(created);
  };

  return (
    <Modal title={post.title} onClose={onClose} wide>
      <div className="cm-form">
        <p className="cm-apply__intro">
          {post.authorName} is looking for a <b>{post.role}</b>
          {post.location && <> · {post.location}</>}
          {post.budget && <> · {post.budget}</>}
        </p>
        <p className="cm-apply__desc">{post.description}</p>

        <section className="cm-sheet">
          <header>
            <h4>Enquiry sheet</h4>
            <p>Your answers go straight to {post.authorName} — nobody else sees them.</p>
          </header>

          {post.questions.map((q) => (
            <label className="cm-field" key={q.id}>
              <span>
                {q.label}
                {q.required && <i className="cm-req"> *</i>}
              </span>
              {q.type === 'textarea' ? (
                <textarea
                  rows={3}
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
              ) : q.type === 'select' ? (
                <select
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                >
                  <option value="">Choose…</option>
                  {(q.options || []).filter(Boolean).map((o) => <option key={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  type={q.type === 'date' ? 'date' : 'text'}
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                />
              )}
            </label>
          ))}

          <label className="cm-field">
            <span>Anything else you want them to know</span>
            <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        </section>

        {error && <p className="sub__error" role="alert">{error}</p>}

        <div className="cm-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn--primary" onClick={submit}>Send my answers</button>
        </div>
      </div>
    </Modal>
  );
}
