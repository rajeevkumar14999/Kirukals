import { useEffect, useState } from 'react';
import { sourceFor } from '../screenplay/preproduction';

/**
 * A picture that lives on this machine.
 *
 * The script holds a reference, not the photograph, so the address has to be
 * fetched from the vault before an <img> can be pointed at it. This does that
 * and nothing else, so every place that shows a reference frame, a headshot or
 * a costume board asks the same way.
 *
 * Scripts written before the vault existed carry the picture inside them as a
 * data URL. Those still draw — and are quietly moved into the vault the first
 * time they are shown, so an old script stops being a heavy one.
 */
export default function Attachment({ of, alt = '', className, onMoved }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    let cancelled = false;
    sourceFor(of, onMoved)
      .then((found) => { if (!cancelled) setSrc(found); })
      .catch(() => { if (!cancelled) setSrc(null); });
    return () => { cancelled = true; };
  }, [of?.ref, of?.data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!of) return null;
  if (!src) return <span className={className} aria-label={alt} />;
  return <img className={className} src={src} alt={alt} />;
}
