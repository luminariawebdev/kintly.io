import React from 'react';
import { supabase } from '../lib/supabase';
import { ThemeContext } from '../App';
import { KinnektLogo, EmojiInput } from '../Components';
import { PALETTE as COLORS } from '../lib/colors';

export function SettingsScreen({ profile, onBack, onProfileUpdate, onSignOut }) {
  const theme = React.useContext(ThemeContext);
  const [color, setColor] = React.useState(profile?.color ?? 'coral');
  const [showSw, setShowSw] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [saveErr, setSaveErr] = React.useState('');
  const [avatar, setAvatar] = React.useState(profile?.avatar ?? '');
  const [avatarPickerOpen, setAvatarPickerOpen] = React.useState(false);
  const [avatarMode, setAvatarMode] = React.useState('main'); // 'main' | 'emoji'
  const [confirmSignOut, setConfirmSignOut] = React.useState(false);
  const [groupMenuOpen, setGroupMenuOpen] = React.useState(false);
  const [memberColors, setMemberColors] = React.useState({}); // { colorId: displayName }
  const [members, setMembers] = React.useState([]); // full group roster
  const groupMenuRef = React.useRef(null);
  const fileInputRef = React.useRef(null);

  // Load the full group roster — powers the Members list below, plus the
  // "color already taken" map on the swatch picker (which excludes self).
  React.useEffect(() => {
    if (!profile?.group_id) return;
    let cancelled = false;
    const applyRows = (rows) => {
      if (cancelled || !rows) return;
      setMembers(rows);
      const map = {};
      rows.forEach(m => {
        if (m.id !== profile.id && m.color) map[m.color] = m.display_name || 'Someone';
      });
      setMemberColors(map);
    };
    (async () => {
      let { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, color, avatar, created_at')
        .eq('group_id', profile.group_id)
        .order('created_at', { ascending: true });
      // Fall back if the avatar column hasn't been migrated yet.
      if (error && /avatar/i.test(error.message || '')) {
        ({ data } = await supabase
          .from('profiles')
          .select('id, display_name, color, created_at')
          .eq('group_id', profile.group_id)
          .order('created_at', { ascending: true }));
      }
      applyRows(data);
    })();
    return () => { cancelled = true; };
  }, [profile?.group_id, profile?.id]);

  React.useEffect(() => {
    if (!groupMenuOpen) return;
    const onDocClick = (e) => {
      if (!groupMenuRef.current) return;
      if (!groupMenuRef.current.contains(e.target)) setGroupMenuOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [groupMenuOpen]);

  const me = COLORS.find(c => c.id === color) ?? COLORS[0];
  const group = profile?.group;

  // Local-only setters — no DB writes until the user clicks Save below.
  const saveColor = (newColor) => { setColor(newColor); setShowSw(false); };
  const saveAvatar = (next) => { setAvatar(next || ''); };

  const dirty = (
    color !== (profile?.color ?? 'coral') ||
    avatar !== (profile?.avatar ?? '')
  );

  const saveProfile = async () => {
    if (!dirty) return;
    setSaving(true);
    setSaveErr('');
    let payload = { color, avatar: avatar || null };
    let { error } = await supabase.from('profiles').update(payload).eq('id', profile.id);
    // Fallback if avatar column hasn't been migrated yet
    if (error && /avatar/i.test(error.message || '')) {
      const { avatar: _a, ...rest } = payload;
      ({ error } = await supabase.from('profiles').update(rest).eq('id', profile.id));
      if (!error) {
        alert('Saved color — avatar column missing.\nRun:\n\nalter table public.profiles add column if not exists avatar text;');
      }
    }
    setSaving(false);
    if (error) { setSaveErr(error.message); return; }
    onProfileUpdate();
  };

  const copyCode = async () => {
    if (!group?.invite_code) return;
    try {
      await navigator.clipboard.writeText(group.invite_code);
    } catch {
      // fallback for environments without clipboard API
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pickEmoji = (emoji) => {
    saveAvatar(emoji);
    setAvatarPickerOpen(false);
    setAvatarMode('main');
  };

  const onPickPhoto = async (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - min) / 2;
        const sy = (img.naturalHeight - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        saveAvatar(dataUrl);
        setAvatarPickerOpen(false);
        setAvatarMode('main');
      };
      img.onerror = () => alert('Could not load that image — try another file.');
      img.src = reader.result;
    };
    reader.onerror = () => alert('Could not read the file.');
    reader.readAsDataURL(file);
  };

  const removeAvatar = () => {
    saveAvatar('');
    setAvatarPickerOpen(false);
    setAvatarMode('main');
  };

  const PRESET_EMOJIS = [
    '😀', '😎', '🥰', '🤓', '🥳', '🤩', '🥹', '😴',
    '🦊', '🐻', '🐼', '🦁', '🐯', '🐰', '🐶', '🐱',
    '🦄', '🐸', '🦋', '🌟', '☀️', '🌈', '🌸', '🌻',
    '🍕', '☕', '🍎', '🧁', '⚽', '🎸', '📚', '🚀',
  ];

  const avatarIsImage = typeof avatar === 'string' && (avatar.startsWith('data:image') || /^https?:\/\//.test(avatar));

  const signOut = async () => {
    await supabase.auth.signOut();
    onSignOut();
  };

  return (
    <div className="fb-screen">
      <div className="fb-scroll">
        <div className="fb-stickyhead">
          <div className="fb-stickyhead-row">
            <button className="fb-link" style={{ justifySelf: 'start', textDecoration: 'none' }} onClick={onBack}>‹ Back</button>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Settings</div>
            <span />
          </div>
        </div>

        <div style={{ padding: '22px 16px 40px' }}>

          {/* App brand — moved here from the Main sticky header so the
              top of the home screen stays tight. Logo + wordmark stacked
              over a small tagline. */}
          <div className="settings-brand">
            <KinnektLogo size={64} />
            <span className="settings-brand-name">Kinnekt</span>
            <span className="settings-brand-tag">Connecting families</span>
          </div>

          <div className="fb-sec-label" style={{ marginBottom: 8 }}>Profile</div>
          <div className="set-group">
            <div className="set-row" style={{ display: 'block' }}>
              <span className="lbl">Display name</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink)', flex: 1 }}>
                  {profile?.display_name}
                </span>
                <span aria-hidden="true" title="Display name is set at signup and cannot be changed" style={{ fontSize: 13, color: 'var(--text-muted)' }}>🔒</span>
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Set at signup — cannot be changed.
              </div>
            </div>

            <div className="set-row" style={{ display: 'block' }}>
              <span className="lbl">Avatar</span>
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
                <button
                  className="avatar-circle"
                  onClick={() => { setAvatarMode('main'); setAvatarPickerOpen(true); }}
                  style={{
                    width: 84, height: 84, borderRadius: '50%',
                    background: avatarIsImage ? `center / cover no-repeat url(${avatar})` : (me.hex),
                    border: '3px solid rgba(255, 255, 255, 0.9)',
                    boxShadow: '0 6px 18px rgba(15, 30, 60, 0.16)',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 72, lineHeight: 1,
                    color: 'var(--ink)',
                    cursor: 'pointer',
                    transition: 'transform 0.2s var(--ease), box-shadow 0.2s var(--ease)',
                    padding: 0,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.04)'; e.currentTarget.style.boxShadow = '0 10px 24px rgba(106, 77, 255, 0.25)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 6px 18px rgba(15, 30, 60, 0.16)'; }}
                  title="Change avatar"
                >
                  {!avatarIsImage && (avatar || (profile?.display_name || '?')[0].toUpperCase())}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={e => { onPickPhoto(e.target.files?.[0]); e.target.value = ''; }}
                />
              </div>
            </div>

            <div className="set-row" onClick={() => setShowSw(s => !s)} style={{ display: 'block', cursor: 'pointer' }}>
              <span className="lbl">Your color</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="dot xl" style={{ '--c': me.hex }} />
                  <span className="val">{me.label}</span>
                </div>
                <span className="car">{showSw ? '▴' : '▾'}</span>
              </div>
              {showSw && (
                <div className="swatches" style={{ paddingTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {COLORS.map(c => {
                    const takenBy = memberColors[c.id];
                    const isMine = c.id === color;
                    const disabled = !!takenBy;
                    return (
                      <div
                        key={c.id}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: disabled ? 'not-allowed' : 'pointer' }}
                        onClick={e => { e.stopPropagation(); if (!disabled) saveColor(c.id); }}
                        title={disabled ? `Chosen by ${takenBy}` : c.label}
                      >
                        <div style={{ position: 'relative', display: 'inline-flex' }}>
                          <span
                            className={'swatch' + (isMine ? ' on' : '')}
                            style={{ '--c': c.hex, pointerEvents: 'none' }}
                          />
                          {disabled && (
                            <svg
                              viewBox="0 0 28 28"
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
                            >
                              <circle cx="14" cy="14" r="12" fill="none" stroke="rgba(80,80,80,0.85)" strokeWidth="2.5" />
                              <line x1="5" y1="5" x2="23" y2="23" stroke="rgba(80,80,80,0.85)" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                          )}
                        </div>
                        <span style={{ fontSize: 10, fontWeight: isMine ? 700 : 500, color: disabled ? 'var(--text-muted)' : 'var(--ink)', textAlign: 'center', lineHeight: 1.2, maxWidth: 48 }}>
                          {c.label}
                        </span>
                        {disabled && (
                          <span style={{ fontSize: 8.5, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.1, maxWidth: 48 }}>
                            {takenBy}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, margin: '-4px 0 6px' }}>
            <span style={{
              fontSize: 11,
              color: saveErr ? 'var(--kinnekt-coral)' : (dirty ? 'var(--kinnekt-purple)' : 'var(--text-muted)'),
              fontStyle: 'italic',
            }}>
              {saving ? 'Saving…' : (saveErr ? saveErr : (dirty ? 'Unsaved changes' : 'All changes saved'))}
            </span>
            <button
              className="fb-btn solid"
              onClick={saveProfile}
              disabled={!dirty || saving}
              style={{
                width: 'auto', padding: '10px 22px', fontSize: 13,
                opacity: (!dirty || saving) ? 0.45 : 1,
                cursor: (!dirty || saving) ? 'not-allowed' : 'pointer',
              }}
            >{saving ? 'Saving…' : 'Save'}</button>
          </div>
          <div style={{ height: 16 }} />

          <div className="fb-sec-label" style={{ marginBottom: 8 }}>Group</div>
          <div className="set-group">
            {group ? (
              <>
                <div
                  className="set-row"
                  ref={groupMenuRef}
                  style={{ display: 'block', cursor: 'pointer', position: 'relative' }}
                  onClick={() => setGroupMenuOpen(o => !o)}
                >
                  <span className="lbl">Group</span>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <span className="val" style={{ fontWeight: 600 }}>{group.name}</span>
                    <span className="car">{groupMenuOpen ? '▴' : '▾'}</span>
                  </div>
                  {groupMenuOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute',
                        top: 'calc(100% - 4px)',
                        left: 14, right: 14,
                        background: 'var(--surface-glass-strong)',
                        backdropFilter: 'blur(22px)',
                        WebkitBackdropFilter: 'blur(22px)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: 'var(--r-lg)',
                        boxShadow: 'var(--shadow-large)',
                        padding: '8px 0',
                        zIndex: 50,
                      }}
                    >
                      <div style={{
                        padding: '8px 14px 6px',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.14em',
                        color: 'var(--text-muted)',
                      }}>Your groups</div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '12px 14px',
                        fontSize: 14,
                      }}>
                        <span className="dot" style={{ '--c': me.hex, width: 12, height: 12 }} />
                        <span style={{ flex: 1, fontWeight: 600 }}>{group.name}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>current</span>
                      </div>
                      <div style={{
                        padding: '12px 14px 14px',
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        fontStyle: 'italic',
                        borderTop: '1px solid var(--border-soft)',
                        marginTop: 4,
                      }}>
                        No other groups available
                      </div>
                    </div>
                  )}
                </div>
                <div className="set-row" style={{ display: 'block' }}>
                  <span className="lbl">Members{members.length ? ` · ${members.length}` : ''}</span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
                    {members.length === 0 ? (
                      <span style={{ fontSize: 13, color: 'var(--text-muted)', fontStyle: 'italic' }}>Loading…</span>
                    ) : members.map(m => {
                      const mh = COLORS.find(c => c.id === m.color)?.hex || '#9aa0a6';
                      const isImg = typeof m.avatar === 'string' && (m.avatar.startsWith('data:image') || /^https?:\/\//.test(m.avatar));
                      const isMe = m.id === profile?.id;
                      return (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <span
                            aria-hidden="true"
                            style={{
                              width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                              background: isImg ? `center / cover no-repeat url(${m.avatar})` : mh,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: m.avatar && !isImg ? 19 : 14, fontWeight: 700,
                              color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.35)',
                              border: '2px solid var(--surface-glass-strong)',
                              boxShadow: '0 2px 6px rgba(15,30,60,0.14)',
                            }}
                          >
                            {!isImg && (m.avatar || (m.display_name || '?')[0].toUpperCase())}
                          </span>
                          <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--ink)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.display_name}
                          </span>
                          {isMe && (
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>you</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="set-row" style={{ alignItems: 'center' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span className="lbl">Invite code</span>
                    <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 20, letterSpacing: '0.12em', fontWeight: 600, marginTop: 2 }}>
                      {group.invite_code}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.5, marginTop: 2 }}>Share this code to invite family members</div>
                  </div>
                  <button className="copy-btn" onClick={copyCode}>
                    {copied ? '✓ copied' : 'copy'}
                  </button>
                </div>
              </>
            ) : (
              <div className="set-row">
                <span className="val" style={{ opacity: 0.5 }}>Not in a group</span>
              </div>
            )}
          </div>

          <div className="fb-sec-label" style={{ marginBottom: 8 }}>Display</div>
          <div className="set-group">
            <div className="set-row" style={{ display: 'block' }}>
              <span className="lbl">Theme</span>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                {[
                  { id: 'light', label: 'Light', icon: '☀' },
                  { id: 'dark',  label: 'Dark',  icon: '☾' },
                  { id: 'auto',  label: 'Auto',  icon: '⌁' },
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => theme.setPref(opt.id)}
                    className={'fb-chip' + (theme.pref === opt.id ? ' on' : '')}
                    style={{ flex: 1, padding: '8px 10px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                  >
                    <span style={{ fontSize: 14, lineHeight: 1 }}>{opt.icon}</span>
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
              {theme.pref === 'auto' && (
                <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Currently {theme.resolved} — follows your system settings.
                </div>
              )}
            </div>
          </div>

          <div className="fb-sec-label" style={{ marginBottom: 8 }}>Account</div>
          <div className="set-group">
            <div className="set-row danger" style={{ cursor: 'pointer', justifyContent: 'center' }} onClick={() => setConfirmSignOut(true)}>
              <span className="val" style={{ fontWeight: 600 }}>Sign out</span>
            </div>
          </div>

          <div className="auth-foot" style={{ marginTop: 22 }}>kinnekt v1.0</div>
        </div>

        {avatarPickerOpen && (
          <div
            className="sheet-overlay"
            onClick={() => { setAvatarPickerOpen(false); setAvatarMode('main'); }}
          >
            <div
              className="sheet"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 380, alignSelf: 'center', margin: 'auto 0', maxHeight: 'none', minHeight: 'auto' }}
            >
              <div className="sheet-hd">
                <h3>{avatarMode === 'emoji' ? 'Pick an emoji' : 'Change avatar'}</h3>
                <button
                  className="close"
                  onClick={() => { setAvatarPickerOpen(false); setAvatarMode('main'); }}
                >Cancel</button>
              </div>

              <div className="sheet-body">
                {avatarMode === 'main' && (
                  <div style={{ display: 'flex', gap: 14, marginTop: 4 }}>
                    <button
                      onClick={() => setAvatarMode('emoji')}
                      style={{
                        flex: 1,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        padding: '22px 12px',
                        background: 'var(--surface-glass)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: 'var(--r-lg)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        boxShadow: 'var(--shadow-soft)',
                        transition: 'all 0.25s var(--ease)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-tint)'; e.currentTarget.style.borderColor = 'var(--hover-border)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-medium)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-glass)'; e.currentTarget.style.borderColor = 'var(--border-glass)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-soft)'; }}
                    >
                      <span style={{ fontSize: 40, lineHeight: 1 }} aria-hidden="true">😀</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Emoji</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        flex: 1,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                        padding: '22px 12px',
                        background: 'var(--surface-glass)',
                        border: '1px solid var(--border-glass)',
                        borderRadius: 'var(--r-lg)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        boxShadow: 'var(--shadow-soft)',
                        transition: 'all 0.25s var(--ease)',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover-tint)'; e.currentTarget.style.borderColor = 'var(--hover-border)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = 'var(--shadow-medium)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-glass)'; e.currentTarget.style.borderColor = 'var(--border-glass)'; e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'var(--shadow-soft)'; }}
                    >
                      <span style={{ fontSize: 40, lineHeight: 1 }} aria-hidden="true">📷</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Photo</span>
                    </button>
                  </div>
                )}

                {avatarMode === 'emoji' && (
                  <div>
                    {/* Open-ended emoji picker — typing in the input
                        accepts any emoji from the OS keyboard (iOS 🌐
                        globe key, macOS Cmd+Ctrl+Space, etc.). PRESET
                        grid below is just one-tap shortcuts. Selection
                        also closes the sheet via pickEmoji(). */}
                    <EmojiInput
                      value={avatar && !avatarIsImage ? avatar : ''}
                      onChange={pickEmoji}
                      presets={PRESET_EMOJIS}
                    />
                    <button
                      onClick={() => setAvatarMode('main')}
                      className="fb-btn"
                      style={{ width: '100%', marginTop: 12 }}
                    >‹ Back</button>
                  </div>
                )}
              </div>

              {avatar && avatarMode === 'main' && (
                <div className="sheet-foot">
                  <button onClick={removeAvatar} className="danger-btn" style={{ width: '100%' }}>
                    Remove avatar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {confirmSignOut && (
          <div className="sheet-overlay" onClick={() => setConfirmSignOut(false)}>
            <div
              className="sheet"
              onClick={e => e.stopPropagation()}
              style={{ maxWidth: 380, alignSelf: 'center', margin: 'auto 0', maxHeight: 'none', minHeight: 'auto' }}
            >
              <div className="sheet-hd">
                <h3>Sign out?</h3>
              </div>
              <div className="sheet-body">
                <div style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  You'll be signed out of <strong>Kinnekt</strong> on this device.
                  You can sign back in any time with your email and password.
                </div>
              </div>
              <div className="sheet-foot">
                <button className="danger-btn" style={{ width: '100%' }} onClick={signOut}>Sign out</button>
                <button className="fb-btn" onClick={() => setConfirmSignOut(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
