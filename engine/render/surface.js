// Spectral surfaces: every solid surface carries physical properties and shows them in each band.
//
//   A = [T0 °C at t=0, Teq °C (night equilibrium), 1/tau (per script-s), eIR (8–14 µm emissivity)]
//   B = [eMW (microwave emissivity), uvAlb (UV albedo), gamma (terrestrial activity, rel.), rRadio (radio reflectivity)]
//   C = [gloss (0 matte … 1 water/glass: emissivity drops at grazing angles), Tradio, Tmicro, Tgamma]
//       T* = the fraction of radio / microwave / gamma light from behind that gets through (spectral eye, M10/T6:
//       long waves and gamma cross walls, foliage and thin matter that block light); see TRANS below
//   D = [h (m), nirAlb, R0opt, slope (rad)] — how the surface REFLECTS (M11/T2), see REFLECTION below:
//       h      rms height of the roughness the mesh does not model (sub-facet): sets specular vs diffuse per band
//       nirAlb near-IR (~0.8 µm) albedo, the foliage red edge — data for night-vision near-IR (M11/T3)
//       R0opt  normal-incidence specular reflectance at UV / optical wavelengths (Fresnel)
//       slope  rms slope of the unresolved shape (curved car panels, sub-facet tilts): the width of a mirror image
//
// Temperature T(t) = Teq + (T0 − Teq)·exp(−t/tau): sand and meadows cool fast, rock and asphalt slowly,
// water barely at all — which gives the beach its thermal crossover. Per band:
//   IR     thermal palette of the radiated temperature e·T + (1−e)·T_sky(−35 °C): wet/glossy surfaces at grazing
//          angles mirror the cold sky.
//   Micro  brightness temperature Tb = eMW·T + (1−eMW)·50 K: calm water reads cold, land warm; plus illumination
//          from microwave transmitters (routers, masts) registered with addTx('micro', …), and short local
//          flashes where a ray hits a surface (multipath reflections) registered with addHits('micro', …).
//   Radio  illumination from radio transmitters (addTx('radio', …)): 1/r², Lambert, moving dashes (old view; the
//          spectral eye uses the reflection model below instead).
//   UV     uvAlb × the remaining UV skylight (fades with the Sun): snow and sand glow at dusk, grass doesn't.
//   Gamma  sparse scintillation speckle ∝ activity: granite sparkles, the sea is almost silent.
//   X-ray  nothing — the ground is dark in X-rays.
// With Visible on, the same layer is added faintly (OVERLAY); with Visible off, the instrument material shows it fully.
//
// REFLECTION (M11/T2, spectral eye only — gated by eyeSmooth, the old view keeps the terms above). Every band has
// its illuminators and every surface reflects them as well as emitting (Kirchhoff: e = 1 − R):
//   reflectivity  radio R0 = B.w (Fresnel at 100 MHz from ITU-R permittivities, cited per preset); microwave
//          R0 = 1 − eMW; thermal IR R = 1 − eIR (both Kirchhoff, from the cited emissivities); UV diffuse = uvAlb and
//          specular R0opt (D.z); angle dependence by Schlick 1994 (Comput. Graph. Forum 13:233), R(θ) = R0 + (1 − R0)
//          (1 − cos θ)^5, the unpolarised Fresnel average — every surface is a near-mirror at grazing incidence.
//   specular vs diffuse  Rayleigh criterion: a surface is smooth when h < λ / (8 cos θ). The coherent (specular)
//          fraction is S = exp(−(4π h cos θ / λ)²) (Beckmann & Spizzichino 1963, The Scattering of EM Waves from
//          Rough Surfaces); the rest R·(1 − S) is scattered diffusely. λ: radio 3 m (100 MHz, the FM transmitters and
//          the synchrotron sky), microwave 1.5 cm for the sky brightness (20 GHz, as the emissivities) and 12.5 cm for
//          transmitters (2.4 GHz Wi-Fi), UV / thermal IR: the optical gloss C.x. So the ground mirrors radio (h of cm
//          ≪ 3 m), metal and water mirror microwaves, grass and rock scatter them, canopies scatter everything.
//   illuminators  radio: transmitters (addTx) and the band sky — galactic synchrotron, T_b from the same formula as
//          the night sky's eye hook (engine/world/atmosphere.js, Haslam 408 MHz shape × (408/100)^2.55), without its
//          mottling (its mean); radio brightness T_b = (1 − R)·T + R·T_reflected at .006 per 1000 K (the sky's scale).
//          Microwave: transmitters (addTx) and the sky T_b = 2.725 K·e^(−τ) + 270 K·(1 − e^(−τ)), τ = .05 / sin el (as
//          the sky hook): metals and calm water mirror the cold zenith (they read cold) and the warm ground below the
//          horizon. Thermal IR: the 8–14 µm window sky (as the sky hook, Idso 1981) in the mirror direction for glossy
//          surfaces. UV: the skylight; the sky's radiance is taken as that of a white Lambertian surface under it
//          (uniform-sky approximation, as UV_PATH in engine/core/bands.js). Diffuse reflection sees the cos-weighted
//          hemisphere: sky × (1 + N.y)/2, the rest the ground (the surface's own temperature: STAND-IN for whatever
//          stands there); hemispheric sky means of the same formulas: radio ≈ 2600 K, microwave 27 K, IR −28 °C.
//          A mirror image of a transmitter is a lobe of width s = 2·slope (≥ .03 rad) around the specular direction,
//          flux-conserving: peak P·R·S·(.03 / s)² / (1 + L² / range²) over the reflected path L (the image cannot
//          outshine the source; a curved panel shows a dim sheen, a mirror a point);
//          the eye's diffraction blur (compose.js) widens it to the receptor's resolution. X-ray / gamma: no
//          reflection (Compton albedo of the ground is ~1 %, below the scenes' gamma speckle).
//
// NEAR-IR (M11/T3, spectral eye only: the night-vision channel of the IR band, engine/core/bands.js NIR). Nothing in
// the scenes is hot enough to emit at 0.7–1.4 µm except flames and lamps (sources): the landscape is seen by the
// light it reflects. Lambertian, L = nirAlb (D.y) × E, with
//   E = E_sky·(1 + N.y)/2 + E_moon·max(N·M, 0) + Σ P_lamp·max(N·L, 0)/d²   (sky: the cos-weighted hemisphere; Moon: a
//       directional source; near-IR lamps registered with addTx('nir', …))
// in the units of the scene's own lights (the visible hemisphere and moon lights of engine/world/atmosphere.js, read
// from ENV each frame), so surfaces and sources stay on the one intensity scale the eye assumes (bands.js LREF): the
// near-IR sky is the visible sky light × its near-IR / visible ratio, the Moon the moon light × 1.4 (NIR_LIGHT). The
// real illuminance (NIR_LIGHT: the twilight sky after Brown 1952, the night-sky floor of starlight + OH airglow, the
// waxing Moon in linear light) is computed alongside: its ratio to the scene's (uNirPhot) is what the tube's photon
// count and threshold use (compose.js), so the grain follows the real darkness. Moonlit grass (.45) and sand (.45)
// glow, water (.02) and asphalt (.12) stay black — leaves are ~9× brighter than in the red (~.05: the red edge,
// SPECTRUM.nirReflect). Not modelled: shadows (no shadow maps), the Moon's glint on water; lamps light the ground only
// where a scenario registers them with addTx('nir', …) (as sources they show in the near-IR regardless).
import * as THREE from 'three';
import { V3, sm } from '../core/util.js';
import { S } from '../core/state.js';
import { COMMON } from './shaders.js';
import { solid } from './instrument.js';
import { GAL_C, GAL_N, sunEl, moonDir, MOON_ILLUM, ENV } from '../world/atmosphere.js';
import { NIR } from '../core/bands.js';

