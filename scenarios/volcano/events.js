// Events that belong to the volcano (sky events come from the engine library).
import * as THREE from 'three';
import { V3, DEG, lerp, clamp, sm, env, R } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { event } from 'spectra/core/events.js';
import { skyP, deg, FOV_SKY } from 'spectra/core/geom.js';
import { Em, Rib, EmField, BEAM, toViewer } from 'spectra/render/sources.js';
import { solid } from 'spectra/render/instrument.js';
import { spectralGroup, SURF_U } from 'spectra/render/surface.js';
import { COMMON } from 'spectra/render/shaders.js';
import { ENV, night, sunEl } from 'spectra/world/atmosphere.js';
import { CRATER, LAKE_Y, SPOTS, heightAt, downhill } from './world.js';


// Planck's law, relative to lava at 1150 °C (1423 K) at the same wavelength: B(λ,T) ∝ 1/(e^(c2/λT) − 1), c2 = 1.4388e-2 m·K
const C2 = 1.4388e-2, T_LAVA = 1423;
const planckRel = (lam, T) => (Math.exp(C2 / (lam * T_LAVA)) - 1) / (Math.exp(C2 / (lam * T)) - 1);
const visRel = T => planckRel(650e-9, T), irRel = T => planckRel(10e-6, T);   // 10 µm: what a thermal camera sees
// near-IR (the night-vision channel, render rule 7): molten lava at 1423 K is far brighter at 0.8 µm (a GaAs tube's
// band) than at 650 nm — B(0.8 µm)/B(0.65 µm) = (0.65/0.8)⁵·(e^(c2/0.65µm·T) − 1)/(e^(c2/0.8µm·T) − 1) ≈ 6.5 — while
// a crust at ≤ 900 K gives < 1e-3 of the molten value there: only the cracks and fresh lava show
const NIR_VIS = (650e-9 / 800e-9) ** 5 * (Math.exp(C2 / (650e-9 * T_LAVA)) - 1) / (Math.exp(C2 / (800e-9 * T_LAVA)) - 1);
// crust surface temperature (K) dt script units after it formed (1 unit ≈ 3.4 min): ~600 °C after a few minutes,
// ~260 °C after half an hour, ~170 °C after two hours — a t^-1/2 STAND-IN curve; Hon et al. 1994 measured values of
// this order (their own fit is linear in log t)
const crustT = dt => 353 + (T_LAVA - 353) / Math.sqrt(1 + Math.max(0, dt) / .3);

const ORANGE = '#ff6a1a';
const P = (x, y, z) => new V3(x, y, z);
const LAKE_C = () => P(CRATER.x, LAKE_Y, CRATER.z);

