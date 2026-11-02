# Contributing

Thanks for helping. This project is small on purpose: one HTML file that runs anywhere, offline.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting a bug or asking for a feature

Open an [issue](https://github.com/Gitguy268/realistic-vinyl-player/issues/new/choose) and use the template. For a bug, say which browser and version, what you did, what you expected and what happened. Add `?debug` to the URL and include any messages from the browser console.

Report security problems privately: see [SECURITY.md](SECURITY.md).

## Making a change

1. Fork the repository and create a branch from `main`.
2. Open `index.html` in a browser to run it. Add `?demo` to load three synthesized tracks.
3. Make your change. Keep commits small, each with a clear message.
4. Run the checks (below) and update the README if behaviour or controls changed.
5. Open a pull request and fill in the template.

## Running the checks

```
cd test
npm ci && npx playwright install
npm run lint       # syntax, no external resources, no leftover debug output, links
npm run build      # assembles the published site in _site/
npm test           # behaviour in Chromium, Firefox and WebKit
```

`npm run test:quick` runs the behaviour checks in Chromium only. `npm run test:audio` prints pitch, glide and click measurements; run it when you touch the audio engine.

## Code style

- Everything the player needs stays in `index.html`: inline CSS and JavaScript, no build step, nothing loaded from another file, no network requests. It must work from `file://`.
- Plain HTML, CSS and JavaScript. Two-space indentation, single quotes, semicolons.
- Follow the section comments. Physical constants go in the constants block at the top of the script, not inline.
- Keep element ids, the IndexedDB schema (`vinyl-db`) and the existing `localStorage` keys unchanged, so saved libraries keep working. New settings go under `vinyl-deck`.
- Keep `aria-label`s and visible focus styles. Respect `prefers-reduced-motion`.
- Comments say why, not what.

## Assets and dependencies

- Do not add audio, images or fonts you did not make or that are not licensed for redistribution. The textures and demo tracks are generated in code. The one piece of outside code is the butterchurn visualizer, inlined unmodified in its own `<script>` block with its licence. The bars visualizer is this project's own code, written after Musializer's method and credited in the README, as are the ideas behind the graphic EQ presets (Webamp), the desktop (Winampify) and the other 2D visualizers.
- Do not add a dependency without a clear reason. Development-only tools go in `test/package.json` with an exact version.

## Licence

Contributions are accepted under the [MIT License](LICENSE).
