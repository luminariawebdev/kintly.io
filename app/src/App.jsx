import React from 'react';
import { IOSDevice } from './IOSFrame';
import { supabase } from './lib/supabase';
import { AuthScreen, ResetPasswordScreen, ProfileSetupScreen } from './screens/Auth';
import { MainApp } from './screens/Main';
import { SettingsScreen } from './screens/Settings';

const FRAME_W = 402;
const FRAME_H = 874;

// Resolve the actual visual theme given a user preference and current state.
// 'auto' = a fixed local-time schedule: light from 7am to 7pm, dark from
// 7pm to 7am. (We used to follow the OS color-scheme setting, but on iOS
// that depends on the phone's own light/dark schedule which didn't reliably
// reach the web app, so auto often never switched. A hard clock rule is
// predictable; anyone who wants otherwise can pick Light or Dark manually.)
const AUTO_LIGHT_START = 7;  // 07:00 — switch to light
const AUTO_DARK_START = 19;  // 19:00 — switch to dark
function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  const hour = new Date().getHours();
  return hour >= AUTO_LIGHT_START && hour < AUTO_DARK_START ? 'light' : 'dark';
}

export const ThemeContext = React.createContext({ pref: 'auto', setPref: () => {}, resolved: 'light' });

// True on a real phone-sized viewport (or an installed PWA). There we
// render the app edge-to-edge instead of inside the desktop iPhone
// mockup — the mockup is a fixed 402×874 box, which on a real phone is
// taller than the screen, gets centered, and clips the header off the
// top with no way to scroll up to it. Breakpoint matches the mobile
// media query in styles.css.
function useIsMobile() {
  const get = () => {
    if (typeof window === 'undefined') return false;
    const standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
    return standalone || window.innerWidth <= 768;
  };
  const [mobile, setMobile] = React.useState(get);
  React.useEffect(() => {
    const onResize = () => setMobile(get());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return mobile;
}

export function App() {
  const [screen, setScreen] = React.useState('loading');
  const [profile, setProfile] = React.useState(null);
  const [profileErr, setProfileErr] = React.useState('');
  const [themePref, setThemePref] = React.useState(() => {
    try { return localStorage.getItem('kinnekt:theme') || 'auto'; } catch { return 'auto'; }
  });
  const [resolved, setResolved] = React.useState(() => resolveTheme(themePref));
  const isMobile = useIsMobile();

  // Re-resolve on preference change. For 'auto' the theme is on a clock
  // schedule, so it has to flip at the 7am / 7pm boundaries while the app is
  // open. Re-check once a minute — negligible cost, and setResolved bails out
  // when the value is unchanged, so a re-render only happens at the actual
  // switch. (Light/Dark are fixed, so no timer is needed for them.)
  React.useEffect(() => {
    try { localStorage.setItem('kinnekt:theme', themePref); } catch {}
    setResolved(resolveTheme(themePref));

    if (themePref !== 'auto') return;
    const id = setInterval(() => setResolved(resolveTheme('auto')), 60 * 1000);
    return () => clearInterval(id);
  }, [themePref]);

  // Apply data-theme attribute to root so CSS overrides cascade
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
  }, [resolved]);

  // Moving "glint" on the glass cards: as a card travels up through the
  // viewport, slide its sheen highlight across — the way light tracks over a
  // window as you walk past it. We map each card's vertical center to a 0..1
  // value and write it to the --sheen custom property the CSS reads; one
  // rAF-throttled pass on scroll/resize, querying live so cards that mount or
  // unmount are handled for free. Plain getBoundingClientRect + a CSS var, so
  // it works in iOS Safari (unlike CSS scroll-driven animations).
  React.useEffect(() => {
    let raf = 0;
    const paint = () => {
      raf = 0;
      const vh = window.innerHeight || 1;
      document.querySelectorAll('.feed-box, .day-summary, .fb-listbox, .upcoming-box')
        .forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.bottom < -80 || r.top > vh + 80) return; // skip off-screen
          const p = (r.top + r.height / 2) / vh;          // 0 = top, 1 = bottom
          el.style.setProperty('--sheen', Math.max(-0.15, Math.min(1.15, p)).toFixed(3));
        });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
    // Defer the first pass so freshly-rendered cards are in the DOM.
    raf = requestAnimationFrame(paint);
    document.addEventListener('scroll', onScroll, true); // capture: catch inner scrollers
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [screen]);

  const loadProfile = React.useCallback(async (userId) => {
    setProfileErr('');
    const { data: prof, error: profErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profErr) {
      setProfileErr(profErr.message);
      setScreen('group-setup');
      return;
    }

    if (!prof) {
      // Profile doesn't exist yet — retry once after a short delay
      await new Promise(r => setTimeout(r, 1000));
      const { data: prof2 } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
      if (!prof2) { setScreen('group-setup'); return; }
      return loadProfile(userId);
    }

    let fullProfile = prof;
    if (prof.group_id) {
      const { data: grp } = await supabase.from('groups').select('id, name, invite_code').eq('id', prof.group_id).maybeSingle();
      fullProfile = { ...prof, group: grp || null };
    }

    setProfile(fullProfile);
    // Routing: no group yet → group setup. In a group but hasn't done the
    // name/color/avatar prompt → profile setup. Otherwise → the app.
    // `'profile_complete' in prof` guards the case where the column hasn't
    // been migrated yet: if it's absent we skip the prompt (old behavior)
    // rather than bouncing every existing member into setup.
    const hasFlag = 'profile_complete' in fullProfile;
    if (!fullProfile.group_id) setScreen('group-setup');
    else if (hasFlag && fullProfile.profile_complete !== true) setScreen('profile-setup');
    else setScreen('app');
  }, []);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setScreen('auth');
      } else {
        loadProfile(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // User arrived from a reset-password email link — let them set
        // a new password before continuing into the app.
        setScreen('reset-pw');
        return;
      }
      if (!session) {
        setScreen('auth');
        setProfile(null);
      } else if (event === 'SIGNED_IN') {
        loadProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = React.useCallback(async () => {
    // Re-fetches the profile WITHOUT touching the screen state. Used after
    // in-place edits like changing avatar/color/name so the user stays
    // wherever they are (most often Settings).
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    const userId = session.user.id;
    const { data: prof } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    if (!prof) return;
    let fullProfile = prof;
    if (prof.group_id) {
      const { data: grp } = await supabase.from('groups').select('id, name, invite_code').eq('id', prof.group_id).maybeSingle();
      fullProfile = { ...prof, group: grp || null };
    }
    setProfile(fullProfile);
  }, []);

  const onGroupReady = React.useCallback((fullProfile) => {
    setProfile(fullProfile);
    setScreen('app');
  }, []);

  const screens = (
    <>
      {screen === 'loading' && <LoadingScreen />}
      {(screen === 'auth' || screen === 'group-setup') && (
        <AuthScreen
          initialStep={screen === 'group-setup' ? 'group-setup' : 'login'}
          onComplete={refreshProfile}
          onGroupReady={onGroupReady}
        />
      )}
      {screen === 'reset-pw' && (
        <ResetPasswordScreen
          onDone={async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) loadProfile(session.user.id);
            else setScreen('auth');
          }}
        />
      )}
      {screen === 'profile-setup' && profile && (
        <ProfileSetupScreen
          profile={profile}
          onComplete={() => loadProfile(profile.id)}
        />
      )}
      {screen === 'app' && (
        <MainApp
          profile={profile}
          onSettings={() => setScreen('settings')}
          onProfileUpdate={refreshProfile}
        />
      )}
      {screen === 'settings' && (
        <SettingsScreen
          profile={profile}
          onBack={() => setScreen('app')}
          onProfileUpdate={refreshProfile}
          onSignOut={() => { setScreen('auth'); setProfile(null); }}
        />
      )}
    </>
  );

  return (
    <ThemeContext.Provider value={{ pref: themePref, setPref: setThemePref, resolved }}>
      {isMobile ? (
        // Real phone / installed PWA: render edge-to-edge, no mockup frame.
        <div className="app-mobile-root">{screens}</div>
      ) : (
        // Desktop: show the app inside the iPhone mockup for preview.
        <div className="app-shell" style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}>
          <IOSDevice width={FRAME_W} height={FRAME_H}>{screens}</IOSDevice>
        </div>
      )}
    </ThemeContext.Provider>
  );
}

function LoadingScreen() {
  return (
    <div className="fb-screen" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div className="marklogo" style={{ margin: '0 auto 16px' }} />
        <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em', opacity: 0.4 }}>
          Loading…
        </div>
      </div>
    </div>
  );
}