export const OVERLAY = { value: .12 };
const MAX_TX = 8, MAX_HIT = 12;
const vec4s = () => Array.from({ length: MAX_TX }, () => new THREE.Vector4());
export const SURF_U = {
  uSOnR_: { value: 0 }, uSOnM_: { value: 0 }, uSOnI_: { value: 0 }, uSOnU_: { value: 0 }, uSOnG_: { value: 0 },
  uOverlay: OVERLAY, uRadioDiffuse: { value: 1 }, uSurfT: { value: 0 }, uUVsky: { value: 0 }, uSurfTime: S.TIME,
  uTxR: { value: vec4s() }, uTxM: { value: vec4s() }, uTxN: { value: vec4s() },
  uHitM: { value: Array.from({ length: MAX_HIT }, () => new THREE.Vector4()) },
  uGalN: { value: GAL_N }, uGalC: { value: GAL_C },   // the radio sky's orientation, for its reflection (M11/T2)
  uNirSky: { value: 0 }, uNirMoon: { value: new THREE.Vector4() },   // near-IR illumination (M11/T3, NIR_LIGHT)
  uNirPhot: { value: 1 },   // real near-IR irradiance (NIR.lux0 units) per scene-light unit: the tube's photon count (compose.js)
};

// Near-IR illumination (M11/T3). The real illuminance in units of NIR.lux0 (the sunset field = 1): illuminances in lx,
// then × a near-IR / visible ratio for each light (a night-vision photocathode counts 0.6–0.9 µm photons, not lux):
//   twilight  horizontal illuminance vs solar elevation, log10 lx: +5° 3.6, 0° 2.6, −6° 0.53 (3.4 lx, end of civil
//             twilight), −12° −2.1 (8e-3 lx, nautical), −18° −3.2 (6e-4 lx, astronomical: starlight + airglow)
//             (Brown 1952, Natural Illumination Charts, US Navy BuShips 374-1; the same values in Bond & Henderson
//             1963); near-IR/visible 1 (sunlight's own spectrum, the reference)
//   night     the floor below −18°: the 6e-4 lx night sky × 5 in the near-IR — the OH Meinel airglow outshines the
//             starlight at 0.7–0.9 µm several times (Vatsia 1972; SPECTRUM.ohAirglow); the ×5 is a STAND-IN in that range
//   Moon      0.27 lx from a full Moon at the zenith (Allen's Astrophysical Quantities, 4th ed. 2000, §12) × the phase
//             MOON_ILLUM (Krisciunas & Schaefer 1991, as atmosphere.js) × the extinction 10^(−0.4·k·X), k = 0.1 mag
//             per airmass at ~0.85 µm (I band; site values 0.05–0.1) with the Kasten & Young 1989 airmass, × the last
//             1.5° of setting; near-IR/visible 1.4 — lunar reflectance 0.17 at 900 nm vs 0.12 at 550 nm (ROLO:
//             Kieffer & Stone 2005, AJ 129:2887; SPECTRUM.moonNIR)
// What the surfaces get is the scene's own light in the near-IR: the hemisphere light × (real near-IR sky / real visible
// sky: 1 in twilight, nightK under the airglow) and the moon light × moonK; uNirPhot = real / scene (horizontal).
export const NIR_LIGHT = { tw: [[5, 3.6], [0, 2.6], [-6, .53], [-12, -2.1], [-18, -3.2]], nightK: 5, moonLx: .27, moonK: 1.4, extK: .1 };
const D2R = Math.PI / 180;
function nirLight() {
  const el = sunEl(), tw = NIR_LIGHT.tw;
  let lg = tw.at(-1)[1];
  for (let i = 0; i < tw.length - 1; i++) if (el >= tw[i + 1][0]) { const [e0, l0] = tw[i], [e1, l1] = tw[i + 1]; lg = el >= e0 ? l0 : l1 + (l0 - l1) * (el - e1) / (e0 - e1); break; }
  const visSky = Math.max(10 ** lg, 10 ** tw.at(-1)[1]), sky = Math.max(10 ** lg, 10 ** tw.at(-1)[1] * NIR_LIGHT.nightK);   // airglow floor below −18°
  const m = moonDir(), mel = Math.asin(Math.min(1, m.y)) / D2R, h = Math.max(mel, 0);
  const X = 1 / (Math.sin(h * D2R) + .50572 * (h + 6.07995) ** -1.6364);
  const moon = NIR_LIGHT.moonLx * MOON_ILLUM * 10 ** (-.4 * NIR_LIGHT.extK * X) * NIR_LIGHT.moonK * sm(0, 1.5, mel);
  // the scene's lights (atmosphere.js, updated just before this), as luminance
  const lum = c => .2126 * c.r + .7152 * c.g + .0722 * c.b, hemi = ENV.hemi, ml = ENV.moonLight;
  const sSky = hemi ? lum(hemi.color) * hemi.intensity * sky / visSky : sky / NIR.lux0;
  const sMoon = ml ? lum(ml.color) * ml.intensity * NIR_LIGHT.moonK : moon / NIR.lux0;
  SURF_U.uNirSky.value = sSky; SURF_U.uNirMoon.value.set(m.x, m.y, m.z, sMoon);
  const up = Math.max(m.y, 0), real = (sky + moon * up) / NIR.lux0, scene = sSky + sMoon * up;
  SURF_U.uNirPhot.value = scene > 1e-9 ? real / scene : 1;
}

