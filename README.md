# Puzzle 26

A personal, browser-based puzzle hunt built with HTML, CSS, and JavaScript.

For players: follow the guidelines available through the site's help button.
The source code and automated tests may contain spoilers.

## Run locally

No frontend build step is required. From this directory, serve the files with
a local HTTP server. For example, with Python 3 installed:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open [http://127.0.0.1:8000/](http://127.0.0.1:8000/).

A local HTTP server is preferable to opening `index.html` directly, especially
when testing requests to the separate grading service.

## Project layout

- `index.html`, `app.js`, and `styles.css`: the site shell, navigation, and styling.
- Other root-level JavaScript and CSS files: supporting data and interactive features.
- `assets/`: images, fonts, source records, and notices.
- `games/`: embedded interactive puzzles.
- `grader-config.js`: public connection settings for the external grading service.
- `scripts/` and `previews/`: development utilities and standalone previews.
- `tests/`: automated browser and data checks; these may reveal puzzle answers.

Generated data and embedded game bundles should be rebuilt with their associated
generation or synchronization scripts, not edited independently. Some scripts
require authoring sources maintained outside this repository.

## Saved progress and grading

Progress is stored in the current browser. It does not automatically synchronize
between devices or transfer from a local preview to the published website.
The help dialog includes a control to clear locally saved progress.

The browser-side identity gate is part of the hunt, not a security boundary.

Code submissions use a separate authenticated HTTPS grading service.
Publishing this frontend does not deploy that service. Its CORS configuration
must allow the frontend's origin. Never put private access codes, AWS credentials,
or server API keys into frontend files or the public repository.

## Publishing

The intended GitHub Pages address is
[kevinrao99.github.io/puzzle-26/](https://kevinrao99.github.io/puzzle-26/).

An empty `.nojekyll` file is included for plain static-file publishing. Configure
GitHub Pages to use the `main` branch and
`/ (root)` folder. Keep `index.html`, its supporting files, `assets/`, and
`games/` together with their relative paths intact.

See [GitHub's publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).
Review files for private data and review third-party asset permissions before
publishing.

## Development checks

The automated tests require Node.js, Playwright, and Chrome:

```sh
node --test --test-concurrency=1 tests/*.test.cjs
```

Set `NODE_PATH` if Playwright is installed outside the repository.
Test dependencies are not required by the published website.

## Third-party assets

Bundled media and fonts remain subject to their original rights and licenses.
Source records and notices are retained in `assets/`. Their inclusion here does
not itself establish permission to redistribute them.
