// Entry point: run(scenario) builds the renderer, atmosphere, HUD, the scenario's world and
// events, then drives the loop. A scenario is a plain object:
//
//   {
//     title, loading, hint,                 // UI text
//     atmosphere: { lightPollution, cloudCover },   // optional, see world/atmosphere.js
//     fog: .0001,                           // optional FogExp2 density
//     meterNorm: { radio: .., ... },        // optional per-band meter tops (defaults in core/bands.js)
//     build()  -> { walk(t, camera), groundAt(x, z) },   // builds terrain/props once
//     events() -> [event, ...],             // local + library events; init() order = list order
//   }
//
// URL parameters (handy for screenshots): ?t=30 (script time 0–60) &yaw=0.3 &pitch=0.5
// &paused &bands=ir,micro &labels=0 &detector=orbit (default ground: the atmosphere absorbs far-UV/X/gamma)
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { clamp } from './core/util.js';
import { S } from './core/state.js';
import { BANDS, METER_NORM } from './core/bands.js';
import { SPECTRUM, bandOf, describe } from './core/spectrum.js';
import { hideAllSources, EMS, RIBS, FIELDS } from './render/sources.js';
import { applyVisMode } from './render/instrument.js';
import { createAtmosphere, sunEl } from './world/atmosphere.js';
import { updateSurfaces, uvSkylight } from './render/surface.js';
import { buildDom, createHud, sizeOverlay, drawOverlay } from './ui/hud.js';

// S.curEvent lets sources group ghost markers (absorbed in Ground mode) by event
function updateEvent(e) { S.curEvent = e; if (e.update) e.update(); S.curEvent = null; }

export function run(sc) {
  buildDom(sc);
  // let the loading text paint before the (synchronous) world build
  requestAnimationFrame(() => setTimeout(() => start(sc), 0));
}

