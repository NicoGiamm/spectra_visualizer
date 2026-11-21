# Improvement plan — spectral worlds & realistic events

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done. Work one step at a time; every step ends with
`uv run spectra shot <id> -t …` checks (several moments + `--bands` instrument views), a short note under the step,
and a commit. Steps inside a phase are ordered; phases 3–6 can be reordered once phases 0–2 are done.

## Goals (from the review)

1. **The landscape itself must show the spectrum.** Today only discrete emitters glow; surfaces are lit in
   visible light or turned flat dark in instrument view. The sea should glow in IR, sand and rock should cool, buildings
   should leak heat, snow should reflect UV, granite should speckle in gamma, the sea should look *cold* in microwave.
2. **Realistic events.** Audit every event for physics (band, wavelength, whether it can reach the ground, where in
   the sky, how long it lasts) and replace or relabel the ones that are invented.
3. **A much busier city in radio and microwave.** Wi-Fi, cellular, Bluetooth, broadcast, trams, multipath bouncing
   in the street canyon. (Band note: in our table Wi-Fi 2.4/5 GHz = 12.5/6 cm and cellular are **microwave**; true
   **radio** (>1 m) in a city is FM/DAB broadcast, VHF airband, power lines, tram/LED/switching interference. Both
   bands get filled.)
4. **A gradual, physically paced aurora.**

## Guiding principles

- **Two layers per band**: *sources* (Em/Rib, as now) and *surfaces* (new: every material has spectral properties).
- **Physics first, stylisation second**: the look per band stays stylised (thermal palette, radio dashes,
  microwave crackle…), but *what* emits, *how much* and *when* follows real physics. Anything compressed or
  invented is tagged so the panel can say so.
- **One source of truth per fact**: wavelengths/frequencies, emissivities, thermal inertia live in tables
  (`engine/core/`), not scattered literals.
- **Budget**: the city will need hundreds of emitters → instancing before content (step 0.2).

---

## Phase 0 — Foundations & measurement

- [x] **0.1 Timeline & activity report (Python).**
  Engine: `?dump=1` makes the page `console.log` one JSON line with every event's metadata
  (`name, t0, t1, bands, tags, freq`) and per-band activity sampled every 0.5 script-s (run the update loop
  headless over t = 0…60 without rendering). Tooling: `uv run spectra timeline <id>` runs headless Chrome, parses the
  JSON and prints an ASCII gantt + a per-band sparkline of active sources; `--json` for raw output.
  *Done when* the three scenarios print a timeline and gaps/peaks are visible at a glance.
- [x] **0.2 Instanced emitters.**
  `EmField(band, n, { color, real })`: one InstancedMesh (or one Points geometry) drawing *n* camera-facing
  quads with per-instance position/size/intensity/seed attributes in the same band shader (port `QUAD_FS` to read
  instance attributes). API: `field.set(i, pos, size, I)`; activity accounting identical to `Em`. Same for ribbons if
  needed later (`RibBatch`). Migrate fireflies, Wi-Fi, street lights, car lights.
  *Done when* draw calls (log `renderer.info.render.calls` in `?dump`) drop ≥50 % in the city with identical screenshots.
- [x] **0.3 Spectral reference table.**
  `engine/core/spectrum.js`: named emitters/processes with frequency or wavelength, e.g.
  `wifi24: { f: 2.4e9 }`, `fm: { f: 1e8 }`, `ais: { f: 162e6 }`, `xbandRadar: { f: 9.4e9 }`, `carRadar: { f: 77e9 }`,
  `na589: { λ: 589e-9 }`, `o5577: { λ: 557.7e-9 }`, `o7774: { λ: 777.4e-9 }`… plus `bandOf(entry)` that derives
  the band from the BANDS ranges. Events reference entries (`freq: 'wifi24'`) instead of guessing bands; a check in
  `spectra timeline` warns when an event's declared bands disagree with its `freq` entries.
  *Done when* every existing event lists its processes and no mismatch warnings remain (see audit in 2.3).

## Phase 1 — Spectral surfaces (the landscape shows the spectrum)