// ---------------------------------------------------------------- presets (documented reference values)
// Sources, one per column (short keys used in the row comments):
//   eIR   broadband 8–14 µm emissivity: [Sal] Salisbury & D'Aria 1992, Remote Sens. Environ. 42:83; [EL] ASTER /
//         ECOSTRESS spectral library (Baldridge et al. 2009; Meerdink et al. 2019); [MOD] MODIS UCSB emissivity
//         library (Wan & Snyder); snow: Hori et al. 2006, Remote Sens. Environ. 100:486; water: Masuda et al. 1988.
//   eMW   passive microwave emissivity ~10–37 GHz near nadir: [UMF] Ulaby, Moore & Fung, Microwave Remote Sensing
//         vol. III (1986), and Ulaby & Long 2014; calm sea: Wilheit 1979; dry snow: Mätzler 1994 (volume scattering
//         lowers it at 37 GHz); a metal is a near-perfect reflector (Kirchhoff: e = 1 − R ≈ 0).
//   uvAlb UV albedo, UV-B → UV-A (the dusk skylight is mostly UV-A): [FG] Feister & Grewe 1995, Photochem. Photobiol.
//         62:736 (vegetation 0.016–0.017, bare soil 0.04–0.05, concrete 0.07–0.10 in UV-B; dry bright beach sand
//         0.14 at 300 nm → 0.24 at 400 nm); [WHO] Global Solar UV Index guide 2002 (fresh snow up to 0.8, dry beach
//         sand ~0.15, sea foam ~0.25, water/grass/soil below 0.1); fresh snow 0.9+ in UV-B: Blumthaler & Ambach 1988.
//   gamma terrestrial gamma dose rate relative to granite (= 1): [UN] UNSCEAR 2000 Annex B, D = 0.0417·K + 0.462·U +
//         0.604·Th nGy/h per Bq/kg; granite K ~1200, U ~60, Th ~80 Bq/kg → ~125 nGy/h; world-median soil (K 400,
//         U 35, Th 30) → ~50 nGy/h ≈ 0.4; [RP112] EC Radiation Protection 112 (1999): concrete ~0.4, brick ~0.6 of
//         granite. Water and snow shield the ground (cosmic + K-40 in sea water only).
//   T0/Teq/tau surface temperature at sunset, clear-sky night equilibrium (mid-latitude summer evening) and cooling
//         time — STAND-INS chosen per scene, time-compressed to script-seconds; only their ORDER is physical, from the
//         thermal admittance μ (J m⁻² s⁻½ K⁻¹) in [Oke] Oke 1987, Boundary Layer Climates, Table 2.1 / urban table:
//         fresh snow 130, wood ~380, dry sandy soil 620, brick ~1070, asphalt ~1200, still water 1545 (mixing makes
//         the sea effectively infinite), wet sand 2550, concrete ~2200, stone/granite ~2200. Vegetation cools fastest
//         despite its water: the canopy is thermally decoupled from the soil (dew); forest canopies trap longwave.
//   rRadio normal-incidence power reflectance at 100 MHz, |(√ε − 1)/(√ε + 1)|² with ε = ε' − jσ/(ωε₀) (M11/T2; was a
//         relative STAND-IN): [P527] ITU-R P.527-6 ground classes (sea water ε' 70, σ 5 S/m → .91; fresh water 80,
//         .01 → .64; wet ground 30, .01 → .48; medium dry ground 15, .001 → .35; very dry ground 3, 1e-4 → .07);
//         [P2040] ITU-R P.2040-3 Table 3 building materials at 0.1 GHz (concrete 5.24 → .16, brick 3.91 → .17, wood
//         1.99 → .03, glass 6.31 → .19, metal σ 1e7 → 1); rock: granite ε' 5–6 [Dan] Daniels 2004, Ground Penetrating
//         Radar (2nd ed.), Table 4.2 → .16; asphalt ε' 4–8 (Saarenketo & Scullion 2000, J. Appl. Geophys. 43:119) → .15;
//         tissue: muscle ε' ~66, σ ~.7 S/m at 100 MHz (Gabriel, Lau & Gabriel 1996, Phys. Med. Biol. 41:2271) → .75.
// Reflection data D = [h, nirAlb, R0opt, slope] per preset (REFL below):
//   h      sub-facet rms height: [UMF] vol. II ch. 11–12 (bare soil / fields 0.5–4 cm); road macrotexture 0.5–2 mm
//          (ISO 13473-1 mean texture depth); sea: capillary / short gravity waves below the sea shader's own waves
//          (mm–cm) — STAND-IN values within those ranges; canopies and grass are volume scatterers (h ~ their depth)
//   nirAlb ~0.8 µm reflectance [EL] (ASTER / ECOSTRESS: green grass .4–.5, conifer canopy .25–.35, soils .25–.35,
//          dry quartz sand .4–.5, granite .25–.35, concrete .3–.4, brick .3–.45, aged asphalt .1–.15, weathered wood
//          .35–.5); fresh snow .9 (Wiscombe & Warren 1980, J. Atmos. Sci. 37:2712); water .02 (Fresnel, the volume
//          absorbs: Hale & Querry 1973, Appl. Opt. 12:555); skin .5 (Anderson & Parrish 1981, J. Invest. Dermatol. 77:13)
//   R0opt  Fresnel at normal incidence, ((n − 1)/(n + 1))²: water n 1.34–1.35 at 365 nm (Hale & Querry) → .02, ice
//          n 1.33 → .02, silicates / bitumen / paint binders / skin n 1.4–1.6 → .03–.05
//   slope  rms unresolved slope: STAND-INS (sea residual .1 below the Cox & Munk 1954 total of ~.13 rad at 3 m/s wind,
//          J. Opt. Soc. Am. 44:838, because the shader draws the long waves); terrain .15–.35, flat paving .05
// Transmission [Tradio, Tmicro, Tgamma] of what a surface stands for (C.yzw), for light from behind it:
//   ground (terrain, water, paving): radio .05 — knife-edge diffraction over a ridge costs ~13 dB at VHF (ITU-R P.526),
//     the "bending round hills"; microwave 0 — diffraction loss grows ~10 dB per frequency decade (~25 dB at 1–3 GHz);
//     gamma 0 — metres of rock/soil (1.46 MeV in rock: ~6 cm attenuation length)
//   canopy (a tree crown, ~10 m of foliage): radio .9 — ~0.05 dB/m at 100 MHz (ITU-R P.833); microwave .25 —
//     Weissberger 1982 (ECAC-TR-81-101), d < 14 m branch L = 0.45 f^0.284 d dB ≈ 6 dB at 2.4 GHz, 10 m (T ≈ .25);
//     gamma .95 — crown biomass ~1 kg/m³ × 10 m = 1 g/cm² at μ/ρ .052 cm²/g (1.46 MeV); the biomass is a STAND-IN
//   facade (a whole building: several walls and floors): radio .1 — ~10 dB building entry loss at VHF (ITU-R P.2109
//     order of magnitude); microwave .002 — ≥ 25–30 dB at 2–5 GHz across a building; gamma 0
//   wood (boardwalks, huts: a few cm): radio .95, microwave .6 — ~2 dB through 3–5 cm of wood at 2.4 GHz (ITU-R P.2040
//     dry wood ε'≈2, loss tangent ~.05); gamma .88 — 2.5 g/cm² at μ/ρ .052
//   body (an animal or a person: ~30 cm of tissue ≈ water): radio .5 — STAND-IN (the body absorbs/scatters VHF but is
//     smaller than its wavelength); microwave .01 — ~20 dB through a torso at 2.4 GHz (ITU-R P.2040 tissue ε″; body-loss
//     measurements ~15–30 dB); gamma .2 — 30 cm of water at μ/ρ .058 cm²/g (1.46 MeV)
const TRANS = { ground: [.05, 0, 0], canopy: [.9, .25, .95], facade: [.1, .002, 0], wood: [.95, .6, .88], body: [.5, .01, .2] };
// D for a surface without reflection data (a custom {A, B, C}): ordinary rough dry ground — STAND-IN
export const DEF_D = [.02, .3, .04, .2];
const P = (T0, Teq, tau, eIR, eMW, uvAlb, gamma, rRadio, gloss = 0, tr = TRANS.ground) => ({ A: [T0, Teq, tau ? 1 / tau : 0, eIR], B: [eMW, uvAlb, gamma, rRadio], C: [gloss, ...tr], D: DEF_D });
export const PRESET = {
  // sea surface: warm all night (no cooling), cold in microwave. eIR .98 [Masuda, EL]; eMW .45 calm sea [Wilheit, UMF];
  // uvAlb .06 [WHO, FG: water < 0.1]; gamma .05 (sea water shields, K-40 only) [UN]; rRadio .64 fresh water [P527] (the
  // stream; the seaside's sea overrides it with sea water's .91)
  water:    P(18, 18, 0, .98, .45, .06, .05, .64, 1),
  // eIR .96 (pore water) [EL]; eMW .6 (moist soil 0.6–0.7) [UMF]; uvAlb .12 (wet sand darker than dry) [FG];
  // gamma .25 like ordinary quartz sand [UN]; slower than dry sand (μ 2550 vs 620) [Oke], but an exception to the μ
  // order against concrete/rock: swash and evaporation tie it to the sea's temperature (Teq near the sea's 18 °C);
  // rRadio .48 wet ground [P527]
  wetSand:  P(24, 15, 22, .96, .6, .12, .25, .48, .5),
  // dry quartz sand: hot at sunset, radiates fast (μ 620) [Oke]. eIR .92 (quartz reststrahlen dip at 8–9.5 µm) [Sal, EL];
  // eMW .9 [UMF]; uvAlb .22 (UV-A end of 0.14–0.24) [FG]; gamma .3 — quartz is nearly inert, typical beach sand
  // 20–40 nGy/h [UN]; heavy-mineral (monazite/zircon) sands are higher — see the seaside's local preset; rRadio .07 very
  // dry ground [P527]
  sand:     P(34, 9, 18, .92, .9, .22, .3, .07),
  // granite: slow to cool (μ ~2200) [Oke], the reference for gamma (= 1) [UN]. eIR .9 [Sal, EL]; eMW .88 [UMF];
  // uvAlb .12 — STAND-IN (no UV albedo measurement for granite found; a bit above concrete's 0.07–0.10 [FG] for pale granite);
  // rRadio .16 granite ε' ~5.5 [Dan]
  rock:     P(33, 13, 40, .9, .88, .12, 1, .16),
  // fresh snow: lowest thermal admittance (μ 130) → cools fastest [Oke]; eIR .99 [Hori]; eMW .7 dry snow at 37 GHz
  // [Mätzler]; uvAlb .85 [WHO, Blumthaler & Ambach]; gamma .1 (snowpack shields the ground) [UN]; rRadio .15 — dry snow
  // (ε' ~1.5, Mätzler 1996) is transparent at 3 m, the frozen ground under it reflects (ε' ~5 [P527] dry ground) — STAND-IN mix
  snow:     P(-2, -6, 10, .99, .7, .85, .1, .15, .2),
  // grass: cools fast under a clear sky (canopy decoupled, dew). eIR .97 [EL, MOD]; eMW .92 [UMF]; uvAlb .03 [FG];
  // gamma .3 — soil beneath (~0.4), lowered by soil moisture and the organic layer [UN]; rRadio .35 medium dry ground
  // [P527] (grass is transparent at 3 m)
  meadow:   P(24, 7, 10, .97, .92, .03, .3, .35),
  // canopy keeps warmth longer (trapped longwave). eIR .97 [EL, MOD]; eMW .93 [UMF]; uvAlb .03 [FG]; gamma .25 (soil
  // under litter) [UN]; rRadio .35 medium dry ground under the trees [P527]
  forest:    P(21, 12, 25, .97, .93, .03, .25, .35),
  // canopy: tree crowns as objects (same emission as forest; the forest floor / forested terrain stays ground); rRadio
  // .05 — STAND-IN: a crown is a lossy volume of leaves and wood (~.05 dB/m at VHF, ITU-R P.833), not an interface
  canopy:    P(21, 12, 25, .97, .93, .03, .25, .05, 0, TRANS.canopy),
  // bare dry soil / trail. eIR .94 [Sal, MOD]; eMW .9 dry soil [UMF]; uvAlb .08 (UV-A end; 0.04–0.05 in UV-B) [FG];
  // gamma .4 world-median soil [UN]; μ ~600–1000 [Oke] ≥ dry sand's 620, so it cools no faster than sand; rRadio .35
  // medium dry ground [P527]
  dirt:     P(28, 10, 20, .94, .9, .08, .4, .35),
  // stores the day's heat (μ ~1200) [Oke]. eIR .95 [EL]; eMW .88 urban surfaces [UMF]; uvAlb .05 [WHO];
  // gamma .3 — STAND-IN (aggregate-dependent, below concrete; RP112 tabulates no asphalt row); rRadio .15 (ε' 4–8, Saarenketo)
  asphalt:  P(38, 17, 30, .95, .88, .05, .3, .15),
  // μ ~2200 [Oke]. eIR .93 [EL]; eMW .88 [UMF]; uvAlb .1 (0.07–0.10) [FG]; gamma .4 (typical concrete ~0.42 of granite) [RP112];
  // rRadio .16 [P2040]
  concrete: P(32, 16, 30, .93, .88, .1, .4, .16),
  // brick/plaster walls with heated interiors behind them (Teq kept high and tau held up by the interior — STAND-IN). eIR .9
  // (brick 0.90–0.93) [EL]; eMW .85 [UMF]; uvAlb .08 — STAND-IN (like concrete, a bit darker); gamma .5 (brick ~0.65, plaster far lower: a mix) [RP112];
  // rRadio .17 brick [P2040] (the wall material; rebar and window frames are not modelled)
  facade:    P(26, 19, 40, .9, .85, .08, .5, .17, 0, TRANS.facade),
  // μ ~380 [Oke] (below sand and soil, so it cools faster than both); eIR .9 (0.90–0.95) [EL]; eMW .9 [UMF]; uvAlb .05 — STAND-IN (dark organic surface, like soil [FG]);
  // gamma .1 (K-40 only) [UN]; rRadio .03 [P2040]
  wood:      P(22, 14, 12, .9, .9, .05, .1, .03, 0, TRANS.wood),
  // warm-blooded body (M10/T9): the skin / fur surface stays ~30 °C all night (metabolism: no cooling, tau 0) —
  // STAND-IN between bare skin (~33 °C) and fur / clothing (~20–30 °C on a cool night); eIR .98 — human skin 0.98
  // (Steketee 1973, Phys. Med. Biol. 18:686), animal fur 0.95–0.99; eMW .6 — STAND-IN (wet tissue reflects microwaves,
  // skin emissivity ~0.5–0.7 at 10–40 GHz); uvAlb .05 — STAND-IN (skin / fur UV-A reflectance ~5–10 %); gamma .02 —
  // body K-40 ~60 Bq/kg vs ~1200 Bq/kg in granite [UN]; rRadio .75 tissue (Gabriel 1996)
  body:      P(30, 30, 0, .98, .6, .05, .02, .75, 0, TRANS.body),
};
// Reflection data per preset, D = [h (m), nirAlb, R0opt, slope (rad)] — sources and STAND-INs in the header above PRESET.
const REFL = {
  water:    [.002, .02, .02, .05],   // still water / a stream: mm ripples
  wetSand:  [.003, .25, .02, .08],   // swash-smoothed, a water film on top
  sand:     [.005, .45, .04, .15],   // wind ripples
  rock:     [.05, .3, .05, .35],     // outcrops, boulders below the mesh scale
  snow:     [.01, .9, .02, .1],
  meadow:   [.05, .45, .04, .3],     // grass layer over soil
  forest:   [.3, .3, .04, .5],       // litter and understorey
  canopy:   [1, .3, .04, 1],         // a crown: a volume scatterer
  dirt:     [.02, .3, .04, .2],
  asphalt:  [.002, .12, .04, .05],
  concrete: [.002, .35, .04, .05],
  facade:   [.02, .35, .04, .1],     // reveals, sills
  wood:     [.003, .45, .04, .1],
  body:     [.01, .5, .03, .5],      // fur / clothing on a curved body
};
for (const [k, d] of Object.entries(REFL)) PRESET[k].D = d;
export const surfD = p => p.D ?? DEF_D;
export function mixSurf(parts) {   // [[preset, weight], ...] -> blended {A, B, C, D}
  const out = { A: [0, 0, 0, 0], B: [0, 0, 0, 0], C: [0, 0, 0, 0], D: [0, 0, 0, 0] }; let W = 0;
  for (const [p, w] of parts) { if (w <= 0) continue; W += w; const q = { ...p, D: surfD(p) }; for (const k of 'ABCD') for (let i = 0; i < 4; i++) out[k][i] += q[k][i] * w; }
  for (const k of 'ABCD') for (let i = 0; i < 4; i++) out[k][i] /= W || 1;
  return out;
}
// 'attr' surfaces (heightfields) need a per-vertex aSurfD next to aSurfA/B/C: wrap the heightfield's surfAt with
// collectSurfD(surfAt) — heightfield() calls it once per vertex, in vertex order — then attach(geometry)
export function collectSurfD(surfAt) {
  const D = [];
  const f = (...a) => { const s = surfAt(...a); D.push(...surfD(s)); return s; };
  f.attach = g => {
    if (D.length !== g.attributes.position.count * 4) throw new Error(`collectSurfD: ${D.length / 4} values for ${g.attributes.position.count} vertices`);
    g.setAttribute('aSurfD', new THREE.BufferAttribute(new Float32Array(D), 4)); return g;
  };
  return f;
}

