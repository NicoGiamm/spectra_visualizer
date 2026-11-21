// HUD: DOM controls, spectrum meters, event panel, and the overlay canvas (compass, labels, off-screen arrows).
import { V3, DEG, clamp, lerp } from '../core/util.js';
import { S } from '../core/state.js';
import { BANDS, BAND, PRESETS } from '../core/bands.js';

export function buildDom(sc) {
  document.body.insertAdjacentHTML('afterbegin', `
<div id="loading">${sc.loading || 'Loading…'}</div>
<canvas id="ov"></canvas>
<div id="flash"></div>
<div id="top">
  <a class="btn" id="home" href="${sc.home || window.SPECTRA_HOME || '../../index.html'}" title="All scenarios">☰</a>
  <button class="btn" id="play">❚❚ Pause</button>
  <span class="btn" id="clock">19:30</span>
  <input type="range" id="scrub" min="0" max="120" step="0.01" value="0">
  <span id="presets"></span>
  <button class="btn active" id="labels">Labels</button>
</div>
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
  scrub.oninput = () => { S.t = +scrub.value / 2; };
  const setLabels = v => { S.labelsOn = v; labBtn.classList.toggle('active', v); };
  labBtn.onclick = () => setLabels(!S.labelsOn);
  addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); setPlay(!S.playing); }
    const k = +e.key; if (k >= 1 && k <= 7) toggle(BANDS[k - 1].id);
    if (e.key === 'ArrowLeft') S.yaw = clamp(S.yaw + .08, -1.35, 1.35); if (e.key === 'ArrowRight') S.yaw = clamp(S.yaw - .08, -1.35, 1.35);
    if (e.key === 'ArrowUp') S.pitch = clamp(S.pitch + .06, -.1, 1.5); if (e.key === 'ArrowDown') S.pitch = clamp(S.pitch - .06, -.1, 1.5);
  });

  const meter = Object.fromEntries(BANDS.map(b => [b.id, 0]));
  const fills = Object.fromEntries(BANDS.map(b => [b.id, document.querySelector(`#cell-${b.id} .fill`)]));
  const clock = document.getElementById('clock'), evlist = document.getElementById('evlist');

  function frame(active, norm) {
    scrub.value = S.t * 2;
    BANDS.forEach(b => { meter[b.id] = lerp(meter[b.id], clamp(S.act[b.id] / norm[b.id]), .15); fills[b.id].style.height = (meter[b.id] * 100) + '%'; });
    const hrs = 19.5 + S.t / 60 * 4;
    clock.textContent = `${Math.floor(hrs)}:${String(Math.floor((hrs % 1) * 60)).padStart(2, '0')}`;
    const key = active.map(e => e.name).join('|'); if (key === lastEv) return; lastEv = key;
    evlist.innerHTML = active.map(e => `<div class="ev ${e.bands.some(b => S.on[b]) ? '' : 'dim'}"><b>${e.name}</b><small>${e.note}</small><div class="chips">${
      e.bands.map(b => `<span class="chip" style="color:${BAND[b].color};opacity:${S.on[b] ? 1 : .35}">${BAND[b].name}</span>`).join('')}</div></div>`).join('');
  }
  return { sync, frame, setPlay, setLabels };
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
  if (!S.labelsOn) return;
  const right = W > 760 ? W - 300 : W - 30, v = new V3();
  for (const e of active) {
    const p = e.where && e.where(); if (!p) continue;
    if (!e.bands.some(b => S.on[b])) continue;
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
