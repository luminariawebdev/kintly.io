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

export function AuthScreen({ initialStep = 'login', onComplete, onGroupReady }) {
  const [step, setStep] = React.useState(initialStep);

  if (step === 'group-setup') {
    return <GroupSetupScreen onGroupReady={onGroupReady} />;
  }

  return (
    <div className="fb-screen">
      <div className="fb-scroll">
        <div className="auth-wrap">
          <div className="auth-mark">
            <div className="marklogo" />
            <h1>kinnekt.</h1>
            <p>// Shared tasks, plans &amp; notes for your people</p>
          </div>

          <div className="fb-chips" style={{ marginBottom: 20 }}>
            <button className={'fb-chip' + (step === 'login' ? ' on' : '')} onClick={() => setStep('login')}>Sign in</button>
            <button className={'fb-chip' + (step === 'signup' ? ' on' : '')} onClick={() => setStep('signup')}>Create account</button>
          </div>

          {step === 'login'
            ? <LoginForm onComplete={onComplete} />
            : <SignupForm onComplete={() => setStep('group-setup')} />
          }
        </div>
      </div>
    </div>
  );
}

function LoginForm({ onComplete }) {
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const submit = async () => {
    if (!email || !pw) { setErr('Please fill in all fields'); return; }
    setLoading(true);
    setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) { setErr(error.message); setLoading(false); }
    else onComplete();
  };

  return (
    <>
      <div className="field">
        <label>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" onKeyDown={e => e.key === 'Enter' && submit()} />
      </div>
      <div className={'field' + (err ? ' err' : '')}>
        <label>Password</label>
        <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(''); }} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && submit()} />
        {err && <div className="err-msg">{err}</div>}
      </div>
      <div className="auth-actions">
        <button className="fb-btn solid" onClick={submit} disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
      </div>
      <div className="auth-foot">kinnekt v1.0</div>
    </>
  );
}

function SignupForm({ onComplete }) {
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [color, setColor] = React.useState('coral');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const submit = async () => {
    if (!name || !email || !pw) { setErr('Please fill in all fields'); return; }
    if (pw.length < 6) { setErr('Password must be at least 6 characters'); return; }
    setLoading(true);
    setErr('');

    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: { data: { display_name: name, color } },
    });

    if (error) { setErr(error.message); setLoading(false); return; }

    // Ensure profile exists (trigger may be slightly delayed)
    if (data.user) {
      await new Promise(r => setTimeout(r, 800));
      const { data: existing } = await supabase.from('profiles').select('id').eq('id', data.user.id).single();
      if (!existing) {
        await supabase.from('profiles').insert({ id: data.user.id, display_name: name, color });
      }
    }

    setLoading(false);
    onComplete();
  };

  return (
    <>
      <div className="field">
        <label>Your name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="First name or nickname" />
        <div style={{
          fontSize: 11,
          fontStyle: 'italic',
          color: 'var(--kinnekt-coral)',
          marginTop: 6,
          letterSpacing: '0.01em',
        }}>
          ⚠ This name is final and cannot be changed.
        </div>
      </div>
      <div className="field">
        <label>Your color</label>
        <div className="swatches" style={{ paddingTop: 6 }}>
          {COLORS.map(c => (
            <span key={c.id} className={'swatch' + (color === c.id ? ' on' : '')} style={{ '--c': c.hex }} onClick={() => setColor(c.id)} title={c.label} />
          ))}
        </div>
      </div>
      <div className="field">
        <label>Email</label>
        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <div className={'field' + (err ? ' err' : '')}>
        <label>Password</label>
        <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(''); }} placeholder="At least 6 characters" onKeyDown={e => e.key === 'Enter' && submit()} />
        {err && <div className="err-msg">{err}</div>}
      </div>
      <div className="auth-actions">
        <button className="fb-btn solid" onClick={submit} disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</button>
      </div>
    </>
  );
}

