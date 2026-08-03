import { memo, useLayoutEffect, useRef } from 'react';
import { TYPES } from '../screenplay/elements';
import { toHtml } from '../screenplay/markup';

function ElementRow({
  element,
  index,
  isActive,
  isFirst,
  dimmed,
  comments,
  spellcheck,
  lang,
  threadOpen,
  onOpenComments,
  registerRef,
  onChange,
  onKeyDown,
  onFocus,
  onClick,
}) {
  const ref = useRef(null);
  const cfg = TYPES[element.type];

  // Grow the textarea to fit its content — the page scrolls, never the field.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [element.text, element.type]);

  useLayoutEffect(() => {
    registerRef(element.id, ref.current);
    return () => registerRef(element.id, null);
  }, [element.id, registerRef]);

  const shared = { textAlign: cfg.align, fontWeight: cfg.bold ? 700 : 400 };

  return (
    <div
      className={[
        'row',
        `row--${element.type}`,
        isActive ? 'row--active' : '',
        dimmed ? 'row--dimmed' : '',
        comments?.length ? 'row--commented' : '',
        threadOpen ? 'row--thread' : '',
      ].filter(Boolean).join(' ')}
      style={{
        // Measured in characters, not inches. The two are the same distance —
        // Courier is exactly 10 to the inch — but 6in rounds to 576px while 60
        // characters need 576.12px, so an inch-wide box silently loses the
        // last column and wraps a word early. `ch` is that advance width, so
        // the line holds exactly the 60 characters a screenplay page holds.
        marginLeft: `${cfg.indent * 10}ch`,
        // The extra pixel absorbs the browser's rounding of `ch` itself, which
        // is otherwise a hundredth of a pixel short of the last column — and a
        // hundredth of a pixel is enough to push a word onto the next line.
        width: `calc(${cfg.width * 10}ch + 1px)`,
        marginTop: isFirst ? 0 : `${cfg.spaceBefore}em`,
      }}
      data-type={element.type}
    >
      {/*
        The textarea keeps every native editing behaviour; its own glyphs are
        transparent and a mirror painted on top draws the same characters with
        emphasis applied. Both share identical metrics, so the caret and the
        rendered text stay aligned character for character — which is also why
        the markers are dimmed rather than hidden.
      */}
      <div className="row__stack">
        <textarea
          ref={ref}
          className="row__input"
          style={shared}
          value={element.text}
          rows={1}
          spellCheck={spellcheck !== false && !cfg.uppercase}
          // The dictionary the browser checks against, chosen in Customize.
          lang={lang}
          placeholder={isActive ? cfg.label : ''}
          onChange={(e) => onChange(index, e.target.value)}
          // Every way a caret can move: typed into, clicked in, arrowed
          // through. Undo needs to know where it was, not where the line was.
          onSelect={onCaretMove}
          onClick={onCaretMove}
          onKeyUp={onCaretMove}
          onKeyDown={(e) => onKeyDown(e, index)}
          onFocus={() => onFocus(index)}
          onClick={onClick}
        />
        <div
          className="row__mirror"
          style={shared}
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: toHtml(element.text, element.styles) }}
        />
      </div>
      {/* A note already here, or the caret is here and one could be started. */}
      {(comments?.length > 0 || isActive) && (
        <button
          className={`row__comment${comments?.length ? '' : ' row__comment--empty'}`}
          onClick={() => onOpenComments(element.id)}
          tabIndex={-1}
          title={comments?.length ? `${comments.length} comment${comments.length === 1 ? '' : 's'}` : 'Comment (Ctrl+Alt+M)'}
          aria-label={comments?.length ? `${comments.length} comment${comments.length === 1 ? '' : 's'} on this line` : 'Add a comment on this line'}
        >
          <span aria-hidden="true">💬</span>
          {comments?.length > 1 && <i>{comments.length}</i>}
        </button>
      )}
      <span className="row__tag" aria-hidden="true">{cfg.short}</span>
    </div>
  );
}

export default memo(ElementRow);
