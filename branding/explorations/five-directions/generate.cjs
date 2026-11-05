const fs = require("node:fs");
const path = require("node:path");
const opentype = require("opentype.js");
const sharp = require("sharp");
const out = __dirname;
const fontRoot = "/System/Library/Fonts/Supplemental/";
const fonts = {};
const font = (name) => (fonts[name] ??= opentype.loadSync(fontRoot + name + ".ttf"));
const palette = { ink: "#173b34", mint: "#8de0bf", sea: "#102827", paper: "#f3f7f3" };
const f = (n) => Number(n.toFixed(3));
const shape = (body, width, height) => ({ body, width, height });
const wrap = (s, color, title) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.width} ${s.height}" role="img" aria-label="${title}"><title>${title}</title><g fill="${color}" color="${color}">${s.body}</g></svg>`;
function glyph(fontName, char, x, y, w, h) {
  const p = font(fontName).getPath(char, 0, 0, 100),
    b = p.getBoundingBox();
  return `<g transform="translate(${x} ${y}) scale(${f(w / (b.x2 - b.x1))} ${f(h / (b.y2 - b.y1))}) translate(${f(-b.x1)} ${f(-b.y1)})"><path d="${p.toPathData(3)}"/></g>`;
}
function lettering(fontName, tracking = 0, splitFont = null, shear = 0) {
  const text = "ClawMuse",
    items = [];
  let pen = 0;
  let bounds = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
  for (let i = 0; i < text.length; i++) {
    const ft = font(splitFont && i >= 4 ? splitFont : fontName);
    const g = ft.charToGlyph(text[i]);
    if (i && (!splitFont || i !== 4))
      pen += (ft.getKerningValue(ft.charToGlyph(text[i - 1]), g) * 100) / ft.unitsPerEm;
    const p = g.getPath(pen, 0, 100),
      b = p.getBoundingBox();
    items.push(`<path id="glyph-${i + 1}-${text[i]}" d="${p.toPathData(3)}"/>`);
    bounds.x1 = Math.min(bounds.x1, b.x1);
    bounds.x2 = Math.max(bounds.x2, b.x2);
    bounds.y1 = Math.min(bounds.y1, b.y1);
    bounds.y2 = Math.max(bounds.y2, b.y2);
    pen += (g.advanceWidth * 100) / ft.unitsPerEm + tracking;
  }
  const h = bounds.y2 - bounds.y1,
    w = bounds.x2 - bounds.x1,
    extra = Math.abs(shear) * h;
  return shape(
    `<g transform="translate(${f(4 - bounds.x1)} ${f(4 - bounds.y1)})"><g transform="matrix(1 0 ${-shear} 1 0 0)">${items.join("")}</g></g>`,
    Math.ceil(w + extra + 8),
    Math.ceil(h + 8),
  );
}
const cSolid =
  '<path id="c" d="M44 8H27C12 8 4 17 4 32v16c0 15 8 24 23 24h17V57H28c-6 0-9-3-9-9V32c0-6 3-9 9-9h16Z"/>';
