import React from 'react';

// Shared brand logo — used in the Settings page header. Kept here (instead
// of Main.jsx) so multiple screens can import it without circular deps.
export function KinnektLogo({ size = 54 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" aria-label="Kinnekt">
      <defs>
        <linearGradient id="kk-dot" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A6CFF" />
          <stop offset="100%" stopColor="#5683FF" />
        </linearGradient>
        <linearGradient id="kk-v" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A6CFF" />
          <stop offset="100%" stopColor="#6FA9FF" />
        </linearGradient>
        <linearGradient id="kk-u" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#5683FF" />
          <stop offset="100%" stopColor="#85C0FF" />
        </linearGradient>
        <linearGradient id="kk-d" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#3DD9C5" />
          <stop offset="45%" stopColor="#FFA88A" />
          <stop offset="100%" stopColor="#FF7878" />
        </linearGradient>
      </defs>
      {/* Dot — the head of the i */}
      <circle cx="22" cy="12" r="6.8" fill="url(#kk-dot)" />
      {/* Vertical pill — body of the i, left stroke of the K */}
      <rect x="16" y="22" width="12" height="44" rx="6" fill="url(#kk-v)" />
      {/* Upper-right diagonal — blue gradient */}
      <rect x="22" y="38" width="32" height="12" rx="6" fill="url(#kk-u)" transform="rotate(-45 22 44)" />
      {/* Lower-right diagonal — cyan → coral */}
      <rect x="22" y="38" width="32" height="12" rx="6" fill="url(#kk-d)" transform="rotate(45 22 44)" />
    </svg>
  );
}

// Single-emoji input. Lets users pick from a small "quick picks" grid OR
// type/paste any emoji using their OS keyboard — on iOS that's the 🌐
// globe key → emoji panel; on macOS Cmd+Ctrl+Space; on Android, the
// emoji button. The picker stores the first grapheme so multi-codepoint
// emoji like 👨‍👩‍👧 stay intact.
function firstGrapheme(str) {
  if (!str) return '';
  try {
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const seg = new Intl.Segmenter();
      const { value } = seg.segment(str)[Symbol.iterator]().next();
      return value?.segment || '';
    }
  } catch { /* fall through to Array.from */ }
  return Array.from(str)[0] || '';
}

// A generous default set covering the common categories. Callers can
// override via `presets` to scope it (e.g. avatar pickers might lean
// faces, Space pickers might lean topics).
const POPULAR_EMOJIS = [
  '✨', '⭐', '❤️', '🔥', '🌟', '🌈', '☀️', '🌙',
  '😀', '😎', '🥰', '🤓', '🥳', '🤩', '🥹', '😴',
  '🦊', '🐻', '🐼', '🐶', '🐱', '🐰', '🐸', '🦄',
  '🎂', '🍕', '☕', '🍎', '🧁', '🍳', '🍷', '🍔',
  '🏕️', '🏠', '🎄', '🎁', '🎒', '🏖️', '⚽', '🎸',
  '📚', '🚀', '🚗', '✈️', '🌱', '🌸', '🌻', '🎨',
  '🛠️', '🧺', '🇮🇹', '🇺🇸', '🇯🇵', '🇫🇷', '🇬🇧', '🐾',
];