- [ ] **1.1 Surface property model.**
  Per material (or per vertex/instance via attributes): `T0` surface temp at t=0 (°C), `tau` thermal inertia
  (script-s), `Tcore` (interior heat for buildings), `eIR` (8–14 µm emissivity), `eMW` (microwave emissivity),
  `uvAlb` (UV albedo), `gamma` (terrestrial activity, relative), `rRadio` (radio reflectivity).
  Temperature curve: `T(t) = Tair(t) + (T0 − Tair(0))·exp(−t/tau) + Tcore·k`, with `Tair` falling from ~22 °C to
  ~12 °C over the timeline (`engine/world/atmosphere.js`).
  Reference values (document sources in comments): water `eIR .98, eMW .45, uvAlb .06, gamma .05, tau ∞`;
  dry sand `eIR .92, eMW .9, uvAlb .2, gamma .6 (heavy minerals), tau short`; wet sand `eMW .6`;
  granite/rock `eIR .9, gamma 1.0, tau long`; fresh snow `eIR .99, uvAlb .85`; grass/forest `eIR .97, uvAlb .02,
  tau medium`; asphalt `eIR .95, tau medium, T0 high`; concrete/brick `gamma .5`; glass windows `eIR .85 but reflect
  the cold sky at grazing angles`.
- [ ] **1.2 Surface band shader chunk.**
  `engine/render/surface.js`: a GLSL chunk + `spectral(material, props)` that patches `MeshStandardMaterial`s
  (onBeforeCompile) and is included by custom shaders (sea, buildings). Per active band it adds:
  - **IR**: `thermal()` palette of `eIR·T` (radiance-ish), with grazing-angle emissivity drop (water/glass reflect
    the cold sky near the horizon → realistic darker far sea and window panes).
  - **Microwave**: brightness temperature `Tb = eMW·T + (1−eMW)·Tsky` in the crackle look — calm sea reads
    *cold*, land warm, foam warmer than open water.
  - **Radio**: illumination by up to 8 active radio transmitters (uniform arrays: position, power), `1/r²`,
    Lambert, `rRadio` — broadcast towers paint the slopes/facades in moving dashes.
  - **UV**: `uvAlb × UV skylight(t)` (fades with the sun) — snow fields and sand glow violet at dusk, grass doesn't.
  - **Gamma**: Poisson-like scintillation speckle (hash on world cell × time) scaled by `gamma` — granite and
    building stone sparkle sparsely, the sea is almost silent.
  - **X-ray**: nothing (honest; the ground is dark in X-rays).
  Visibility rule: full strength in instrument view (Visible off); **15–20 %** overlay when Visible is on
  (tunable `SURFACE_OVERLAY`, maybe a HUD slider). Replaces `topoMat`/`gridMat` thermal hacks; contour/grid
  lines stay as a faint structural cue.
- [ ] **1.3 Activity from surfaces.**
  Meters get a per-band surface contribution (precomputed area-weighted mean of the band term, recomputed every
  ~0.5 s) so the bars reflect the landscape, not only point sources. Retune `METER_NORM`.
- [x] **1.4 Apply to the trail.** Terrain vertex attributes from the existing colour classes (grass, dry, rock,
  snow, dirt); trees (`eIR .97`, slight warmth), rocks (slow cooling replaces the 22 hand-placed `NEAR_ROCKS` Ems
  → keep a few Ems only for the hottest boulders), hut walls (`Tcore`). **Alpenglow becomes real**: tint snow faces
  that see the sun (`dot(normal, sunDir) > 0` at `sunEl` 0…−3°) pink in visible light — today it draws nothing.
- [x] **1.5 Apply to the seaside.** Sea shader includes the chunk: IR shows the **thermal crossover** — at t=0 the
  sand is hotter than the sea, by t≈20–25 the sand has cooled below the sea, which stays warm (≈18 °C) all night;
  microwave shows the sea cold with brighter foam lines; UV shows a faint sand/foam glow until ~t=12; gamma: sand
  > rock > sea. Promontory rock gets granite properties.
- [ ] **1.6 Apply to the city.** Asphalt (warm, slow), sidewalks, park lawn (cools fast, dew), building facades
  (`Tcore` per instance → heat leaks around windows, warm roofs with HVAC), glass (reflects cold sky in IR).
  Removes the hard-coded `BUILD.heat` look in favour of the shared chunk.

