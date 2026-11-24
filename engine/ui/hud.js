// HUD: DOM controls, spectrum meters, event panel, and the overlay canvas (compass, labels, off-screen arrows).
import { V3, DEG, clamp, lerp, PLAY } from '../core/util.js';
import { S } from '../core/state.js';
import { BANDS, BAND, PRESETS, TRANSMIT, ABSORB_AT } from '../core/bands.js';
import { SPECTRUM, bandOf, describe } from '../core/spectrum.js';
import { clockHours } from '../world/atmosphere.js';

// Per event and band: the processes it lists (`freq`) and whether all of them are absorbed before the ground.
const INFO = new WeakMap();
function bandInfo(e) {
  let m = INFO.get(e); if (m) return m;
  const procs = (e.freq || []).map(k => SPECTRUM[k]).filter(Boolean);
  m = Object.fromEntries(e.bands.map(b => { const ps = procs.filter(p => bandOf(p) === b); return [b, { procs: ps, absorbed: ps.length > 0 && ps.every(p => p.ground === false) }]; }));
  INFO.set(e, m); return m;
}
const absorbedBands = e => S.detector === 'ground' ? e.bands.filter(b => bandInfo(e)[b].absorbed) : [];
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function buildDom(sc) {
  document.body.insertAdjacentHTML('afterbegin', `
<div id="loading">${sc.loading || 'Loading…'}</div>
<canvas id="ov"></canvas>
<div id="flash"></div>
<div id="top">
  <a class="btn" id="home" href="${sc.home || window.SPECTRA_HOME || '../../index.html'}" title="All scenarios">☰</a>
  <button class="btn" id="play">❚❚ Pause</button>
  <span class="btn" id="clock">19:30</span>
  <input type="range" id="scrub" min="0" max="${PLAY.len.toFixed(2)}" step="0.01" value="0">
  <span id="presets"></span>
  <button class="btn active" id="labels">Labels</button>
  <button class="btn" id="detector" title="Ground: what reaches a detector on the ground (the air absorbs far-UV, X-rays and gamma rays from space). Orbit: what a satellite would see.">Detector: Ground</button>
  <button class="btn" id="eyemode" hidden title="Adapted: every band is seen by its own receptor, adapted to its own scene (no band privileged). Absolute: one receptor, adapted to visible light, for every band — the invisible bands at their raw level.">Eye: adapted</button>
  <button class="btn" id="eyeset" hidden title="Eye settings: per-band brightness and what each band's brightness means">Eye ⚙</button>
</div>
<div id="eyepanel" hidden></div>
<div id="events"><h3>Now happening</h3><div id="evlist"></div></div>
<div id="hint">${sc.hint || 'Drag to look ahead and up · scroll to zoom · click a band or press 1–7 to filter · space = play/pause · lasts 2 minutes'}</div>
<div id="spectrum"></div>`);
}

