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
  // Jupiter's decametric (DAM) radio storms, cyclotron-maser emission up to the 39.5 MHz electron-cyclotron limit, many
  // controlled by Io; discovered at 22.2 MHz (Burke & Franklin 1955, J. Geophys. Res. 60, 213); amateur receivers
  // (NASA Radio JOVE) listen at 20.1 MHz, above the night-time ionospheric cutoff, so it reaches the ground
  jupiterDAM:      { name: 'Jupiter decametric radio storms (10–40 MHz)', f: 20.1e6 },
  // --- deep sky ---
  starlight:       { name: 'starlight', lam: 550e-9 },
  cmb:             { name: 'cosmic microwave background (2.7 K, peak)', f: 160e9 },
  dustFIR:         { name: 'warm interstellar dust', lam: 100e-6 },
  synchrotron:     { name: 'galactic synchrotron', f: 100e6 },
  // --- the sky's own background per band (spectral eye, M10/T7: engine/world/atmosphere.js) ---
  // atmospheric O₂ / H₂O thermal emission at ~20 GHz, near the 22.235 GHz water line (ITU-R P.676-13); with the
  // 2.725 K CMB behind it (Fixsen 2009, ApJ 707, 916: the 'cmb' key)
  skyMicrowave:    { name: 'sky brightness temperature (atmosphere + CMB)', f: 20e9 },
  // clear-sky thermal emission in the 8–14 µm window: ≈ air temperature at the horizon, colder at the zenith
  // (Idso 1981, Water Resour. Res. 17, 295; Berdahl & Fromberg 1982)
  skyThermalIR:    { name: 'clear-sky thermal emission (8–14 µm)', lam: 10e-6 },
  // O₂ Herzberg I bands, 250–400 nm, from ~95 km (Chamberlain 1961, Physics of the Aurora and Airglow; ~400 R)
  uvAirglow:       { name: 'UV airglow (O₂ Herzberg bands)', lam: 340e-9 },
  // cosmic X-ray background at ~5 keV, the 2–10 keV band its photon rate is quoted for (~10 ph cm⁻² s⁻¹ sr⁻¹; its νFν
  // peaks near 30 keV — Gruber et al. 1999, ApJ 520, 124); absorbed by the air column
  cxb:             { name: 'cosmic X-ray background', E: 5e3, ground: false },
  // diffuse Galactic gamma rays from cosmic-ray interactions, concentrated in the plane (Fermi-LAT: Ackermann et al.
  // 2012, ApJ 750, 3); absorbed by the air column
  gammaDiffuse:    { name: 'diffuse Galactic gamma rays', E: 1e8, ground: false },
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
  nlcScatter:      { name: 'sunlight scattered by mesospheric ice', lam: 470e-9 },
  nlcUV:           { name: 'UV scattered by mesospheric ice', lam: 350e-9, ground: false },
  lightning:       { name: 'lightning channel light', lam: 500e-9 },
  sferics:         { name: 'lightning sferics (VLF)', f: 10e3 },
  leaderXray:      { name: 'stepped-leader X-rays', E: 1e5 },
  tgf:             { name: 'terrestrial gamma-ray flash', E: 1e7 },
  cherenkov:       { name: 'air-shower Cherenkov light', lam: 350e-9 },
  showerFluor:     { name: 'N₂ fluorescence from the shower', lam: 391e-9 },
  showerGamma:     { name: 'shower secondaries (gamma)', E: 1e9, ground: false },
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
  fm:              { name: 'FM broadcast', f: 100e6 },                 // 87.5–108 MHz broadcast band (ITU RR Art. 5, Region 1)
  airband:         { name: 'VHF airband voice', f: 125e6 },            // 118–137 MHz AM voice (ITU RR Art. 5; ICAO Annex 10 Vol. V)
  ais:             { name: 'AIS ship transponder (VHF)', f: 162e6 },
  satBeacon:       { name: 'satellite VHF beacon', f: 145.8e6 },   // ISS ARISS FM downlink 145.800 MHz
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
  showerRadio:     { name: 'air-shower geosynchrotron radio pulse (30–80 MHz)', f: 55e6 },
  crepuscular:     { name: 'crepuscular rays (sunlight between cloud shadows)', lam: 600e-9 },
  purpleLight:     { name: 'purple light (red sunlight scattered by stratospheric aerosol)', lam: 430e-9 },
  zodiacal:        { name: 'zodiacal light (sunlight scattered by interplanetary dust)', lam: 550e-9 },
  n2p4278:         { name: 'N₂⁺ first negative band 427.8 nm (blue lower border)', lam: 427.8e-9 },
  o7774:           { name: 'oxygen near-IR line 777.4 nm', lam: 777.4e-9 },
  n2FirstPos:      { name: 'N₂ first positive bands (red / near-IR)', lam: 870e-9 },
  auroralRadar:    { name: 'VHF radar backscatter off the auroral E-region', f: 50e6 },
  bluetooth:       { name: 'Bluetooth LE advertising burst', f: 2.44e9 },

  // ===== trail additions =====
  tvUHF:           { name: 'TV broadcast (UHF, DVB-T)', f: 600e6 },
  sunWarmSlope:    { name: 'sun-warmed slope cooling (~300 K)', lam: 9.7e-6 },
  fogScatter:      { name: 'twilight/moonlight scattered by fog droplets', lam: 550e-9 },
  fogTop:          { name: 'cold fog top hiding the warmer ground (~280 K)', lam: 10.3e-6 },
  sparkGlow:       { name: 'incandescent sparks (~1000–1300 K)', lam: 650e-9 },
  plumeHeat:       { name: 'hot gas & soot above the fire, cooling as it rises', lam: 4.5e-6 },
  groundHeat:      { name: 'ground heated by the fire pit (~330 K)', lam: 8.8e-6 },
  waterCold:       { name: 'stream water: cold sky reflected (IR) and low emissivity (microwave)', f: 37e9 },
  headlamp:        { name: 'LED headlamp', lam: 550e-9 },
  cowBody:         { name: 'cow body heat (~312 K)', lam: 9.3e-6 },
  gpsL1:           { name: 'GPS L1 / Galileo E1 navigation signal', f: 1575.42e6 },
  galileoE5:       { name: 'Galileo E5 / GPS L5 navigation signal', f: 1191.795e6 },
  wxTelemetry:     { name: 'weather-station telemetry link (VHF)', f: 169.4e6 },

  // ===== seaside additions =====
  aisAtoN:         { name: 'AIS aid-to-navigation broadcast (VHF)', f: 161.975e6 },   // AIS 1 (ch. 87B); AIS 2 = 162.025 MHz (ITU-R M.1371-5, ITU RR App. 18)
  // ch. 16 = 156.800 MHz, international distress, safety and calling (ITU RR Appendix 18; RR Art. 31/52): FM voice, 25 kHz channel
  vhf16:           { name: 'marine VHF channel 16 voice', f: 156.8e6 },
  sbandRadar:      { name: 'ship S-band navigation radar (2.9–3.1 GHz)', f: 3.05e9 },   // 2900–3100 MHz maritime radionavigation (ITU RR Art. 5); IEC 62388 S-band ship radar
  // racons reply in the 9300–9500 MHz radar band (and 2900–3100 MHz) when a ship's radar sweeps them (ITU-R M.824-4; IALA R0101)
  racon:           { name: 'radar beacon (racon) reply', f: 9.4e9 },
  // turbine towers and moving blades return strong, Doppler-spread X-band echoes and side-lobe ghosts (MCA/QinetiQ, "Results of the
  // electromagnetic investigations", North Hoyle offshore wind farm, 2004)
  radarClutter:    { name: 'radar echoes off turbine blades (X-band)', f: 9.4e9 },
  navGreen:        { name: 'green navigation light', lam: 520e-9 },
  // lantern colours: IALA R0201 / CIE S 004 signal-light chromaticity; white, yellow (special marks, offshore structures: IALA G1162)
  navWhiteLED:     { name: 'white LED lantern', lam: 560e-9 },
  navYellow:       { name: 'yellow special-mark light', lam: 590e-9 },
  // metal-halide lamps: Hg + Na/Sc/Tl iodide lines across the visible; 560 nm stands for the white mix (Waymouth, "Electric Discharge Lamps", 1971)
  deckLight:       { name: 'metal-halide deck floodlights', lam: 560e-9 },
  mistScatter:     { name: 'moonlight scattered by sea-mist droplets', lam: 550e-9 },
  mistThermal:     { name: 'thermal emission of cool mist (~285 K)', lam: 10.2e-6 },
  // Sea-cliff interferometers at Dover Heights, Sydney: 200 MHz (McCready, Pawsey & Payne-Scott 1947, the Sun) and
  // 100 MHz (Bolton & Stanley 1948, Cygnus A)
  lloydFringe:     { name: 'sea-cliff interferometer fringes (Lloyd\'s mirror, 200 MHz)', f: 200e6 },
  lloydFringe100:  { name: 'sea-cliff interferometer fringes (Lloyd\'s mirror, 100 MHz)', f: 100e6 },
  // Bluetooth Classic (BR/EDR) audio streaming, A2DP profile: 79 × 1 MHz channels 2.402–2.480 GHz, frequency-hopping
  // (Bluetooth Core Specification v5.3, Vol. 2 Part A)
  bluetoothA2DP:   { name: 'Bluetooth Classic audio stream (A2DP)', f: 2.44e9 },

  // ===== city additions =====
  keyFob:          { name: 'car key fob (433.92 MHz)', f: 433.92e6 },
  tpms:            { name: 'tyre-pressure sensors (433.92 MHz)', f: 433.92e6 },
  lteIoT:          { name: 'LTE-M modem (scooters, bus screen)', f: 800e6 },
  tetra:           { name: 'TETRA emergency-services net (380–400 MHz, 77 cm)', f: 390e6 },
  airportASR:      { name: 'airport surveillance radar (ATC primary radar, S-band 2.7–2.9 GHz)', f: 2.8e9 },
  // DAB+: one continuous COFDM multiplex per block, VHF Band III 174–240 MHz (ETSI EN 300 401); 220 MHz falls in block 11C (centre 220.352 MHz; ITU-R BS.1660)
  dab:             { name: 'DAB+ digital radio (Band III, continuous OFDM)', f: 220e6 },
  // 50 Hz mains (EN 50160). λ = 6000 km, so anyone within λ/2π ≈ 950 km sits in the quasi-static near field: the line
  // radiates essentially nothing, and its E/B field falls to background within tens to about a hundred metres (WHO EHC 238, 2007).
  // Stylised: drawn as a faint radio glow on the line, which it is not.
  powerHum:        { name: '50 Hz power-line near field (quasi-static, not radiated)', f: 50, stylised: true },
  // corona discharge on HV conductors and fittings: broadband impulsive noise, strongest at LF/MF (CISPR TR 18 measures at 0.5 MHz), falling off through HF, worse in
  // rain, fog and wet snow (CISPR TR 18-1; EPRI "Transmission Line Reference Book, 345 kV and Above", ch. 7)
  coronaRF:        { name: 'power-line corona noise (broadband HF/VHF)', f: 10e6 },
  // sliding-contact arcs between pantograph and contact wire: broadband impulsive noise from ~100 kHz to a few hundred
  // MHz, the reason railways have their own EMC standard (EN 50121-2); 30 MHz stands in for the band
  arcRF:           { name: 'pantograph arcing (broadband radio)', f: 30e6 },
  // a short arc in air: N₂ second-positive bands (337–434 nm), N II/O II ion lines and the electrode metal's lines (Cu I
  // 510–522 nm for a copper wire) add up to blue-white; 450 nm stands for the visible mix (line data: NIST ASD)
  arcLight:        { name: 'electric arc in air: N₂ and metal lines, blue-white', lam: 450e-9 },
  // Cu I resonance line 324.75 nm (3d¹⁰4s ²S½ – 3d¹⁰4p ²P°3/2; NIST ASD), the strongest UV line of a copper arc
  arcUV:           { name: 'arc UV: Cu I resonance line 324.7 nm', lam: 324.7e-9 },
  // N₂ second-positive system (C³Πu → B³Πg), 0–0 band head at 337.1 nm — the strongest UV emission of any spark in air
  // (the nitrogen-laser line; Lofthus & Krupenie, J. Phys. Chem. Ref. Data 6, 113, 1977). Bug-zapper grids are steel
  // or zinc-plated, not copper, so their spark's UV is the air's own, not arcUV's Cu I line
  airArcUV:        { name: 'spark in air: N₂ second-positive band 337.1 nm', lam: 337.1e-9 },
  // LED drivers switch at 20 kHz–1 MHz; the fast edges' harmonics are conducted and radiated up into the HF/VHF range
  // (CISPR 15 sets limits for lighting from 9 kHz to 300 MHz); 30 MHz stands in for that harmonic comb. The visible
  // flicker of a cheap driver is the rectified mains ripple at 100 Hz, a different thing.
  smpsEMI:         { name: 'LED-driver switching interference (kHz–MHz switching harmonics)', f: 30e6 },
  neon:            { name: 'neon discharge 640 nm', lam: 640.2e-9 },
  ledBlue:         { name: 'blue LED light bar', lam: 465e-9 },
  ledAmber:        { name: 'amber LED indicator', lam: 590e-9 },
  ir850:           { name: '850 nm IR illuminator', lam: 850e-9 },
  lidar905:        { name: '905 nm LiDAR pulses', lam: 905e-9 },
  // condensed vapour (steam from a leaking district-heating line, cooling-tower drift): liquid droplets are near-black
  // bodies at 8–14 µm, so the plume shows in thermal IR — the warm, dry air around it does not (air is transparent there)
  steam:           { name: 'condensed vapour plume: water droplets (~300–320 K)', lam: 9.3e-6 },
  // the same droplets (µm–tens of µm, ≫ λ) scatter all visible wavelengths alike (Mie regime: Bohren & Huffman,
  // "Absorption and Scattering of Light by Small Particles", 1983): a pale white plume in the lamplight
  dropletScatter:  { name: 'lamplight scattered by condensed-vapour droplets (white)', lam: 550e-9 },
  // natural radioactivity of building stone (K-40 line; Tl-208 from the thorium chain; Bi-214 from the uranium/radon chain)
  k40Gamma:        { name: 'K-40 gamma line (1.46 MeV, granite & brick)', E: 1.461e6 },
  tl208Gamma:      { name: 'Tl-208 gamma line (2.61 MeV, thorium chain)', E: 2.614e6 },
  bi214Gamma:      { name: 'Bi-214 gamma line (609 keV, uranium/radon chain)', E: 609.3e3 },
  blacklight365:   { name: 'black-light / insect-trap tube (UVA 365 nm)', lam: 365e-9 },
  hg405:           { name: 'mercury violet line leaking from black-light tubes (404.7 nm)', lam: 404.7e-9 },
  ledRed:          { name: 'red LED rear light', lam: 625e-9 },
  heaterGlow:      { name: 'red-hot patio-heater mesh (~1100 K, visible tail)', lam: 680e-9 },
  droneLink:       { name: 'drone control link (2.4 GHz ISM)', f: 2.44e9 },
  droneVideo:      { name: 'drone video downlink (5.8 GHz)', f: 5.8e9 },
  batteryWarm:     { name: 'warm traction battery / motors (~305 K)', lam: 9.5e-6 },

  // ===== near-IR (M11/T3: the night-vision channel of the IR band, engine/render/surface.js surfNIR) =====
  // leaves reflect ~0.45–0.5 at 0.8 µm against ~0.05 in the red — the red edge at ~0.7 µm (mesophyll scattering, no
  // chlorophyll absorption beyond 0.7 µm: Jacquemoud & Baret 1990, Remote Sens. Environ. 34:75, PROSPECT; ASTER /
  // ECOSTRESS library spectra); the illuminant is the Moon, the twilight sky and the airglow
  nirReflect:      { name: 'near-IR moonlight / skylight reflected (leaves bright: the red edge)', lam: 800e-9 },
  // moonlight is sunlight × the lunar reflectance, which rises from ~0.07 at 400 nm to ~0.17 at 900 nm (ROLO model:
  // Kieffer & Stone 2005, Astron. J. 129:2887) — redder than sunlight, so the Moon is a strong near-IR illuminator
  moonNIR:         { name: 'moonlight in the near-IR (lunar reflectance rising to the red)', lam: 850e-9 },
  // OH Meinel bands: vibration–rotation airglow of OH at ~87 km, 0.6–2.5 µm (Meinel 1950, ApJ 111:555); in the
  // 0.7–0.9 µm range of a GaAs photocathode it outshines starlight several times (Vatsia 1972, Atmospheric Optical
  // Environment, US Army ECOM) — what lights a moonless night for night-vision goggles
  ohAirglow:       { name: 'OH Meinel-band airglow (night-sky near-IR)', lam: 850e-9 },

};