// ---------------------------------------------------------------- GLSL
export const SURF_VERT_DECL = `
varying vec3 vSurfW; varying vec3 vSurfN;
#ifdef SURF_ATTR
attribute vec4 aSurfA; attribute vec4 aSurfB; attribute vec4 aSurfC; attribute vec4 aSurfD; varying vec4 vSurfA; varying vec4 vSurfB; varying vec4 vSurfC; varying vec4 vSurfD;
#endif
`;
export const SURF_VERT_MAIN = `{
  mat4 sm_ = modelMatrix;
  #ifdef USE_INSTANCING
    sm_ = modelMatrix * instanceMatrix;
  #endif
  vSurfW = (sm_ * vec4(position, 1.)).xyz; vSurfN = normalize(mat3(sm_) * normal);
  #ifdef SURF_ATTR
    vSurfA = aSurfA; vSurfB = aSurfB; vSurfC = aSurfC; vSurfD = aSurfD;
  #endif
}`;
export const SURF_FRAG_DECL = COMMON + `
varying vec3 vSurfW; varying vec3 vSurfN;
#ifdef SURF_ATTR
varying vec4 vSurfA; varying vec4 vSurfB; varying vec4 vSurfC; varying vec4 vSurfD;
#else
uniform vec4 uSurfA, uSurfB, uSurfC, uSurfD;
#endif
uniform float uSOnR_, uSOnM_, uSOnI_, uSOnU_, uSOnG_, uOverlay, uRadioDiffuse, uSurfT, uUVsky, uSurfTime;
// band switches = uniform × eye mask: the spectral eye (engine/render/compose.js) evaluates one band at a time by
// setting the masks; everywhere else they stay 1, so the switches are exactly the uniforms
float eyeMR = 1., eyeMM = 1., eyeMI = 1., eyeMU = 1., eyeMG = 1.;
// eyeSmooth = 1 inside the spectral eye's hooks: stylised random speckle is replaced by its expected value (the eye
// adds the real detection statistics itself, photon grain / speckle — compose.js); 0 everywhere else
float eyeSmooth = 0.;
// speckle of coherent radio (transmitter reflections): set by the eye's hook (compose.js eyeSpeckle), 1 elsewhere
float surfSpk = 1.;
#define uSOnR (uSOnR_*eyeMR)
#define uSOnM (uSOnM_*eyeMM)
#define uSOnI (uSOnI_*eyeMI)
#define uSOnU (uSOnU_*eyeMU)
#define uSOnG (uSOnG_*eyeMG)
uniform vec4 uTxR[${MAX_TX}], uTxM[${MAX_TX}], uHitM[${MAX_HIT}];
// ray hit flashes: a spot (~2 m) on the hit face, brighter in the middle
float hitField(vec3 W){
  float f = 0.;
  for(int i = 0; i < ${MAX_HIT}; i++){ if(uHitM[i].w <= 0.) continue;
    vec3 d = W - uHitM[i].xyz; f += uHitM[i].w*exp(-dot(d, d)/4.); }
  return f;
}
float txField(vec4 tx[${MAX_TX}], vec3 W, vec3 N, float range, float dashes){
  float f = 0.;
  for(int i = 0; i < ${MAX_TX}; i++){ if(tx[i].w <= 0.) continue;
    vec3 L = tx[i].xyz - W; float d = length(L); L /= max(d, 1e-3);
    float g = tx[i].w*(.25 + .75*max(dot(N, L), 0.))/(1. + d*d/(range*range));
    if(dashes > 0.) g *= .35 + .65*step(.5, fract(d/dashes - uSurfTime*.9));
    f += g; }
  return f;
}
// ---- reflection (M11/T2; the formulas and sources are in the header: REFLECTION). Spectral eye only.
uniform vec3 uGalN, uGalC;
const vec3 SURF_LUMW = vec3(.2126, .7152, .0722), SURF_RADC = vec3(1., .31, .85);
float fresnelS(float R0, float c){ return R0 + (1. - R0)*pow(1. - clamp(c, 0., 1.), 5.); }          // Schlick
float cohK(float h, float c, float lam){ float g = 12.566*h*c/lam; return exp(-g*g); }             // Beckmann: specular fraction
float upK(vec3 d){ return smoothstep(-.02, .04, d.y); }                                             // mirror ray: sky above, ground below
// band skies in direction d — the same formulas as the night sky's eye hook (engine/world/atmosphere.js)
float skyRadioK(vec3 d){ float g = dot(d, uGalN), core = pow(max(dot(d, uGalC), 0.), 5.); return 36.*(17. + 230.*exp(-g*g/.06)*(1. + 2.5*core)); }
float skyMicroK(vec3 d){ float t = .05/max(d.y, .02); return 2.725*exp(-t) + 270.*(1. - exp(-t)); }
float skyIRC(vec3 d){ return mix(-60., 10., 1. - pow(.7, 1./max(d.y, .04))); }
// mirror images of transmitters: a lobe of width s = 2·slope (≥ .03 rad, the narrowest image drawn) around the
// specular direction. Flux-conserving: the image of a source of power P seen over the whole reflected path
// (tx → surface → eye, the same near-field falloff as txField) is spread over the lobe, so its peak falls as (.03/s)²
// — a mirror shows a bright point, a curved panel a dim sheen
float txImage(vec4 tx[${MAX_TX}], vec3 W, vec3 N, vec3 Rf, float range, float slope){
  float s = max(2.*slope, .03), f = 0., dc = length(W - cameraPosition);
  for(int i = 0; i < ${MAX_TX}; i++){ if(tx[i].w <= 0.) continue;
    vec3 L = tx[i].xyz - W; float d = length(L); L /= max(d, 1e-3);
    float p = d + dc;
    f += tx[i].w*step(0., dot(N, L))*exp(-(1. - dot(Rf, L))/(s*s))*(.0009/(s*s))/(1. + p*p/(range*range)); }
  return f;
}
// radio seen by the eye: Kirchhoff brightness (1 − R)·T + R·T_reflected (sky / ground) at the sky's .006 per 1000 K,
// plus the transmitters' mirror images and their diffuse remainder. T in °C, R0 = B.w, h = D.x, slope = D.w
vec3 radioRefl(vec3 W, vec3 N, vec3 V, float T, float R0, float h, float slope){
  float c = clamp(dot(-V, N), 0., 1.), S = cohK(h, c, 3.), R = mix(R0, fresnelS(R0, c), S), Tg = T + 273.;
  vec3 Rf = reflect(V, N);
  float Tsp = mix(Tg, skyRadioK(Rf), upK(Rf)), Tdif = mix(Tg, 2600., .5 + .5*N.y);
  float Tb = (1. - R)*Tg + R*mix(Tdif, Tsp, S);
  float tx = R*S*txImage(uTxR, W, N, Rf, 700., slope) + R0*(1. - S)*txField(uTxR, W, N, 700., 0.);
  return SURF_RADC*(6e-6*Tb/dot(SURF_RADC, SURF_LUMW) + tx*1.1*surfSpk);   // only the coherent part speckles
}
// microwave brightness temperature (K) with the mirrored sky (R0 = 1 − eMW), and the transmitters' reflection
float microTb(vec3 N, vec3 V, float T, float eMW, float h){
  float c = clamp(dot(-V, N), 0., 1.), S = cohK(h, c, .015), R0 = 1. - eMW, R = mix(R0, fresnelS(R0, c), S), Tg = T + 273.;
  vec3 Rf = reflect(V, N);
  float Tsp = mix(Tg, skyMicroK(Rf), upK(Rf)), Tdif = mix(Tg, 27., .5 + .5*N.y);
  return (1. - R)*Tg + R*mix(Tdif, Tsp, S);
}
float microTx(vec3 W, vec3 N, vec3 V, float eMW, float h, float slope){
  float c = clamp(dot(-V, N), 0., 1.), S = cohK(h, c, .125), R0 = 1. - eMW;
  return fresnelS(R0, c)*S*txImage(uTxM, W, N, reflect(V, N), 22., slope) + R0*(1. - S)*txField(uTxM, W, N, 22., 0.);
}
// the 8–14 µm sky temperature (°C) a surface reflects: the mirror direction for its glossy part, the cos-weighted
// hemisphere (sky mean −28 °C, the ground below at the surface's own T) for the rest
// near-IR radiance (the night-vision channel, M11/T3; header: NEAR-IR): nirAlb × (sky hemisphere + Moon)
// plus near-IR lamps registered with addTx('nir', …): irradiance P at 1 m, 1/d² (d ≥ 1 m), Lambert
uniform float uNirSky; uniform vec4 uNirMoon; uniform vec4 uTxN[${MAX_TX}];
float surfNIR(vec3 W, vec3 N, float alb){
  float E = uNirSky*(.5 + .5*N.y) + uNirMoon.w*max(dot(N, uNirMoon.xyz), 0.);
  for(int i = 0; i < ${MAX_TX}; i++){ if(uTxN[i].w <= 0.) continue;
    vec3 L = uTxN[i].xyz - W; float d2 = dot(L, L); E += uTxN[i].w*max(dot(N, L*inversesqrt(max(d2, 1e-6))), 0.)/max(d2, 1.); }
  return alb*E; }
float irReflT(vec3 N, vec3 V, float T, float gloss){
  vec3 Rf = reflect(V, N);
  return mix(mix(T, -28., .5 + .5*N.y), mix(T, skyIRC(Rf), upK(Rf)), gloss);
}
vec3 surfBands(vec3 W, vec3 N, float inVis){   // inVis = 1 for the faint overlay in visible light: smooth terms only
#ifdef SURF_ATTR
  vec4 A = vSurfA, B = vSurfB, C = vSurfC, D = vSurfD;
#else
  vec4 A = uSurfA, B = uSurfB, C = uSurfC, D = uSurfD;
#endif
  bool reflOn = eyeSmooth > .5;                                       // inside the spectral eye: reflection model on
  vec3 V = W - cameraPosition; float dist = length(V); V /= dist;
  float cosv = clamp(dot(-V, N), 0., 1.), near = (1. - smoothstep(12., 90., dist))*(1. - inVis);
  float T = A.y + (A.x - A.y)*exp(-uSurfT*A.z);
  vec3 col = vec3(0.);
  if(uSOnI > 0.){                                                     // INFRARED
    float e = A.w*mix(1., 1. - .7*pow(1. - cosv, 4.), C.x), Tr = e*T + (1. - e)*(reflOn ? irReflT(N, V, T, C.x) : -35.);
    float x = clamp((Tr + 4.)/44., 0., 1.);
    col += uSOnI*thermal(x)*(.04 + .5*x*x);
  }
  if(uSOnM > 0.){                                                     // MICROWAVE
    float Tb = reflOn ? microTb(N, V, T, B.x, D.x) : B.x*(T + 273.) + (1. - B.x)*50., x = clamp((Tb - 120.)/180., 0., 1.);
    // crackle only up close, in cells of ~0.2° (like the emitter crackle): power-of-two world cells so they don't swim
    float cs = exp2(floor(log2(max(dist*.0035, .03)))); vec3 gc = mod(floor(W/cs), 512.);
    vec2 g = gc.xz + gc.y*17.31; float sp = mix(step(.96 - .06*x, h21(g + floor(uSurfTime*10.)))*near, 0., eyeSmooth);   // eye: none — the sparks are decoration, the emission is the Tb wash
    vec3 c = mix(vec3(1.,.42,0.), vec3(1.,.85,.2), h21(g*1.7));        // per-cell tint on the sparks only
    float tx = txField(uTxM, W, N, 22., 0.), txs = tx/(1. + tx), hit = hitField(W);
    // instrument view with IR on: the thermal palette carries the surfaces, so the smooth Tb/tx wash nearly goes and
    // the sparks halve; ray-hit flashes (and the Em/Rib/EmField emitters, drawn elsewhere) stay at full brightness.
    // The faint visible-light overlay keeps its old mean tint (tx unsaturated, no IR toning).
    float wash = mix((1. - .85*uSOnI)*(x*x*.12 + txs*.22), x*x*.12 + tx*.35, inVis);
    if(reflOn) wash = x*x*.12 + microTx(W, N, V, B.x, D.x, D.w)*.35;   // eye: the transmitters reflected (diffuse + mirror image)
    col += uSOnM*(vec3(1.,.6,.1)*wash + (1. - .5*uSOnI)*c*sp*(x*.3 + txs*.9)) + uSOnM*vec3(1.,.93,.75)*hit*1.4;
  }
  if(uSOnR > 0.){                                                     // RADIO
    if(reflOn) col += uSOnR*radioRefl(W, N, V, T, B.w, D.x, D.w);
    else col += uSOnR*uRadioDiffuse*vec3(1.,.31,.85)*B.w*txField(uTxR, W, N, 700., 9.)*1.1;
  }
  if(uSOnU > 0.){                                                     // ULTRAVIOLET
    float u = B.y*(.35 + .65*max(N.y, 0.));
    // eye: the glossy part mirrors the skylight (Fresnel R0opt = D.z), the rest is the diffuse albedo
    if(reflOn){ float F = C.x*fresnelS(D.z, cosv); u = u*(1. - F) + F*upK(reflect(V, N)); }
    col += uSOnU*vec3(.62,.3,1.)*u*uUVsky*1.3;
  }
  if(uSOnG > 0.){                                                     // GAMMA
    vec3 gc = floor(W*2.2); float h = h21(gc.xz + gc.y*17.31 + floor(uSurfTime*16.)*3.17);
    // eye: the expected value (hit probability B.z·.03 × 1.8 × mean hue luminance ~.6) at every distance — terrestrial
    // gamma does not fade with distance, the near fade is a display LOD of the speckle
    col += uSOnG*mix(hsv(fract(uSurfTime*1.1 + h21(gc.xz)))*step(1. - B.z*.03, h)*1.8*(1. - smoothstep(40., 260., dist))*(1. - inVis),
                     vec3(B.z*.03*1.8*.6), eyeSmooth);
  }
  return col;
}
`;

