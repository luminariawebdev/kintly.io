import React from 'react';
import { IOSDevice } from './IOSFrame';
import { supabase } from './lib/supabase';
import { AuthScreen } from './screens/Auth';
import { MainApp } from './screens/Main';
import { SettingsScreen } from './screens/Settings';

const FRAME_W = 402;
const FRAME_H = 874;

// Resolve the actual visual theme given a user preference and current state.
// 'auto' = follow the OS color-scheme preference, matching iOS / macOS /
// Windows / web convention. (Previously this layered a time-of-day rule on
// top — auto went dark after 7pm regardless of the system setting — which
// surprised users whose OS was on light mode.)
function resolveTheme(pref) {
  if (pref === 'light' || pref === 'dark') return pref;
  const sysDark = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
  return sysDark ? 'dark' : 'light';
}

export const ThemeContext = React.createContext({ pref: 'auto', setPref: () => {}, resolved: 'light' });

export function App() {
  const [screen, setScreen] = React.useState('loading');
  const [profile, setProfile] = React.useState(null);
  const [profileErr, setProfileErr] = React.useState('');
  const [themePref, setThemePref] = React.useState(() => {
    try { return localStorage.getItem('kinnekt:theme') || 'auto'; } catch { return 'auto'; }
  });
  const [resolved, setResolved] = React.useState(() => resolveTheme(themePref));

  // Re-resolve on preference change or system theme change. matchMedia fires
  // the listener whenever the OS toggles light/dark, so no polling needed.
  React.useEffect(() => {
    try { localStorage.setItem('kinnekt:theme', themePref); } catch {}
    setResolved(resolveTheme(themePref));

    const mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(resolveTheme(themePref));
    mq?.addEventListener?.('change', onChange);
    return () => { mq?.removeEventListener?.('change', onChange); };
  }, [themePref]);

  // Apply data-theme attribute to root so CSS overrides cascade
  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
  }, [resolved]);

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
    setScreen(fullProfile.group_id ? 'app' : 'group-setup');
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

  return (
    <ThemeContext.Provider value={{ pref: themePref, setPref: setThemePref, resolved }}>
      <div className="app-shell" style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}>
        <IOSDevice width={FRAME_W} height={FRAME_H}>
          {screen === 'loading' && <LoadingScreen />}
          {(screen === 'auth' || screen === 'group-setup') && (
            <AuthScreen
              initialStep={screen === 'group-setup' ? 'group-setup' : 'login'}
              onComplete={refreshProfile}
              onGroupReady={onGroupReady}
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
        </IOSDevice>
      </div>
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
