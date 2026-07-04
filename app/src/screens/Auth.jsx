import React from 'react';
import { supabase } from '../lib/supabase';
import { PALETTE } from '../lib/colors';
import { VERSION_LABEL } from '../lib/build';
import { EmojiInput, KinnektLogo } from '../Components';

export function AuthScreen({ initialStep = 'login', profile, onComplete, onGroupReady, onEnterSpace }) {
  const [step, setStep] = React.useState(initialStep);

  // Safety net: if the parent moves us to the group picker (e.g. after a
  // successful sign-in with 2+ groups) while this component instance is reused,
  // React would keep the stale internal step and leave the login form on screen
  // ("Signing in…" forever). Sync to the requested step. (The key={screen} on
  // the parent already forces a remount; this is belt-and-suspenders.)
  React.useEffect(() => {
    if (initialStep === 'group-setup') setStep('group-setup');
  }, [initialStep]);

  if (step === 'group-setup') {
    return <GroupSetupScreen profile={profile} onGroupReady={onGroupReady} onEnterSpace={onEnterSpace} />;
  }

  return (
    <div className="fb-screen">
      <div className="fb-scroll">
        <div className="auth-wrap">
          <div className="auth-mark">
            <div style={{ marginBottom: 18 }}><KinnektLogo size={64} /></div>
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
  // 'login' = email + password sign-in. 'reset' = email-only recovery
  // request (password field hidden, primary button sends the link).
  const [mode, setMode] = React.useState('login');
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [resetSent, setResetSent] = React.useState(false);
  const emailRef = React.useRef(null);
  const isReset = mode === 'reset';

  const submit = async () => {
    if (!email || !pw) { setErr('Please fill in all fields'); return; }
    setLoading(true);
    setErr('');
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) { setErr(error.message); setLoading(false); return; }
      onComplete(data?.user?.id);
    } catch {
      // A thrown rejection (network drop) — not a returned { error } — would
      // otherwise leave the button stuck on "Signing in…" forever.
      setErr('Network error — check your connection and try again.');
      setLoading(false);
    }
  };

  // Sends the Supabase recovery email. The link lands back on the app,
  // which fires a PASSWORD_RECOVERY auth event — App.jsx routes that to
  // the ResetPasswordScreen.
  const sendReset = async () => {
    if (loading || resetSent) return;
    setErr('');
    if (!email) { setErr('Enter your email above first.'); emailRef.current?.focus(); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
      });
      setLoading(false);
      if (error) { setErr(error.message); return; }
      setResetSent(true);
    } catch {
      setLoading(false);
      setErr('Network error — check your connection and try again.');
    }
  };

  const goReset = () => {
    setMode('reset'); setErr(''); setResetSent(false);
    setTimeout(() => emailRef.current?.focus(), 0);
  };
  const goLogin = () => { setMode('login'); setErr(''); setResetSent(false); };

  return (
    <>
      <div className={'field' + (err && isReset ? ' err' : '')}>
        <label>Email</label>
        <input
          ref={emailRef}
          type="email"
          value={email}
          onChange={e => { setEmail(e.target.value); setErr(''); }}
          placeholder="you@example.com"
          onKeyDown={e => e.key === 'Enter' && (isReset ? sendReset() : submit())}
        />
        {isReset && err && <div className="err-msg">{err}</div>}
      </div>

      {!isReset && (
        <div className={'field' + (err ? ' err' : '')}>
          <label>Password</label>
          <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(''); }} placeholder="••••••••" onKeyDown={e => e.key === 'Enter' && submit()} />
          {err && <div className="err-msg">{err}</div>}
        </div>
      )}

      <div className="auth-actions">
        {isReset ? (
          <>
            <button className="fb-btn solid" onClick={sendReset} disabled={loading || resetSent}>
              {loading ? 'Sending…' : (resetSent ? '✓ Reset link sent' : 'Forgot password')}
            </button>
            {resetSent && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 2, lineHeight: 1.45 }}>
                We emailed a reset link to <strong>{email}</strong>. Open it on this device to set a new password.
              </div>
            )}
            <button type="button" className="fb-link" onClick={goLogin}>← Back to sign in</button>
          </>
        ) : (
          <>
            <button className="fb-btn solid" onClick={submit} disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
            <button type="button" className="fb-link" onClick={goReset} disabled={loading}>Forgot password?</button>
          </>
        )}
      </div>
      <div className="auth-foot">{VERSION_LABEL}</div>
    </>
  );
}

