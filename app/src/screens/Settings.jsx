import React from 'react';
import { supabase } from '../lib/supabase';

const COLORS = [
  { id: 'coral',       hex: '#FF9F8A', label: 'Coral' },
  { id: 'peach',       hex: '#FFC18C', label: 'Peach' },
  { id: 'amber',       hex: '#FFD787', label: 'Apricot' },
  { id: 'lemon',       hex: '#F0E68C', label: 'Lemon' },
  { id: 'moss',        hex: '#C8D685', label: 'Chartreuse' },
  { id: 'green',       hex: '#98D4A8', label: 'Mint' },
  { id: 'teal',        hex: '#7FCDC1', label: 'Turquoise' },
  { id: 'blue',        hex: '#87BDE8', label: 'Sky' },
  { id: 'periwinkle',  hex: '#A8AEE5', label: 'Periwinkle' },
  { id: 'plum',        hex: '#BFA0E5', label: 'Lavender' },
  { id: 'lilac',       hex: '#DAAEDA', label: 'Lilac' },
  { id: 'rose',        hex: '#F2A4C2', label: 'Rose' },
];

export function SettingsScreen({ profile, onBack, onProfileUpdate, onSignOut }) {
  const [name, setName] = React.useState(profile?.display_name ?? '');
  const [color, setColor] = React.useState(profile?.color ?? 'coral');
  const [showSw, setShowSw] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [nameErr, setNameErr] = React.useState('');

  const me = COLORS.find(c => c.id === color) ?? COLORS[0];
  const group = profile?.group;

  const saveName = async () => {
    if (!name.trim()) { setNameErr('Name cannot be empty'); return; }
    if (name.trim() === profile?.display_name) return;
    setSaving(true);
    setNameErr('');
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim() })
      .eq('id', profile.id);
    setSaving(false);
    if (error) { setNameErr(error.message); } else { onProfileUpdate(); }
  };

  const saveColor = async (newColor) => {
    setColor(newColor);
    setShowSw(false);
    await supabase.from('profiles').update({ color: newColor }).eq('id', profile.id);
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

          <div className="fb-sec-label" style={{ marginBottom: 8 }}>Profile</div>
          <div className="set-group">
            <div className="set-row" style={{ display: 'block' }}>
              <span className="lbl">Display name</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  value={name}
                  onChange={e => { setName(e.target.value); setNameErr(''); }}
                  onBlur={saveName}
                  onKeyDown={e => e.key === 'Enter' && e.target.blur()}
                  style={{
                    border: 0, background: 'transparent',
                    font: 'inherit', fontSize: 16, fontWeight: 600,
                    color: 'var(--ink)', flex: 1, padding: 0, outline: 'none',
                  }}
                />
                {saving && <span style={{ fontSize: 11, opacity: 0.4 }}>saving…</span>}
              </div>
              {nameErr && <div className="err-msg" style={{ marginTop: 4 }}>{nameErr}</div>}
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
                <div className="swatches" style={{ paddingTop: 10 }}>
                  {COLORS.map(c => (
                    <span
                      key={c.id}
                      className={'swatch' + (c.id === color ? ' on' : '')}
                      style={{ '--c': c.hex }}
                      onClick={e => { e.stopPropagation(); saveColor(c.id); }}
                      title={c.label}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="fb-sec-label" style={{ marginBottom: 8 }}>Group</div>
          <div className="set-group">
            {group ? (
              <>
                <div className="set-row" style={{ display: 'block' }}>
                  <span className="lbl">Group name</span>
                  <span className="val" style={{ fontWeight: 600 }}>{group.name}</span>
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

          <div className="fb-sec-label" style={{ marginBottom: 8 }}>Account</div>
          <div className="set-group">
            <div className="set-row danger" style={{ cursor: 'pointer' }} onClick={signOut}>
              <span className="val">Sign out</span>
              <span className="car">›</span>
            </div>
          </div>

          <div className="auth-foot" style={{ marginTop: 22 }}>kinnekt v1.0</div>
        </div>
      </div>
    </div>
  );
}