const mSolid = '<path id="m" d="M52 72V8h14l16 24L98 8h14v64H96V37L82 56 68 37v35Z"/>';
const pixelAlphabet = {
  C: ["01110", "11001", "11000", "11000", "11000", "11001", "01110"],
  l: ["11000", "01000", "01000", "01000", "01000", "01000", "01110"],
  a: ["00000", "00000", "01110", "00011", "01111", "11011", "01111"],
  w: ["00000", "00000", "10001", "10001", "10101", "11111", "01010"],
  M: ["11011", "11111", "10101", "10101", "10001", "10001", "10001"],
  u: ["00000", "00000", "11011", "11011", "11011", "11011", "01111"],
  s: ["00000", "00000", "01111", "11000", "01110", "00011", "11110"],
  e: ["00000", "00000", "01110", "11011", "11111", "11000", "01111"],
};
function pixelText(text, size = 8) {
  let body = "";
  for (let i = 0; i < text.length; i++) {
    let d = "";
    pixelAlphabet[text[i]].forEach((row, y) =>
      [...row].forEach((v, x) => {
        if (v === "1") d += `M${(i * 6 + x) * size} ${y * size}h${size}v${size}h-${size}Z`;
      }),
    );
    body += `<path id="pixel-${i}-${text[i]}" d="${d}"/>`;
  }
  return shape(body, (text.length * 6 - 1) * size, 7 * size);
}
const options = [
  {
    id: "01",
    slug: "precision",
    name: "精密构造",
    en: "PRECISION",
    tag: "利落 · 稳定 · 产品感",
    desc: "块面 CM + 紧凑重字标，适合专业工具型 SaaS。",
    icon: shape(cSolid + mSolid, 116, 80),
    word: lettering("Arial Black", -3.1),
  },
  {
    id: "02",
    slug: "editorial",
    name: "衬线编辑",
    en: "EDITORIAL MUSE",
    tag: "优雅 · 人文 · 灵感感",
    desc: "交织 CM + 衬线与斜体，让 Muse 的创作属性更突出。",
    icon: shape(
      glyph("Georgia", "C", 2, 8, 69, 64) + glyph("Georgia Italic", "M", 40, 8, 73, 64),
      118,
      80,
    ),
    word: lettering("Georgia", -1, "Georgia Italic"),
  },
  {
    id: "03",
    slug: "momentum",
    name: "斜切动感",
    en: "MOMENTUM",
    tag: "速度 · 行动力 · 科技感",
    desc: "斜切的带状 CM 与前倾字标，把“行动”做成视觉重心。",
    icon: shape(
      '<path id="c-ribbon" d="M60 8H30L4 42l15 30h26l12-15H30l-7-14 15-20h11Z"/><path id="m-ribbon" d="m49 72 22-64h15l4 26 23-26h17l-22 64H91l12-34-22 24-7-25-12 35Z"/>',
      134,
      80,
    ),
    word: lettering("Arial Black", -2.6, null, 0.22),
  },
  {
    id: "04",
    slug: "companion",
    name: "圆润亲和",
    en: "COMPANION",
    tag: "温暖 · 轻松 · 陪伴感",
    desc: "柔软的 CM 与饱满圆字，让日常使用更有亲近感。",
    icon: shape(
      '<path id="c-soft" d="M37 16H29C16 16 9 25 9 40s7 24 20 24h8" fill="none" stroke="currentColor" stroke-width="17" stroke-linecap="round"/><path id="m-soft" d="M55 64V31c0-9 5-15 13-15s13 6 13 15v33-33c0-9 5-15 13-15s13 6 13 15v33" fill="none" stroke="currentColor" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>',
      122,
      80,
    ),
    word: lettering("Arial Rounded Bold", -2.5),
  },
  {
    id: "05",
    slug: "terminal",
    name: "像素终端",
    en: "TERMINAL",
    tag: "开发者 · 模块化 · 独立感",
    desc: "网格像素字与 CM 模块，保留终端工具的鲜明个性。",
    icon: pixelText("CM", 8),
    word: pixelText("ClawMuse", 8),
  },
];
function fit(s, x, y, w, h) {
  const scale = Math.min(w / s.width, h / s.height);
  return `<g transform="translate(${f(x + (w - s.width * scale) / 2)} ${f(y + (h - s.height * scale) / 2)}) scale(${f(scale)})">${s.body}</g>`;
}
for (const o of options) {
  const dir = path.join(out, `${o.id}-${o.slug}`);
  fs.mkdirSync(dir, { recursive: true });
  const lock = shape(fit(o.icon, 0, 0, 100, 88) + fit(o.word, 126, 0, 444, 88), 576, 88);
  o.lock = lock;
  for (const [name, s] of [
    ["symbol", o.icon],
    ["wordmark", o.word],
    ["lockup", lock],
  ]) {
    fs.writeFileSync(
      path.join(dir, `${name}.svg`),
      wrap(s, palette.ink, `ClawMuse ${o.en} ${name}`),
    );
    fs.writeFileSync(
      path.join(dir, `${name}-light.svg`),
      wrap(s, palette.mint, `ClawMuse ${o.en} ${name}, light`),
    );
  }
  const tile = shape(
    `<rect width="160" height="160" rx="36" fill="${palette.sea}"/><g fill="${palette.mint}" color="${palette.mint}">${fit(o.icon, 20, 30, 120, 100)}</g>`,
    160,
    160,
  );
  fs.writeFileSync(
    path.join(dir, "app-icon.svg"),
    wrap(tile, palette.ink, `ClawMuse ${o.en} app icon`),
  );
}
// Comparison labels are live text; exported logos above contain paths only.
const W = 1600,
  H = 1940;
