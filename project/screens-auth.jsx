// screens-auth.jsx — Login + Join Group

// ─────────────────────────────────────────────────────────────
function LoginScreen({ showError = false }) {
  const [email, setEmail] = React.useState(showError ? 'maya@park.fam' : '');
  const [pw, setPw] = React.useState(showError ? '••••••••' : '');
  const [err, setErr] = React.useState(showError);

  return (
    <div className="fb-screen">
      <div className="fb-scroll">
        <div className="auth-wrap">
          <div className="auth-mark">
            <div className="marklogo" />
            <h1>Family<em>board</em>.</h1>
            <p>// Shared tasks, plans &amp; notes for your people</p>
          </div>

          <div className="field">
            <label>Email or username</label>
            <input
              type="text"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErr(false); }}
              placeholder="you@example.com"
            />
          </div>

          <div className={'field' + (err ? ' err' : '')}>
            <label>Password</label>
            <input
              type="password"
              value={pw}
              onChange={(e) => { setPw(e.target.value); setErr(false); }}
              placeholder="••••••••"
            />
            {err && <div className="err-msg">Incorrect password — try again or reset</div>}
          </div>

          <div className="auth-actions">
            <button
              className="fb-btn solid"
              onClick={() => setErr(true)}
            >Log in</button>
            <button className="fb-link">Create account</button>
          </div>

          <div className="auth-foot">
            v 0.4.0 — wireframe build · forgot password?
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function JoinGroupScreen() {
  const [accepted, setAccepted] = React.useState(false);

  return (
    <div className="fb-screen">
      <div className="fb-scroll">
        <div className="auth-wrap" style={{ paddingTop: 70 }}>
          <div className="join-card">
            <div className="inv-from">You're invited</div>
            <div className="inv-by">
              <ColorDot user="theo" />
              <span><b>Theo</b> invited you to join</span>
            </div>
            <h2>The Park <em>Family</em></h2>
            <div className="gmeta">4 members · created Apr 2026</div>

            <div className="join-members">
              {USERLIST.map(u => (
                <div className="m" key={u.id}>
                  <div className="av" style={{ '--c': u.color }} data-initial={u.initial} />
                  <span>{u.name}</span>
                </div>
              ))}
            </div>

            <div className="join-token">
              invite token <span className="mono">FB-7K2P-NQ41</span>
            </div>
          </div>

          {accepted ? (
            <div className="kbd-hint" style={{ marginBottom: 12 }}>
              ✓ JOINED — REDIRECTING TO /APP …
            </div>
          ) : null}

          <div className="auth-actions">
            <button
              className="fb-btn solid"
              onClick={() => setAccepted(true)}
            >Accept invite</button>
            <button className="fb-link">Decline · back to my groups</button>
          </div>

          <div className="auth-foot">
            By accepting you agree to share your name &amp; color with group members.
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LoginScreen, JoinGroupScreen });
