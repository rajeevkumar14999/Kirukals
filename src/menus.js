import { TYPES, TYPE_ORDER } from './screenplay/elements';
import { isDesktopApp } from './downloads';
import { DOC_LANGUAGES, UI_LANGUAGES } from './settings';

/**
 * Every command the app has, in seven menus.
 *
 * The names are the ones this trade already uses, so a screenwriter arriving
 * from Final Draft or WriterDuet does not have to learn where anything lives.
 * Keeping the definition here rather than inside the app's own component is
 * deliberate: it is a list of what the program can do, and reads like one.
 *
 * `on` marks a setting rather than an action, so a menu can show what is
 * currently true instead of only offering to change it.
 */
export function buildMenus(ctx) {
  const {
    doc, session, prefs, setPrefs, active, pinned,
    canUndo, canRedo, undo, redo,
    section, panelOpen, setSection, setPanelOpen,
    setDialog, setDocView, openSheet, setActiveType, openSettings,
    newDoc, printScript, togglePin,
    setCommentTick, setDualTick,
    onOpenProfile, onSignOut, onImport, onHelp,
  } = ctx;

  return [
    {
      label: 'File',
      items: [
        { label: 'New script', run: newDoc },
        { label: 'Open portfolio…', keys: 'Ctrl+O', run: () => setDialog('portfolio') },
        { sep: true },
        { label: 'Import…', run: onImport },
        { label: 'Export…', run: () => setDialog('exportpick') },
        { label: 'Print / Save as PDF', keys: 'Ctrl+P', run: () => printScript(doc, prefs) },
        { sep: true },
        { label: 'Title page…', run: () => setDialog('title') },
        { label: 'Watermark…', run: () => setDialog('watermark') },
        { sep: true },
        { label: 'External backups…', run: () => setDialog('backups') },
        ...(isDesktopApp()
          ? []
          : [{ label: 'Download for Windows', run: () => setDialog('download') }]),
      ],
    },

    {
      label: 'Edit',
      items: [
        { label: 'Undo', keys: 'Ctrl+Z', disabled: !canUndo, run: undo },
        { label: 'Redo', keys: 'Ctrl+Shift+Z', disabled: !canRedo, run: redo },
        { sep: true },
        { label: 'Find & replace…', keys: 'Ctrl+F', run: () => setDialog('find') },
        { label: 'Rename character…', run: () => setDialog('rename') },
        { sep: true },
        {
          label: 'Comment on this line',
          keys: 'Ctrl+Alt+M',
          run: () => setCommentTick((n) => n + 1),
        },
        {
          label: pinned ? 'Unpin this line' : 'Pin this line',
          keys: 'Ctrl+Alt+K',
          run: () => {
            togglePin();
            setSection('project');
            setPanelOpen(true);
          },
        },
        { label: 'Line alternates…', keys: 'Ctrl+Alt+A', run: () => setDialog('alternates') },
        {
          label: 'Delete this line',
          keys: 'Ctrl+Shift+K',
          note: 'Press it in the page — deleted lines go to the Graveyard',
          disabled: true,
        },
      ],
    },

    {
      label: 'Format',
      items: [
        ...TYPE_ORDER.map((type, i) => ({
          label: TYPES[type].label,
          keys: `Ctrl+${i + 1}`,
          on: active.element?.type === type,
          run: () => setActiveType(type),
        })),
        { sep: true },
        // Emphasis needs a selection, which a menu click has just discarded.
        { label: 'Bold', keys: 'Ctrl+B', note: 'Select the words first', disabled: true },
        { label: 'Italic', keys: 'Ctrl+I', note: 'Select the words first', disabled: true },
        { label: 'Underline', keys: 'Ctrl+U', note: 'Select the words first', disabled: true },
        { sep: true },
        {
          label: 'Speak at the same time',
          keys: 'Ctrl+Alt+D',
          on: Boolean(active.element?.dual),
          run: () => setDualTick((n) => n + 1),
        },
        { label: 'Tag this line…', keys: 'Ctrl+Alt+T', run: () => setDialog('tagger') },
      ],
    },

    {
      label: 'View',
      items: [
        ...[
          ['project', 'Project'],
          ['cards', 'Cards'],
          ['comments', 'Comments'],
          ['tools', 'Tools panel'],
          ['analysis', 'Analysis'],
        ].map(([id, label]) => ({
          label,
          on: panelOpen && section === id,
          run: () => {
            setSection(id);
            setPanelOpen(true);
          },
        })),
        { sep: true },
        { label: 'Hide the panel', on: !panelOpen, run: () => setPanelOpen((o) => !o) },
        {
          label: 'Focus mode',
          on: prefs.focusMode,
          run: () => setPrefs((p) => ({ ...p, focusMode: !p.focusMode })),
        },
        {
          label: 'Dark theme',
          on: prefs.theme === 'dark',
          run: () => setPrefs((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' })),
        },
        { sep: true },
        {
          label: 'Zoom in',
          run: () => setPrefs((p) => ({ ...p, zoom: Math.min(2, +(p.zoom + 0.1).toFixed(2)) })),
        },
        {
          label: 'Zoom out',
          run: () => setPrefs((p) => ({ ...p, zoom: Math.max(0.6, +(p.zoom - 0.1).toFixed(2)) })),
        },
        { label: 'Actual size', run: () => setPrefs((p) => ({ ...p, zoom: 1 })) },
      ],
    },

    {
      label: 'Tools',
      items: [
        { label: 'Analyse the script…', run: () => setDocView('analysis') },
        { label: 'Check formatting…', run: () => setDialog('formatting') },
        { label: 'Present progressive…', run: () => setDialog('progressive') },
        { label: 'Shorten document…', run: () => setDialog('shorten') },
        { label: 'Word count', run: () => setDialog('wordcount') },
        { sep: true },
        { label: 'ReadAloud…', run: () => setDialog('readaloud') },
        { label: 'Writing schedule…', run: () => setDialog('schedule') },
      ],
    },

    {
      label: 'Production',
      items: [
        { label: 'Locations', run: () => openSheet('locations') },
        { label: 'Actors', run: () => openSheet('cast') },
        { label: 'Costumes', run: () => openSheet('costumes') },
        { label: 'Shot division', run: () => openSheet('shots') },
        { label: 'Shoot plan', run: () => openSheet('plan') },
        { sep: true },
        { label: 'Budget', run: () => openSheet('budget') },
        { label: 'Pitch deck', run: () => openSheet('deck') },
      ],
    },

    {
      // Customize is where settings live, and it sits next to Help because
      // that is where a person goes when the program is not behaving the way
      // they want it to.
      label: 'Customize',
      items: [
        ...[
          ['editing', 'Editing…'],
          ['display', 'Display…'],
          ['format', 'Format…'],
          ['notifications', 'Notifications…'],
          ['pdf', 'PDF…'],
          ['page', 'Page…'],
          ['misc', 'Misc…'],
        ].map(([id, label]) => ({ label, run: () => openSettings(id) })),
        { sep: true },
        {
          label: 'Interface Language',
          items: [
            ...UI_LANGUAGES.map((l) => ({
              label: l.label,
              on: (prefs.uiLanguage || 'en') === l.id,
              run: () => setPrefs((p) => ({ ...p, uiLanguage: l.id })),
            })),
            { label: 'Other languages are not translated yet', disabled: true },
          ],
        },
        {
          label: 'Document Language',
          items: DOC_LANGUAGES.map((l) => ({
            label: l.label,
            on: (prefs.docLanguage || 'en-US') === l.id,
            run: () => setPrefs((p) => ({ ...p, docLanguage: l.id })),
          })),
        },
      ],
    },

    {
      label: 'Help',
      items: [
        { label: 'Ask the helpdesk', run: onHelp },
        { label: 'Keyboard shortcuts', run: () => setDialog('shortcuts') },
        { sep: true },
        { label: 'Profile & community', run: () => onOpenProfile('board') },
        ...(session.guest
          ? []
          : [
              { label: 'Membership & payment', run: () => onOpenProfile('plan') },
              { label: 'Change password…', run: () => setDialog('password') },
            ]),
        ...(isDesktopApp()
          ? [{ label: 'Check for updates…', run: () => onOpenProfile('update') }]
          : []),
        { sep: true },
        { label: session.guest ? 'Leave guest session' : 'Sign out', run: onSignOut },
      ],
    },
  ];
}
