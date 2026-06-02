import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "notes.config.json");
const indexPath = path.join(root, "index.html");
const dataPath = path.join(root, "assets", "notes-data.js");

const requiredFields = ["title", "type", "date", "slug", "source", "summary", "tags"];

const fail = (message) => {
  console.error(`build-notes: ${message}`);
  process.exit(1);
};

const normalizePath = (value) => value.split(path.sep).join("/");

const isValidSlug = (slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

const shortHash = (value) => createHash("sha256").update(value).digest("hex").slice(0, 10);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const homeLinkPattern = /<!-- sun-blog-home-link:start -->[\s\S]*?<!-- sun-blog-home-link:end -->\s*/g;

const homeLinkMarkup = `<!-- sun-blog-home-link:start -->
<a class="sun-blog-home-link" href="../../" aria-label="返回主页">← 首页</a>
<style>
  .sun-blog-home-link {
    position: fixed;
    top: 18px;
    left: 18px;
    z-index: 2147483647;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 8px 13px;
    border: 1px solid rgba(23, 32, 51, 0.16);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.88);
    box-shadow: 0 10px 26px rgba(23, 32, 51, 0.16);
    color: #174a7c;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Hiragino Sans GB", "Microsoft YaHei", Arial, sans-serif;
    font-size: 14px;
    font-weight: 800;
    line-height: 1;
    text-decoration: none;
    backdrop-filter: blur(10px);
  }

  .sun-blog-home-link:hover {
    color: #8f2444;
    text-decoration: none;
  }

  @media (max-width: 720px) {
    .sun-blog-home-link {
      top: 12px;
      left: 12px;
      min-height: 34px;
      padding: 7px 11px;
      font-size: 13px;
    }
  }
</style>
<!-- sun-blog-home-link:end -->
`;

const injectHomeLink = (html) => {
  const cleanedHtml = html.replace(homeLinkPattern, "");
  if (cleanedHtml.includes("</body>")) {
    return cleanedHtml.replace("</body>", `${homeLinkMarkup}</body>`);
  }
  return `${cleanedHtml}\n${homeLinkMarkup}`;
};

const rewriteGlobalAssetPaths = (html) => html.replace(
  /(src|href)=("|')assets\//g,
  "$1=$2../../assets/"
).replace(
  /url\((["']?)assets\//g,
  "url($1../../assets/"
);

const listTopLevelFileNames = async (directory) => {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
};

const getNotePaths = (note) => {
  const outputDir = path.join(root, "notes", note.slug);
  return {
    assetsDirPath: note.assetsDir ? path.join(root, note.assetsDir) : null,
    outputAssetsDir: path.join(outputDir, "assets"),
    outputDir,
    outputPath: path.join(outputDir, "index.html"),
    sourcePath: path.join(root, note.source)
  };
};

const rewriteNoteAssetPaths = async (html, assetsDir) => {
  if (!assetsDir) {
    return html;
  }

  const assetDirName = path.basename(assetsDir);
  const escapedDir = escapeRegExp(assetDirName);
  const assetsDirPath = path.join(root, assetsDir);

  let rewrittenHtml = html.replace(
    new RegExp(`(src|href)=("|')${escapedDir}/`, "g"),
    "$1=$2assets/"
  ).replace(
    new RegExp(`url\\((["']?)${escapedDir}/`, "g"),
    "url($1assets/"
  );

  for (const fileName of await listTopLevelFileNames(assetsDirPath)) {
    const escapedName = escapeRegExp(fileName);
    rewrittenHtml = rewrittenHtml.replace(
      new RegExp(`(src|href)=("|')\\.\\./\\.\\./assets/${escapedName}`, "g"),
      `$1=$2assets/${fileName}`
    ).replace(
      new RegExp(`url\\((["']?)\\.\\./\\.\\./assets/${escapedName}`, "g"),
      `url($1assets/${fileName}`
    );
  }

  return rewrittenHtml;
};

const rewriteAssetPaths = async (html, note) => rewriteNoteAssetPaths(
  rewriteGlobalAssetPaths(html),
  note.assetsDir
);

const readConfig = async () => {
  let notes;
  try {
    notes = JSON.parse(await readFile(configPath, "utf8"));
  } catch (error) {
    fail(`cannot read notes.config.json: ${error.message}`);
  }

  if (!Array.isArray(notes)) {
    fail("notes.config.json must contain an array");
  }

  return notes;
};

const validateNote = (note, index, seenSlugs) => {
  for (const field of requiredFields) {
    if (note[field] === undefined || note[field] === null || note[field] === "") {
      fail(`note #${index + 1} is missing required field: ${field}`);
    }
  }

  if (!isValidSlug(note.slug)) {
    fail(`note "${note.title}" has invalid slug "${note.slug}". Use lowercase letters, numbers, and hyphens.`);
  }

  if (seenSlugs.has(note.slug)) {
    fail(`duplicate slug: ${note.slug}`);
  }
  seenSlugs.add(note.slug);

  if (!Array.isArray(note.tags) || note.tags.some((tag) => typeof tag !== "string" || !tag.trim())) {
    fail(`note "${note.title}" must have a tags array of non-empty strings`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(note.date)) {
    fail(`note "${note.title}" must use date format YYYY-MM-DD`);
  }

  if (note.visible !== undefined && typeof note.visible !== "boolean") {
    fail(`note "${note.title}" visible must be true or false`);
  }

  const { assetsDirPath, outputAssetsDir, outputPath, sourcePath } = getNotePaths(note);
  const sourceExists = existsSync(sourcePath);
  const outputExists = existsSync(outputPath);

  if (!sourceExists && !outputExists) {
    fail(`source file is missing and no generated note exists for "${note.title}": ${note.source}`);
  }

  if (note.assetsDir !== undefined) {
    if (typeof note.assetsDir !== "string" || !note.assetsDir.trim()) {
      fail(`note "${note.title}" has invalid assetsDir`);
    }

    if (existsSync(assetsDirPath) && !statSync(assetsDirPath).isDirectory()) {
      fail(`assetsDir is not a directory for "${note.title}": ${note.assetsDir}`);
    }

    if (!existsSync(assetsDirPath) && sourceExists && !existsSync(outputAssetsDir)) {
      fail(`assetsDir does not exist for "${note.title}" and no generated assets exist: ${note.assetsDir}`);
    }
  }
};

const build = async () => {
  const notes = await readConfig();
  const seenSlugs = new Set();

  notes.forEach((note, index) => validateNote(note, index, seenSlugs));

  const builtNotes = [];
  for (const note of notes) {
    const { assetsDirPath, outputAssetsDir, outputDir, outputPath, sourcePath } = getNotePaths(note);
    const sourceExists = existsSync(sourcePath);
    const assetsDirExists = note.assetsDir && existsSync(assetsDirPath);
    const inputPath = sourceExists ? sourcePath : outputPath;
    const inputIsGeneratedNote = path.resolve(inputPath) === path.resolve(outputPath);
    const sourceHtml = await readFile(inputPath, "utf8");
    const noteHtml = inputIsGeneratedNote
      ? sourceHtml
      : await rewriteAssetPaths(sourceHtml, assetsDirExists ? note : { ...note, assetsDir: undefined });
    const outputHtml = injectHomeLink(noteHtml);

    await mkdir(outputDir, { recursive: true });

    if (assetsDirExists) {
      await rm(outputAssetsDir, { recursive: true, force: true });
      await cp(assetsDirPath, outputAssetsDir, { recursive: true });
    }

    await writeFile(outputPath, outputHtml);

    if (note.visible !== false) {
      builtNotes.push({
        title: note.title,
        type: note.type,
        date: note.date,
        url: `notes/${note.slug}/`,
        summary: note.summary,
        tags: note.tags,
        accent: Boolean(note.accent)
      });
    }
  }

  const sortedNotes = builtNotes.sort((a, b) => b.date.localeCompare(a.date));
  const data = `window.NOTES = ${JSON.stringify(sortedNotes, null, 2)};\n`;
  const dataVersion = shortHash(data);

  await mkdir(path.dirname(dataPath), { recursive: true });
  await writeFile(dataPath, data);

  const indexHtml = await readFile(indexPath, "utf8");
  const versionedIndexHtml = indexHtml.replace(
    /assets\/notes-data\.js(?:\?v=[a-f0-9]+)?/g,
    `assets/notes-data.js?v=${dataVersion}`
  );
  await writeFile(indexPath, versionedIndexHtml);

  for (const note of sortedNotes) {
    const outputPath = path.join(root, note.url, "index.html");
    if (!existsSync(outputPath)) {
      fail(`generated note is missing: ${normalizePath(path.relative(root, outputPath))}`);
    }
  }

  console.log(`Built ${sortedNotes.length} notes.`);
  console.log(`Updated ${normalizePath(path.relative(root, dataPath))}.`);
  console.log(`Updated ${normalizePath(path.relative(root, indexPath))} with notes data version ${dataVersion}.`);
};

build();