## Phase 2 — Physical honesty

- [ ] **2.1 Atmospheric transmission & detector mode.**
  Table per band of what reaches the ground: radio ~10 MHz–30 GHz ✓ (ionosphere blocks lower), microwave mostly ✓
  (absorption near 22/60/118/183 GHz), IR in windows (near-IR, 8–14 µm), visible ✓, UV only UVA/part UVB, X-ray ✗,
  gamma ✗. Every source gets `origin: 'space' | 'high' | 'ground'` (default from its event). New HUD toggle
  **Detector: Ground / Orbit** (default *Ground* — see open question Q1). In *Ground* mode space-origin X-ray/gamma/
  far-UV sources are not drawn; instead a dashed ghost outline + label "absorbed at ~30 km" shows where they are, and
  the panel explains why. What *does* reach the ground stays: air-shower Cherenkov light (near-UV/visible) and radio,
  lightning X-rays and TGF/gamma glows, terrestrial gamma.
- [ ] **2.2 Panel shows the physics.** Event chips show the process and frequency/wavelength on hover
  (`Wi-Fi 2.4 GHz · 12.5 cm`), plus a tag: `common` / `rare` / `time-compressed` / `stylised`. Script-time
  compression (e.g. air showers last µs, not seconds) is labelled.
- [~] **2.3 Event audit — apply the verdicts below.** One commit per group (sky library, trail, seaside, city). *Trail group applied (see 2026-11-21 note).*

### Audit of existing events

| Event | Verdict | Action |
|---|---|---|
| Sunset | ✓ Sun is bright in radio; UV fading first is right (long path) | keep |
| Airliner | ✗ transponder (Mode S/ADS-B 1030/1090 MHz = 28 cm) is **microwave** | transponder → micro; radio = VHF airband voice (118–137 MHz) bursts |
| Venus | ✓ | keep |
| CMB | ✓ band; the mottling is a 10⁻⁵ effect | tag `stylised` |
| Milky Way | ✓ (radio synchrotron, Sgr A*, dust in near-IR) | dim under light pollution only (done) |
| Meteor shower | ✓ radio forward-scatter; ✗ meteor UV never reaches the ground | UV → `origin:'high'`, hidden in Ground mode |
| Pulsar | ✓ radio; ✗ X-ray absorbed | X-ray `origin:'space'` |
| Comet | ✓ dust/ion tails (ion tail is *visible* blue, CO⁺ 420 nm); ✗ X-rays absorbed | X-ray space-only; ion tail colour stays visible |
| Satellite pass / Starlink | ✓ (Ku/Ka downlink = micro) | keep |
| Black-hole binary | ✓ radio jets; ✗ X-ray absorbed | X-ray space-only |
| Aurora | position/timing/bands wrong — see Phase 3 | rework |
| Moonrise | ✓ visible, thermal IR; ✗ lunar gamma (real, Fermi) absorbed | gamma space-only |
| Air showers | concept ✓; ✗ X-ray shaft; duration µs; missing radio (30–80 MHz geosynchrotron, real) | drop X-ray shaft or space-only; add radio pulse; tag `time-compressed` |
| Thunderstorm | ✓ sferics, lightning X-rays (ground-detected), TGF/gamma glows | keep, add VLF note |
| Fast radio burst | ✓ (dispersion sweep: low frequencies arrive later) | relabel the "swell" as dispersion |
| Supernova | ✓ visible/IR/radio; ✗ UV flash, X, gamma absorbed | space-only for UV/X/gamma; tag `rare` |
| Gamma-ray burst | ✗ gamma absorbed; ✓ rare naked-eye optical afterglow, radio afterglow | gamma space-only (screen flash only in Orbit mode); tag `rare` |
| Sun dog pair | ✓ but parhelia sit at **~22°**, not 18° | move to 22°+ (grows slightly with sun elevation) |
| Zodiacal scatter | ✗ invented phenomenon | replace with **crepuscular rays** (t 2–12) and **purple light** twilight glow (t 8–16) ahead; optional real **zodiacal light** cone after full dark at the dark-sky sites (trail, seaside) |
| Noctilucent clouds | ✓ (summer, low in the NW after dusk) | keep |
| Moon halo | ✓ 22°; ✗ "IR companion ring" invented; circumscribed halo needs a high Moon | drop IR ring; replace 29° ring with upper tangent arc |
| Hiker / You | ✓ phone = micro | keep; phone also does Bluetooth bursts |
| Alpenglow | ✗ draws nothing; peaks opposite the Sun are **east (behind you)** | real tint on snow faces lit at grazing sun (1.4), label side peaks |
| Radio/TV tower | ✓ FM = radio; TV UHF (470–700 MHz) = micro | add micro, paint slopes via 1.2 radio term |
| Warm rocks | ✓ | becomes surface cooling (1.4) |
| Mountain hut, Deer, Fireflies, Bats | ✓ | keep |
| Thermal updraft | ✗ thermal cameras see surfaces, not air (air is transparent at 8–14 µm) | replace with **sun-warmed slope** cooling (surface) + **valley fog** forming later (visible, cold in IR) |
| Fire whirl | ✗ needs a large fire | replace with **spark draft & smoke plume** (vis + IR, smoke cools with height) |
| Green flash | ✓ rare, needs a sharp sea horizon | tag `rare` |
| Lighthouse | ✓; radio beacons (285–325 kHz) mostly retired → AIS AtoN on VHF | real light characteristic e.g. Fl(2) 10 s; AIS bursts |
| Container ship | ✓ X-band radar 9.4 GHz (micro), AIS 162 MHz (radio), hot funnel | add S-band radar, deck crew phones |
| Bioluminescent surf | ✓ | keep |
| Street lights | half-true: most cities now LED (no IR tail) | mix of old sodium (orange, near-IR) and LED (white, no IR, slight blue) |
| Lit windows, 5G mast, Wi-Fi, Traffic, Fireworks | ✓ | keep; expanded in Phase 4 |

