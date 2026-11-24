// Above the atmosphere: the view from the ISS cupola, ~400 km up, over one orbit. The geometry is real, the scale is
// not: the Earth is drawn at 1 world unit = 10 km (radius 637.1, the station 40 units up) so that it fits inside the
// camera's far plane with usable depth precision, while the cupola frame around the eye is in metres. Only angles
// matter to the eye, and the angles are those of a 400 km orbit:
//   limb dip below the local horizontal  acos(6371 / 6771) = 19.8°   (the horizon is 70.2° from nadir)
//   distance to the limb                 √(6771² − 6371²) ≈ 2290 km
//   airglow (95 km) above the limb       ≈ 2.4°
// Frame: the viewer floats in the nadir-facing cupola and looks out of its aft side window at the limb, head tipped
// so that "down" (nadir) is 25° ahead of straight down (TAU): the limb ahead sits ~5° above the view's horizontal, the
// Earth fills the lower half of the frame, space the upper half. Front is still azimuth 270 (the engine's convention);
// here it is the aft direction, opposite the orbital motion: the ground streams away from you toward the limb, the Sun
// sets ahead and rises behind you.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { V3, DEG, sm, clamp } from 'spectra/core/util.js';
import { S } from 'spectra/core/state.js';
import { solid } from 'spectra/render/instrument.js';
import { COMMON } from 'spectra/render/shaders.js';
import { ENV } from 'spectra/world/atmosphere.js';

export const RE = 637.1, H = 40;                        // Earth radius, orbit altitude (world units of 10 km)
export const TAU = 25 * DEG;                            // nadir tipped 25° toward the front (view convenience, see above)
export const N = new V3(0, -Math.cos(TAU), -Math.sin(TAU));   // nadir
const F = new V3(0, Math.sin(TAU), -Math.cos(TAU));     // forward along the limb plane (⊥ N)
const E1 = new V3(1, 0, 0);                             // right (north): the orbit normal
export const C = N.clone().multiplyScalar(RE + H);      // the Earth's centre (the camera sits at the origin)
export const LIMB_A = Math.asin(RE / (RE + H));         // 70.2°: nadir angle of the horizon

// The clock: one script = one orbit. The ISS circles the Earth in ~92.9 min, so 1 script unit = 1.55 min and the
// Sun (and the ground) turn 6° per unit around the orbit normal. The Sun lies BETA = 15° out of the orbit plane.
// Station sunset at T_SET = 9 (ahead, az ≈ 285, ~5° up in the view); the Earth's shadow lasts 23.2 units = 35.9 min
// (the Sun is hidden while its nadir angle is < 70.2°), so sunrise comes at t ≈ 32.2, behind you, and at t = 60 the
// Sun is back where it started: the loop is seamless. The Earth's own rotation (0.25°/min, ~23° per orbit) is left out.
export const MIN_PER_UNIT = 92.9 / 60, OMEGA = 6 * DEG, BETA = 15 * DEG, T_SET = 9;
const TH_SET = TAU - Math.asin(Math.cos(LIMB_A) / Math.cos(BETA));        // in-plane Sun angle at sunset (≈ 4.5°)
export const T_RISE = T_SET + (Math.PI - 2 * Math.asin(Math.cos(LIMB_A) / Math.cos(BETA))) / OMEGA;   // ≈ 32.2
const theta = t => TH_SET + OMEGA * (T_SET - t);
export const sunDir = (t = S.t, v = new V3()) => { const th = theta(t);
  return v.set(Math.sin(BETA), Math.cos(BETA) * Math.sin(th), -Math.cos(BETA) * Math.cos(th)); };
