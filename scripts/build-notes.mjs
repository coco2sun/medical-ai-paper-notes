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

  const sourcePath = path.join(root, note.source);
  if (!existsSync(sourcePath)) {
    fail(`source file does not exist for "${note.title}": ${note.source}`);
  }

  if (note.assetsDir !== undefined) {
    if (typeof note.assetsDir !== "string" || !note.assetsDir.trim()) {
      fail(`note "${note.title}" has invalid assetsDir`);
    }

    const assetsDirPath = path.join(root, note.assetsDir);
    if (!existsSync(assetsDirPath)) {
      fail(`assetsDir does not exist for "${note.title}": ${note.assetsDir}`);
    }

    if (!statSync(assetsDirPath).isDirectory()) {
      fail(`assetsDir is not a directory for "${note.title}": ${note.assetsDir}`);
    }
  }
};

const build = async () => {
  const notes = await readConfig();
  const seenSlugs = new Set();

  notes.forEach((note, index) => validateNote(note, index, seenSlugs));

  const builtNotes = [];
  for (const note of notes) {
    const sourcePath = path.join(root, note.source);
    const outputDir = path.join(root, "notes", note.slug);
    const outputPath = path.join(outputDir, "index.html");
    const sourceHtml = await readFile(sourcePath, "utf8");
    const outputHtml = await rewriteAssetPaths(sourceHtml, note);

    await mkdir(outputDir, { recursive: true });

    if (note.assetsDir) {
      const noteAssetsDir = path.join(outputDir, "assets");
      await rm(noteAssetsDir, { recursive: true, force: true });
      await cp(path.join(root, note.assetsDir), noteAssetsDir, { recursive: true });
    }

    await writeFile(outputPath, outputHtml);

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