// Shown when the user arrives from a password-recovery email link.
// Supabase signs them in with a temporary recovery session and fires a
// PASSWORD_RECOVERY auth event; App.jsx routes here so they can set a
// new password before continuing into the app.
export function ResetPasswordScreen({ onDone }) {
  const [pw, setPw] = React.useState('');
  const [pw2, setPw2] = React.useState('');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  const submit = async () => {
    if (pw.length < 6) { setErr('Password must be at least 6 characters'); return; }
    if (pw !== pw2) { setErr('Passwords do not match'); return; }
    setLoading(true);
    setErr('');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) { setErr(error.message); return; }
    onDone();
  };

  return (
    <div className="fb-screen">
      <div className="fb-scroll">
        <div className="auth-wrap" style={{ paddingTop: 60 }}>
          <div className="auth-mark">
            <div style={{ marginBottom: 18 }}><KinnektLogo size={64} /></div>
            <h1>New <em>password</em></h1>
            <p>Choose a new password for your account</p>
          </div>
          <div className="field">
            <label>New password</label>
            <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(''); }} placeholder="At least 6 characters" />
          </div>
          <div className={'field' + (err ? ' err' : '')}>
            <label>Confirm password</label>
            <input type="password" value={pw2} onChange={e => { setPw2(e.target.value); setErr(''); }} placeholder="Same again" onKeyDown={e => e.key === 'Enter' && submit()} />
            {err && <div className="err-msg">{err}</div>}
          </div>
          <div className="auth-actions">
            <button className="fb-btn solid" onClick={submit} disabled={loading}>{loading ? 'Saving…' : 'Save new password'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SignupForm({ onComplete }) {
  const [email, setEmail] = React.useState('');
  const [pw, setPw] = React.useState('');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  // Account creation collects only credentials now. Name, color, and
  // avatar are chosen later, in the profile-setup prompt that appears
  // right after the member creates or joins a group — that's where the
  // group roster is known, so taken colors can be ruled out.
  const submit = async () => {
    if (!email || !pw) { setErr('Please fill in all fields'); return; }
    if (pw.length < 6) { setErr('Password must be at least 6 characters'); return; }
    setLoading(true);
    setErr('');

    try {
      const { error } = await supabase.auth.signUp({ email, password: pw });
      if (error) { setErr(error.message); setLoading(false); return; }
      // The handle_new_user trigger creates the profile row (placeholder
      // name from the email, profile_complete = false). The setup prompt
      // fills in the real values, so there's nothing to insert here.
      setLoading(false);
      onComplete();
    } catch {
      setErr('Network error — check your connection and try again.');
      setLoading(false);
    }
  };

  return (
    <>
      <div className="field">
        <label>Email</label>
        <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErr(''); }} placeholder="you@example.com" onKeyDown={e => e.key === 'Enter' && submit()} />
      </div>
      <div className={'field' + (err ? ' err' : '')}>
        <label>Password</label>
        <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(''); }} placeholder="At least 6 characters" onKeyDown={e => e.key === 'Enter' && submit()} />
        {err && <div className="err-msg">{err}</div>}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -4, marginBottom: 4, lineHeight: 1.4 }}>
        You'll set your name, color, and avatar right after you join or create a group.
      </div>
      <div className="auth-actions">
        <button className="fb-btn solid" onClick={submit} disabled={loading}>{loading ? 'Creating account…' : 'Create account'}</button>
      </div>
    </>
  );
}

