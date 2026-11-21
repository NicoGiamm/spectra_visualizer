// Small procedural canvas textures shared by events.
import * as THREE from 'three';
import { rng } from '../core/util.js';

export function canvasTex(size, draw) { const c = document.createElement('canvas'); c.width = c.height = size; draw(c.getContext('2d'), size); const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; return tx; }

const lazy = f => { let v; return () => v || (v = f()); };

export const softTex = lazy(() => canvasTex(128, (g, s) => { const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }));

export const cloudTex = lazy(() => canvasTex(256, (g, s) => { const r = rng(9); for (let i = 0; i < 70; i++) { const x = s * (.2 + .6 * r()), y = s * (.35 + .35 * r()), rad = s * (.06 + .14 * r()); const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); } }));

export const moonTex = lazy(() => canvasTex(256, (g, s) => {
  const r = rng(5); g.fillStyle = '#d9d6cf'; g.beginPath(); g.arc(s / 2, s / 2, s / 2 - 2, 0, 7); g.fill();
  g.save(); g.clip();
  [[.38, .36, .16], [.6, .45, .13], [.48, .62, .11], [.68, .3, .08], [.3, .58, .07]].forEach(([x, y, rr]) => { const gr = g.createRadialGradient(x * s, y * s, 0, x * s, y * s, rr * s); gr.addColorStop(0, 'rgba(90,88,92,.55)'); gr.addColorStop(1, 'rgba(90,88,92,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
  for (let i = 0; i < 60; i++) { const x = r() * s, y = r() * s, rr = 1 + r() * 6; g.strokeStyle = 'rgba(70,70,70,.35)'; g.beginPath(); g.arc(x, y, rr, 0, 7); g.stroke(); }
  const lg = g.createRadialGradient(s / 2, s / 2, s * .3, s / 2, s / 2, s / 2); lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,.35)'); g.fillStyle = lg; g.fillRect(0, 0, s, s);
  g.restore();
}));
