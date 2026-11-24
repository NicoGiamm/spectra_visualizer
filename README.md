# Spectra Visualizer

![The seaside scene from sunset into the night, across the spectrum](scenarios/seaside/examples/seaside.webp)

## What if we could see every electromagnetic wave?

Our eyes catch one thin slice of the light around us. Everything else — the radio a lighthouse hums, the
microwaves a phone whispers to the nearest mast, the warmth the sand gives back to the night in infrared, the
ultraviolet still in the sky after sunset, the X-rays of a lightning flash, the gamma rays a cosmic ray shakes
loose high above — passes straight through us unseen. What would a single evening look like if we had eyes for
all of it at once?

Spectra Visualizer is an attempt to find out. You stand on a mountain trail, on a beach or in a city street —
or on an Arctic snowfield under the aurora, on the plains as a thunderstorm rolls in, on a ridge facing a lava
lake, on a yacht far out at sea, or at the window of the space station — and watch two minutes of evening turn into
night, seen through an imagined eye that is sensitive to the whole
spectrum: radio, microwave, infrared, visible light, ultraviolet, X-rays and gamma rays, each in its own colour,
each as it would really reach you. The sea stays warm after the sand has cooled, Wi-Fi spills down a street, the
Milky Way roars in radio, a supernova flares — and you can switch any band off to see what it was adding.

## Run it

You need [uv](https://docs.astral.sh/uv/) and a browser with WebGL (three.js loads from the internet).

```bash
git clone https://github.com/NicoGiamm/spectra_visualizer.git
cd spectra_visualizer
uv run spectra serve        # open http://127.0.0.1:8000 and pick a scene
```

Or run `uv run spectra build` and open one of the files it writes to `dist/` straight from disk.

Curious how it works? See the [technical notes](docs/technical.md).

## License

[MIT](LICENSE) © 2026 NicoGiamm. three.js, loaded from a CDN at runtime, is MIT-licensed too.