export function createHud({ onFilter }) {
  const spec = document.getElementById('spectrum'), pre = document.getElementById('presets');
  BANDS.forEach((b, i) => {
    const c = document.createElement('div'); c.className = 'cell'; c.id = 'cell-' + b.id;
    c.style.setProperty('--c', b.id === 'vis' ? 'linear-gradient(90deg,#f44,#fa0,#ff4,#4f4,#4af,#a4f)' : b.color);
    if (b.id === 'vis') c.style.borderImage = 'linear-gradient(90deg,#f44,#fa0,#ff4,#4f4,#4af,#a4f) 1';
    c.innerHTML = `<div class="fill"></div><div class="lbl"><b>${i + 1} · ${b.name}</b><small>${b.range}</small></div>`;
    c.onclick = () => toggle(b.id); spec.appendChild(c);
  });
  Object.entries(PRESETS).forEach(([name, ids]) => {
    const btn = document.createElement('button'); btn.className = 'btn'; btn.textContent = name; btn.style.marginRight = '4px';
    btn.onclick = () => { BANDS.forEach(b => S.on[b.id] = ids.includes(b.id)); sync(); }; pre.appendChild(btn);
  });
  let lastEv = '';
  function toggle(id) { S.on[id] = !S.on[id]; sync(); }
  function sync() {
    BANDS.forEach(b => document.getElementById('cell-' + b.id).classList.toggle('off', !S.on[b.id]));
    [...pre.children].forEach(btn => { const ids = PRESETS[btn.textContent]; btn.classList.toggle('active', BANDS.every(b => S.on[b.id] === ids.includes(b.id))); });
    onFilter(); lastEv = '';
  }

  const playBtn = document.getElementById('play'), scrub = document.getElementById('scrub'), labBtn = document.getElementById('labels');
  const setPlay = p => { S.playing = p; playBtn.textContent = p ? '❚❚ Pause' : '▶ Play'; };
  playBtn.onclick = () => setPlay(!S.playing);
  scrub.oninput = () => { S.t = PLAY.script(+scrub.value); };   // the slider runs in real seconds
  const setLabels = v => { S.labelsOn = v; labBtn.classList.toggle('active', v); };
  labBtn.onclick = () => setLabels(!S.labelsOn);
  const detBtn = document.getElementById('detector');
  const setDetector = v => { S.detector = v; detBtn.textContent = `Detector: ${v === 'orbit' ? 'Orbit' : 'Ground'}`; detBtn.classList.toggle('active', v === 'orbit'); lastEv = ''; };
  detBtn.onclick = () => setDetector(S.detector === 'orbit' ? 'ground' : 'orbit');
  addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); setPlay(!S.playing); }
    const k = +e.key; if (k >= 1 && k <= 7) toggle(BANDS[k - 1].id);
    if (e.key === 'ArrowLeft') S.yaw = clamp(S.yaw + .08, -1.35, 1.35); if (e.key === 'ArrowRight') S.yaw = clamp(S.yaw - .08, -1.35, 1.35);
    if (e.key === 'ArrowUp') S.pitch = clamp(S.pitch + .06, -.1, 1.5); if (e.key === 'ArrowDown') S.pitch = clamp(S.pitch - .06, -.1, 1.5);
  });

  const meter = Object.fromEntries(BANDS.map(b => [b.id, 0]));
  const fills = Object.fromEntries(BANDS.map(b => [b.id, document.querySelector(`#cell-${b.id} .fill`)]));
  const clock = document.getElementById('clock'), evlist = document.getElementById('evlist');

  // meters use soft compression 1 - exp(-act/norm): busy bands approach the top but never pin
  function frame(active, norm) {
    scrub.value = PLAY.real(S.t);
    BANDS.forEach(b => { meter[b.id] = lerp(meter[b.id], 1 - Math.exp(-S.act[b.id] / norm[b.id]), .15); fills[b.id].style.height = (meter[b.id] * 100) + '%'; });
    const h = clockHours(), hrs = ((h % 24) + 24) % 24;   // the scenario's local time (site clock), else 19:30 + 4 h
    clock.textContent = `${Math.floor(hrs)}:${String(Math.floor((hrs % 1) * 60)).padStart(2, '0')}`;
    const key = active.map(e => e.name).join('|'); if (key === lastEv) return; lastEv = key;
    evlist.innerHTML = active.map(evHtml).join('');
  }
  if (S.eye) eyeControls();
  return { sync, frame, setPlay, setLabels, setDetector };
}

