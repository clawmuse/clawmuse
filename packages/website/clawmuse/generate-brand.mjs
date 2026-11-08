import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const identity = JSON.parse(await readFile(new URL("identity.json", import.meta.url), "utf8"));
const output = new URL("public/brand/", import.meta.url);
await mkdir(output, { recursive: true });
const ink = "#173b34";
const mint = "#8de0bf";
const paper = "#f3f7f3";
const sea = "#102827";
const paths = (shape, color) =>
  `<g fill="none" stroke="${color}" stroke-width="${shape.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${shape.paths.map(({ id, d }) => `<path id="${id}" d="${d}"/>`).join("")}</g>`;
const svg = (viewBox, title, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-labelledby="title"><title id="title">${title}</title>${body}</svg>\n`;
const symbol = (color) => paths(identity.symbol, color);
const wordmark = (color) => paths(identity.wordmark, color);
const lockup = (symbolColor, typeColor) =>
  `<g id="cm-symbol">${symbol(symbolColor)}</g><g id="clawmuse-lettering" transform="translate(104 0)">${wordmark(typeColor)}</g>`;
const assets = {
  "clawmuse-symbol.svg": svg(identity.symbol.viewBox, "ClawMuse CM symbol", symbol(mint)),
  "clawmuse-symbol-ink.svg": svg(
    identity.symbol.viewBox,
    "ClawMuse CM symbol, forest ink",
    symbol(ink),
  ),
  "clawmuse-wordmark.svg": svg(
    identity.wordmark.viewBox,
    "ClawMuse custom lettering",
    wordmark(ink),
  ),
  "clawmuse-wordmark-light.svg": svg(
    identity.wordmark.viewBox,
    "ClawMuse custom lettering, light",
    wordmark(paper),
  ),
  "clawmuse-lockup.svg": svg("0 0 420 64", "ClawMuse horizontal lockup", lockup(ink, ink)),
  "clawmuse-lockup-light.svg": svg(
    "0 0 420 64",
    "ClawMuse horizontal lockup, light",
    lockup(mint, paper),
  ),
  "clawmuse-mark.svg": svg(
    "0 0 96 96",
    "ClawMuse app icon",
    `<rect id="background" width="96" height="96" rx="24" fill="${sea}"/><g transform="translate(7 16)">${symbol(mint)}</g>`,
  ),
};

// A fully vector social master; the PNG is for social services without SVG support.
const social = svg(
  "0 0 1200 630",
  "ClawMuse — Put your ideas into action.",
  `<rect width="1200" height="630" fill="${sea}"/><circle cx="1040" cy="80" r="300" fill="none" stroke="#284c42"/><circle cx="1040" cy="80" r="220" fill="none" stroke="#284c42"/><g transform="translate(100 100) scale(1.6)">${symbol(mint)}</g><g transform="translate(100 270) scale(2.8)">${wordmark(paper)}</g><path d="M105 510h100l-15-15m15 15-15 15" fill="none" stroke="${mint}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
);
assets["clawmuse-social.svg"] = social;
await Promise.all(
  Object.entries(assets).map(([name, content]) => writeFile(new URL(name, output), content)),
);
await sharp(Buffer.from(social))
  .resize(1200, 630)
  .png()
  .toFile(fileURLToPath(new URL("clawmuse-social.png", output)));
console.log(
  "Generated CM, custom lettering, lockups, app icon, and social assets from identity.json.",
);
