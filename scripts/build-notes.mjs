import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configPath = path.join(root, "notes.config.json");
const dataPath = path.join(root, "assets", "notes-data.js");

const requiredFields = ["title", "type", "date", "slug", "source", "summary", "tags"];

const fail = (message) => {
  console.error(`build-notes: ${message}`);
  process.exit(1);
};

const normalizePath = (value) => value.split(path.sep).join("/");

const isValidSlug = (slug) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);

const rewriteAssetPaths = (html) => html.replace(
  /(src|href)=("|')assets\//g,
  "$1=$2../../assets/"
).replace(
  /url\((["']?)assets\//g,
  "url($1../../assets/"
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
    const outputHtml = rewriteAssetPaths(sourceHtml);

    await mkdir(outputDir, { recursive: true });
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

  await mkdir(path.dirname(dataPath), { recursive: true });
  await writeFile(dataPath, data);

  for (const note of sortedNotes) {
    const outputPath = path.join(root, note.url, "index.html");
    if (!existsSync(outputPath)) {
      fail(`generated note is missing: ${normalizePath(path.relative(root, outputPath))}`);
    }
  }

  console.log(`Built ${sortedNotes.length} notes.`);
  console.log(`Updated ${normalizePath(path.relative(root, dataPath))}.`);
};

build();
