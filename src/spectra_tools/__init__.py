"""Tooling for Spectra Visualizer: discover scenarios, bundle them into single HTML files,
serve the repo for development, and take headless screenshots."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SCENARIOS = ROOT / "scenarios"
DIST = ROOT / "dist"