// ---------------------------------------------------------------- lava lake
const LAKE_VS = `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const LAKE_GLSL = COMMON + `uniform float uTime, uOver, uHot; uniform vec3 uC; varying vec3 vW;
// crust plates drift from the upwelling toward the margins; cracks between them and the margins show the molten lava
float lakeHot(){ vec2 q = vW.xz - uC.xz; float r = length(q)/${CRATER.lake.toFixed(1)};
  vec2 p = q*.045 + vec2(uTime*.01, -uTime*.006);
  float n = fbm(p), crack = smoothstep(.014, 0., abs(n - .5)) + .5*smoothstep(.008, 0., abs(fbm(p*2.3 + 4.) - .5));
  float rim = .8*smoothstep(.9, 1., r);
  float over = uOver*smoothstep(.25, 0., abs(r - uOver*1.1))*(.6 + .4*n);   // an overturn: a hot front sweeping the lake
  return clamp((crack + rim)*uHot + over, 0., 1.); }`;
export const lavaLake = () => event({ name: 'Lava lake', t0: 0, t1: 60, bands: ['vis', 'ir', 'micro'], freq: ['lavaGlow', 'lavaThermal', 'crustThermal', 'lavaMicrowave'], tags: ['rare'],
  note: 'A pond of molten basalt at about 1150 °C in the crater ahead. Dark crust plates drift across it and split along glowing cracks; every so often the crust founders and the lake turns over in a sweep of fresh lava. In visible light only the cracks glow red-orange (Planck: a few hundred °C colder and the visible glow is tens to thousands of times fainter), while in infrared even the crust is bright — tens of times the ground around it — and in microwaves, where brightness simply follows temperature, the lake is several times brighter than the ground. Only a handful of volcanoes hold a lasting lava lake (Erebus, Erta Ale, Nyiragongo, Kīlauea 2008–18).',
  init() {
    this.u = { uTime: S.TIME, uOver: { value: 0 }, uHot: { value: 1 }, uC: { value: LAKE_C() }, uSOnI_: SURF_U.uSOnI_ };
    const m = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: LAKE_VS, fragmentShader: LAKE_GLSL + `
      void main(){ float h = lakeHot(); gl_FragColor = vec4(mix(vec3(.02, .014, .012), vec3(1.8, .5, .07), h), 1.); }` });
    // spectral eye: crust ~400–600 °C is already bright at 10 µm, cracks (molten) brighter still (Planck, irRel); microwave
    // ≈ 5× the ground's Tb wash (surface.js: x²·.12 of (1, .6, .1) ≈ .05 luminance at 260 K) by Rayleigh–Jeans
    // near-IR: the molten fraction's own glow — its visible red channel (1.8·h) × NIR_VIS (Planck, above); the
    // crust (basalt, nirAlb ~.08) adds nothing visible next to it
    m.userData.eyeBands = `uniform float uSOnI_;
      vec3 eyeTrans(){ return vec3(.05, 0., 0.); }
      void eyeBands(out vec4 o1, out vec4 o3){ float h = lakeHot(); o1 = vec4(1.2 + 2.6*h, 0., 0., 1.); o3 = vec4(0., .22 + .04*h, 0., 1.); }