function GroupSetupScreen({ profile, onGroupReady, onEnterSpace }) {
  const [mode, setMode] = React.useState(null);
  const [groupName, setGroupName] = React.useState('');
  const [inviteCode, setInviteCode] = React.useState('');
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [created, setCreated] = React.useState(null); // { name, code, id }
  const [spaces, setSpaces] = React.useState([]);      // [{ id, name, is_personal }]
  const [entering, setEntering] = React.useState(false); // guards double-tap on the enter buttons

  // Every space this account already belongs to (shared groups + Personal),
  // so a returning member can pick which to enter and a new one can jump
  // straight to Personal.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from('group_members')
        .select('group_id, groups(id, name, is_personal)')
        .eq('user_id', user.id);
      if (cancelled) return;
      const list = (data || []).map(r => r.groups).filter(Boolean);
      list.sort((a, b) => (a.is_personal === b.is_personal)
        ? (a.name || '').localeCompare(b.name || '')
        : (a.is_personal ? 1 : -1));
      setSpaces(list);
    })();
    return () => { cancelled = true; };
  }, []);

  const enter = async (id) => {
    if (entering) return; // block a double-tap firing enterSpace twice
    setEntering(true);
    try {
      if (onEnterSpace) await onEnterSpace(id); else window.location.reload();
    } finally {
      // On success enterSpace unmounts this screen (harmless reset); on a
      // failed/no-op enter (e.g. removed from the group) this re-enables the
      // picker instead of bricking it until reload.
      setEntering(false);
    }
  };

  const createGroup = async () => {
    if (!groupName.trim()) { setErr('Enter a group name'); return; }
    setLoading(true); setErr('');
    try {
      const { data: group, error } = await supabase.rpc('create_group', { p_name: groupName.trim() });
      if (error || !group) throw new Error(error?.message || 'Could not create group');
      setCreated({ name: group.name, code: group.invite_code, id: group.id });
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
  };

  const joinGroup = async () => {
    if (!inviteCode.trim()) { setErr('Enter an invite code'); return; }
    setLoading(true); setErr('');
    try {
      const { data: group, error } = await supabase.rpc('join_group_by_code', { p_code: inviteCode.trim() });
      if (error) throw new Error(error.message);
      if (!group) throw new Error('Invalid invite code — check with your group admin');
      await enter(group.id);
    } catch (e) { setErr(e.message); } finally { setLoading(false); }
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
              <button className="fb-btn solid" disabled={entering} onClick={() => enter(created.id)}>
                Continue to app →
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const groups = spaces.filter(s => !s.is_personal);
  const personal = spaces.find(s => s.is_personal);

  return (
    <div className="fb-screen">
      <div className="fb-scroll">
        <div className="auth-wrap" style={{ paddingTop: 50 }}>
          <div className="auth-mark" style={{ marginBottom: 24 }}>
            <h1>Your <em>spaces</em></h1>
            <p>Choose where to go — enter a space, join a group, or create one</p>
          </div>

          {!mode && (
            <>
              {/* Spaces you already belong to. */}
              {(groups.length > 0 || personal) && (
                <div className="auth-actions" style={{ marginBottom: 18 }}>
                  {groups.map(g => (
                    <button key={g.id} className="fb-btn" disabled={entering} onClick={() => enter(g.id)}>{g.name} →</button>
                  ))}
                  {personal && (
                    <button className="fb-btn" disabled={entering} onClick={() => enter(personal.id)}>🔒 Go to Personal →</button>
                  )}
                </div>
              )}

              <div className="auth-actions">
                <button className="fb-btn solid" onClick={() => setMode('create')}>Create a group</button>
                <button className="fb-btn" onClick={() => setMode('join')}>Join with invite code</button>
              </div>
            </>
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

          <div className="auth-foot" style={{ marginTop: 24 }}>{VERSION_LABEL}</div>
        </div>
      </div>
    </div>
  );
}

// Shown once, right after a member creates or joins a group. This is
// where they pick the name / color / avatar that the rest of the group
// sees — colors already claimed by other members are ruled out so two
// people can't end up the same color. Saving flips profile_complete so
// the member is never prompted again.
export function ProfileSetupScreen({ profile, onComplete }) {
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState(null);
  const [avatar, setAvatar] = React.useState('');
  const [taken, setTaken] = React.useState({}); // { colorId: displayName }
  const [showEmoji, setShowEmoji] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  // Load colors already claimed by the other members of this group, and
  // default the picker to the first color nobody has taken.
  React.useEffect(() => {
    if (!profile?.group_id) return;
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, display_name, color')
      .eq('group_id', profile.group_id)
      .neq('id', profile.id)
      .then(({ data }) => {
        if (cancelled || !data) return;
        const map = {};
        data.forEach(m => { if (m.color) map[m.color] = m.display_name || 'Someone'; });
        setTaken(map);
        const firstFree = PALETTE.find(c => !map[c.id]);
        setColor(prev => prev || (firstFree ? firstFree.id : null));
      });
    return () => { cancelled = true; };
  }, [profile?.group_id, profile?.id]);

  const save = async () => {
    if (!name.trim()) { setErr('Enter your name'); return; }
    if (!color) { setErr('Pick a color'); return; }
    if (taken[color]) { setErr('That color is taken — pick another'); return; }
    setLoading(true);
    setErr('');
    let { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim(), color, avatar: avatar || null, profile_complete: true })
      .eq('id', profile.id);
    // Degrade gracefully if a column hasn't been migrated yet.
    if (error && /avatar/i.test(error.message || '')) {
      ({ error } = await supabase.from('profiles')
        .update({ display_name: name.trim(), color, profile_complete: true }).eq('id', profile.id));
    }
    if (error && /profile_complete/i.test(error.message || '')) {
      ({ error } = await supabase.from('profiles')
        .update({ display_name: name.trim(), color, avatar: avatar || null }).eq('id', profile.id));
    }
    setLoading(false);
    if (error) { setErr(error.message); return; }
    onComplete();
  };

  const avatarIsImage = typeof avatar === 'string' && (avatar.startsWith('data:image') || /^https?:\/\//.test(avatar));
  const selectedHex = (PALETTE.find(c => c.id === color) || {}).hex || '#9aa0a6';

  return (
    <div className="fb-screen">
      <div className="fb-scroll">
        <div className="auth-wrap" style={{ paddingTop: 40 }}>
          <div className="auth-mark" style={{ marginBottom: 18 }}>
            <h1>Set up your <em>profile</em></h1>
            <p>This is how your group will see you</p>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
            <button
              type="button"
              onClick={() => setShowEmoji(s => !s)}
              style={{
                width: 84, height: 84, borderRadius: '50%',
                background: avatarIsImage ? `center / cover no-repeat url(${avatar})` : selectedHex,
                border: '3px solid rgba(255,255,255,0.9)',
                boxShadow: '0 6px 18px rgba(15,30,60,0.16)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 52, lineHeight: 1, cursor: 'pointer',
                color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.3)',
              }}
              title="Choose an emoji"
            >
              {!avatarIsImage && (avatar || (name.trim()[0]?.toUpperCase() || '🙂'))}
            </button>
          </div>
          <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            Tap the circle to pick an emoji
          </div>

          {showEmoji && (
            <div className="field">
              <EmojiInput
                value={avatar && !avatarIsImage ? avatar : ''}
                onChange={(e) => { setAvatar(e); setShowEmoji(false); }}
              />
            </div>
          )}

          <div className="field">
            <label>Your name</label>
            <input value={name} onChange={e => { setName(e.target.value); setErr(''); }} placeholder="First name or nickname" />
            <div style={{ fontSize: 11, fontStyle: 'italic', color: 'var(--kinnekt-coral)', marginTop: 6 }}>
              ⚠ This name is final and cannot be changed.
            </div>
          </div>

          <div className="field">
            <label>Your color</label>
            <div className="swatches" role="radiogroup" aria-label="Your color" style={{ paddingTop: 6, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {PALETTE.map(c => {
                const takenBy = taken[c.id];
                const isMine = c.id === color;
                const disabled = !!takenBy;
                return (
                  <button
                    type="button"
                    key={c.id}
                    role="radio"
                    aria-checked={isMine}
                    aria-label={disabled ? `${c.label} — chosen by ${takenBy}` : c.label}
                    disabled={disabled}
                    style={{ background: 'none', border: 'none', font: 'inherit', minWidth: 44, minHeight: 44, padding: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: disabled ? 'not-allowed' : 'pointer' }}
                    onClick={() => { if (!disabled) { setColor(c.id); setErr(''); } }}
                    title={disabled ? `Chosen by ${takenBy}` : c.label}
                  >
                    <div style={{ position: 'relative', display: 'inline-flex' }}>
                      <span className={'swatch' + (isMine ? ' on' : '')} style={{ '--c': c.hex, pointerEvents: 'none' }} />
                      {disabled && (
                        <svg viewBox="0 0 28 28" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                          <circle cx="14" cy="14" r="12" fill="none" stroke="rgba(80,80,80,0.85)" strokeWidth="2.5" />
                          <line x1="5" y1="5" x2="23" y2="23" stroke="rgba(80,80,80,0.85)" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      )}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: isMine ? 700 : 500, color: disabled ? 'var(--text-muted)' : 'var(--ink)', textAlign: 'center', maxWidth: 48, lineHeight: 1.2 }}>{c.label}</span>
                    {disabled && (
                      <span style={{ fontSize: 8.5, color: 'var(--text-muted)', textAlign: 'center', maxWidth: 48, lineHeight: 1.1 }}>{takenBy}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {err && <div className="err-msg" style={{ marginBottom: 8 }}>{err}</div>}

          <div className="auth-actions">
            <button className="fb-btn solid" onClick={save} disabled={loading}>{loading ? 'Saving…' : 'Enter group →'}</button>
          </div>

          <div className="auth-foot" style={{ marginTop: 22 }}>{VERSION_LABEL}</div>
        </div>
      </div>
    </div>
  );
}
