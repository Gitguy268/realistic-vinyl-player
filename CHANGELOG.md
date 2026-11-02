# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Visualizer button: a visualizer on the record label while a record plays. Each press steps on: off, MilkDrop ([butterchurn](https://github.com/jberg/butterchurn), inlined in `index.html`), then spectrum bars after [Musializer](https://github.com/tsoding/musializer). It stays upright as the record turns and is remembered. Off by default and under reduced motion; without WebGL 2 only the bars are offered.
- Four more visualizer styles on the same button, drawn from scratch after ideas in [awesome-audio-visualization](https://github.com/willianjusten/awesome-audio-visualization): Lines (a ridgeline in the Unknown Pleasures style), Oscilloscope, Spectrogram and Radial spectrum.
- Graphic EQ in Deck settings: Winamp's ten bands with a preamp, its 17 built-in presets (values from [Webamp](https://github.com/captbaritone/webamp)) and loading of Winamp `.eqf` preset files. Off by default; a trim ahead of it keeps boosts from clipping. Stored under `vinyl-eq` and `vinyl-eq-presets`, which the other players read too when served from the same address or opened as local files in the same browser.
- 🗂 Desktop button, after [Winampify](https://github.com/remigallego/winampify): artists and albums open as folders in movable windows; a track plays on a double-click or when dragged onto the Turntable icon.

### Changed

- `index.html` now embeds third-party code (butterchurn, MIT), so the "no dependencies" badge is gone. It still needs nothing installed and makes no network requests.

- The copyright holder in `LICENSE` is written "Lucas Van De Weerd".
- Added `.github/CODEOWNERS`.

## [1.0.0] - 2026-10-10

First release: a remake of [Vinyl-Player](https://github.com/Gitguy268/Vinyl-Player) that keeps its layout, controls, themes and saved data.

### Added

- Time-based platter at exactly 33⅓, 45 and 78 rpm, with spin-up, coast-down, a ±8% pitch fader, wow and flutter.
- Audio engine in an AudioWorklet: pitch follows platter speed everywhere, and Scratch mode plays the real track forwards and backwards.
- Vinyl signal path after the EQ: mono bass, channel crosstalk, treble roll-off, soft saturation.
- Generated surface noise, with scratches that are drawn on the record and tick once per turn where they are drawn.
- A pivoted tonearm over the whole playlist: lead-in, track gaps, run-out, locked groove, auto-return, drag to seek.
- Record condition (Mint to Beat-up), imperfection amount, motor button and cue lever.
- Optional record sides with a Flip button, and optional record size by speed (7-inch at 45, 10-inch at 78).
- Tags and cover art from MP3, FLAC, M4A/MP4, Ogg Vorbis, Opus and WAV files.
- Media keys, and background playback through a media element on touch devices.
- Playwright checks for behaviour, audio and layout; lint, link check and GitHub Pages deploy in CI.

### Changed

- Scratch ratio is the physical 1.8 s per revolution (the original used 3.6).
- Vinyl noise defaults to 0.3 for new users.
- Phone focus mode fits the screen (the original overflowed it).

[1.0.0]: https://github.com/Gitguy268/realistic-vinyl-player/releases/tag/v1.0.0
