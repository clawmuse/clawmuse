// The repository changelog is the source of truth. Keep only the latest releases so the site
// stays current after every release without shipping the whole history to visitors.
import { readFile, writeFile } from "node:fs/promises";

const limit = 6;
const sources = { en: "CHANGELOG.md", "zh-CN": "CHANGELOG.zh-CN.md" };

// Plain text for the page: drop inline code marks and keep link labels only.
function plain(text) {
  return text
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .trim();
}

function parse(markdown) {
  const releases = [];
  let release = null;
  let section = null;
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = line.match(/^## (\d+\.\d+\.\d+) - (\d{4}-\d{2}-\d{2})$/);
    if (heading) {
      if (releases.length === limit) break;
      release = { version: heading[1], date: heading[2], sections: [], notes: [] };
      section = null;
      releases.push(release);
      continue;
    }
    if (!release) continue;
    if (line.startsWith("## ")) {
      // An unreleased or malformed heading ends the current release.
      release = null;
      continue;
    }
    const title = line.match(/^### (.+)$/);
    if (title) {
      section = { title: plain(title[1]), items: [] };
      release.sections.push(section);
    } else if (line.startsWith("- ") && section) {
      section.items.push(plain(line.slice(2)));
    } else if (line.trim()) {
      release.notes.push(plain(line));
    }
  }
  return releases;
}

const changelog = {};
for (const [language, file] of Object.entries(sources)) {
  changelog[language] = parse(await readFile(new URL(`../../../${file}`, import.meta.url), "utf8"));
}
// A translation counts only when it covers the same release, so a release never waits on it.
const translated = new Map(changelog["zh-CN"].map((release) => [release.version, release]));
changelog["zh-CN"] = changelog.en.map((release) => {
  const translation = translated.get(release.version);
  return translation?.date === release.date ? translation : release;
});
await writeFile(
  new URL("./changelog.json", import.meta.url),
  `${JSON.stringify(changelog, null, 2)}\n`,
);
console.log(`Synced ${changelog.en.length} changelog releases`);