#define EYE_NIR
      float eyeNIR(){ return uSOnI_*1.8*lakeHot()*${NIR_VIS.toFixed(3)}; }`;
    const g = new THREE.CircleGeometry(CRATER.lake, 72); g.rotateX(-Math.PI / 2); g.translate(CRATER.x, LAKE_Y + .4, CRATER.z);
    S.scene.add(solid(new THREE.Mesh(g, m)));
    this.glow = new Em('vis', ORANGE); this.heat = new Em('ir');
    this.overs = [6, 21, 37, 51];   // overturn episodes (script time)
  },
  update() {
    const { t } = S; let o = 0;
    for (const t0 of this.overs) { const k = (t - t0) / 3; if (k > 0 && k < 1) o = k; }
    this.u.uOver.value = o;
    // the lake's light lighting the fume just above it (a broad glow, strongest after dark when nothing competes)
    this.glow.set(LAKE_C().add(P(0, 25, 0)), 260, .5 + .4 * o);
    this.heat.set(LAKE_C().add(P(0, 10, 0)), 200, 1.2 + .6 * o);
    S.act.vis += .3; S.act.ir += .8; S.act.micro += .1;
  },
  where() { return LAKE_C().add(P(0, 20, 0)); } });

// ---------------------------------------------------------------- the active flow
export const activeFlow = () => event({ name: 'Lava flow through the breach', t0: 0, t1: 60, bands: ['vis', 'ir'], freq: ['lavaGlow', 'lavaThermal', 'crustThermal'], tags: ['time-compressed'],
  note: 'The lake spills through the low notch in the crater rim facing you and a channel of lava runs down the cone. While it is fed the channel stays near 1150 °C and glows; its front creeps across the valley floor. When the supply stops (about halfway through the night) the channel crusts over: the visible glow dies within minutes while the flow stays bright on a thermal camera and only slowly darkens.',
  init() {
    this.path = downhill(SPOTS.breach.x, SPOTS.breach.z + 4, 110, 8);
    this.vis = new Rib('vis', ORANGE, 110); this.ir = new Rib('ir', null, 110);
    this.front = new Em('vis', '#ff8a2a'); this.frontIR = new Em('ir');
  },
  update() {
    const { t } = S, STOP = 30, n = this.path.length;
    const f = clamp(.45 + t / 50), k = Math.max(2, Math.round(n * f)), pts = this.path.slice(0, k);
    const T = t < STOP ? 1400 : crustT(t - STOP), cracks = t < STOP ? 1 : .05 * Math.exp(-(t - STOP) / 5);
    const vI = 1.4 * Math.max(visRel(T), cracks * visRel(1400)), iI = 1.5 * irRel(T);
    this.vis.set(pts, 9, 6, vI); this.ir.set(pts, 16, 12, iI);
    const tip = pts[pts.length - 1];
    if (t < STOP + 4) { this.front.set(tip, 30, vI * .8); this.frontIR.set(tip, 50, iI); }
    this.tip = tip;
  },
  where() { return this.tip || this.path[0]; } });

// ---------------------------------------------------------------- older flows cooling
export const coolingFlows = () => event({ name: 'Cooling flow lobes', t0: 0, t1: 60, bands: ['ir', 'vis'], freq: ['crustThermal', 'lavaGlow'], tags: ['time-compressed'],
  note: 'Lobes that broke out on the cone earlier this evening. A crust forms within seconds and its surface cools roughly as one over the square root of time: below 600 °C in minutes, a couple of hundred °C after an hour or two. So they show red cracks only at first, then go dark to the eye, while in infrared they stay far warmer than the ground and fade slowly over the night.',
  init() {
    this.lobes = Array.from({ length: 6 }, () => {
      const a = (40 + R() * 100) * DEG, r = CRATER.rim + 40 + R() * 160, x = CRATER.x + Math.cos(a) * r, z = CRATER.z + Math.sin(a) * r;
      return { pts: downhill(x, z, 40 + Math.floor(R() * 40), 8), te: -24 + R() * 40, w: 6 + R() * 8 };
    });
    this.ir = this.lobes.map(() => new Rib('ir', null, 80)); this.vis = this.lobes.map(() => new Rib('vis', '#ff4a10', 80));
  },
  update() {
    const { t } = S;
    this.lobes.forEach((l, i) => {
      const dt = t - l.te; if (dt < 0) return;
      const grow = clamp(dt / 4), k = Math.max(2, Math.round(l.pts.length * grow)), pts = l.pts.slice(0, k), T = crustT(dt);
      this.ir[i].set(pts, l.w * 1.6, l.w, 1.4 * irRel(T));
      this.vis[i].set(pts, l.w, l.w * .7, 1.2 * Math.max(visRel(T), .06 * Math.exp(-dt / 6) * visRel(1400)));
    });
  },
  where() { const l = this.lobes.find(l => S.t > l.te) || this.lobes[0]; return l.pts[l.pts.length >> 1]; } });

// ---------------------------------------------------------------- lava fountain paroxysm
export const fountain = () => event({ name: 'Lava fountain paroxysm', t0: 18, t1: 42, bands: ['vis', 'ir'], freq: ['lavaGlow', 'lavaThermal'], tags: ['rare', 'time-compressed'],
  note: 'Gas-rich magma rises faster and the spattering vent in the lake grows into a fountain hundreds of metres high, like Etna\'s paroxysms of 2021, each lasting an hour or two. Clots leave the vent at ~1150 °C, yellow-orange, and redden as they cool in flight; in infrared the whole jet is a blaze.',
  init() {
    this.vent = LAKE_C().add(P(-30, 0, -25));
    this.c = Array.from({ length: 80 }, () => ({ s: R(), a: R() * 6.28, sp: .1 + R() * .25, r: .4 + R() * .5 }));
    this.vf = new EmField('vis', this.c.length, '#ffb040'); this.irf = new EmField('ir', 24);
    this.c.forEach((q, i) => this.vf.color(i, new THREE.Color().setHSL(.06 + q.s * .05, 1, .55)));
  },
  update() {
    const { t, T } = S, H = 25 + 380 * env(t, 18, 42, 5);   // spattering before and after, a 400 m jet at the peak
    this.c.forEach((q, i) => {
      const u = (T * q.r * .25 + q.s) % 1, y = 4 * H * u * (1 - u), sp = H * q.sp * u;
      const p = this.vent.clone().add(P(Math.cos(q.a) * sp - u * H * .15, y, Math.sin(q.a) * sp));
      const Tc = T_LAVA - 250 * u;                             // clots cool in flight
      this.vf.set(i, p, 4 + H * .025, 1.4 * visRel(Tc) ** .5);   // square root = display tone curve for the clots, not physics
      if (i < 24) this.irf.set(i, p, 8 + H * .05, 1.2 * irRel(Tc));
    });
    this.top = this.vent.clone().add(P(0, H, 0));
  },
  where() { return this.top; } });

// ---------------------------------------------------------------- plume
const PLUME_VS = `attribute vec3 aC; attribute vec4 aS; varying vec2 vQ; varying vec4 vS;
void main(){ vQ = position.xy; vS = aS;
  vec3 toC = cameraPosition - aC; toC.y = 0.; vec3 r = normalize(vec3(toC.z, 0., -toC.x));
  vec3 W = aC + r*position.x*aS.x*.5 + vec3(0., position.y*aS.x*.42, 0.);
  gl_Position = projectionMatrix*viewMatrix*vec4(W, 1.); }`;
const PLUME_SHAPE = `float plumeA(){ float n = fbm(vQ*1.4 + vec2(vS.z*17., vS.z*5. - uTime*.02));
  return smoothstep(1., .25, length(vQ))*(.35 + .65*n); }`;
export const gasPlume = () => event({ name: 'SO₂ gas plume', t0: 0, t1: 60, bands: ['uv', 'vis', 'ir'], freq: ['so2UV', 'dropletScatter', 'steam'],
  note: 'Gas pours from the crater and bends south on the wind. To the eye it is a thin veil of condensed steam, lit orange from below by the lava after dark. Its sulfur dioxide absorbs ultraviolet at 300–320 nm, so in UV it stands out as a dark plume against the bright twilight sky — the way UV cameras measure a volcano\'s SO₂ output. Once the sky\'s UV fades after sunset there is nothing left for it to block. During the paroxysm it turns ashy and dense.',
  init() {
    const N = 34, quad = [[-1, -1], [1, -1], [1, 1], [-1, 1]], pos = [], aC = [], aS = [], idx = [];
    this.axis = s => LAKE_C().add(P(-1700 * s ** 1.5, 40 + 1300 * s ** .8, -260 * s));
    for (let i = 0; i < N; i++) {
      const s = (i + R() * .6) / N, c = this.axis(s).add(P((R() - .5) * 60, 0, (R() - .5) * 60)), w = 120 + 800 * s;
      quad.forEach(([qx, qy]) => { pos.push(qx, qy, 0); aC.push(c.x, c.y, c.z); aS.push(w, s, R(), 0); }); const a = i * 4; idx.push(a, a + 1, a + 2, a, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aC', new THREE.Float32BufferAttribute(aC, 3)); g.setAttribute('aS', new THREE.Float32BufferAttribute(aS, 4)); g.setIndex(idx);
    this.u = { uTime: S.TIME, uCol: { value: new THREE.Color() }, uGlow: { value: 0 }, uAsh: { value: 0 }, uSOnI_: SURF_U.uSOnI_, uNirSky: SURF_U.uNirSky, uNirMoon: SURF_U.uNirMoon };
    const m = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: PLUME_VS, transparent: true, depthWrite: false, fragmentShader: COMMON + `uniform float uTime, uGlow, uAsh; uniform vec3 uCol; varying vec2 vQ; varying vec4 vS; ${PLUME_SHAPE}
      void main(){ float a = plumeA(), s = vS.y, low = exp(-s*5.)*smoothstep(.6, -1., vQ.y);
        vec3 c = mix(uCol, uCol*.45, uAsh) + uGlow*low*vec3(1., .32, .08);
        gl_FragColor = vec4(c, a*mix(.28*(1. - .6*s), .8*(1. - .4*s), uAsh)); }` });
    // spectral eye: SO₂ absorbs the UV skylight behind it (coverage, UV = 0); the warm wet base shows faintly in IR
    // near-IR: the droplets scatter like a cloud (Mie, size ≫ λ: albedo .5 STAND-IN, as the seaside mist) the sky and
    // the Moon (E/π, surface.js NEAR-IR), and the lava's own near-IR from below: the visible underglow's red channel
    // (uGlow·low) × NIR_VIS, the same Planck ratio as the lake that lights it
    m.userData.eyeBands = `uniform float uSOnI_, uNirSky; uniform vec4 uNirMoon;
      void eyeBands(out vec4 o1, out vec4 o3){ float a = plumeA(), s = vS.y;
      o1 = vec4(.25*exp(-s*4.), 0., 0., a*.85*exp(-s*1.6)); o3 = vec4(0.); }