## Phase 3 — Aurora rework (gradual and physical)

- [ ] **3.1 Substorm phases on the script axis** (replace the 3-s `env` fade):
  *growth* (t≈26–33): a faint, homogeneous green arc low on the horizon fades in over ~6 s, almost no rays;
  *breakup* (≈33–38): brightening, rays appear, folds speed up, the curtain climbs, red tops (630 nm) appear;
  *recovery* (≈38–50): diffuse patches pulsating with 2–20 s periods, slowly dimming to a faint glow.
  Intensity also gated by darkness (`night()`), so it never starts in twilight.
- [ ] **3.2 Softer geometry.** Curtain amplitude, height and ray contrast ramp per phase instead of appearing at
  full size; soft fade on both arc ends and at the top; per-segment brightness variation along the arc.
- [ ] **3.3 Correct place & bands.** The auroral oval lies toward the pole: put the arc **low over the north-western
  horizon** (az ≈ 300–345, el 3–20°, near the view's right edge) and fix the note. Bands from the ground:
  visible (557.7 nm green, 630 nm red, 427.8 nm N₂⁺ blue base) and **near-IR** (777.4 nm O, N₂ first positive);
  radio = VHF **radar backscatter** off the auroral E-region, not AKR (100–300 kHz, blocked by the ionosphere);
  UV and X-ray become `origin:'high'` (Orbit mode only). The side ribbons follow the curtain's own displacement
  (same wave function in JS) instead of static lines, and stagger in with the phases.
- [ ] **3.4 Per-scenario visibility.** Trail and seaside get it; the city drops it (light pollution) — already so.

## Phase 4 — The city comes alive (radio & microwave ecosystem)

- [ ] **4.1 Crowd of emitters** (all via `EmField`): pedestrians (realistic-IR bodies, phones pinging LTE/5G,
  Bluetooth earbuds bursting), many more Wi-Fi APs (one per lit flat with ~60 % probability, channel-coloured
  2.4 vs 5 GHz), shop-front Wi-Fi, bus stops with LED screens, parked cars with key-fob/TPMS bursts (433 MHz =
  69 cm micro), scooters.
- [ ] **4.2 Multipath bouncing.** Engine helper `bounce(origin, dir, boxes, maxHits)` reflecting rays off the
  city's axis-aligned building boxes (exported by `world.js`). The mast and a few strong APs emit short-lived
  rays that reflect 2–4 times down the canyon as `Rib` polylines, fading per bounce (≈ −6 dB each), dashes moving
  outward. Facades hit by rays flash in the radio/micro surface term (1.2).
- [ ] **4.3 Ambient field haze.** A screen-space band "fog" for microwave in the street canyon: crackle density
  proportional to the number of active APs/phones within ~80 m, attenuated by depth (layered camera-facing quads
  at 8/25/70 m or a post pass). Fades as you walk into the park → you *feel* leaving the dense RF zone.
- [ ] **4.4 True radio in the city.** FM/DAB broadcast mast on a distant hill (paints facades via 1.2), VHF airband
  from the approaching airliner, **tram line** with pantograph arcing (broadband radio + visible/UV blue flashes),
  overhead power line hum (ELF, very long-wavelength radio, faint steady), LED-driver/switching interference near
  shop signs.
- [ ] **4.5 More visible/IR life.** Mixed LED/sodium lamps, neon & LED signs, security cameras with **850 nm IR
  illuminator rings** (near-IR, invisible by eye — a perfect band lesson), rooftop HVAC exhaust plumes (IR),
  manhole steam (IR), delivery robot/robotaxi **LiDAR (905 nm near-IR)** sweeping, distant airport **radar**
  (S-band, microwave) sweeping from the horizon, police car blue lights + radio bursts.
- [ ] **4.6 Tune.** `meterNorm`, draw-call budget (< ~400), 30 fps target on mid hardware; walk speed so the
  canyon section isn't rushed.

## Phase 5 — Seaside realism

- [x] **5.1 Sea in every band** (built on 1.5): IR thermal crossover; microwave cold sea + warm foam; radio
  **sea-interferometer** effect — sky radio sources (pulsar, Milky Way centre, the Sun at the start) get a mirrored
  copy on the sea surface that interferes as they move (historical cliff radio astronomy); UV glitter fades early.
- [ ] **5.2 Maritime life:** marine VHF ch. 16 chatter (radio), fishing boats with deck lights appearing offshore after
  dark, navigation **buoys** with real light characteristics (red/green, IALA), an **offshore wind farm** with
  synchronised red aviation lights and radar clutter, a beach bonfire with people (IR bodies, phones).
- [x] **5.3 Coast details:** wet-sand band that reflects (vis) and reads cold in microwave, foam lines warmer in IR,
  cliff granite gamma speckle, sea mist late (cold, hides the horizon in IR, glows in moonlight).
- [ ] **5.4 Lighthouse & ship polish:** Fl(2) 10 s characteristic, beam visible in haze, ship radar surface hits
  on the promontory, AIS packets as short radio dashes toward the coast station.

## Phase 6 — Trail realism

- [x] **6.1 Mountain surfaces** (on 1.4): snow UV glow at dusk, granite gamma, meadows cooling fast, forest
  staying warmer (canopy), stream as a cold line in IR and dark in microwave.
- [x] **6.2 Alpine life:** distant hikers' headlamps on far switchbacks after dark, cows with warm bodies
  (realistic IR) on the meadow, a cell mast on the ridge (micro, paints the valley), a weather-station radio link,
  GPS/Galileo satellites (L-band microwave) as faint steady sources, valley fog (replaces thermal updraft).
- [x] **6.3 Replace fire whirl** with spark draft & smoke plume; campfire IR ground heating around the pit.

## Phase 7 — Polish & docs

- [ ] **7.1 Retune** `GAIN`, `METER_NORM`, bloom after surfaces are in; check each preset (Human eye, Thermal, Radio
  telescope, High energy) in all three scenarios with `spectra shot`.
- [ ] **7.2 Performance pass** with the `?dump` draw-call/frame-time numbers; LOD for far emitters.
- [ ] **7.3 Docs:** README (surfaces, detector mode, spectrum table), CLAUDE.md conventions (surface properties,
  `EmField`, `origin`, `freq` entries, timeline tool), update this plan.

---

## Open questions (decide before Phase 2 / Phase 4)

- **Q1 Detector default**: *Ground* (honest: cosmic X/gamma hidden with ghost markers) or *Orbit* (today's
  spectacle)? Proposal: Ground by default, one click to Orbit.
- **Q2 Event density vs realism**: keep the time-compressed "one improbable night" (supernova + GRB + FRB + comet)
  tagged as such, or add a **"Typical night"** mode that only plays `common` events? Proposal: keep the show,
  add the mode later.
- **Q3 Surface overlay with Visible on**: faint overlay (~15 %) or none? Proposal: faint, with a HUD slider.

## Progress notes

<!-- Append dated notes per step: what changed, screenshots checked, follow-ups. -->

### 2026-11-21 · 0.1 done
`uv run spectra timeline [ids] [--step .5] [--json]` (headless `?dump=1&dstep=…` → JSON in `<script id="spectra-dump">`,
read via `--dump-dom`; ~5 s per scenario). Baseline:
- draw calls (scene pass, t=5/30/55): trail 101/218/158 · seaside 87/179/119 · **city 452/719/736**.
- sources: trail 417 Em + 410 Rib.
- **Bug found: every meter is pinned at the top** (act / METER_NORM peaks: trail vis 18×, ir 8.5×; city vis 38×,
  ir 12×, micro 7×) — also true in the original single file. Fix in 1.3 (meters must be re-normalised, likely with a
  soft compression like `1 - exp(-act/norm)` instead of a hard clamp).

### 2026-11-21 · 0.2 done
`EmField(band, n, color, real)` in `engine/render/sources.js` (instanced quads, same band shader via `#define`s,
per-instance colour, unused slots clipped in the vertex shader; seeds from `Math.random` so the seeded `R` stream —
and every layout — is unchanged). Migrated: fireflies, warm rocks, warm sand, bioluminescent surf, street lights,
Wi-Fi, car head/tail lights + engine heat + radar, fireworks stars, Starlink. City scenery merged too (centre-line
dashes, lamp poles/arms, light pools → 3 meshes; car bodies/cabins → 2 InstancedMeshes).
Activity samples identical to the baseline (only the random lightning flicker differs).
Draw calls: trail 101/218/158 → 80/136/158 · seaside 87/179/119 → 74/125/107 · **city 452/719/736 → 64/162/157**.
Also dimmed the far-facade window average (was a flat beige wall at night).

### 2026-11-21 · 0.3 done — Phase 0 complete
`engine/core/spectrum.js`: ~90 processes (f / λ / E), `bandOf()` from the BANDS ranges, `describe()` for labels
("2.4 GHz · 12.5 cm"), flags `ground: false` (absorbed by the atmosphere) and `stylised: true`. Every event lists
`freq: [...]` (+ provisional `tags`). The dump now records the bands each event *actually draws*; `spectra timeline`
prints a physics check (declared ↔ processes ↔ drawn). Fixed: Pulsar drew an undeclared visible glow; flames had no
process. **0 warnings** in all scenarios.
The check's info lines are the Phase 2 to-do list: 19 processes absorbed before the ground (meteor UV, pulsar /
BH-binary / comet / supernova / GRB X-rays, lunar & shower gamma, auroral UV/X/AKR, NLC UV…) and 5 stylised ones
(zodiacal scatter ×2, warm air, IR moon-halo ring, air-shower X-ray shaft).

