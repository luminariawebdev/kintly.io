import React from 'react';
import { IOSDevice } from './IOSFrame';
import { DesignCanvas, DCSection, DCArtboard } from './DesignCanvas';
import { useTweaks, TweaksPanel, TweakSection, TweakToggle, TweakSelect, TweakSlider } from './TweaksPanel';
import { ShaderProvider } from './ShaderButton';
import { LoginScreen, JoinGroupScreen } from './screens/Auth';
import { MainApp } from './screens/Main';
import { SettingsScreen } from './screens/Settings';

const FRAME_W = 402;
const FRAME_H = 874;

function Frame({ children }) {
  return (
    <IOSDevice width={FRAME_W} height={FRAME_H}>
      {children}
    </IOSDevice>
  );
}

const TWEAK_DEFAULTS = {
  shaderOn:  true,
  shader:    'plasma',
  speed:     100,
  intensity: 100,
  alwaysOn:  true,
  glow:      true,
};

export function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  const shaderValue = {
    shaderOn:  t.shaderOn,
    shader:    t.shader,
    speed:     t.speed,
    intensity: t.intensity,
    alwaysOn:  t.alwaysOn,
    glow:      t.glow,
  };

  return (
    <ShaderProvider value={shaderValue}>
      <DesignCanvas>
        <DCSection
          id="intro"
          title="FamilyBoard — wireframe"
          subtitle="Mobile-first · marigold &amp; ink · hover the Add task button for a shader"
        >
          <DCArtboard id="auth-login" label="01 · Login" width={FRAME_W} height={FRAME_H}>
            <Frame><LoginScreen /></Frame>
          </DCArtboard>
          <DCArtboard id="auth-login-err" label="02 · Login (error)" width={FRAME_W} height={FRAME_H}>
            <Frame><LoginScreen showError={true} /></Frame>
          </DCArtboard>
          <DCArtboard id="auth-join" label="03 · Join via invite" width={FRAME_W} height={FRAME_H}>
            <Frame><JoinGroupScreen /></Frame>
          </DCArtboard>
        </DCSection>

        <DCSection
          id="app"
          title="/app — interactive"
          subtitle="One-page scroll · sticky header + anchor tabs · hover Add task ↓"
        >
          <DCArtboard id="app-tasks" label="04 · Main (Tasks)" width={FRAME_W} height={FRAME_H}>
            <Frame><MainApp initialTab="tasks" /></Frame>
          </DCArtboard>
          <DCArtboard id="app-cal" label="05 · Main (Calendar)" width={FRAME_W} height={FRAME_H}>
            <Frame><MainApp initialTab="calendar" initialScroll="calendar" /></Frame>
          </DCArtboard>
          <DCArtboard id="app-notes" label="06 · Main (Notes)" width={FRAME_W} height={FRAME_H}>
            <Frame><MainApp initialTab="notes" initialScroll="notes" /></Frame>
          </DCArtboard>
        </DCSection>

        <DCSection
          id="modals"
          title="Create flows"
          subtitle="Bottom-sheet modals · each opens from its section's primary action"
        >
          <DCArtboard id="mod-task" label="07 · Add task" width={FRAME_W} height={FRAME_H}>
            <Frame><MainApp initialTab="tasks" initialModal="task" /></Frame>
          </DCArtboard>
          <DCArtboard id="mod-event" label="08 · Add event" width={FRAME_W} height={FRAME_H}>
            <Frame><MainApp initialTab="calendar" initialScroll="calendar" initialModal="event" /></Frame>
          </DCArtboard>
          <DCArtboard id="mod-note" label="09 · Pin note" width={FRAME_W} height={FRAME_H}>
            <Frame><MainApp initialTab="notes" initialScroll="notes" initialModal="note" /></Frame>
          </DCArtboard>
        </DCSection>

        <DCSection
          id="settings"
          title="Settings"
          subtitle="Profile · color picker · group management"
        >
          <DCArtboard id="set-default" label="10 · Settings" width={FRAME_W} height={FRAME_H}>
            <Frame><SettingsScreen /></Frame>
          </DCArtboard>
          <DCArtboard id="set-color" label="11 · Color picker open" width={FRAME_W} height={FRAME_H}>
            <Frame><SettingsScreen openSwatches={true} /></Frame>
          </DCArtboard>
        </DCSection>
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Shader on Add Task">
          <TweakToggle
            label="Enabled"
            value={t.shaderOn}
            onChange={(v) => setTweak('shaderOn', v)}
          />
          <TweakToggle
            label="Always on"
            value={t.alwaysOn}
            onChange={(v) => setTweak('alwaysOn', v)}
          />
          <TweakSelect
            label="Effect"
            value={t.shader}
            options={[
              { value: 'plasma',   label: 'Marigold plasma' },
              { value: 'sunrays',  label: 'Sun rays' },
              { value: 'grain',    label: 'Scrolling grain' },
              { value: 'halftone', label: 'Halftone dots' },
              { value: 'liquid',   label: 'Liquid metal' },
            ]}
            onChange={(v) => setTweak('shader', v)}
          />
          <TweakSlider
            label="Speed"
            value={t.speed}
            min={0} max={300} step={5} unit="%"
            onChange={(v) => setTweak('speed', v)}
          />
          <TweakSlider
            label="Intensity"
            value={t.intensity}
            min={0} max={200} step={5} unit="%"
            onChange={(v) => setTweak('intensity', v)}
          />
          <TweakToggle
            label="Glow halo"
            value={t.glow}
            onChange={(v) => setTweak('glow', v)}
          />
        </TweakSection>
      </TweaksPanel>
    </ShaderProvider>
  );
}
