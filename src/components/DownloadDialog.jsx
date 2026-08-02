import { Modal } from './Dialogs';
import { DESKTOP, downloadUrl, prettySize } from '../downloads';

/**
 * Getting Kirukals as an installed program.
 *
 * The two honest warnings are here rather than buried: Windows will complain
 * about an unsigned installer, and the desktop app keeps its own scripts. A
 * download page that hides both is a support ticket waiting to happen.
 */
export default function DownloadDialog({ onClose, onBackup }) {
  return (
    <Modal title="Download Kirukals" onClose={onClose}>
      <div className="dl">
        <div className="dl__head">
          <div>
            <b>Kirukals for Windows</b>
            <span>Version {DESKTOP.version} · {prettySize()} · {DESKTOP.platform}</span>
          </div>
          <a className="btn btn--primary" href={downloadUrl()} download={DESKTOP.file}>
            Download the installer
          </a>
        </div>

        <ul className="dl__points">
          <li>Opens in its own window, with a desktop and Start-menu shortcut.</li>
          <li>Works with no internet at all — the whole app is installed, not streamed.</li>
          <li>Updates by installing a newer version over the top; nothing is lost.</li>
        </ul>

        <h4>Two things to expect</h4>
        <p className="hint">
          <b>Windows will warn you the first time.</b> “Windows protected your PC” appears because
          the installer is not code-signed yet. Choose <b>More info → Run anyway</b>. That warning
          is about a certificate, not about the file.
        </p>
        <p className="hint">
          <b>The desktop app keeps its own scripts.</b> What you have written here lives in this
          browser and will not appear there by itself. Back up first, then import in the desktop
          app — it takes a moment and nothing is lost.
        </p>

        <div className="modal__actions">
          <button className="btn" onClick={onBackup}>Back up my scripts first</button>
          <a className="btn btn--primary" href={downloadUrl()} download={DESKTOP.file}>
            Download ({prettySize()})
          </a>
        </div>
      </div>
    </Modal>
  );
}