### 2026-11-21 · 1.4 + 2.3 (trail group) + 6.1–6.3 done — Trail realism
`world.js`: terrain `surfAt` maps the colour classes to surface presets (meadow→dirt→rock→snow, `PRESET.*` in
`engine/render/surface.js`, per-vertex `aSurfA/B/C`); trees/rocks/hut/grass registered with `spectral()`; the
stream strip is new (`STREAM`, water preset — cold sky mirror in IR, eMW .45 dark in micro, mirrors the sky
keyframes `SKY_REFL` in visible). Terrain-only physics in `TRAIL_U`/`TERRAIN_DECL`: sun-warmed slope faces
(`uAft`, decay `uSlopeK = exp(-t/9)`), campfire ground heating (`uCamp`), and a long-range microwave coverage
field `uMTx[2]` (cell mast + TV UHF) with radial dashes. **Alpenglow is real**: `visExtra` tints snow faces
that see the grazing sun pink (`uAlpen` × `dot(N, uSunDir)`), label points at the lit side peak (`SPOTS.alpen`).
`events.js`: audit replacements — `thermalUpdraft` → `sunWarmedSlope` + `valleyFog` (cold fog banks in hollows,
silver when moonlit, cold opaque cap in IR), `fireWhirl` → `sparkDraft` (updraft sparks + smoke plume cooling
with height); campfire gained ground heating (`groundHeat`, `uCamp` + meter share); radio/TV tower now carries
TV-UHF **micro** + FM **radio** painting the slopes (`addTx('radio')`, `uMTx[1]`); warm rocks keep a few
`EmField` Ems only for the hottest boulders. Phase 6 events: `mountainStream`, `farHikers` (headlamp switchback
zigzag), `cows` (InstancedMesh herd + realistic-IR `EmField` bodies), `cellMast` (LTE/5G, paints the valley),
`weatherStation` (VHF bursts + arced radio link to the ridge mast), `gnss` (GPS L1 / Galileo E5, faint steady
L-band points). New spectrum.js processes: tvUHF, sunWarmSlope, fogScatter/Top, sparkGlow, plumeHeat, groundHeat,
waterCold, headlamp, cowBody, gpsL1, galileoE5, wxTelemetry.
Verified: `spectra timeline trail` — **0 physics warnings**; draw calls 86/152/162 at t=5/30/55 (baseline 80/136/158 —
the +6…+16 are the new meshes/labels; fields and instancing keep it in the ballpark); sources 232 Em + 406 Rib + 9 fields.
Shots `trail_t5/30/54` + instrument `-t 30 --bands ir,micro` all exit 0; alpenglow label, stream, cows, fog, plume
and satellite points read correctly. Meters still pinned at the top in every band (known 0.1 bug — re-normalisation
is step 1.3; the new micro sources raise the micro peak, retune there).
Follow-ups: seaside/city audit groups; 1.3 meter accounting + soft compression.