export const sunAz = t => { const d = sunDir(t); return ((Math.atan2(d.z, d.x) / DEG) % 360 + 360) % 360; };
export const sunEl = t => Math.asin(clamp(sunDir(t).y, -1, 1)) / DEG;
// how much of the Sun shows over the limb (0…1), and the tangent height (units) of its line of sight: below ~30 km
// the air column reddens and flattens it
export function sunState(t = S.t) {
  const a = Math.acos(clamp(sunDir(t).dot(N), -1, 1));
  return { vis: sm(LIMB_A - .27 * DEG, LIMB_A + .27 * DEG, a), h: (RE + H) * Math.sin(a) - RE, a };
}
// the ground turns with the Sun (same axis, same sense): Earth-fixed → scene
export const rot = (t = S.t) => OMEGA * (T_SET - t);
const _q = new THREE.Quaternion();
export function earthP(u, h = 0, t = S.t, out = new V3()) {           // u: Earth-fixed unit vector, h: height (units)
  _q.setFromAxisAngle(E1, rot(t)); return out.copy(u).applyQuaternion(_q).multiplyScalar(RE + h).add(C);
}
// a point at height h on the line of sight grazing the limb, psi radians right of straight ahead
export function limbP(psi, h = 0, out = new V3()) {
  const a = Math.asin((RE + h) / (RE + H)), d = Math.sqrt((RE + H) ** 2 - (RE + h) ** 2);
  return out.copy(N).multiplyScalar(Math.cos(a)).addScaledVector(F, Math.sin(a) * Math.cos(psi)).addScaledVector(E1, Math.sin(a) * Math.sin(psi)).multiplyScalar(d);
}
// is an Earth point in view (not behind the planet)? and how sunlit is it (cos of the solar zenith angle)
export const facing = p => { const n = p.clone().sub(C).normalize(); return -n.dot(p) / p.length(); };
export const sunlit = (p, t = S.t) => p.clone().sub(C).normalize().dot(sunDir(t));
// A ground feature streaming through the view: s = 0 at the edge of the visible ground behind you, 1 at the limb
// ahead; lat (rad, Earth-centric) to the side. The ground covers that ~40° of arc (2 × 19.8°) in 6.6 units (10 min).
const CAP = Math.PI / 2 - LIMB_A;
export const CROSS = 2 * CAP / OMEGA;                                  // units to cross the visible ground
export function drift(s, lat, h = 0, out = new V3()) {
  return out.copy(N).negate().applyAxisAngle(F, lat).applyAxisAngle(E1, -(-CAP + 2 * CAP * s)).multiplyScalar(RE + h).add(C);
}
// where a line of sight from the eye meets the ground (null if it misses the planet)
export function onEarth(dir, h = 0) {
  const d = dir.clone().normalize(), b = d.dot(C), c = C.lengthSq() - (RE + h) ** 2, disc = b * b - c;
  return disc < 0 ? null : d.multiplyScalar(b - Math.sqrt(disc));
}