// Spectral eye (M10): what a band's brightness and hue stand for, physically
const LEGEND = {
  radio: 'flux; the sky glows with galactic synchrotron · soft (100 m array) · speckle = coherent transmitters',
  micro: 'brightness temperature: cold sea and sky dark, warm land bright · blurred (1 m dish)',
  ir: 'radiated temperature (8–14 µm): warmer is brighter · warm-blooded bodies glow',
  vis: 'luminance, natural colour (a little desaturated)',
  uv: 'UV-A radiance: skylight on bright ground, glowing haze at dusk',
  xray: 'photon counts (keV): the air absorbs them within metres',
  gamma: 'single photon hits (MeV): their density is the rate · the air absorbs them in ~160 m',
};
const EYE_KEY = 'spectra.eye';
// the eye controls: Eye: adapted / absolute, and the settings panel (per-band brightness, legend); kept per viewer
function eyeControls() {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(EYE_KEY) || '{}') || {}; } catch { saved = {}; }
  const view = S.eyeView = { abs: !!(S.eyeView?.abs ?? saved.abs), w: { ...Object.fromEntries(BANDS.map(b => [b.id, 1])), ...(saved.w || {}) } };
  const save = () => { try { localStorage.setItem(EYE_KEY, JSON.stringify(view)); } catch { /* private window: not kept */ } };
  const mode = document.getElementById('eyemode'), set = document.getElementById('eyeset'), panel = document.getElementById('eyepanel');
  mode.hidden = set.hidden = false;
  const showMode = () => { mode.textContent = `Eye: ${view.abs ? 'absolute' : 'adapted'}`; mode.classList.toggle('active', view.abs); };
  mode.onclick = () => { view.abs = !view.abs; showMode(); save(); }; showMode();
  panel.innerHTML = `<h3>Spectral eye</h3><p class="note">Each band is one hue; its brightness is the quantity below. The hue shifts a little
    with frequency inside the band. Adapted: every band has its own receptor.</p>` + BANDS.map(b => `
    <label class="eyerow"><span class="eyename" style="color:${b.id === 'vis' ? '#fff' : b.color}">${b.name}</span>
      <input type="range" min="0" max="2" step="0.05" value="${view.w[b.id]}" data-band="${b.id}"><small>${LEGEND[b.id]}</small></label>`).join('')
    + '<button class="btn" id="eyereset">Reset</button>';
  panel.querySelectorAll('input').forEach(inp => { inp.oninput = () => { view.w[inp.dataset.band] = +inp.value; save(); }; });
  document.getElementById('eyereset').onclick = () => {
    BANDS.forEach(b => { view.w[b.id] = 1; }); view.abs = false; showMode(); save();
    panel.querySelectorAll('input').forEach(inp => { inp.value = 1; });
  };
  set.onclick = () => { panel.hidden = !panel.hidden; set.classList.toggle('active', !panel.hidden); };
}

// One panel entry: name + tags, note, band chips (hover: processes with frequency / wavelength), absorption note.
function evHtml(e) {
  const info = bandInfo(e), abs = absorbedBands(e), all = abs.length && abs.length === e.bands.length;
  const shown = e.bands.some(b => S.on[b] && !abs.includes(b));
  const chips = e.bands.map(b => {
    const ps = info[b].procs, a = abs.includes(b);
    let title = ps.length ? ps.map(p => `${p.name} · ${describe(p)}`).join('\n') : BAND[b].name;
    if (a) title += `\nAbsorbed before the ground: ${TRANSMIT[b].why}. Switch Detector to Orbit to see it.`;
    return `<span class="chip${a ? ' abs' : ''}" title="${esc(title)}" style="color:${BAND[b].color};opacity:${S.on[b] && !a ? 1 : .35}">${BAND[b].name}</span>`;
  }).join('');
  const tags = (e.tags || []).map(t => `<span class="tag tag-${t}">${t}</span>`).join('');
  const absNote = all ? `<small class="absnote">Nothing of this reaches the ground: switch Detector to Orbit.</small>`
    : abs.length ? `<small class="absnote">From the ground: ${abs.map(b => BAND[b].name).join(', ')} absorbed high in the atmosphere.</small>` : '';
  return `<div class="ev ${shown ? '' : 'dim'}"><b>${e.name}${tags}</b><small>${e.note}</small>${absNote}<div class="chips">${chips}</div></div>`;
}

// Overlay canvas
const ov = () => document.getElementById('ov');
let octx;
export function sizeOverlay() { const c = ov(); c.width = innerWidth * S.PR; c.height = innerHeight * S.PR; octx = c.getContext('2d'); octx.setTransform(S.PR, 0, 0, S.PR, 0, 0); }