### 2026-11-21 · 1.5, 5.1, 5.3 done (seaside, now verified)
`scenarios/seaside/world.js`: local presets (`wetSand` glossy eMW .6, `sand` tau 22 s so its 18 °C crossover
with the sea lands near t≈22, `dune`, `granite` gamma 1); terrain `surfAt` blends wet→dry→dune→granite with
`aSurfA/B/C` attrs; terrain hook `coastExtra` (ship-radar microwave echoes off the cliffs + sparkly sea clutter,
bonfire IR hot-spot hook left for 5.2, far-cliff gamma speckle that survives the distance fade) and a `visExtra`
that mirrors sky + sun/moon on the glossy wet band. Sea is one ShaderMaterial for both looks
(`seaMaterial(instr)`): `seaBands()` gives IR water emissivity 1−R(θ) (dark far sea), the crossover, mist cold
screen; microwave Tb with cold calm sea / warm foam + radar sea clutter; radio txField + mirrored radio-sky
slots `ENVSEA.rs` (Sun radio during the sunset, Sgr A* synchrotron, pulsar — Lloyd's-mirror interference fringes,
lloydFringe 200 MHz); UV glitter only while the low sun still has UV (`uUVglit = sm(.8, 4, sunEl)`), foam
reflecting; gamma near-silent. `ENVSEA` shared state; `world.update` fills airT/uvGlit/rs and ties fog density to
mist. `events.js`: `ship` writes `radP/radA/radI` (sweep bearing shared with the surface shaders' `radarEcho`),
new `seaMist` event (t 42–60) drives uMist + meter activity (bands vis/ir, `mistScatter`/`mistThermal`);
`masts()` adds the coast radio station and the cliff-top Yagi interferometer array (merged, for 5.2/5.4 events).
Verified: `spectra timeline seaside` — 0 warnings, 30 events, draw calls 75/125/108 (was 74/125/107, +1 mast
mesh); `spectra shot` exit 0 at t=5/22/30/54 and `--bands ir,micro` (sand hottest t≈5, sea brighter by t=30/54,
mist hides the horizon toward IR), `--bands radio,uv` (t=8 sun mirror + UV glitter path, t=25 interference
fringes on the whole sea), `--bands gamma,radio --yaw .85` (granite speckle across the headland).
Follow-ups: `ENVSEA.fire` hook stays unwired (5.2 bonfire); meters still pinned (1.3/7.1).
