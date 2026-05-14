import React from 'react';
import { supabase } from '../lib/supabase';

const COLORS = [
  { id: 'coral', hex: '#E27457', label: 'Coral' },
  { id: 'blue',  hex: '#4A78B5', label: 'Blue'  },
  { id: 'green', hex: '#5C9B6F', label: 'Green' },
  { id: 'amber', hex: '#B8862E', label: 'Amber' },
  { id: 'plum',  hex: '#8861A8', label: 'Plum'  },
  { id: 'teal',  hex: '#3E8E8A', label: 'Teal'  },
  { id: 'rose',  hex: '#C6577E', label: 'Rose'  },
  { id: 'moss',  hex: '#5C7A37', label: 'Moss'  },
];

export function AuthScreen({ initialStep = 'login', onComplete }) {
  const [step, setStep] = React.useState(initialStep);

  if (step === 'group-setup') {
    return <GroupSetupScreen onComplete={onComplete} />;
  }

  return (
    <div className="fb-screen">
      <div className="fb-scroll">
        <div className="auth-wrap">
          <div className="auth-mark">
            <div className="marklogo" />
            <h1>Family<em>board</em>.</h1>
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
      <div className="auth-foot">FamilyBoard v1.0</div>
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

function GroupSetupScreen({ onComplete }) {
  const [mode, setMode] = React.useState(null);
  const [groupName, setGroupName] = React.useState('');
  const [inviteCode, setInviteCode] = React.useState('');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [created, setCreated] = React.useState(null);

  const createGroup = async () => {
    if (!groupName.trim()) { setErr('Enter a group name'); return; }
    setLoading(true);
    setErr('');

    const { data: { user } } = await supabase.auth.getUser();
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { data: group, error: gErr } = await supabase
      .from('groups').insert({ name: groupName.trim(), invite_code: code }).select().single();

    if (gErr) { setErr(gErr.message); setLoading(false); return; }

    const { error: pErr } = await supabase.from('profiles').update({ group_id: group.id }).eq('id', user.id);
    if (pErr) { setErr(pErr.message); setLoading(false); return; }

    setCreated({ name: groupName.trim(), code });
    setLoading(false);
  };

  const joinGroup = async () => {
    if (!inviteCode.trim()) { setErr('Enter an invite code'); return; }
    setLoading(true);
    setErr('');

    const { data: { user } } = await supabase.auth.getUser();
    const { data: group, error: gErr } = await supabase
      .from('groups').select('id, name').eq('invite_code', inviteCode.trim().toUpperCase()).single();

    if (gErr || !group) { setErr('Invalid invite code — check with your group admin'); setLoading(false); return; }

    const { error: pErr } = await supabase.from('profiles').update({ group_id: group.id }).eq('id', user.id);
    if (pErr) { setErr(pErr.message); setLoading(false); return; }

    setLoading(false);
    onComplete();
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
              <button className="fb-btn solid" onClick={onComplete}>Continue to app →</button>
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

          <div className="auth-foot" style={{ marginTop: 24 }}>FamilyBoard v1.0</div>
        </div>
      </div>
    </div>
  );
}
