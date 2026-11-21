// Event contract. An event is one object holding both its panel metadata and its drawing:
//
//   { name, t0, t1, bands: ['vis', ...], note,
//     init()   { build meshes / Em / Rib once (scene exists by then) },
//     update() { runs every frame; must reset sizes & intensities, call .set() only when visible },
//     where()  { return a world point for the label, or null } }
//
// t0/t1 are on the 0–60 script axis. `where` must be a method, not an arrow, when it reads `this`.
// Library events are factories: `meteorShower({ t0: 30, t1: 44 })` returns the object with overrides.

export const event = (base, over = {}) => Object.assign(base, over);
