// Spectral reference: the physical processes behind every event, by frequency (f, Hz), wavelength
// (lam, m) or photon energy (E, eV). Events list the processes they depict in `freq: [...]`; the band
// each process belongs to is derived from BANDS' ranges, never typed by hand. `uv run spectra timeline`
// warns when an event's declared bands, its processes and what it actually draws disagree.
//
// ground: false  -> the atmosphere absorbs it before it reaches an observer on the ground (see plan step 2.1).
// stylised: true -> not a real process as drawn (kept for now, flagged in the audit).

const C = 299792458, HC = 1.23984193e-6;   // m/s, eV·m

export const SPECTRUM = {
  // --- the Sun, Moon, planets, sunlight scattering ---
  sunlight:        { name: 'sunlight (scattered/reflected)', lam: 550e-9 },
  solarNIR:        { name: 'solar near-infrared', lam: 1.0e-6 },
  solarUV:         { name: 'solar UVA', lam: 350e-9 },
  solarRadio:      { name: 'quiet-Sun radio emission', f: 150e6 },
  iceHalo:         { name: 'ice-crystal refraction (halo/parhelion)', lam: 550e-9 },
  haloUV:          { name: 'UV through ice crystals', lam: 360e-9 },
  lunarThermal:    { name: 'lunar surface thermal emission', lam: 10e-6 },
  lunarGamma:      { name: 'cosmic-ray gamma glow of the Moon', E: 1e8, ground: false },
  greenFlash:      { name: 'refracted green sunlight', lam: 520e-9 },
  // --- deep sky ---
  starlight:       { name: 'starlight', lam: 550e-9 },
  cmb:             { name: 'cosmic microwave background (2.7 K, peak)', f: 160e9 },
  dustFIR:         { name: 'warm interstellar dust', lam: 100e-6 },
  synchrotron:     { name: 'galactic synchrotron', f: 100e6 },
  pulsarRadio:     { name: 'pulsar radio beam', f: 150e6 },
  pulsarOptical:   { name: 'pulsar optical pulses', lam: 500e-9 },
  pulsarXray:      { name: 'pulsar X-rays', E: 1e3, ground: false },
  accretionXray:   { name: 'accretion-disk X-rays', E: 5e3, ground: false },
  jetSynchrotron:  { name: 'relativistic jet synchrotron', f: 150e6 },
  companionStar:   { name: 'companion star light', lam: 550e-9 },
  frb:             { name: 'fast radio burst (low band)', f: 150e6 },
  snUV:            { name: 'supernova shock-breakout UV', lam: 100e-9, ground: false },
  snOptical:       { name: 'supernova light curve', lam: 550e-9 },
  snXray:          { name: 'supernova remnant X-rays', E: 2e3, ground: false },
  snGamma:         { name: 'Ni-56/Co-56 decay lines', E: 8.47e5, ground: false },
  snDust:          { name: 'new dust forming (IR)', lam: 10e-6 },
  snRadio:         { name: 'remnant radio synchrotron', f: 150e6 },
  grbGamma:        { name: 'gamma-ray burst prompt emission', E: 3e5, ground: false },
  afterglowXray:   { name: 'GRB X-ray afterglow', E: 1e3, ground: false },
  afterglowOptical:{ name: 'GRB optical afterglow', lam: 550e-9 },
  afterglowRadio:  { name: 'GRB radio afterglow', f: 150e6 },
  // --- solar system ---
  cometDust:       { name: 'comet dust tail (reflected sunlight)', lam: 550e-9 },
  cometIon:        { name: 'comet ion tail (CO⁺ 420 nm)', lam: 420e-9 },
  cometLyA:        { name: 'comet hydrogen coma (Lyman-α)', lam: 121.6e-9, ground: false },
  cometDustIR:     { name: 'comet dust thermal emission', lam: 10e-6 },
  cometXray:       { name: 'solar-wind charge exchange X-rays', E: 5e2, ground: false },
  meteorLight:     { name: 'meteor ablation light (Na, Mg, Fe)', lam: 589e-9 },
  meteorUV:        { name: 'meteor UV emission', lam: 300e-9, ground: false },
  meteorEcho:      { name: 'radio forward-scatter off the ion trail', f: 143.05e6 },
  // --- atmosphere ---
  o5577:           { name: 'oxygen green line 557.7 nm', lam: 557.7e-9 },
  o6300:           { name: 'oxygen red line 630.0 nm', lam: 630.0e-9 },
  auroralUV:       { name: 'N₂ Lyman-Birge-Hopfield UV', lam: 160e-9, ground: false },
  auroralXray:     { name: 'auroral bremsstrahlung X-rays', E: 3e4, ground: false },
  akr:             { name: 'auroral kilometric radiation', f: 300e3, ground: false },
  nlcScatter:      { name: 'sunlight scattered by mesospheric ice', lam: 470e-9 },
  nlcUV:           { name: 'UV scattered by mesospheric ice', lam: 350e-9, ground: false },
  lightning:       { name: 'lightning channel light', lam: 500e-9 },
  sferics:         { name: 'lightning sferics (VLF)', f: 10e3 },
  leaderXray:      { name: 'stepped-leader X-rays', E: 1e5 },
  tgf:             { name: 'terrestrial gamma-ray flash', E: 1e7 },
  cherenkov:       { name: 'air-shower Cherenkov light', lam: 350e-9 },
  showerFluor:     { name: 'N₂ fluorescence from the shower', lam: 391e-9 },
  showerGamma:     { name: 'shower secondaries (gamma)', E: 1e9, ground: false },
  showerXray:      { name: 'X-ray shaft (as drawn)', E: 3e4, stylised: true },
  haloScintillation:{ name: '"zodiacal scatter" sparkles (as drawn)', lam: 550e-9, stylised: true },
  haloScintUV:     { name: '"zodiacal scatter" UV (as drawn)', lam: 360e-9, stylised: true },
  warmAir:         { name: 'warm air column (as drawn)', lam: 10e-6, stylised: true },
  haloIR:          { name: 'infrared halo ring (as drawn)', lam: 10e-6, stylised: true },
  // --- thermal emission (Wien peak) ---
  thermal290:      { name: 'thermal emission ~290 K (ground, water)', lam: 10e-6 },
  thermal310:      { name: 'thermal emission ~310 K (bodies)', lam: 9.3e-6 },
  thermal700:      { name: 'thermal emission ~700 K (exhaust, chimney)', lam: 4.1e-6 },
  flame:           { name: 'flame light (glowing soot)', lam: 600e-9 },
  thermal1200:     { name: 'thermal emission ~1200 K (flames, embers)', lam: 2.4e-6 },
  // --- artificial light ---
  incandescent:    { name: 'warm interior light', lam: 600e-9 },
  ledWhite:        { name: 'white LED', lam: 550e-9 },
  navRed:          { name: 'red navigation/obstruction light', lam: 630e-9 },
  na589:           { name: 'sodium-vapour lamp D lines', lam: 589e-9 },
  na819:           { name: 'sodium near-IR lines 819 nm', lam: 819e-9 },
  strontium:       { name: 'firework metal-salt emission', lam: 640e-9 },
  luciferin:       { name: 'firefly bioluminescence', lam: 560e-9 },
  dinoflagellate:  { name: 'plankton bioluminescence', lam: 475e-9 },
  // --- radio & microwave technology ---
  fm:              { name: 'FM broadcast', f: 100e6 },
  airband:         { name: 'VHF airband voice', f: 125e6 },
  ais:             { name: 'AIS ship transponder (VHF)', f: 162e6 },
  satBeacon:       { name: 'satellite VHF beacon', f: 145e6 },
  radiobeacon:     { name: 'marine radiobeacon', f: 300e3 },
  modeS:           { name: 'aircraft transponder (Mode S / ADS-B)', f: 1090e6 },
  wxRadar:         { name: 'airborne weather radar (X-band)', f: 9.3e9 },
  xbandRadar:      { name: 'ship X-band radar', f: 9.4e9 },
  kuDownlink:      { name: 'satellite Ku-band downlink', f: 12e9 },
  lte:             { name: 'LTE/5G phone uplink', f: 1.8e9 },
  nr35:            { name: '5G NR 3.5 GHz', f: 3.5e9 },
  lte800:          { name: 'LTE 800 MHz', f: 800e6 },
  wifi24:          { name: 'Wi-Fi 2.4 GHz', f: 2.4e9 },
  wifi5:           { name: 'Wi-Fi 5 GHz', f: 5.5e9 },
  carRadar:        { name: 'automotive radar 77 GHz', f: 77e9 },

  // ===== sky & engine additions (engine owner) =====

  // ===== trail additions =====

  // ===== seaside additions =====
  aisAtoN:         { name: 'AIS aid-to-navigation broadcast (VHF)', f: 161.975e6 },
  vhf16:           { name: 'marine VHF channel 16 voice', f: 156.8e6 },
  sbandRadar:      { name: 'ship S-band radar', f: 3.05e9 },
  racon:           { name: 'radar beacon (racon) reply', f: 9.4e9 },
  radarClutter:    { name: 'radar echoes off turbine blades (X-band)', f: 9.4e9 },
  navGreen:        { name: 'green navigation light', lam: 520e-9 },
  navWhiteLED:     { name: 'white LED lantern', lam: 560e-9 },
  navYellow:       { name: 'yellow special-mark light', lam: 590e-9 },
  deckLight:       { name: 'metal-halide deck floodlights', lam: 560e-9 },
  mistScatter:     { name: 'moonlight scattered by sea-mist droplets', lam: 550e-9 },
  mistThermal:     { name: 'thermal emission of cool mist (~285 K)', lam: 10.2e-6 },
  lloydFringe:     { name: 'sea-cliff interferometer fringes (Lloyd\'s mirror, 200 MHz)', f: 200e6 },

  // ===== city additions =====

};

