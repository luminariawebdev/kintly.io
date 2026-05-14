import React from 'react';
import { IOSDevice } from './IOSFrame';
import { supabase } from './lib/supabase';
import { AuthScreen } from './screens/Auth';
import { MainApp } from './screens/Main';
import { SettingsScreen } from './screens/Settings';

const FRAME_W = 402;
const FRAME_H = 874;

export function App() {
  const [screen, setScreen] = React.useState('loading');
  const [profile, setProfile] = React.useState(null);
  const [profileErr, setProfileErr] = React.useState('');

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
    const { data: { session } } = await supabase.auth.getSession();
    if (session) loadProfile(session.user.id);
  }, [loadProfile]);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#FFCF03',
      padding: 24,
    }}>
      <IOSDevice width={FRAME_W} height={FRAME_H}>
        {screen === 'loading' && <LoadingScreen />}
        {(screen === 'auth' || screen === 'group-setup') && (
          <AuthScreen
            initialStep={screen === 'group-setup' ? 'group-setup' : 'login'}
            onComplete={refreshProfile}
            profileErr={profileErr}
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
