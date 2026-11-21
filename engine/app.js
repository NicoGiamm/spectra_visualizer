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
// &paused &bands=ir,micro &labels=0
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { clamp } from './core/util.js';
import { S } from './core/state.js';
import { BANDS, METER_NORM } from './core/bands.js';
import { hideAllSources } from './render/sources.js';
import { applyVisMode } from './render/instrument.js';
import { createAtmosphere } from './world/atmosphere.js';
import { buildDom, createHud, sizeOverlay, drawOverlay } from './ui/hud.js';

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
    world.update && world.update(S.t);
    EV.forEach(e => e.update && e.update());
    composer.render();
    const active = EV.filter(e => S.t >= e.t0 && S.t <= e.t1);
    drawOverlay(active); hud.frame(active, norm);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