let board = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#edf1ec"/><g font-family="Arial, 'PingFang SC', sans-serif"><text x="70" y="70" font-size="13" letter-spacing="3" fill="#526d61">CLAWMUSE / IDENTITY EXPLORATIONS</text><text x="70" y="126" font-size="40" font-weight="600" fill="${palette.ink}">五种气质，同一个 ClawMuse。</text><text x="1530" y="120" text-anchor="end" font-size="16" fill="#647b70">01—05 · 方向提案</text>`;
for (let i = 0; i < options.length; i++) {
  const o = options[i],
    y = 175 + i * 338;
  board += `<rect x="50" y="${y}" width="1500" height="310" rx="20" fill="${palette.paper}"/><text x="82" y="${y + 48}" font-size="22" fill="${palette.ink}" font-weight="700">${o.id}</text><text x="138" y="${y + 47}" font-size="20" fill="${palette.ink}" font-weight="600">${o.name}</text><text x="138" y="${y + 73}" font-size="10" letter-spacing="2" fill="#647b70">${o.en}</text><text x="82" y="${y + 271}" font-size="15" fill="#526d61">${o.desc}</text><g fill="${palette.ink}" color="${palette.ink}">${fit(o.icon, 90, y + 113, 150, 100)}${fit(o.word, 276, y + 105, 660, 112)}</g><line x1="1030" y1="${y + 35}" x2="1030" y2="${y + 275}" stroke="#d6e0d7"/><rect x="1070" y="${y + 36}" width="112" height="112" rx="26" fill="${palette.sea}"/><g fill="${palette.mint}" color="${palette.mint}">${fit(o.icon, 1085, y + 55, 82, 75)}</g><g fill="${palette.ink}" color="${palette.ink}">${fit(o.icon, 1220, y + 62, 48, 48)}${fit(o.icon, 1300, y + 70, 32, 32)}${fit(o.icon, 1360, y + 74, 24, 24)}</g><text x="1220" y="${y + 139}" font-size="11" letter-spacing="1" fill="#647b70">48 / 32 / 24</text><rect x="1070" y="${y + 171}" width="438" height="93" rx="12" fill="${palette.sea}"/><g fill="${palette.mint}" color="${palette.mint}">${fit(o.lock, 1092, y + 192, 390, 50)}</g>`;
}
board += `<text x="70" y="1912" font-size="14" fill="#647b70">统一深海薄荷配色，比较字形、图标与尺度表现。官网保持当前版本，选定后再替换。</text></g></svg>`;
fs.writeFileSync(path.join(out, "comparison.svg"), board);
(async () => {
  await sharp(Buffer.from(board)).png().toFile(path.join(out, "comparison.png"));
  for (const o of options) {
    const color = palette.ink;
    const s = shape(
      `<rect width="1400" height="860" fill="${palette.paper}"/><g fill="${color}" color="${color}">${fit(o.icon, 600, 60, 200, 170)}${fit(o.word, 220, 290, 960, 140)}</g><rect y="520" width="1400" height="340" fill="${palette.sea}"/><g fill="${palette.mint}" color="${palette.mint}">${fit(o.lock, 280, 620, 840, 120)}</g>`,
      1400,
      860,
    );
    await sharp(Buffer.from(wrap(s, color, `ClawMuse ${o.en}`)))
      .png()
      .toFile(path.join(out, `${o.id}-${o.slug}`, "preview.png"));
  }
  console.log(
    "Created five logo directions, editable path SVGs, comparison, and individual previews.",
  );
})();
const inline = (s) =>
  `<svg viewBox="0 0 ${s.width} ${s.height}" fill="currentColor" aria-hidden="true">${s.body}</svg>`;
