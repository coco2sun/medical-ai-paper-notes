# CocoSun - Biomedical AI Paper Notes

Static GitHub Pages site for biomedical AI paper notes. https://coco2sun.github.io/medical-ai-paper-notes/

## Add a New HTML Note

1. Put the new standalone HTML note in `incoming/`.
2. Add one item to `notes.config.json`.
3. Run:

```bash
node scripts/build-notes.mjs
```

The build script copies the HTML into `notes/<slug>/index.html`, rewrites local `assets/...` references to `../../assets/...`, and regenerates `assets/notes-data.js` for the homepage.

`incoming/` is a local-only staging area and is ignored by Git except for `incoming/.gitkeep`. After running the build, commit the generated `notes/<slug>/...` files, `notes.config.json`, and `assets/notes-data.js`; do not commit the original incoming HTML or attachment folder.

## Note Config Fields

```json
{
  "title": "New paper note title",
  "type": "论文精读",
  "date": "2026-06-02",
  "slug": "new-paper-note",
  "source": "incoming/New_Paper_Note.html",
  "assetsDir": "incoming/New_Paper_Note_files",
  "summary": "One sentence summary.",
  "tags": ["medical imaging", "foundation model", "multimodal"],
  "visible": true,
  "accent": false
}
```

- `slug` must use lowercase letters, numbers, and hyphens.
- `source` can point to `incoming/...` for a new note or an existing `notes/<slug>/index.html`.
- `assetsDir` is optional. Use it when the HTML has an attachment folder, such as `incoming/New_Paper_Note_files`.
- `visible` is optional and defaults to `true`. Set it to `false` to hide a note from the homepage while keeping `notes/<slug>/index.html` directly accessible.
- `accent` controls the homepage card button color in the latest-notes area: `true` uses the wine accent button, `false` uses the default blue button. It does not affect the all-notes list.
- The homepage shows the latest 6 notes and all notes based on `notes.config.json`.

When `assetsDir` is set, the build script copies that folder into `notes/<slug>/assets/` and rewrites references like `src="New_Paper_Note_files/figure1.png"` to `src="assets/figure1.png"`.

If `source` or `assetsDir` no longer exists because `incoming/` was not synced, the build still works as long as the generated `notes/<slug>/index.html` and any generated `notes/<slug>/assets/` files are already present.

## Article Page Home Link

- `scripts/build-notes.mjs` automatically injects a floating `← 首页` link into every generated article page.
- The link is inserted into `notes/<slug>/index.html` during build and points to `../../`.
- Original `incoming/` HTML files do not need to include this link.
- The injected block is wrapped with `sun-blog-home-link` markers, so repeated builds replace the old block instead of duplicating it.

## Homepage Display Logic

- `scripts/build-notes.mjs` reads `notes.config.json`, sorts notes by `date` descending, and writes the result to `assets/notes-data.js`.
- `index.html` loads `assets/notes-data.js`, sorts the notes by `date` descending again, and renders:
  - `最新笔记`: the first 6 notes from the sorted list.
  - `全部笔记`: every note from the sorted list.
- If multiple notes share the same date, their relative order follows their order in `notes.config.json`.

## arxiv-paper-html-notes
`arxiv-paper-html-notes`: generates polished Chinese static HTML notes from one or more arXiv papers. https://github.com/coco2sun/arxiv-paper-html-cn-notes-skill