// ---------------------------------------------------------------- materials
let variant = 0;
const toVec4 = a => new THREE.Vector4(...a);

// instrument (Visible off) material: dark base + structure lines + full surface bands
// vertDecl / vertMain: optional vertex-shader hooks (e.g. a per-instance attribute passed on as a flat varying)
function instrumentMaterial(props, { lines = 'none', cell = 25, extraDecl = '', instrExtra = '', uniforms = {}, vertDecl = '', vertMain = '' } = {}) {
  const attr = props === 'attr';
  return new THREE.ShaderMaterial({
    defines: attr ? { SURF_ATTR: '' } : {},
    uniforms: { ...SURF_U, ...uniforms, ...(attr ? {} : { uSurfA: { value: toVec4(props.A) }, uSurfB: { value: toVec4(props.B) }, uSurfC: { value: toVec4(props.C) }, uSurfD: { value: toVec4(surfD(props)) } }) },
    vertexShader: SURF_VERT_DECL + vertDecl + `void main(){ ${SURF_VERT_MAIN} ${vertMain}
      gl_Position = projectionMatrix * viewMatrix * vec4(vSurfW, 1.); }`,
    fragmentShader: SURF_FRAG_DECL + extraDecl + `

      void main(){
        vec3 N = normalize(vSurfN), W = vSurfW; float dist = length(W - cameraPosition), line = 0.;
        ${lines === 'topo' ? `float q = W.y/20., f = fract(q); line = (1. - smoothstep(0., fwidth(q)*1.2, min(f, 1. - f)))*(1. - smoothstep(300., 5500., dist));` : ''}
        ${lines === 'grid' ? `vec2 q = W.xz/${cell.toFixed(1)}, f = abs(fract(q) - .5), w = fwidth(q)*1.2;
          line = max(smoothstep(.5 - w.x, .5, f.x), smoothstep(.5 - w.y, .5, f.y))*(1. - smoothstep(.12, .35, max(w.x, w.y)))*(1. - smoothstep(200., 4000., dist));` : ''}
        vec3 c = vec3(.006,.007,.014) + vec3(.16,.2,.42)*line*.8 + surfBands(W, N, 0.);
        ${instrExtra}
        gl_FragColor = vec4(c, 1.);
      }`,
  });
}