const RANGES = [['radio', 1, Infinity], ['micro', 1e-3, 1], ['ir', 700e-9, 1e-3], ['vis', 380e-9, 700e-9],
  ['uv', 10e-9, 380e-9], ['xray', 1e-11, 10e-9], ['gamma', 0, 1e-11]];

export const wavelength = p => p.lam ?? (p.f ? C / p.f : HC / p.E);
export function bandOf(p) { const l = wavelength(p); return RANGES.find(([, lo, hi]) => l >= lo && l < hi)[0]; }

const si = (v, units) => { for (const [k, u] of units) if (v >= k) return `${+(v / k).toPrecision(3)} ${u}`; return `${v.toPrecision(3)} ${units.at(-1)[1]}`; };
// "2.4 GHz · 12.5 cm" — used by the panel
export function describe(p) {
  const l = wavelength(p), f = C / l, E = HC / l;
  const lam = si(l, [[1e3, 'km'], [1, 'm'], [1e-2, 'cm'], [1e-3, 'mm'], [1e-6, 'µm'], [1e-9, 'nm'], [1e-12, 'pm']]);
  if (l < 10e-9) return `${si(E, [[1e9, 'GeV'], [1e6, 'MeV'], [1e3, 'keV'], [1, 'eV']])} · ${lam}`;
  if (l < 1e-3) return lam;
  return `${si(f, [[1e9, 'GHz'], [1e6, 'MHz'], [1e3, 'kHz'], [1, 'Hz']])} · ${lam}`;
}
