# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue.

Use GitHub's private reporting form: <https://github.com/Gitguy268/realistic-vinyl-player/security/advisories/new>

Include what you found, how to reproduce it, and the browser and version. You should get a reply within a week. Please give the fix time to ship before you publish details.

## Scope

The player is one static HTML file. It has no server, no accounts and makes no network requests; audio files, cover art and settings stay in the browser (IndexedDB and `localStorage`). The most useful reports are about:

- a crafted audio file or cover image that runs script or breaks the page (the tag parsers read untrusted bytes);
- anything that makes the page send data off the device;
- the GitHub Actions workflows in this repository.

## Supported versions

Only the latest version on the `main` branch is supported.
