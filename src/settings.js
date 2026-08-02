/**
 * Everything the Customize menu can change.
 *
 * The defaults live here rather than beside the dialog that edits them,
 * because they are also what the rest of the app reads: a setting that has
 * never been touched must still answer when asked. `settings()` merges a
 * stored preferences object over these, so a preferences file written by an
 * older version gains new keys instead of leaving holes.
 */

export const DEFAULTS = {
  // Editing
  spellcheck: true,
  autocomplete: true,
  graveyard: true,

  // Display
  theme: 'dark',
  zoom: 1,
  focusMode: false,
  commentMarks: true,

  // Format
  contd: false,
  boldSceneHeadings: true,
  underlineSceneHeadings: false,
  sceneNumbers: false,

  // Notifications
  notifyChat: true,
  notifyUpdates: true,

  // PDF
  pdfTitlePage: true,
  pdfPageNumbers: true,
  pdfFontSize: 12,

  // Page
  paper: 'letter',
  marginTop: 1,
  marginBottom: 0.75,
  marginLeft: 1.5,
  marginRight: 1,

  // Misc
  confirmClose: true,

  // Language
  uiLanguage: 'en',
  docLanguage: 'en-US',
};

/** The stored preferences, with every missing key filled in. */
export function settings(prefs) {
  return { ...DEFAULTS, ...prefs };
}

/**
 * The paper sizes, in inches.
 *
 * A script is written to US Letter almost everywhere in the trade, including
 * in countries where every other document is A4 — so Letter stays the default
 * and A4 is the deliberate choice.
 */
export const PAPER = {
  letter: { label: 'US Letter', css: 'Letter', w: 8.5, h: 11 },
  a4: { label: 'A4', css: 'A4', w: 8.27, h: 11.69 },
};

/**
 * Languages offered for the document.
 *
 * This is the dictionary the browser spell-checks against, so the list is the
 * set of languages a spell-checker is likely to have — not a list of languages
 * a script could be written in, which is all of them.
 */
export const DOC_LANGUAGES = [
  { id: 'en-US', label: 'English (United States)' },
  { id: 'en-GB', label: 'English (United Kingdom)' },
  { id: 'en-IN', label: 'English (India)' },
  { id: 'ta', label: 'தமிழ் · Tamil' },
  { id: 'hi', label: 'हिन्दी · Hindi' },
  { id: 'ml', label: 'മലയാളം · Malayalam' },
  { id: 'te', label: 'తెలుగు · Telugu' },
  { id: 'kn', label: 'ಕನ್ನಡ · Kannada' },
  { id: 'fr', label: 'Français · French' },
  { id: 'es', label: 'Español · Spanish' },
  { id: 'de', label: 'Deutsch · German' },
];

/**
 * Languages the interface itself is written in.
 *
 * One, so far. It is listed anyway: a menu that shows what is available and
 * says plainly what is not is more use than a menu that hides the question.
 */
export const UI_LANGUAGES = [{ id: 'en', label: 'English' }];
