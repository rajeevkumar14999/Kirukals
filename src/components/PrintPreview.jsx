import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from './Dialogs';
import { printHtml } from '../screenplay/formats';

/**
 * The pages, before they go anywhere.
 *
 * Printing used to jump straight to the system dialog, which shows a thumbnail
 * the size of a stamp and no way back. A script is the thing a writer sends a
 * producer: the margins, where the pages break and whether the title page is
 * there are worth seeing at a size where they can be judged.
 *
 * The preview is the same HTML that goes to the printer — not an impression of
 * it — rendered in a frame of its own so the app's stylesheet cannot reach in
 * and make it look like something the printer will not produce.
 */
export default function PrintPreview({ doc, prefs, onClose }) {
  const frame = useRef(null);
  const [zoom, setZoom] = useState(0.55);
  const [pages, setPages] = useState(null);

  const html = useMemo(() => printHtml(doc, prefs), [doc, prefs]);

  // Count the sheets once the frame has laid them out, so the preview can say
  // how long the script is in the same breath as showing it.
  useEffect(() => {
    const node = frame.current;
    if (!node) return undefined;
    const read = () => {
      try {
        setPages(node.contentDocument?.querySelectorAll('.sheet').length ?? null);
      } catch {
        setPages(null);
      }
    };
    node.addEventListener('load', read);
    return () => node.removeEventListener('load', read);
  }, [html]);

  const print = () => {
    const view = frame.current?.contentWindow;
    if (!view) return;
    view.focus();
    view.print();
  };

  return (
    <Modal title="Print preview" onClose={onClose} wide>
      <div className="preview">
        <div className="preview__bar">
          <span className="hint">
            {pages === null ? 'Laying out…' : `${pages} page${pages === 1 ? '' : 's'}`}
            {' · '}
            {prefs?.paper === 'a4' ? 'A4' : 'US Letter'}
          </span>
          <span className="preview__zoom">
            <button onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.1).toFixed(2)))}>−</button>
            <b>{Math.round(zoom * 100)}%</b>
            <button onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}>+</button>
          </span>
        </div>

        <div className="preview__paper">
          <iframe
            ref={frame}
            title="The script as it will print"
            srcDoc={html}
            style={{
              width: `${100 / zoom}%`,
              height: `${100 / zoom}%`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
          />
        </div>
      </div>

      <div className="modal__actions">
        <button className="btn" onClick={onClose}>Close</button>
        <button className="btn btn--primary" onClick={print}>Print or save as PDF</button>
      </div>

      <p className="hint">
        Choose <b>Save as PDF</b> as the printer to get a file. What is above is exactly what will
        be produced — the same page, not an impression of it.
      </p>
    </Modal>
  );
}