const NAMES = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
export function drawOverlay(active) {
  const W = innerWidth, H = innerHeight, camera = S.camera; octx.clearRect(0, 0, W, H);
  const fwd = new V3(); camera.getWorldDirection(fwd); const head = (Math.atan2(fwd.z, fwd.x) / DEG + 360) % 360;
  const cx = W / 2, cy = 62, half = 170;
  octx.font = '11px system-ui'; octx.textAlign = 'center'; octx.fillStyle = 'rgba(12,14,26,.6)'; octx.fillRect(cx - half - 10, cy - 13, half * 2 + 20, 26);
  for (let a = 0; a < 360; a += 15) {
    const d = ((a - head + 540) % 360) - 180; if (Math.abs(d) > 60) continue; const x = cx + d / 60 * half;
    octx.fillStyle = 'rgba(232,234,246,.8)'; octx.fillRect(x, cy + 4, 1, NAMES[a] ? 6 : 3);
    if (NAMES[a]) { octx.fillStyle = a === 0 ? '#ff8a8a' : '#e8eaf6'; octx.fillText(NAMES[a], x, cy); }
  }
  octx.fillStyle = '#b46bff'; octx.beginPath(); octx.moveTo(cx - 5, cy + 13); octx.lineTo(cx + 5, cy + 13); octx.lineTo(cx, cy + 8); octx.fill();
  const right = W > 760 ? W - 300 : W - 30, v = new V3();
  drawGhosts(W, H, right, v);
  if (!S.labelsOn) return;
  for (const e of active) {
    const p = e.where && e.where(); if (!p) continue;
    const abs = absorbedBands(e);
    if (!e.bands.some(b => S.on[b] && !abs.includes(b))) continue;
    v.copy(p).project(camera);
    let sx = (v.x * .5 + .5) * W, sy = (-v.y * .5 + .5) * H; const behind = v.z > 1;
    const col = BAND[e.bands[0]].color;
    if (!behind && sx > 30 && sx < right && sy > 90 && sy < H - 110) {
      octx.fillStyle = 'rgba(0,0,0,.55)'; const w = octx.measureText(e.name).width + 10; octx.fillRect(sx - w / 2, sy + 14, w, 15);
      octx.fillStyle = '#e8eaf6'; octx.fillText(e.name, sx, sy + 25);
    } else {
      if (behind) { sx = W - sx; sy = H - sy; }
      const ang = Math.atan2(sy - H / 2, sx - W / 2), dx = Math.cos(ang), dy = Math.sin(ang);
      const kx = dx > 0 ? (right - 20 - W / 2) / dx : (30 - W / 2) / dx, ky = dy > 0 ? (H - 120 - H / 2) / dy : (100 - H / 2) / dy, k = Math.min(Math.abs(kx), Math.abs(ky));
      const ax = W / 2 + dx * k, ay = H / 2 + dy * k;
      octx.save(); octx.translate(ax, ay); octx.rotate(ang); octx.fillStyle = col; octx.beginPath(); octx.moveTo(9, 0); octx.lineTo(-5, -6); octx.lineTo(-5, 6); octx.fill(); octx.restore();
      octx.fillStyle = 'rgba(0,0,0,.55)'; const w = octx.measureText(e.name).width + 10, lx = clamp(ax - dx * 14, w / 2 + 4, W - w / 2 - 4), ly = ay - dy * 16;
      octx.fillRect(lx - w / 2, ly - 10, w, 15); octx.fillStyle = '#e8eaf6'; octx.fillText(e.name, lx, ly + 1);
    }
  }
}

// Ground mode: sources absorbed by the atmosphere leave a faint dashed ring and "X-ray absorbed ~40 km"
// at their position (one per event, grouped in render/sources.js). Off-screen ghosts are skipped.
function drawGhosts(W, H, right, v) {
  if (S.detector !== 'ground' || !S.ghosts.size) return;
  octx.save(); octx.setLineDash([4, 4]); octx.lineWidth = 1.2; octx.font = '10px system-ui'; octx.textAlign = 'center';
  let n = 0;
  for (const g of S.ghosts.values()) {
    const bands = [...g.bands].filter(b => S.on[b] && ABSORB_AT[b]); if (!bands.length) continue;
    v.copy(g.pos).project(S.camera); if (v.z > 1) continue;
    const sx = (v.x * .5 + .5) * W, sy = (-v.y * .5 + .5) * H;
    if (sx < 20 || sx > right || sy < 90 || sy > H - 100) continue;
    if (++n > 12) break;
    const kms = bands.map(b => ABSORB_AT[b][0]), lo = Math.min(...kms), hi = Math.max(...kms);
    octx.strokeStyle = BAND[bands[0]].color; octx.globalAlpha = .55;
    octx.beginPath(); octx.arc(sx, sy, 15, 0, Math.PI * 2); octx.stroke();
    if (S.labelsOn) {
      const txt = `${bands.map(b => ABSORB_AT[b][1]).join(' + ')} absorbed ~${lo === hi ? lo : `${lo}–${hi}`} km`;
      octx.globalAlpha = .75; octx.fillStyle = 'rgba(0,0,0,.45)'; const w = octx.measureText(txt).width + 8; octx.fillRect(sx - w / 2, sy - 33, w, 13);
      octx.fillStyle = BAND[bands[0]].color; octx.fillText(txt, sx, sy - 23);
    }
  }
  octx.restore();
}
