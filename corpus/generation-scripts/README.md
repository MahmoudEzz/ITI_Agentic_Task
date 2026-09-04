# corpus/generation-scripts

One-off scripts used to author the binary CV fixtures and the manifest — not part of the application, not run automatically, kept for transparency/reproducibility.

- `generate-docx-cvs.mjs` — builds the 5 `.docx` CVs (`docx` package), including the white-on-white hidden-text prompt-injection fixture.
- `generate-native-pdf-cvs.mjs` — builds the 2 native-text `.pdf` CVs (`pdf-lib`, real selectable text via `drawText`).
- `generate-scanned-pdf-cvs.mjs` — builds the 5 "scanned" `.pdf` CVs (Puppeteer renders HTML to a PNG, `pdf-lib` embeds it as the entire page with no text layer) — the OCR fixture for T6.
- `build-manifest.mjs` — regenerates `corpus/manifest.json` from the files on disk plus the fixture metadata in the script.

Requires `docx`, `pdf-lib`, `puppeteer` as devDependencies (already in `package.json`). Not required at application runtime.