// ------------------------------------------------------------------ the Earth
// Visible: oceans, land, clouds lit by the Sun (terminator tinted), sun glint. Spectral eye (compose.js hook), same
// mappings as the sky's own bands (engine/world/atmosphere.js) so Earth and sky compare inside each band:
//   ir     8–14 µm window seen from above: the surface temperature where it is clear — ocean ~17 °C, land ~27 °C by
//          day and ~10 °C at night — and the cold cloud tops (~−45 °C, 'cloudTopIR'): the clouds are the dark parts
//   micro  19 GHz Tb: land ~270 K, ocean ~150 K (emissivity ~.5), cloud liquid water adds ~40 K over the sea
//          ('earthMicrowave'): continents glow, oceans are dark
//   uv     the sunlit side scatters near-UV sunlight (Rayleigh, and clouds); amplitude STAND-IN
//   radio  the planet's own thermal glow at VHF, Rayleigh–Jeans Tb ≈ 290 K land / ~150 K sea (emissivity ~.5),
//          on the sky's synchrotron scale (.006 per 1000 K, atmosphere.js): darker than the radio sky ('earthRadio');
//          plus what leaks up from transmitters over the inhabited land (uRadio, the radio-leak event; amplitude
//          STAND-IN, chosen to stand well above the thermal glow, as man-made noise does at VHF)
//   X-ray, gamma: none from the surface here (the limb gamma is an event)
// Night-side city lights are part of the surface (uCity, set by the cities event), on the same land mask.
// Opaque in every band (eyeTrans 0): nothing crosses the planet.
export const EARTH_U = { uSun: { value: new V3() }, uRot: { value: 0 }, uC: { value: C }, uCity: { value: 0 }, uRadio: { value: 0 } };
const EARTH_GLSL = COMMON + `uniform vec3 uSun, uC; uniform float uRot, uCity, uRadio; varying vec3 vW;
float eh3(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x + p.y + p.z)); }
float en3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3. - 2.*f);
  return mix(mix(mix(eh3(i), eh3(i + vec3(1,0,0)), f.x), mix(eh3(i + vec3(0,1,0)), eh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(eh3(i + vec3(0,0,1)), eh3(i + vec3(1,0,1)), f.x), mix(eh3(i + vec3(0,1,1)), eh3(i + vec3(1,1,1)), f.x), f.y), f.z); }
float efbm(vec3 p){ float a = 0., w = .5; for(int i = 0; i < 5; i++){ a += w*en3(p); p = p*2.03 + 3.1; w *= .5; } return a; }
// Earth-fixed coordinates of this fragment, its normal, land and cloud cover, cos of the solar zenith angle
void earthAt(out vec3 n, out vec3 q, out float land, out float cloud, out float mu){
  n = normalize(vW - uC); float c = cos(-uRot), s = sin(-uRot);
  q = vec3(n.x, c*n.y - s*n.z, s*n.y + c*n.z);
  land = smoothstep(.53, .57, efbm(q*2.3 + vec3(4.1, 1.3, 7.)));
  float cb = efbm(q*7. + vec3(1., 9., 3.)), band = .55 + .45*cos(q.x*7.);              // cloud bands across the track
  cloud = smoothstep(.5, .72, cb*(.75 + .35*band))*.95;
  mu = dot(n, uSun); }
// inhabited land: clusters of towns (the same mask for the night lights and the radio leaks)
float towns(vec3 q, float land){ return land*smoothstep(.57, .7, efbm(q*38. + 2.)); }`;
const EARTH_FS = `
void main(){ vec3 n, q; float land, cloud, mu; earthAt(n, q, land, cloud, mu);
  vec3 V = normalize(cameraPosition - vW);
  vec3 ground = mix(vec3(.012, .03, .07), mix(vec3(.16, .14, .08), vec3(.06, .1, .04), smoothstep(.4, .7, efbm(q*11.))), land);
  vec3 col = mix(ground, vec3(.75, .77, .8), cloud);
  float lit = smoothstep(-.03, .2, mu), dusk = exp(-mu*mu/.006);                          // the terminator reddens
  col *= lit*mix(vec3(1.), vec3(1., .45, .2), dusk*.8);
  float g = max(dot(reflect(-V, n), uSun), 0.);
  col += vec3(1., .9, .75)*pow(g, 250.)*(1. - land)*(1. - cloud)*lit*3.;                 // sun glint on the sea
  float rim = pow(1. - clamp(dot(n, V), 0., 1.), 3.);
  col = mix(col, vec3(.25, .45, 1.)*lit, rim*.6);                                          // the air column toward the limb
  float tw = towns(q, land), spark = smoothstep(.55, .95, en3(q*1500.))*smoothstep(.35, .8, en3(q*260. + 5.));
  col += mix(vec3(1., .55, .2), vec3(.85, .85, 1.), step(.7, en3(q*60.)))*tw*spark*(1. - smoothstep(-.1, .04, mu))*(1. - .7*cloud)*uCity*4.;
  gl_FragColor = vec4(col, 1.); }`;