function patchVisible(mat, props, { extraDecl = '', visExtra = '', instrExtra = '', uniforms = {}, vertDecl = '', vertMain = '' } = {}) {
  const attr = props === 'attr', prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey(), id = ++variant;
  const own = attr ? {} : { uSurfA: { value: toVec4(props.A) }, uSurfB: { value: toVec4(props.B) }, uSurfC: { value: toVec4(props.C) }, uSurfD: { value: toVec4(surfD(props)) } };
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    Object.assign(sh.uniforms, SURF_U, uniforms, own);
    if (attr) sh.defines = { ...(sh.defines || {}), SURF_ATTR: '' };
    sh.vertexShader = SURF_VERT_DECL + vertDecl + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SURF_VERT_MAIN + vertMain);
    sh.fragmentShader = SURF_FRAG_DECL + extraDecl + '\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
      `#include <opaque_fragment>\n{ vec3 N = normalize(vSurfN), W = vSurfW; gl_FragColor.rgb += uOverlay*surfBands(W, N, 1.); ${visExtra} }`);
  };
  mat.customProgramCacheKey = () => `surf${id}|${prevKey}`;
  mat.userData.eyeBands = eyeBandsGLSL(instrExtra);
  mat.needsUpdate = true;
}

// The spectral eye's hook (engine/render/compose.js): the surface's emission per band, the same terms as the
// instrument view (surfBands + instrExtra, full detail) without its dark base and lines, one band at a time via
// the eye masks, as luminance into the eye's band outputs: o1 = (IR, UV, gamma, coverage), o3 = (radio, micro,
// X-ray, coverage). The ground is dark in X-rays and opaque in every band (coverage 1). EYE_NIR / eyeNIR(): the
// near-IR (night-vision) radiance, a separate channel of the IR band (M11/T3).
export const eyeBandsGLSL = (instrExtra = '') => `
#ifdef SURF_ATTR
vec3 eyeTrans(){ return vSurfC.yzw; }
float eyeNIR(){ return uSOnI_*surfNIR(vSurfW, normalize(vSurfN), vSurfD.y); }
#else
vec3 eyeTrans(){ return uSurfC.yzw; }
float eyeNIR(){ return uSOnI_*surfNIR(vSurfW, normalize(vSurfN), uSurfD.y); }
#endif
#define EYE_NIR
vec3 eyeSurfC(){ vec3 N = normalize(vSurfN), W = vSurfW; float dist = length(W - cameraPosition), line = 0.;
  vec3 c = surfBands(W, N, 0.); ${instrExtra}
  return c; }
float eyeSurfL(float r, float m, float i, float u, float g){ eyeMR = r; eyeMM = m; eyeMI = i; eyeMU = u; eyeMG = g; eyeSmooth = 1.; return eyeL(eyeSurfC()); }
#define EYE_OWN_SPECKLE
void eyeBands(out vec4 o1, out vec4 o3){
  surfSpk = eyeSpeckle();
  o1 = vec4(eyeSurfL(0., 0., 1., 0., 0.), eyeSurfL(0., 0., 0., 1., 0.), eyeSurfL(0., 0., 0., 0., 1.), 1.);
  o3 = vec4(eyeSurfL(1., 0., 0., 0., 0.), eyeSurfL(0., 1., 0., 0., 0.), 0., 1.);
  eyeMR = eyeMM = eyeMI = eyeMU = eyeMG = 1.; eyeSmooth = 0.; surfSpk = 1.; }`;