#define EYE_NIR
      float eyeNIR(){ float s = vS.y, low = exp(-s*5.)*smoothstep(.6, -1., vQ.y);
        float aV = mix(.28*(1. - .6*s), .8*(1. - .4*s), uAsh), aE = .85*exp(-s*1.6);   // the veil's optical alpha / the eye's (thermal) coverage
        return uSOnI_*(.5*(uNirSky + uNirMoon.w*max(uNirMoon.y, 0.)) + uGlow*low*${NIR_VIS.toFixed(3)})*min(aV/aE, 1.); }`;
    this.mesh = new THREE.Mesh(g, m); this.mesh.frustumCulled = false; this.mesh.renderOrder = 4; S.scene.add(this.mesh);
  },
  update() {
    const { t } = S, n = night(), tw = clamp(1 - n);
    this.u.uCol.value.setRGB(.05 + .4 * tw, .045 + .26 * tw, .05 + .3 * tw).multiplyScalar(.6 + .4 * tw);
    this.u.uGlow.value = .25 + .5 * n; this.u.uAsh.value = env(t, 22, 44, 4) * .85;
    const uvSky = sm(-6, 3, sunEl());   // the skylight UV the SO₂ can block (surface.js uvSkylight)
    S.act.uv += .4 * uvSky; S.act.vis += .2; S.act.ir += .1;
  },
  where() { return this.axis(.35); } });

// ---------------------------------------------------------------- volcanic lightning
export const volcanicLightning = () => event({ name: 'Volcanic lightning', t0: 26, t1: 42, bands: ['vis', 'radio'], freq: ['lightning', 'sferics', 'ventVHF'], tags: ['rare', 'time-compressed'],
  note: 'Ash particles colliding in the turbulent column charge up like a thundercloud (a "dirty thunderstorm"): short sparks crackle right above the vent and longer bolts jump through the ash cloud. Each flash also sends out VLF radio sferics and a burst of VHF pulses that lightning-mapping arrays pick up — the near-vent sparks are almost continuous in radio. Seen during ash-rich eruptions (Etna, Eyjafjallajökull, Redoubt, Calbuco).',
  init() {
    this.base = LAKE_C().add(P(-30, 200, -25));
    this.bolts = Array.from({ length: 12 }, () => {
      const t0 = 27 + R() * 14, len = 120 + R() * 380, a = R() * 6.28, el = (R() - .3) * 1.4, pts = [];
      const o = this.base.clone().add(P(-R() * 300, R() * 350, (R() - .5) * 200)); let p = o.clone();
      for (let i = 0; i < 10; i++) { pts.push(p.clone()); p = p.clone().add(P(Math.cos(a) * len / 10 + (R() - .5) * 40, Math.sin(el) * len / 10 + (R() - .5) * 40, Math.sin(a) * len / 10)); }
      return { t0, pts };
    });
    this.bv = new Rib('vis', '#e4e8ff', 10); this.glow = new Em('vis', '#c8d0ff'); this.ra = new Em('radio'); this.vhf = new Em('radio');
    this.sp = new EmField('vis', 8, '#dfe4ff');
  },
  update() {
    const { t, T } = S, I = env(t, 26, 42, 2);
    // the flash light: the brightest active bolt sets it; switched back off once no bolt is lit (scrubbing included)
    let best = 0, at = null;
    if (I <= 0) { if (this.lit) ENV.flashLight.intensity = 0; this.lit = false; return; }
    for (const b of this.bolts) { const age = t - b.t0; if (age < 0 || age > .9) continue;
      const f = age < .2 ? (Math.sin(T * 97 + b.t0) > -.4 ? 1 : .3) * (1 - age / .2) : 0;
      this.bv.set(b.pts, 7, 5, f * 2.2); this.glow.set(b.pts[4], 500, f * .6); this.ra.set(b.pts[0], 700, 1 - age / .9);
      if (f > best) { best = f; at = b.pts[4]; } }
    if (best > 0) { ENV.flashLight.position.copy(at); ENV.flashLight.intensity = S.on.vis ? best * 2 : 0; } else if (this.lit) ENV.flashLight.intensity = 0;
    this.lit = best > 0;
    // near-vent sparks: tiny, many, every few tenths of a second (visual flicker only)
    for (let i = 0; i < 8; i++) { const ph = (T * 3.1 + i * .37) % 1; if (ph < .12) this.sp.set(i, this.base.clone().add(P(Math.sin(i * 7.1) * 40, -120 + Math.cos(i * 3.3) * 50, Math.cos(i * 5.3) * 40)), 18, I * (1 - ph / .12)); }
    this.vhf.set(this.base.clone().add(P(0, -80, 0)), 300, I * (.5 + .3 * Math.sin(T * 9)));
  },
  where() { return this.base.clone().add(P(-120, 220, 0)); } });

// ---------------------------------------------------------------- radon gamma at a fumarole
export const radonFumarole = () => event({ name: 'Fumarole radon (gamma)', t0: 0, t1: 60, bands: ['gamma', 'ir'], freq: ['bi214Gamma', 'pb214Gamma', 'steam'],
  note: 'A steaming crack on the ridge flank to your left (look left). Volcanic gas and soil gas carry radon from the magma and the rock; its daughters Pb-214 (352 keV) and Bi-214 (609 keV), which grow in over tens of minutes and settle on the rock of the crack, give off gamma rays. It is faint and local: a scintillator held over the vent reads a little above background, and the air absorbs most of it within a hundred metres or two. Fresh basalt itself is poorer in uranium, thorium and potassium than granite. The vapour above the crack is warm in infrared.',
  init() {
    const c = SPOTS.fumarole; this.pts = Array.from({ length: 6 }, () => c.clone().add(P((R() - .5) * 8, .3, (R() - .5) * 8)));
    this.g = new EmField('gamma', this.pts.length); this.ir = new EmField('ir', this.pts.length);
  },
  update() {
    const { T } = S;
    this.pts.forEach((p, i) => {
      this.g.set(i, p, 3 + i % 3, .18 + .06 * Math.sin(T * .7 + i));
      const age = (T * .3 + i / 6) % 1; this.ir.set(i, p.clone().add(P(age * 1.5, age * 7, 0)), 1.5 + age * 4, .35 * (1 - age));
    });
  },
  where() { return SPOTS.fumarole.clone().add(P(0, 3, 0)); } });

// ---------------------------------------------------------------- monitoring station
export const monitoringStation = () => event({ name: 'Volcano monitoring station', t0: 0, t1: 60, bands: ['radio', 'micro', 'vis'], freq: ['monTelemetry', 'wifi5', 'gpsL1', 'ledRed'],
  note: 'A solar-powered station on the ridge beside you: a GNSS antenna tracks navigation satellites (L band, microwave) to measure the volcano swelling by millimetres, the seismometer streams continuously and the tiltmeter and GNSS report in short VHF telemetry bursts (radio), and a thermal camera on a mast watches the crater, streaming its video over a 5 GHz point-to-point link (microwave). A red status LED blinks on the box.',
  init() {
    const b = SPOTS.station, mast = b.clone().add(P(0, 6, 0)), cam = b.clone().add(P(-1.5, 4, 0)), G = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: .7 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, 6, 6), dark); pole.position.set(b.x, b.y + 3, b.z); G.add(pole);
    const pole2 = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, 4, 6), dark); pole2.position.set(cam.x, b.y + 2, cam.z); G.add(pole2);
    const box = new THREE.Mesh(new THREE.BoxGeometry(.6, .7, .4), dark); box.position.set(b.x + .6, b.y + .9, b.z); G.add(box);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, .05, .8), new THREE.MeshStandardMaterial({ color: 0x0a1020, roughness: .3, metalness: .4 })); panel.position.set(b.x + .6, b.y + 1.9, b.z); panel.rotation.z = .5; G.add(panel);
    const camBox = new THREE.Mesh(new THREE.BoxGeometry(.5, .25, .25), dark); camBox.position.copy(cam); G.add(camBox);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.18, 10, 6, 0, 6.28, 0, 1.6), new THREE.MeshStandardMaterial({ color: 0xd8d8d0, roughness: .5 })); dome.position.copy(mast); G.add(dome);
    S.scene.add(spectralGroup(G, 'concrete', { weight: .02 }));
    this.top = mast; this.cam = cam; this.led = b.clone().add(P(.6, 1.3, .21));
    this.tele = new Em('radio'); this.wifi = new Em('micro'); this.ledE = new Em('vis', '#ff2020');
    // the 5 GHz link goes back over the ridge to the observatory (east, behind you); drawn as a short beam in the old
    // view only: clear air does not scatter a 6 cm beam toward you (render rule 6). The eye sees its panel antenna's
    // pattern toward you instead (sources.js BEAM.dish: a ~30 cm panel at 5.5 GHz, θ3dB ≈ 70 λ/D ≈ 13°, boresight east
    // +z, level), and the telemetry whip's vertical dipole (BEAM.dipole)
    this.beam = new Rib('micro', null, 12);
    this.sats = Array.from({ length: 7 }, () => ({ az: FOV_SKY.az0 + 6 + R() * 108, el: 15 + R() * 40 })); this.gnss = new EmField('micro', this.sats.length, '#ffd27a');
  },
  update() {
    const { t, T } = S, ph = (t % 3) / 3;
    const whip = this.cam.clone().add(P(0, 2, 0)), dc = S.camera.position.clone().sub(this.cam).normalize();   // antenna → you
    if (ph < .2) this.tele.set(whip, 9, Math.sin(ph / .2 * Math.PI) * .9, BEAM.dipole(Math.sin(toViewer(whip).el)));
    this.wifi.set(this.cam, 2.2, .5 + .2 * Math.sin(T * 5), BEAM.dish(Math.acos(clamp(dc.z, -1, 1)), 13 * DEG));
    this.beam.set(Array.from({ length: 12 }, (_, i) => this.cam.clone().add(P(0, i * .3, 4 + i * 6))), .6, 3, .35, 0, 0);
    this.ledE.set(this.led, .25, T % 2 < .15 ? 1 : 0);
    // each point drifts along its own track and wraps inside FOV_SKY (az 214–326, el 12–56), fading at the edges, as a
    // satellite setting out of the cone is replaced by another rising into it (as the ocean's gnss())
    const W = 112, wrap = (x, a, w) => a + (((x - a) % w) + w) % w;
    this.sats.forEach((s, i) => { const az = wrap(s.az + t * 1.2 * (i % 2 ? 1 : -1), FOV_SKY.az0 + 4, W), el = wrap(s.el + t * .4 * Math.sin(i), 12, 44);
      const edge = Math.min(az - FOV_SKY.az0 - 4, FOV_SKY.az0 + 4 + W - az, el - 12, 56 - el);
      this.gnss.set(i, skyP(az, el), deg(.7), .2 * sm(0, 3, edge)); });
  },
  where() { return this.top; } });
