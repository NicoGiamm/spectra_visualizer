# M4 physics audit — city scenario (2026-11-21, physics-auditor, read-only)

Timeline: 0 warnings Orbit + Ground; all 7 bands drawn and declared; draw calls 97/246/244. Frequencies, bands and
ground reach of every city process are right; TETRA (390 MHz, micro) and ASR/ship radar split are genuinely fixed.
VERDICT: partial — two wrong behaviours, several wrong notes, missing honesty tags.

## Findings → task

| # | Finding | Fix | Task |
|---|---|---|---|
| 1 | HVAC plume drawn as warm air in LWIR — contradicts M2's applied verdict (air transparent at 8–14 µm) | condensing flue vapour (droplets: IR + visible) or IR on the unit housings/grilles, no warm-air ribbon | T5 |
| 2 | Parked cars chirp TPMS — direct TPMS sleeps once parked (motion-triggered) | drop tpms from parkedRF, keep key-fob unlocks (433.92; many EU fobs 868 MHz); note | T1 |
| 3 | powerHum 50 Hz drawn as a radiated wave 0.5–1 km away — it is a quasi-static near field | `stylised: true` or rename "50 Hz near field (not radiated)"; fix powerlines note | T4 |
| 4 | Missing tags | drone + fireworks `rare`; multipath `stylised`+`time-compressed`; crowd + streetLights `time-compressed`; DAB pulses `stylised` or steady | T1, T2, T4, T5, M2/T3 |
| 5 | traffic tail lights use `navRed` (obstruction light) | `ledRed`; "most new cars" have 77 GHz radar | M2/T3 (city audit group) |
| 6 | Wrong notes | cams: 850 nm shows a faint red glow (940 nm is the invisible one); ledSwitch: flicker 100 Hz, RF from kHz–MHz switching harmonics; bats: drop "LEDs draw far fewer insects" (Pawson & Bader 2014); steam: visible pale plume in lamplight, drop "cold night" (summer cues) | T4, T5 |
| 7 | arcUV 340 nm / arcLight "copper arc" 450 nm | arcUV → 324.7 nm (Cu I resonance, NIST); arcLight → "electric arc in air (N₂ + metal lines)" — also used by the bug zapper | T4 |
| 8 | Minor realism | HPS strike is dim bluish-white → orange (pink-red is LPS); police bar blue (amber only rear advisor); fireworks hues: add Ba green / CuCl blue processes or keep reds; bus interiors LED; 5G mast red light only near the airport; tram arcing duty high (frosty wire); granite blip rate "illustrative" | M2/T3, T4, T5 |
| 9 | 11 unused SPECTRUM keys: aisAtoN, vhf16, sbandRadar, racon, radarClutter, navWhiteLED, navYellow, deckLight, lloydFringe (seaside), akr (aurora), warmAir | wire into seaside/aurora events or delete; delete warmAir | gap → M5, M2 |

Sources cited by the auditor: Direct TPMS (en.wikipedia.org/wiki/Direct_TPMS; tirereview.com TPMS signal science);
Pawson & Bader 2014 (pubmed 29210222); UWE lamp/insect study; Swann & Digi-Key on 850/940 nm glow; NIST ASD
(Ne, Na, Hg, Cu I lines); NNDC ENSDF (K-40, Tl-208, Bi-214); ECC Decision (08)05 (TETRA); ITU RR 2.7–2.9 GHz;
ETSI EN 300 220, EN 301 091; CISPR 15, CISPR TR 18-1 (from reference knowledge, not fetched).