// Registry of surfaces for the meters (activity is the weighted band response of each surface).
const SURFACES = [];

// Make a mesh spectral. props: PRESET entry / {A,B,C} / 'attr' (geometry has aSurfA/B/C; pass opts.mean for meters).
// opts: lines ('none'|'topo'|'grid'), cell, weight (meter share), visExtra/instrExtra/extraDecl/uniforms (GLSL hooks),
//       vertDecl/vertMain (vertex hooks, both materials),
//       custom: true when the visible material is a ShaderMaterial that already calls surfBands().
export function spectral(mesh, props, opts = {}) {
  if (typeof props === 'string' && props !== 'attr') props = PRESET[props];
  const mat = mesh.material, ud = mat.userData;
  if (props === 'attr' && !mesh.geometry.attributes.aSurfD) throw new Error('spectral(): an \'attr\' surface needs aSurfD (collectSurfD)');
  if (!ud.surfInstr) {                                   // a material shared by several meshes is patched once
    if (!opts.custom) patchVisible(mat, props, opts);
    ud.surfInstr = instrumentMaterial(props, opts);
    SURFACES.push({ p: props === 'attr' ? opts.mean : props, w: opts.weight ?? 1 });
  }
  solid(mesh, ud.surfInstr);
  return mesh;
}
// every mesh of a group (props per material: one preset for all, or a function material -> preset name)
export function spectralGroup(group, props, opts = {}) {
  group.traverse(o => { if (o.isMesh) spectral(o, typeof props === 'function' ? props(o.material) : props, opts); });
  return group;
}
// uniforms for a custom ShaderMaterial that includes SURF_FRAG_DECL / calls surfBands()
export const surfaceUniforms = props => ({ ...SURF_U, uSurfA: { value: toVec4(props.A) }, uSurfB: { value: toVec4(props.B) }, uSurfC: { value: toVec4(props.C) }, uSurfD: { value: toVec4(surfD(props)) } });