const EARTH_EYE = `vec3 eyeTrans(){ return vec3(0.); }
void eyeBands(out vec4 o1, out vec4 o3){ vec3 n, q; float land, cloud, mu; earthAt(n, q, land, cloud, mu);
  float T = mix(mix(17., mix(10., 27., smoothstep(-.1, .4, mu)), land), -45., cloud), xi = clamp((T + 4.)/44., 0., 1.);
  float i = eyeL(thermal(xi))*(.04 + .5*xi*xi);
  float Tb = mix(150. + 40.*cloud, 270., land), xm = clamp((Tb - 120.)/180., 0., 1.);
  float m = eyeL(vec3(1., .6, .1))*xm*xm*.12;
  float u = max(mu, 0.)*(.04 + .2*cloud);
  float r = .006*mix(150., 290., land)/1000. + uRadio*.25*smoothstep(.0, .5, towns(q, land));
  o1 = vec4(i, u, 0., 1.); o3 = vec4(r, m, 0., 1.); }`;
function earth() {
  const m = new THREE.ShaderMaterial({ uniforms: EARTH_U, fragmentShader: EARTH_GLSL + EARTH_FS,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }' });
  m.userData.eyeBands = EARTH_EYE;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(RE, 160, 120), m); mesh.position.copy(C);
  S.scene.add(solid(mesh));
}

// ------------------------------------------------------------------ the air seen edge-on
// A transparent shell up to 300 km: for each line of sight, the tangent height h of its closest approach to the
// Earth. Visible light: the sunlit air (Rayleigh blue, scale height ~8 km), the twilight band at the terminator
// (red low, blue above), and at night the airglow layers seen edge-on — green O I 557.7 nm at ~95 km, faint red
// O I 630 nm at ~250 km (uAirglow, set by the airglow event). Eye bands: the sunlit limb in near-IR and near-UV
// (scattered sunlight), the OH Meinel layer at ~87 km in near-IR (uAirglow).
export const SHELL_U = { uSun: { value: new V3() }, uC: { value: C }, uAirglow: { value: 0 } };
const SHELL_GLSL = `uniform vec3 uSun, uC; uniform float uAirglow; varying vec3 vW;
// tangent height (units of 10 km) of the line of sight through this fragment, and sun elevation there (cos)
float shellH(out float lit){ vec3 d = normalize(vW - cameraPosition), rc = uC - cameraPosition;
  float tc = max(dot(rc, d), 0.); vec3 p = cameraPosition + d*tc; float h = length(p - uC) - ${RE.toFixed(1)};
  lit = dot(normalize(p - uC), uSun); return h; }`;
const SHELL_FS = `
void main(){ float lit, h = shellH(lit), disc = h < 0. ? .25 : 1.; h = max(h, 0.);
  float day = smoothstep(-.12, .2, lit), tw = exp(-lit*lit/.012);
  vec3 col = vec3(.22, .42, 1.)*day*exp(-h/.8)*1.2*disc;
  col += (vec3(1., .32, .08)*exp(-h/.35) + vec3(.9, .55, .3)*exp(-h/.9)*.4)*tw*disc;
  float dark = 1. - smoothstep(-.2, .02, lit);
  col += uAirglow*dark*(vec3(.25, 1., .35)*exp(-pow((h - 9.5)/.55, 2.))*.5 + vec3(1., .2, .12)*exp(-pow((h - 25.)/2., 2.))*.02)*disc;
  gl_FragColor = vec4(col, 1.); }`;
const SHELL_EYE = `void eyeBands(out vec4 o1, out vec4 o3){ float lit, h = shellH(lit), disc = h < 0. ? .25 : 1.; h = max(h, 0.);
  float day = smoothstep(-.12, .2, lit), dark = 1. - smoothstep(-.2, .02, lit);
  float ir = day*exp(-h/1.2)*.25*disc + uAirglow*dark*exp(-pow((h - 8.7)/.6, 2.))*.9*disc;
  float uv = day*exp(-h/1.)*.35*disc;
  o1 = vec4(ir, uv, 0., 1.); o3 = vec4(0., 0., 0., 1.); }`;
