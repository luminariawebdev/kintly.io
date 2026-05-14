// shader-button.jsx — WebGL shader background for the Add Task button.
// Hover ramps the effect in; click triggers a brief burst.
// Tweakable: shader type, speed, intensity, alwaysOn, glow.

const __VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// Color constants used in all shaders (marigold + deep amber + ink).
const __COL = `
const vec3 SUN  = vec3(1.0, 0.812, 0.012);
const vec3 GOLD = vec3(0.965, 0.561, 0.012);
const vec3 INK  = vec3(0.078, 0.078, 0.078);
const vec3 CRM  = vec3(0.984, 0.945, 0.78);
`;

// Each frag is full-screen quad. Shared uniforms:
//   u_time, u_hover (0..1), u_press (1 → 0 decay), u_mouse (0..1)
const __PLASMA = `
precision mediump float;
uniform float u_time;
uniform float u_hover;
uniform float u_press;
uniform vec2  u_mouse;
uniform vec2  u_resolution;
${__COL}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  float t = u_time;
  // marigold "fluid": layered sine waves morphing
  float v = 0.0;
  v += sin(uv.x * 10.0 + t * 1.2);
  v += sin(uv.y * 7.0  - t * 1.6);
  v += sin((uv.x + uv.y) * 6.0 + t);
  v += sin(length(uv - u_mouse) * 14.0 - t * 2.2);
  v = v * 0.25;
  vec3 base = mix(SUN, GOLD, smoothstep(-0.6, 0.8, v));
  base = mix(base, CRM, 0.18 + 0.18 * sin(t * 0.7 + uv.x * 4.0));
  float burst = u_press * (1.0 - length(uv - u_mouse) * 1.4);
  base = mix(base, vec3(1.0), max(0.0, burst) * 0.8);
  gl_FragColor = vec4(base, u_hover);
}
`;

const __SUNRAYS = `
precision mediump float;
uniform float u_time;
uniform float u_hover;
uniform float u_press;
uniform vec2  u_mouse;
uniform vec2  u_resolution;
${__COL}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 m = u_mouse;
  vec2 p = uv - m;
  // squash y because button is wide-thin: rays look right
  p.y *= u_resolution.y / u_resolution.x * 3.0;
  float a = atan(p.y, p.x);
  float r = length(p);
  float rays = sin(a * 14.0 + u_time * 1.8) * 0.5 + 0.5;
  rays = pow(rays, 3.0);
  float falloff = smoothstep(1.2, 0.0, r * 1.6);
  vec3 col = mix(SUN, GOLD, rays * 0.7);
  col = mix(CRM, col, rays * falloff);
  // burst flash
  col = mix(col, vec3(1.0), u_press * falloff * 0.7);
  gl_FragColor = vec4(col, u_hover);
}
`;

const __GRAIN = `
precision mediump float;
uniform float u_time;
uniform float u_hover;
uniform float u_press;
uniform vec2  u_mouse;
uniform vec2  u_resolution;
${__COL}
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  // chunky grain that scrolls toward the cursor
  vec2 scale = vec2(240.0, 36.0);
  vec2 cell = floor(uv * scale - vec2(u_time * 12.0, 0.0));
  float n = hash(cell);
  float band = smoothstep(0.35, 0.0, abs(uv.x - u_mouse.x) * 1.4);
  vec3 base = mix(SUN, GOLD, step(0.55, n));
  base = mix(CRM, base, 0.4 + 0.6 * band);
  // sparkle on burst
  float spark = step(0.97 - u_press * 0.3, hash(cell + 13.0));
  base = mix(base, vec3(1.0), spark * u_press * 0.9);
  gl_FragColor = vec4(base, u_hover);
}
`;

const __HALFTONE = `
precision mediump float;
uniform float u_time;
uniform float u_hover;
uniform float u_press;
uniform vec2  u_mouse;
uniform vec2  u_resolution;
${__COL}
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  // halftone dots; size pulses with a traveling wave + cursor distance
  vec2 grid = uv * vec2(50.0, 7.0);
  vec2 cell = fract(grid) - 0.5;
  float d = length(cell);
  float wave = sin(uv.x * 9.0 - u_time * 2.2 + u_mouse.x * 4.0) * 0.5 + 0.5;
  float close = 1.0 - clamp(abs(uv.x - u_mouse.x) * 1.5, 0.0, 1.0);
  float radius = 0.10 + 0.30 * wave + 0.18 * close + u_press * 0.18;
  float dot = 1.0 - smoothstep(radius - 0.05, radius, d);
  vec3 col = mix(SUN, INK, dot);
  gl_FragColor = vec4(col, u_hover);
}
`;

const __LIQUID = `
precision mediump float;
uniform float u_time;
uniform float u_hover;
uniform float u_press;
uniform vec2  u_mouse;
uniform vec2  u_resolution;
${__COL}
// metaballs blobbing under the cursor — gold blobs on cream
float blob(vec2 p, vec2 c, float r) { return r / length(p - c); }
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 p = uv;
  p.y *= u_resolution.y / u_resolution.x * 3.0;
  vec2 m = u_mouse; m.y *= u_resolution.y / u_resolution.x * 3.0;
  float t = u_time;
  float f = 0.0;
  f += blob(p, m, 0.05);
  f += blob(p, vec2(0.2 + 0.1 * sin(t), 0.15 + 0.05 * cos(t * 1.3)), 0.04);
  f += blob(p, vec2(0.6 + 0.15 * cos(t * 0.8), 0.1 + 0.04 * sin(t * 1.7)), 0.045);
  f += blob(p, vec2(0.85 + 0.08 * sin(t * 1.1), 0.12 + 0.05 * cos(t)), 0.04);
  float m1 = smoothstep(0.9, 1.2, f);
  float edge = smoothstep(0.78, 0.95, f) - m1;
  vec3 col = mix(CRM, SUN, m1);
  col = mix(col, GOLD, edge);
  col = mix(col, vec3(1.0), u_press * m1 * 0.7);
  gl_FragColor = vec4(col, u_hover);
}
`;

