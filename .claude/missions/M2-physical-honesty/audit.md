# M2 — audit of existing events

The per-event physics verdicts that M2/T3 applies group by group (sky library, trail, seaside, city), migrated verbatim from the plan.

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
