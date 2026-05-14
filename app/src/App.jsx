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

  const loadProfile = React.useCallback(async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*, group:groups(id, name, invite_code)')
      .eq('id', userId)
      .single();

    if (data) {
      setProfile(data);
      setScreen(data.group_id ? 'app' : 'group-setup');
    } else {
      setScreen('group-setup');
    }
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