function shell() {
  const m = new THREE.ShaderMaterial({ uniforms: SHELL_U, fragmentShader: SHELL_GLSL + SHELL_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position, 1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }' });
  m.userData.eyeBands = SHELL_EYE;
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(RE + 30, 160, 120), m); mesh.position.copy(C); mesh.renderOrder = -7;
  S.scene.add(mesh);
}

// ------------------------------------------------------------------ the cupola
// Struts of the nadir-facing cupola around the eye, in metres: the ring of the central (nadir) window, the outer rim
// and six mullions between the side windows; you look out of the aft one. Aluminium at cabin temperature (~22 °C):
// it glows in thermal IR like everything indoors. Its few cm of metal block radio and microwave and pass part of the
// gamma rays (1 MeV through ~5 cm Al: e^(−0.061·2.7·5) ≈ 0.44, NIST XCOM).
export const FRAME_EYE = `vec3 eyeTrans(){ return vec3(0., 0., .44); }
void eyeBands(out vec4 o1, out vec4 o3){ o1 = vec4(.1207, 0., 0., 1.); o3 = vec4(0., .04, 0., 1.); }`;   // IR: eyeL(thermal(xi))·(.04 + .5 xi²) at xi = (22 + 4)/44, precomputed (a standard material has no thermal())
const cupDir = (a, psi) => N.clone().multiplyScalar(Math.cos(a)).addScaledVector(F, Math.sin(a) * Math.cos(psi)).addScaledVector(E1, Math.sin(a) * Math.sin(psi));
function cupola() {
  const r = .8, tube = (pts, rad, closed) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed), pts.length * 3, rad, 6, closed);
  const ring = a => tube(Array.from({ length: 36 }, (_, k) => cupDir(a, k / 36 * Math.PI * 2).multiplyScalar(r)), .018, true);
  const geos = [ring(25 * DEG), ring(100 * DEG)];
  for (let k = 0; k < 6; k++) { const psi = (30 + 60 * k) * DEG; geos.push(tube(Array.from({ length: 8 }, (_, j) => cupDir((25 + 75 * j / 7) * DEG, psi).multiplyScalar(r)), .011, false)); }
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a8d92, roughness: .5, metalness: .4 });
  mat.userData.eyeBands = FRAME_EYE;
  S.scene.add(solid(new THREE.Mesh(mergeGeometries(geos), mat)));
}

export function build() {
  // the cupola struts sit ~0.8 m from the eye: a closer near plane than the engine's 0.2 m default would be needed for
  // anything nearer; 0.2 m is fine for them, and keeps the depth precision at the Earth (~230 units away)
  earth(); shell(); cupola();
  return {
    walk(t, camera) { camera.position.set(0, 0, 0); },
    // lights: sunlight only while the Sun is over the limb, reddened as its line of sight grazes the air; no skylight
    // (black sky); earthshine from below while the Earth beneath is sunlit (albedo ~.3, STAND-IN level)
    update(t) {
      const s = sunState(t), sd = sunDir(t), red = sm(0, 3, s.h);
      EARTH_U.uSun.value.copy(sd); EARTH_U.uRot.value = rot(t); SHELL_U.uSun.value.copy(sd);
      if (!ENV.sunLight) return;
      ENV.sunLight.intensity = 2.2 * s.vis * (.35 + .65 * red); ENV.sunLight.color.setRGB(1, .45 + .5 * red, .2 + .75 * red);
      const below = sm(-.3, .5, sd.dot(N.clone().negate()));
      ENV.hemi.color.setRGB(.004, .004, .006); ENV.hemi.groundColor.setRGB(.3 * below, .34 * below, .4 * below);
      ENV.moonLight.intensity = 0;
    },
  };
}
