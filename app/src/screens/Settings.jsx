import React from 'react';
import { ColorDot } from '../Components';

export function SettingsScreen({ openSwatches = false }) {
  const [name, setName]   = React.useState('Maya Park');
  const [color, setColor] = React.useState('maya');
  const [showSw, setShowSw] = React.useState(openSwatches);

  const swatches = [
    { id: 'maya', c: 'var(--u-maya)', label: 'Coral'  },
    { id: 'theo', c: 'var(--u-theo)', label: 'Blue'   },
    { id: 'iris', c: 'var(--u-iris)', label: 'Green'  },
    { id: 'leo',  c: 'var(--u-leo)',  label: 'Amber'  },
    { id: 'p1',   c: '#8861A8',       label: 'Plum'   },
    { id: 'p2',   c: '#3E8E8A',       label: 'Teal'   },
    { id: 'p3',   c: '#C6577E',       label: 'Rose'   },
    { id: 'p4',   c: '#5C7A37',       label: 'Moss'   },
  ];
  const me = swatches.find(s => s.id === color) || swatches[0];

  return (
    <div className="fb-screen">
      <div className="fb-scroll">
        <div className="fb-stickyhead">
          <div className="fb-stickyhead-row">
            <button className="fb-link" style={{ justifySelf: 'start', textDecoration: 'none' }}>‹ Back</button>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.14em' }}>Settings</div>
            <span />
          </div>
        </div>

        <div style={{ padding: '22px 16px 40px' }}>

          <div className="fb-sec-label" style={{ marginBottom: 8 }}>Profile</div>
          <div className="set-group">
            <div className="set-row" style={{ display: 'block' }}>
              <span className="lbl">Display name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{
                  border: 0, background: 'transparent',
                  font: 'inherit', fontSize: 16, fontWeight: 600,
                  color: 'var(--ink)', width: '100%', padding: 0, outline: 'none',
                }}
              />
            </div>
            <div className="set-row" onClick={() => setShowSw(s => !s)} style={{ display: 'block' }}>
              <span className="lbl">Your color</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="dot xl" style={{ '--c': me.c }} />
                  <span className="val">{me.label}</span>
                </div>
                <span className="car">{showSw ? '▴' : '▾'}</span>
              </div>
              {showSw && (
                <div className="swatches">
                  {swatches.map(s => (
                    <span
                      key={s.id}
                      className={'swatch' + (s.id === color ? ' on' : '')}
                      style={{ '--c': s.c }}
                      onClick={(e) => { e.stopPropagation(); setColor(s.id); }}
                      title={s.label}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="fb-sec-label" style={{ marginBottom: 8 }}>Group</div>
          <div className="set-group">
            <div className="set-row" style={{ display: 'block' }}>
              <span className="lbl">Current group</span>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ColorDot user="maya" size="lg" />
                  <span className="val">The Park Family</span>
                </div>
                <span className="car">›</span>
              </div>
            </div>
            <div className="set-row">
              <span className="val" style={{ fontWeight: 500 }}>Switch group</span>
              <span className="car">›</span>
            </div>
            <div className="set-row">
              <span className="val" style={{ fontWeight: 500 }}>Invite someone</span>
              <span className="car">›</span>
            </div>
            <div className="set-row danger">
              <span className="val">Leave group</span>
              <span className="car">›</span>
            </div>
          </div>

          <div className="fb-sec-label" style={{ marginBottom: 8 }}>Account</div>
          <div className="set-group">
            <div className="set-row">
              <span className="val" style={{ fontWeight: 500 }}>Notifications</span>
              <span className="car">›</span>
            </div>
            <div className="set-row">
              <span className="val" style={{ fontWeight: 500 }}>Privacy</span>
              <span className="car">›</span>
            </div>
            <div className="set-row danger">
              <span className="val">Log out</span>
              <span className="car">›</span>
            </div>
          </div>

          <div className="auth-foot" style={{ marginTop: 22 }}>
            FamilyBoard v 0.4.0 · build 26.05
          </div>
        </div>
      </div>
    </div>
  );
}
