# CocoSun - Biomedical AI Paper Notes

Static GitHub Pages site for biomedical AI paper notes.

## Add a New HTML Note

1. Put the new standalone HTML note in `incoming/`.
2. Add one item to `notes.config.json`.
3. Run:

```bash
node scripts/build-notes.mjs
```

The build script copies the HTML into `notes/<slug>/index.html`, rewrites local `assets/...` references to `../../assets/...`, and regenerates `assets/notes-data.js` for the homepage.

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
  "accent": false
}
```

- `slug` must use lowercase letters, numbers, and hyphens.
- `source` can point to `incoming/...` for a new note or an existing `notes/<slug>/index.html`.
- `assetsDir` is optional. Use it when the HTML has an attachment folder, such as `incoming/New_Paper_Note_files`.
- The homepage shows the latest 6 notes and all notes based on `notes.config.json`.

When `assetsDir` is set, the build script copies that folder into `notes/<slug>/assets/` and rewrites references like `src="New_Paper_Note_files/figure1.png"` to `src="assets/figure1.png"`.