function GroupSetupScreen({ onGroupReady }) {
  const [mode, setMode] = React.useState(null);
  const [groupName, setGroupName] = React.useState('');
  const [inviteCode, setInviteCode] = React.useState('');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [created, setCreated] = React.useState(null); // { name, code, fullProfile }

  const assignGroup = async (user, groupId) => {
    // Read current profile so we have display_name + color for the fallback upsert
    const { data: current } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();

    // First try: standard update, asking the server to return the row
    const { data: updated, error: upErr } = await supabase
      .from('profiles')
      .update({ group_id: groupId })
      .eq('id', user.id)
      .select();

    if (!upErr && updated && updated.length > 0 && updated[0].group_id === groupId) {
      return updated[0];
    }

    // Fallback: upsert with all required fields. The INSERT policy permits
    // id = auth.uid(), the UPDATE policy permits the same — this combines both.
    const { data: upserted, error: usErr } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        display_name: current?.display_name || user.user_metadata?.display_name || user.email?.split('@')[0] || 'User',
        color: current?.color || user.user_metadata?.color || 'coral',
        group_id: groupId,
      }, { onConflict: 'id' })
      .select();

    if (usErr) {
      throw new Error(`Could not save group membership: ${usErr.message}`);
    }
    if (!upserted || upserted.length === 0 || upserted[0].group_id !== groupId) {
      throw new Error('Profile update returned no rows — RLS may be blocking the update.');
    }
    return upserted[0];
  };

  const createGroup = async () => {
    if (!groupName.trim()) { setErr('Enter a group name'); return; }
    setLoading(true);
    setErr('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();

      const { data: group, error: gErr } = await supabase
        .from('groups').insert({ name: groupName.trim(), invite_code: code }).select().single();
      if (gErr) throw new Error(gErr.message);

      await assignGroup(user, group.id);

      setCreated({ name: groupName.trim(), code });
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  const joinGroup = async () => {
    if (!inviteCode.trim()) { setErr('Enter an invite code'); return; }
    setLoading(true);
    setErr('');

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const { data: group, error: gErr } = await supabase
        .from('groups').select('id, name, invite_code').eq('invite_code', inviteCode.trim().toUpperCase()).single();
      if (gErr || !group) throw new Error('Invalid invite code — check with your group admin');

      await assignGroup(user, group.id);

      window.location.reload();
    } catch (e) {
      setErr(e.message);
      setLoading(false);
    }
  };

  if (created) {
    return (
      <div className="fb-screen">
        <div className="fb-scroll">
          <div className="auth-wrap" style={{ paddingTop: 60 }}>
            <div className="join-card">
              <div className="inv-from">Group created!</div>
              <h2>{created.name}</h2>
              <div className="gmeta">Share this code to invite family members</div>
              <div className="join-token" style={{ marginTop: 16 }}>
                invite code <span className="mono" style={{ fontSize: 28, letterSpacing: '0.12em' }}>{created.code}</span>
              </div>
            </div>
            <div className="auth-actions">
              <button className="fb-btn solid" onClick={() => window.location.reload()}>
                Continue to app →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fb-screen">
      <div className="fb-scroll">
        <div className="auth-wrap" style={{ paddingTop: 50 }}>
          <div className="auth-mark" style={{ marginBottom: 24 }}>
            <h1>Your <em>group</em></h1>
            <p>Create a new family group or join one with an invite code</p>
          </div>

          {!mode && (
            <div className="auth-actions">
              <button className="fb-btn solid" onClick={() => setMode('create')}>Create a group</button>
              <button className="fb-btn" onClick={() => setMode('join')}>Join with invite code</button>
            </div>
          )}

          {mode === 'create' && (
            <>
              <div className={'field' + (err ? ' err' : '')}>
                <label>Group name</label>
                <input autoFocus value={groupName} onChange={e => { setGroupName(e.target.value); setErr(''); }} placeholder="e.g. The Park Family" onKeyDown={e => e.key === 'Enter' && createGroup()} />
                {err && <div className="err-msg">{err}</div>}
              </div>
              <div className="auth-actions">
                <button className="fb-btn solid" onClick={createGroup} disabled={loading}>{loading ? 'Creating…' : 'Create group'}</button>
                <button className="fb-link" onClick={() => { setMode(null); setErr(''); }}>Back</button>
              </div>
            </>
          )}

          {mode === 'join' && (
            <>
              <div className={'field' + (err ? ' err' : '')}>
                <label>Invite code</label>
                <input autoFocus value={inviteCode} onChange={e => { setInviteCode(e.target.value.toUpperCase()); setErr(''); }} placeholder="e.g. AB3X9K" style={{ textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'JetBrains Mono, monospace' }} onKeyDown={e => e.key === 'Enter' && joinGroup()} />
                {err && <div className="err-msg">{err}</div>}
              </div>
              <div className="auth-actions">
                <button className="fb-btn solid" onClick={joinGroup} disabled={loading}>{loading ? 'Joining…' : 'Join group'}</button>
                <button className="fb-link" onClick={() => { setMode(null); setErr(''); }}>Back</button>
              </div>
            </>
          )}

          <div className="auth-foot" style={{ marginTop: 24 }}>kinnekt v1.0</div>
        </div>
      </div>
    </div>
  );
}