const __FRAGS = {
  plasma:   __PLASMA,
  sunrays:  __SUNRAYS,
  grain:    __GRAIN,
  halftone: __HALFTONE,
  liquid:   __LIQUID,
};

function __compile(gl, src, type) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn('shader compile error:', gl.getShaderInfoLog(sh));
    gl.deleteShader(sh);
    return null;
  }
  return sh;
}

function __makeProgram(gl, fragSrc) {
  const vs = __compile(gl, __VERT, gl.VERTEX_SHADER);
  const fs = __compile(gl, fragSrc, gl.FRAGMENT_SHADER);
  if (!vs || !fs) return null;
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('link error:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

// ─────────────────────────────────────────────────────────────
// Tweak context — let the panel share state with deeply-nested shader buttons
const SHADER_DEFAULTS = {
  shaderOn:  true,
  shader:    'plasma',
  speed:     100,    // 0–300
  intensity: 100,    // 0–200
  alwaysOn:  false,
  glow:      true,   // outer shadow halo on hover
};
const ShaderContext = React.createContext(SHADER_DEFAULTS);
function ShaderProvider({ value, children }) {
  return <ShaderContext.Provider value={value}>{children}</ShaderContext.Provider>;
}

// ─────────────────────────────────────────────────────────────
function ShaderButton({ onClick, children, className = 'fb-btn', label = '+ Add task' }) {
  const tweaks = React.useContext(ShaderContext);
  const canvasRef = React.useRef(null);
  const btnRef = React.useRef(null);
  const stateRef = React.useRef({ hover: 0, press: 0, mouse: [0.5, 0.5], targetHover: 0 });
  const glRef = React.useRef(null);
  const progRef = React.useRef(null);
  const shaderRef = React.useRef(tweaks.shader);

  const enabled = tweaks.shaderOn;

  // Initialize WebGL + compile current shader. Re-runs when shader changes.
  React.useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: true });
    if (!gl) return;
    glRef.current = gl;
    shaderRef.current = tweaks.shader;
    const program = __makeProgram(gl, __FRAGS[tweaks.shader] || __FRAGS.plasma);
    if (!program) return;
    progRef.current = program;
    gl.useProgram(program);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1,-1,  1,-1,  -1,1,  -1,1,  1,-1,  1,1]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    return () => {
      try { gl.deleteProgram(program); gl.deleteBuffer(buf); } catch (_) {}
    };
  }, [enabled, tweaks.shader]);

  // Render loop. Reads tweaks via closure; restarts when tweaks change.
  React.useEffect(() => {
    if (!enabled) return;
    const canvas = canvasRef.current;
    const gl = glRef.current;
    if (!canvas || !gl) return;

    let raf;
    const start = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(rect.width  * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const speedF = (tweaks.speed ?? 100) / 100;
    const intF   = (tweaks.intensity ?? 100) / 100;

    const tick = () => {
      const prog = progRef.current;
      if (!prog) { raf = requestAnimationFrame(tick); return; }
      gl.useProgram(prog);

      const t = (performance.now() - start) / 1000 * speedF;
      const s = stateRef.current;
      const target = (tweaks.alwaysOn || s.targetHover) ? 1 : 0;
      s.hover += (target - s.hover) * 0.15;
      s.press *= 0.93;
      if (s.hover < 0.001 && !tweaks.alwaysOn && !s.targetHover) {
        // skip the GL work entirely when fully faded out
        raf = requestAnimationFrame(tick);
        return;
      }

      gl.uniform1f(gl.getUniformLocation(prog, 'u_time'),  t);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_hover'), Math.min(1, s.hover * intF));
      gl.uniform1f(gl.getUniformLocation(prog, 'u_press'), s.press);
      gl.uniform2f(gl.getUniformLocation(prog, 'u_mouse'), s.mouse[0], s.mouse[1]);
      gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), canvas.width, canvas.height);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [enabled, tweaks.shader, tweaks.speed, tweaks.intensity, tweaks.alwaysOn]);

  const handleEnter = () => { stateRef.current.targetHover = 1; };
  const handleLeave = () => { stateRef.current.targetHover = 0; };
  const handleMove  = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    stateRef.current.mouse = [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height)),
    ];
  };
  const handleClick = (e) => {
    stateRef.current.press = 1;
    onClick?.(e);
  };

  // Outer ink halo on hover for the "glow" tweak.
  const haloStyle = (enabled && tweaks.glow) ? {
    boxShadow: '0 0 0 1.5px var(--ink), 0 8px 24px rgba(255, 207, 3, 0.55), 0 0 0 var(--__halo, 0px) rgba(255, 207, 3, 0.0)',
  } : null;

  return (
    <button
      ref={btnRef}
      type="button"
      className={className}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onMouseMove={handleMove}
      onClick={handleClick}
      style={{
        position: 'relative',
        overflow: 'hidden',
        ...(haloStyle || {}),
      }}
    >
      {enabled && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none',
            display: 'block',
          }}
        />
      )}
      <span style={{
        position: 'relative', zIndex: 1,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        mixBlendMode: enabled ? 'normal' : 'normal',
      }}>
        {children || <><span className="plus">+</span> {label}</>}
      </span>
    </button>
  );
}

Object.assign(window, {
  ShaderButton, ShaderProvider, ShaderContext, SHADER_DEFAULTS,
});