// ---------------------------------------------------------------- transmitters
// near-IR lamps (M11/T3): fn() -> { p, power } with power = the lamp's near-IR irradiance at 1 m in the scene's light
// units (as the hemisphere / moon lights, NIR_LIGHT), e.g. a high-pressure sodium street lamp (819 nm doublet + near-IR continuum) or an 850 / 940 nm
// camera illuminator; the MAX_TX brightest as seen from the camera (power / (1 + d²/(20 m)²)) light the surfaces
const TX = { radio: [], micro: [], nir: [] };
// fn() -> { p: Vector3, power } or null; strongest MAX_TX per band are uploaded each frame
export const addTx = (band, fn) => TX[band].push(fn);
// ray hits (multipath): fn() -> [{ p: Vector3 on the surface, power }]; the strongest MAX_HIT flash each frame
const HITS = { micro: [] };
export const addHits = (band, fn) => HITS[band].push(fn);

const tempAt = (A, t) => A[1] + (A[0] - A[1]) * Math.exp(-t * A[2]);
export function updateSurfaces(uvSky) {
  const u = SURF_U, on = S.on, t = S.t;
  u.uSOnR_.value = on.radio ? 1 : 0; u.uSOnM_.value = on.micro ? 1 : 0; u.uSOnI_.value = on.ir ? 1 : 0;
  u.uSOnU_.value = on.uv ? 1 : 0; u.uSOnG_.value = on.gamma ? 1 : 0;
  u.uSurfT.value = t; u.uUVsky.value = uvSky;
  nirLight();
  let txPow = { radio: 0, micro: 0 };
  for (const band of ['radio', 'micro']) {
    const live = TX[band].map(f => f()).filter(x => x && x.power > .01).sort((a, b) => b.power - a.power).slice(0, MAX_TX);
    const arr = band === 'radio' ? u.uTxR.value : u.uTxM.value;
    arr.forEach((v, i) => { const x = live[i]; if (x) v.set(x.p.x, x.p.y, x.p.z, x.power); else v.set(0, 0, 0, 0); });
    txPow[band] = live.reduce((a, x) => a + x.power, 0);
  }
  const cam = S.camera?.position, seen = x => x.power / (1 + (cam ? x.p.distanceToSquared(cam) : 0) / 400);
  const nir = TX.nir.map(f => f()).filter(x => x && x.power > 0).sort((a, b) => seen(b) - seen(a)).slice(0, MAX_TX);
  u.uTxN.value.forEach((v, i) => { const x = nir[i]; if (x) v.set(x.p.x, x.p.y, x.p.z, x.power); else v.set(0, 0, 0, 0); });
  const hits = HITS.micro.flatMap(f => f() || []).filter(x => x.power > .01).sort((a, b) => b.power - a.power).slice(0, MAX_HIT);
  u.uHitM.value.forEach((v, i) => { const x = hits[i]; if (x) v.set(x.p.x, x.p.y, x.p.z, x.power); else v.set(0, 0, 0, 0); });
  S.act.micro += hits.reduce((a, x) => a + x.power, 0) * .1;   // a few small spots: a small meter share
  // meter activity: weighted band response of every registered surface (same formulas as the shader, no geometry)
  for (const { p, w } of SURFACES) {
    if (!p) continue;
    const T = tempAt(p.A, t), xi = Math.min(1, Math.max(0, (p.A[3] * T + (1 - p.A[3]) * -35 + 2) / 42));
    const Tb = p.B[0] * (T + 273) + (1 - p.B[0]) * 50, xm = Math.min(1, Math.max(0, (Tb - 120) / 180));
    S.act.ir += w * xi * .8; S.act.micro += w * (xm * .3 + txPow.micro * .15);
    S.act.uv += w * p.B[1] * uvSky * 2; S.act.gamma += w * p.B[2] * .35; S.act.radio += w * p.B[3] * txPow.radio * .4;
  }
}
export const uvSkylight = sunEl => sm(-6, 3, sunEl);
export { V3 };