const RANGES = [['radio', 1, Infinity], ['micro', 1e-3, 1], ['ir', 700e-9, 1e-3], ['vis', 380e-9, 700e-9],
  ['uv', 10e-9, 380e-9], ['xray', 1e-11, 10e-9], ['gamma', 0, 1e-11]];

export const wavelength = p => p.lam ?? (p.f ? C / p.f : HC / p.E);
export function bandOf(p) { const l = wavelength(p); return RANGES.find(([, lo, hi]) => l >= lo && l < hi)[0]; }
// Where a process sits inside its band: 0 = the long-wave (low-frequency) edge, 1 = the short-wave edge, linear in
// log wavelength. The open ends are closed at the extremes of this table: radio at 100 km (3 kHz, VLF sferics;
// mains hum at 50 Hz clamps to 0), gamma at 1.24e-15 m (1 GeV, air-shower photons). Used by the spectral eye to
// shift a band's hue slightly with frequency (engine/render/compose.js).
const OPEN = { radio: [1, 1e5], gamma: [1.24e-15, 1e-11] };
export const bandEdges = b => { const r = RANGES.find(x => x[0] === b); return OPEN[b] || [r[1], r[2]]; };   // [λ lo, λ hi] in m
const edges = bandEdges;
export function bandPos(p) {
  const l = wavelength(p), [lo, hi] = edges(bandOf(p));
  return Math.min(1, Math.max(0, (Math.log(hi) - Math.log(l)) / (Math.log(hi) - Math.log(lo))));
}
// the inverse: the wavelength (m) at position pos inside band b
export function posLambda(b, pos) { const [lo, hi] = edges(b); return Math.exp(Math.log(hi) - pos * (Math.log(hi) - Math.log(lo))); }

const si = (v, units) => { for (const [k, u] of units) if (v >= k) return `${+(v / k).toPrecision(3)} ${u}`; return `${v.toPrecision(3)} ${units.at(-1)[1]}`; };
// "2.4 GHz · 12.5 cm" — used by the panel
export function describe(p) {
  const l = wavelength(p), f = C / l, E = HC / l;
  const lam = si(l, [[1e3, 'km'], [1, 'm'], [1e-2, 'cm'], [1e-3, 'mm'], [1e-6, 'µm'], [1e-9, 'nm'], [1e-12, 'pm']]);
  if (l < 10e-9) return `${si(E, [[1e9, 'GeV'], [1e6, 'MeV'], [1e3, 'keV'], [1, 'eV']])} · ${lam}`;
  if (l < 1e-3) return lam;
  return `${si(f, [[1e9, 'GHz'], [1e6, 'MHz'], [1e3, 'kHz'], [1, 'Hz']])} · ${lam}`;
}