export function EmojiInput({ value, onChange, presets = POPULAR_EMOJIS, placeholder = 'Tap, then use your keyboard’s emoji panel' }) {
  const inputRef = React.useRef(null);
  // The input is always a one-shot draft: typed text is captured as the
  // first grapheme, passed to `onChange`, then the draft clears. That
  // means the user can keep typing replacement emojis without backspacing.
  const [draft, setDraft] = React.useState('');

  const captureAndCommit = (raw) => {
    setDraft(raw);
    const next = firstGrapheme(raw);
    if (next) {
      onChange(next);
      setDraft('');
      // Re-focus so iOS keeps the emoji keyboard open for follow-up picks.
      window.requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <div className="emoji-input-wrap">
      <div className="emoji-input-row">
        <button
          type="button"
          className="emoji-input-preview"
          onClick={() => inputRef.current?.focus()}
          aria-label="Current emoji — tap to change"
        >{value || '✨'}</button>
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={draft}
          onChange={(e) => captureAndCommit(e.target.value)}
          placeholder={placeholder}
          className="emoji-input-field"
          maxLength={16}
        />
      </div>
      {Array.isArray(presets) && presets.length > 0 && (
        <>
          <div className="emoji-input-hint">Quick picks</div>
          <div className="emoji-preset-grid" role="radiogroup" aria-label="Quick emoji picks">
            {presets.map(e => (
              <button
                key={e}
                type="button"
                role="radio"
                aria-checked={value === e}
                className={'emoji-opt' + (value === e ? ' on' : '')}
                onClick={() => onChange(e)}
              >{e}</button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function AnchorTabs({ active, onChange }) {
  const tabs = [
    { id: 'notes',    label: 'Home' },
    { id: 'tasks',    label: 'Tasks' },
    // Lists is hidden — superseded by Spaces. Code stays intact in
    // ListsSection / AddListModal / ListDetailModal in case we ever
    // want to revive it; just un-comment this line and the matching
    // entry in SECTION_ORDER + scroll-sync ids + JSX render in Main.
    // { id: 'lists',    label: 'Lists' },
    { id: 'spaces',   label: 'Spaces' },
    { id: 'calendar', label: 'Calendar' },
  ];
  return (
    <div className="fb-tabs" role="tablist">
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={active === t.id}
          className={'fb-tab' + (active === t.id ? ' active' : '')}
          onClick={() => onChange(t.id)}
        >{t.label}</button>
      ))}
    </div>
  );
}

// `compact` switches the sheet from the default 75%-min bottom drawer
// to a content-sized sheet that bottom-aligns. Used by date/time
// pickers so the wheels land near the trigger button instead of
// drifting toward the upper half of the screen.
// Stack of currently-open modals so only the TOPMOST handles Escape. Without
// this, a date/time picker opened inside an add sheet closes BOTH on one Esc,
// discarding the whole in-progress form.
const __modalStack = [];

export function Modal({ open, title, onClose, children, footer, compact }) {
  const sheetRef = React.useRef(null);
  const dragRef = React.useRef({ startY: 0, dragging: false, offset: 0 });

  // Reset sheet's internal scrollTop to 0 each time it opens. iOS
  // Safari's autoFocus on the first input + on-screen-keyboard popup
  // was leaving the sheet scrolled partway down, so the user landed
  // mid-form and had to scroll up to see the title.
  React.useEffect(() => {
    if (open && sheetRef.current) {
      sheetRef.current.scrollTop = 0;
    }
  }, [open]);

  // Escape closes the sheet + Tab is trapped inside it (keyboard / accessibility).
  // No autoFocus — inputs wait for a user tap so the iOS keyboard doesn't pop the
  // sheet mid-form; the trap only engages once the user actually presses Tab.
  React.useEffect(() => {
    if (!open) return;
    const token = {};
    __modalStack.push(token);
    const isTopmost = () => __modalStack[__modalStack.length - 1] === token;
    const focusablesIn = (root) => Array.from(root.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter((el) => el.getClientRects().length > 0);
    const onKey = (e) => {
      if (!isTopmost()) return; // only the topmost open modal reacts
      if (e.key === 'Escape') { onClose?.(); return; }
      if (e.key !== 'Tab') return;
      // Keep focus inside the sheet so keyboard / Switch-Control users can't
      // Tab into the (visually hidden) background feed and activate it.
      const sheet = sheetRef.current;
      if (!sheet) return;
      const f = focusablesIn(sheet);
      if (f.length === 0) { e.preventDefault(); return; }
      const first = f[0], last = f[f.length - 1];
      const active = document.activeElement;
      if (!sheet.contains(active)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      const i = __modalStack.indexOf(token);
      if (i !== -1) __modalStack.splice(i, 1);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Restore focus to whatever triggered the sheet when it closes. Split from the
  // Esc/Tab effect (which re-runs when onClose changes) so focus isn't yanked
  // back mid-open — this runs only when `open` actually toggles.
  React.useEffect(() => {
    if (!open) return;
    const prevFocus = typeof document !== 'undefined' ? document.activeElement : null;
    return () => {
      try { if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus(); } catch { /* noop */ }
    };
  }, [open]);

  if (!open) return null;

  const onPointerDown = (e) => {
    if (!sheetRef.current) return;
    dragRef.current.startY = e.clientY;
    dragRef.current.dragging = true;
    dragRef.current.offset = 0;
    sheetRef.current.style.transition = 'none';
    try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch {}
  };

  const onPointerMove = (e) => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    const delta = e.clientY - dragRef.current.startY;
    if (delta <= 0) {
      dragRef.current.offset = 0;
      sheetRef.current.style.transform = 'translateY(0)';
      return;
    }
    dragRef.current.offset = delta;
    sheetRef.current.style.transform = `translateY(${delta}px)`;
  };

  const endDrag = (e) => {
    if (!dragRef.current.dragging || !sheetRef.current) return;
    dragRef.current.dragging = false;
    const offset = dragRef.current.offset;
    const sheet = sheetRef.current;
    sheet.style.transition = 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1)';
    try { e.currentTarget.releasePointerCapture?.(e.pointerId); } catch {}
    if (offset > 110) {
      const rect = sheet.getBoundingClientRect();
      sheet.style.transform = `translateY(${rect.height}px)`;
      window.setTimeout(onClose, 250);
    } else {
      sheet.style.transform = 'translateY(0)';
    }
  };

  return (
    <div className="sheet-overlay" onClick={onClose}>
      <div
        className={'sheet' + (compact ? ' sheet-compact' : '')}
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
      >
        <div
          className="sheet-grab"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <span className="sheet-grab-bar" />
        </div>
        <div className="sheet-hd">
          <h3>{title}</h3>
          {/* Cancel button remains for accessibility / non-touch dismiss */}
          <button className="close" onClick={onClose}>Cancel</button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

