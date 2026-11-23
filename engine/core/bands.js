// The seven bands, filter presets, and per-band tuning.

export const BANDS = [
  { id: 'radio', name: 'Radio',       range: '> 1 m',          color: '#ff4fd8' },
  { id: 'micro', name: 'Microwave',   range: '1 mm – 1 m',     color: '#ffa62b' },
  { id: 'ir',    name: 'Infrared',    range: '700 nm – 1 mm',  color: '#ff4a1c' },
  { id: 'vis',   name: 'Visible',     range: '380 – 700 nm',   color: '#ffffff' },
  { id: 'uv',    name: 'Ultraviolet', range: '10 – 380 nm',    color: '#b46bff' },
  { id: 'xray',  name: 'X-ray',       range: '0.01 – 10 nm',   color: '#5ff4ff' },
  { id: 'gamma', name: 'Gamma',       range: '< 0.01 nm',      color: '#7dff5a' },
];
export const BI = Object.fromEntries(BANDS.map((b, i) => [b.id, i]));   // band id -> uBand index in the shaders
export const BAND = Object.fromEntries(BANDS.map(b => [b.id, b]));

export const PRESETS = {
  'All': BANDS.map(b => b.id), 'Human eye': ['vis'],
  'Invisible only': ['radio', 'micro', 'ir', 'uv', 'xray', 'gamma'],
  'Thermal': ['ir', 'micro'], 'Radio telescope': ['radio', 'micro'], 'High energy': ['uv', 'xray', 'gamma'],
};

// Instrument gain: multiplies the rendered intensity of every Em/Rib source per band,
// so invisible-band sources stay readable against the night.
// Radio was raised (1.9 -> 2.2, M7/T1) once the M1 radio surfaces (pink terrain, microwave flecks) shared the
// Radio telescope view: the radio cones, sferics and links read against them again; ir already blooms at
// campfires and street lamps, and uv/xray/gamma sources fill the dark High energy view, so those stay.
// Not used by the spectral eye (M10, engine/render/compose.js): there every band adapts to its own scene (LREF).
export const GAIN = { radio: 2.2, micro: 2.0, ir: 1.6, vis: 1, uv: 1.9, xray: 2.1, gamma: 1.9 };

// Spectral eye (M10): each band's receptor operating point — the layer mean luminance (shader units) at which its
// gain is key/LREF; its absolute threshold is EYE.floorRel × LREF (engine/render/compose.js). One value for every
// band: the sources are authored on one intensity scale (a nominal source has I ≈ 1 in every band; measured layer
// peaks are 1–3 in every band and scenario), so one receptor model sees them alike. Per-band operating points were
// measured in M10/T2 (median of the layer mean over t 5/20/40/55 in all three scenarios: radio 3e-5, micro .043,
// IR .021, visible .042, UV 5.6e-4, X-ray 4.6e-6, gamma .0044) and rejected: they track how much of the frame a
// band fills, not how bright its sources are, and would amplify the sparse bands (X-ray, UV, radio) 100–10 000×.
// .37 is the visible field at dusk (seaside t 5), the photopic design point, so the night is darker than dusk.
// Spectral eye (M10/T4): each band's receptor aperture D (m), which sets its diffraction blur θ ≈ 1.22 λ / D
// (engine/render/compose.js; Gaussian σ ≈ 0.42 λ / D for the Airy core). A human-sized pupil cannot image radio at
// all (λ ≫ D), so the enhanced eye has a receptor organ per band — stand-ins at instrument scale, not one value:
//   ir/vis/uv  0.007  the dark-adapted human pupil (~7 mm): visible is sharper than a pixel, 10 µm IR ≈ 1 px
//   micro      1      a dish of satellite-TV size (60–120 cm Ku/Ka-band dishes): 20 GHz ≈ 1°, 2.4 GHz ≈ 9° soft
//   radio      100    an interferometric array the size of a LOFAR station (~30–90 m, van Haarlem et al. 2013,
//                     A&A 556, A2): FM ≈ 2°, Jupiter's 20 MHz ≈ 10°, VLF sferics only a glow
//   xray/gamma 0      no diffraction limit: those photons are imaged by masks / pinholes, not lenses
export const APERTURE = { radio: 100, micro: 1, ir: .007, vis: .007, uv: .007, xray: 0, gamma: 0 };

export const LREF = { radio: .37, micro: .37, ir: .37, vis: .37, uv: .37, xray: .37, gamma: .37 };

// Meter normalisation (activity that fills a bar). Scenarios may override via `meterNorm`.
// Rule (M7/T1, with the M1 surfaces and M7/T4 presets in): in hud.js's 1 - exp(-act/norm) each bar peaks at
// ~0.9–0.97 in its busiest scenario and stays above 0.9 for at most a few script seconds, so peaks still read as
// peaks. Trail and seaside share these; X-ray is sky-only and equal everywhere. Gamma is burst-driven (air showers,
// thunderstorm flashes, the GRB): its norm is set by the bursts, so the quiet baseline sits low on purpose.
// Check with `uv run spectra timeline` (peak and ">0.9" columns).
export const METER_NORM = { radio: 5.5, micro: 4.8, ir: 10, vis: 24, uv: 2.4, xray: 1, gamma: 7 };

// Atmospheric transmission to an observer on the ground, per band and per source origin:
//   'ground' — reaches a ground detector (near sources, and tropospheric emission such as Cherenkov light),
//   'high'   — emitted inside the atmosphere above the absorbing layers (meteors, aurora, air-shower secondaries),
//   'space'  — from beyond the atmosphere.
// In Ground detector mode a source whose band × origin has transmission 0 is not drawn and adds no meter
// activity; the overlay draws a dashed ghost ring at its position instead (S.detector, render/sources.js).
export const TRANSMIT = {
  radio: { ground: 1, high: 1, space: 1, why: '~10 MHz–30 GHz window (the ionosphere reflects lower frequencies)' },
  micro: { ground: 1, high: 1, space: 1, why: 'mostly transparent (H₂O/O₂ lines at 22, 60, 118, 183 GHz)' },
  ir:    { ground: 1, high: 1, space: 1, why: 'in the windows: near-IR, 3–5 µm, 8–14 µm' },
  vis:   { ground: 1, high: 1, space: 1, why: 'transparent' },
  uv:    { ground: 1, high: 0, space: 0, why: 'only near-UV (UVA, part of UVB) gets through; ozone and O₂ absorb the rest' },
  xray:  { ground: 1, high: 0, space: 0, why: 'absorbed by the air column (photo-absorption, Compton scattering)' },
  gamma: { ground: 1, high: 0, space: 0, why: 'absorbed by the air column (pair production)' },
};
// Rough altitude (km) where cosmic / high-altitude photons of the band are absorbed, and the ghost label name.
export const ABSORB_AT = { uv: [50, 'Far-UV'], xray: [40, 'X-ray'], gamma: [25, 'Gamma'] };
