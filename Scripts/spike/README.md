# AE round-trip spike

Hand-written proof scripts. No build step, no UI. They exist to retire the export unknowns in
`notes/Windows95AssetHelper/research/02-ae-export.md` before the generator is written.

## `window-roundtrip.jsx`

Builds two Win95 window precomps (bevels and title bar as shape rects, a React95 icon as shape
paths, the title in W95FA), two standalone icon comps, and a scene comp with hold-keyframed
moves and one z-order raise done as a layer split. In package mode (the default) it does this
in a fresh project, saves `Win95Assets-spike.aep` to a folder you choose, then opens another
new project and imports that `.aep` as a project to prove the "importable folder" pillar.

Prerequisites, once per machine:

1. Install `fonts/W95FA.otf` **for all users** (right-click the file > Install for all users) so
   After Effects lists it. Restart AE if it was open.
2. AE > Edit > Preferences > Scripting & Expressions > tick **Allow Scripts to Write Files and
   Access Network** (needed for `spike-log.txt`).

Run it either way:

- AE > File > Scripts > Run Script File > `window-roundtrip.jsx`, pick an output folder outside
  the repo.
- With AE already open, from a console (this is the route the companion will use):

  ```
  "C:\Program Files\Adobe\Adobe After Effects (Beta)\Support Files\AfterFX.com" -r "<absolute path>\Scripts\spike\window-roundtrip.jsx"
  ```

Read `spike-log.txt` in the output folder: `app.version`, the W95FA PostScript name (or
`MISSING`), the title text's rendered width, layer indices after the split, and the item count
after re-import.

## `font-parity.html`

Open in Chrome. Prints the width of "My Computer" in W95FA at 11 px as the browser measures it.
Compare with `sourceRect w=` in `spike-log.txt`. Equal (or within 1 px) confirms the browser
and AE can share W95FA; otherwise the export must rasterise text.

## `fonts/`

W95FA by Alina Sava, SIL Open Font License (see `OFL.txt`; the file in the download is the
unfilled OFL template, which is how the author ships it). Redistributed unchanged. Names inside
the OTF: family `W95FA`, style `Regular`, PostScript `W95FARegular`.
