# Changelog

All notable changes to this project are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