const html = `<!doctype html><html lang="zh-CN" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ClawMuse · 五个品牌方向</title><style>
:root{color-scheme:light;--bg:#edf1ec;--surface:#f8faf5;--ink:#173b34;--muted:#617a6d;--line:#d4dfd5;--accent:#215e49}html[data-theme=dark]{color-scheme:dark;--bg:#0c201f;--surface:#102827;--ink:#8de0bf;--muted:#9eb6ad;--line:#2a463e;--accent:#8de0bf}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Arial,'PingFang SC',sans-serif}button,a{font:inherit}button{cursor:pointer}a{color:inherit;text-underline-offset:4px}header,main{width:min(1200px,calc(100% - 40px));margin:auto}header{padding:52px 0 30px}header small{letter-spacing:.22em;font-size:10px}h1{font-size:clamp(28px,5vw,46px);letter-spacing:-.04em;margin:20px 0 15px}header p,.description{color:var(--muted);line-height:1.8}.toolbar{display:flex;gap:8px;flex-wrap:wrap;margin:25px 0 18px}.toolbar button{border:1px solid var(--line);border-radius:100px;background:transparent;color:var(--ink);padding:9px 16px}.toolbar button[aria-pressed=true]{background:var(--ink);color:var(--bg)}.controls{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}.controls .toolbar{margin:0}article{background:var(--surface);border:1px solid var(--line);border-radius:20px;margin:20px 0;padding:32px 38px}article[hidden]{display:none}.label{display:flex;gap:20px;align-items:center}.number{font-size:30px;letter-spacing:-.06em}.label h2{margin:0;font-size:21px}.label small{display:block;margin-top:7px;font-size:10px;letter-spacing:.16em;color:var(--muted)}.hero-art{display:flex;align-items:center;justify-content:center;min-height:240px;padding:40px 0}.hero-art svg{width:100%;max-width:860px;max-height:180px}.hero-art[data-mode=icon] svg{max-width:240px}.hero-art[data-mode=word] svg{max-width:800px}.details{display:flex;justify-content:space-between;gap:25px;align-items:center;border-top:1px solid var(--line);padding-top:22px}.description{font-size:14px;max-width:640px;margin:0}.links{display:flex;gap:16px;flex-wrap:wrap;font-size:12px}.app-row{display:flex;align-items:center;gap:30px;margin-top:25px}.app-tile{width:92px;height:92px;background:#102827;border:1px solid #2a463e;color:#8de0bf;border-radius:22px;display:flex;align-items:center;justify-content:center}.app-tile svg{width:67px;max-height:56px}.mini{display:flex;align-items:center;gap:24px}.mini span{display:flex;align-items:center;justify-content:center}.mini span:nth-child(1){width:48px;height:48px}.mini span:nth-child(2){width:32px;height:32px}.mini span:nth-child(3){width:24px;height:24px}.mini svg{width:100%;max-height:100%}.scale-label{font-size:11px;color:var(--muted)}footer{padding:32px 0 60px;color:var(--muted);font-size:13px}button:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:4px}@media(max-width:620px){article{padding:24px 20px}.hero-art{min-height:160px;padding:30px 0}.details{align-items:flex-start;flex-direction:column}.app-row{gap:18px}.scale-label{display:none}}
</style></head><body><header><small>CLAWMUSE / IDENTITY EXPLORATIONS</small><h1>五种气质，同一个 ClawMuse。</h1><p>先选气质，再打磨字形、比例与细节。点击编号单独查看；图标、品牌字与组合标识均可下载 SVG。</p><nav class="toolbar" aria-label="选择方案"><button data-filter="all" aria-pressed="true">全部对比</button>${options.map((o) => `<button data-filter="${o.id}" aria-pressed="false">${o.id} ${o.name}</button>`).join("")}</nav><div class="controls"><div class="toolbar" aria-label="展示内容"><button data-mode="lock" aria-pressed="true">组合标识</button><button data-mode="icon" aria-pressed="false">独立图标</button><button data-mode="word" aria-pressed="false">品牌字</button></div><div class="toolbar"><button id="theme-toggle" aria-pressed="false">切换暗色背景</button></div></div></header><main>${options.map((o) => `<article id="option-${o.id}" data-option="${o.id}"><div class="label"><span class="number">${o.id}</span><div><h2>${o.name}</h2><small>${o.en}</small></div></div><div class="hero-art" data-mode="lock" role="img" aria-label="${o.name} ClawMuse 标识">${inline(o.lock)}</div><div class="details"><p class="description">${o.desc}</p><div class="links"><a href="${o.id}-${o.slug}/symbol.svg" download>图标 SVG</a><a href="${o.id}-${o.slug}/wordmark.svg" download>品牌字 SVG</a><a href="${o.id}-${o.slug}/lockup.svg" download>组合 SVG</a></div></div><div class="app-row"><div class="app-tile" aria-hidden="true">${inline(o.icon)}</div><div class="mini" aria-hidden="true">${[1, 2, 3].map(() => `<span>${inline(o.icon)}</span>`).join("")}</div><span class="scale-label">48 / 32 / 24 px</span></div></article>`).join("")}<footer>本页是独立设计提案，未修改官网。请用 01—05 告诉我你的选择，也可以指定一套图标搭配另一套字标。</footer></main><script>
const options=${JSON.stringify(options.map((o) => ({ id: o.id, icon: inline(o.icon), word: inline(o.word), lock: inline(o.lock) })))};
document.querySelectorAll('[data-filter]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('article').forEach(card=>card.hidden=button.dataset.filter!=='all'&&card.dataset.option!==button.dataset.filter);}));
document.querySelectorAll('button[data-mode]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('button[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('article').forEach(card=>{const art=card.querySelector('.hero-art');art.dataset.mode=button.dataset.mode;art.innerHTML=options.find(o=>o.id===card.dataset.option)[button.dataset.mode];});}));
document.querySelector('#theme-toggle').addEventListener('click',event=>{const dark=document.documentElement.dataset.theme!=='dark';document.documentElement.dataset.theme=dark?'dark':'light';event.currentTarget.setAttribute('aria-pressed',String(dark));event.currentTarget.textContent=dark?'切换亮色背景':'切换暗色背景';});
</script></body></html>`;
fs.writeFileSync(path.join(out, "index.html"), html);
fs.writeFileSync(
  path.join(out, "README.md"),
  `# ClawMuse · 五个品牌方向\n\n本目录只包含独立提案，不修改官网或应用。\n\n${options.map((o) => `- ${o.id} ${o.name}：${o.desc}`).join("\n")}\n\n打开 index.html 可单独查看方案、切换深浅背景及图标/品牌字模式。comparison.png 是总览，comparison.svg 可无损放大。\n\n每个方案目录含图标、品牌字、横向组合、对应浅色版、应用图标和大图预览。标识 SVG 的字母均为路径，不需要安装字体；可在 Figma、Illustrator 等工具中继续修改。\n\n排印基础：01 Arial Black；02 Georgia / Georgia Italic；03 Arial Black 倾斜处理；04 Arial Rounded Bold；05 自绘像素字。图标为此次提案绘制；字体文件不包含在素材包中。选定方向后再定制字距、局部字形和实际应用尺寸。\n\n生成脚本使用当前工作区的 opentype.js 与 sharp，并读取 macOS 字体，只用于此提案。导出的 SVG 不依赖这些工具。\n`,
);
