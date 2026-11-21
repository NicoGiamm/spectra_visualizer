// "Instrument view": when Visible is filtered out, the scene turns dark so the invisible
// bands read like a detector display. Every solid object registers here with solid();
// things that exist only in visible light (sprites, smoke, the sky) register with visOnly().
import * as THREE from 'three';
import { COMMON } from './shaders.js';

const SOLIDS = [], VIS_ONLY = [];
const darkMat = new THREE.MeshBasicMaterial({ color: 0x05060c });
const lineMat = new THREE.LineBasicMaterial({ color: 0x3a4a8a });

// Register an object (and its children) as solid. instr = material to use in instrument view
// (default: flat dark for meshes, dim blue for lines).
export function solid(obj, instr) {
  obj.traverse(o => { if (o.isMesh || o.isLine) { o.userData.orig = o.material; if (instr) o.userData.instr = instr; SOLIDS.push(o); } });
  return obj;
}
export function visOnly(obj) { VIS_ONLY.push(obj); return obj; }

let visMode = true;
export function applyVisMode(vis) {
  if (visMode === vis) return; visMode = vis;
  SOLIDS.forEach(o => o.material = vis ? o.userData.orig : (o.userData.instr || (o.isLine ? lineMat : darkMat)));
  VIS_ONLY.forEach(o => o.visible = vis);
}

const worldVS = `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;

// Dark topo-map: contour lines every 20 m, fading with distance. uWarm adds a thermal glow near the viewer.
export const topoMat = new THREE.ShaderMaterial({
  uniforms: { uWarm: { value: 0 } },
  vertexShader: worldVS,
  fragmentShader: COMMON + `varying vec3 vW; uniform float uWarm;
  void main(){
    float dist = length(vW - cameraPosition), q = vW.y/20., f = fract(q), e = min(f, 1.-f);
    float line = 1. - smoothstep(0., fwidth(q)*1.2, e);
    vec3 c = vec3(.006,.007,.014) + vec3(.16,.2,.42)*line*(1.-smoothstep(300.,5500.,dist));
    c += uWarm*thermal(.55*(1.-smoothstep(5.,250.,dist)))*(1.-smoothstep(5.,250.,dist))*.5;
    gl_FragColor = vec4(c,1.);
  }`,
});

// Dark ground grid for flat worlds (sea, streets) where contour lines would be degenerate.
export const gridMat = (cell = 25, color = [.16, .2, .42]) => new THREE.ShaderMaterial({
  uniforms: { uWarm: { value: 0 } },
  vertexShader: worldVS,
  fragmentShader: COMMON + `varying vec3 vW; uniform float uWarm;
  void main(){
    float dist = length(vW - cameraPosition); vec2 q = vW.xz/${cell.toFixed(1)}, f = abs(fract(q)-.5), w = fwidth(q)*1.2;
    float line = max(smoothstep(.5-w.x, .5, f.x), smoothstep(.5-w.y, .5, f.y));   // f = distance from the cell centre
    line *= 1. - smoothstep(.12, .35, max(w.x, w.y));          // cells under a few pixels: fade instead of filling in
    vec3 c = vec3(.006,.007,.014) + vec3(${color.join(',')})*line*(1.-smoothstep(200.,4000.,dist));
    c += uWarm*thermal(.55*(1.-smoothstep(5.,250.,dist)))*(1.-smoothstep(5.,250.,dist))*.5;
    gl_FragColor = vec4(c,1.);
  }`,
});