function start(sc) {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  const PR = Math.min(devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(PR); renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .42;
  renderer.domElement.id = 'gl'; document.body.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000000, sc.fog ?? .0001);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, .2, 40000);
  camera.rotation.order = 'YXZ'; scene.add(camera);
  Object.assign(S, { renderer, scene, camera, PR });

  const rt = new THREE.WebGLRenderTarget(innerWidth * PR, innerHeight * PR, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  // NaN/Inf guard: one bad pixel from any shader (e.g. pow() of a negative number, which real GPUs return as NaN
  // and SwiftShader doesn't) would be smeared by the bloom mip chain into a large black staircase block.
  composer.addPass(new ShaderPass({ uniforms: { tDiffuse: { value: null } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){ vec4 c = texture2D(tDiffuse, vUv); bvec4 bad = bvec4(isnan(c.r) || isinf(c.r), isnan(c.g) || isinf(c.g), isnan(c.b) || isinf(c.b), isnan(c.a) || isinf(c.a));
        gl_FragColor = any(bad) ? vec4(0., 0., 0., 1.) : c; }` }));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .55, .3, .9));
  composer.addPass(new OutputPass());

  const atmo = createAtmosphere(sc.atmosphere);
  const world = sc.build();
  S.groundAt = world.groundAt || (() => 0);
  const EV = sc.events();
  EV.forEach(e => e.init && e.init());
  EV.sort((a, b) => a.t0 - b.t0);
  const norm = { ...METER_NORM, ...(sc.meterNorm || {}) };

  const hud = createHud({ onFilter: () => { atmo.setVis(S.on.vis); applyVisMode(S.on.vis); } });

  // URL parameters
  const q = new URLSearchParams(location.search);
  if (q.has('t')) S.t = clamp(+q.get('t'), 0, 60);
  if (q.has('yaw')) S.yaw = clamp(+q.get('yaw'), -1.35, 1.35);
  if (q.has('pitch')) S.pitch = clamp(+q.get('pitch'), -.1, 1.5);
  if (q.has('bands')) { const ids = q.get('bands').split(','); BANDS.forEach(b => S.on[b.id] = ids.includes(b.id)); }
  if (q.has('paused')) hud.setPlay(false);
  if (q.get('labels') === '0') hud.setLabels(false);
  hud.setDetector(q.get('detector') === 'orbit' ? 'orbit' : 'ground');

  // drag to look: a quarter sphere ahead (yaw ±1.35 rad, pitch −0.1…1.5)
  const gl = renderer.domElement; let drag = null;
  gl.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; gl.setPointerCapture(e.pointerId); });
  gl.addEventListener('pointermove', e => { if (!drag) return; const s = camera.fov / 65 * .0042;
    S.yaw = clamp(S.yaw + (e.clientX - drag.x) * s, -1.35, 1.35); S.pitch = clamp(S.pitch + (e.clientY - drag.y) * s, -.1, 1.5); drag = { x: e.clientX, y: e.clientY }; });
  gl.addEventListener('pointerup', () => drag = null);
  gl.addEventListener('wheel', e => { e.preventDefault(); camera.fov = clamp(camera.fov + e.deltaY * .03, 20, 90); camera.updateProjectionMatrix(); }, { passive: false });
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); sizeOverlay();
  });

  sizeOverlay();
  hud.sync();

  // one simulation step at script time t (no render): what the frame loop does before composer.render()
  // drawn / absorbed: optional arrays of Sets, collect the bands each event actually emitted / had absorbed (Ground mode)
  function step(t, drawn, absorbed) {
    S.t = t; S.T = t * 2; S.TIME.value = S.T;
    BANDS.forEach(b => S.act[b.id] = 0);
    hideAllSources();
    world.walk(S.t, camera);
    camera.rotation.set(S.pitch, S.yaw, 0);
    atmo.update();
    updateSurfaces(uvSkylight(sunEl()));
    world.update && world.update(S.t);
    EV.forEach((e, i) => {
      if (!drawn) { updateEvent(e); return; }
      const before = { ...S.act }; updateEvent(e);
      BANDS.forEach(b => { if (S.act[b.id] - before[b.id] > 1e-6) drawn[i].add(b.id); });
      const gh = S.ghosts.get(e); if (gh) gh.bands.forEach(b => absorbed[i].add(b));
    });
  }
  if (q.has('dump')) dumpReport(sc, EV, step, norm, +(q.get('dstep') || .5));
  if (q.has('t')) S.t = clamp(+q.get('t'), 0, 60); else S.t = 0;
  document.getElementById('loading').remove();

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(.05, (now - last) / 1000); last = now;
    S.T = now / 1000; S.TIME.value = S.T;
    if (S.playing) { S.t += dt * .5; if (S.t > 60) S.t = 0; }      // half speed: the 0–60 script plays over 120 s
    BANDS.forEach(b => S.act[b.id] = 0);
    hideAllSources();
    world.walk(S.t, camera);
    camera.rotation.set(S.pitch, S.yaw, 0);
    atmo.update();
    updateSurfaces(uvSkylight(sunEl()));
    world.update && world.update(S.t);
    EV.forEach(updateEvent);
    composer.render();
    const active = EV.filter(e => S.t >= e.t0 && S.t <= e.t1);
    drawOverlay(active); hud.frame(active, norm);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ?dump: step the whole 0–60 script without drawing, sample per-band activity and the active events,
// count draw calls at a few moments, and write the report as JSON into <script id="spectra-dump">
// (read by `uv run spectra timeline`).
function dumpReport(sc, EV, step, norm, dt) {
  const { renderer, scene, camera } = S, samples = [], drawn = EV.map(() => new Set()), absorbed = EV.map(() => new Set());
  for (let t = 0; t <= 60 + 1e-6; t += dt) {
    step(t, drawn, absorbed);
    samples.push({ t: +t.toFixed(3), act: Object.fromEntries(BANDS.map(b => [b.id, +S.act[b.id].toFixed(4)])),
      active: EV.flatMap((e, i) => (t >= e.t0 && t <= e.t1 ? [i] : [])) });
  }
  const draws = [5, 30, 55].map(t => {
    step(t);
    renderer.info.autoReset = false; renderer.info.reset();
    renderer.render(scene, camera);
    const r = { t, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
    renderer.info.autoReset = true; return r;
  });
  const report = {
    scenario: sc.title, detector: S.detector, step: dt, norm, draws, sources: { em: EMS.length, rib: RIBS.length, fields: FIELDS.length, fieldInstances: FIELDS.reduce((a, f) => a + f.n, 0) },
    events: EV.map((e, i) => {
      const freq = e.freq || [], known = freq.filter(k => SPECTRUM[k]);
      return { name: e.name, t0: e.t0, t1: e.t1, bands: e.bands, tags: e.tags || [], drawn: [...drawn[i]], absorbed: [...absorbed[i]],
        freq: known.map(k => ({ key: k, name: SPECTRUM[k].name, band: bandOf(SPECTRUM[k]), at: describe(SPECTRUM[k]),
          ground: SPECTRUM[k].ground !== false, stylised: !!SPECTRUM[k].stylised })),
        unknownFreq: freq.filter(k => !SPECTRUM[k]) };
    }),
    samples,
  };
  const el = document.createElement('script'); el.type = 'application/json'; el.id = 'spectra-dump';
  el.textContent = JSON.stringify(report); document.body.appendChild(el);
}
