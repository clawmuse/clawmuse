// ClawMuse campaign panels. Screens remain unmodified native captures.
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const root = path.dirname(fileURLToPath(import.meta.url));
const parent = path.dirname(root);
const repo = path.resolve(parent, "../..");
const source = path.join(root, "raw");
const manifest = JSON.parse(await readFile(path.join(source, "capture-manifest.json"), "utf8"));
const output = path.join(root, "output");
const font = await readFile(
  path.join(process.env.SF_FONT_DIR || "/System/Library/Fonts", "SFNS.ttf"),
);
const logo = await readFile(path.join(repo, "branding/clawmuse-vectors/clawmuse-lockup-light.svg"));
const symbol = await readFile(path.join(repo, "branding/clawmuse-vectors/clawmuse-symbol.svg"));
const data = (buffer, type = "image/png") => `data:${type};base64,${buffer.toString("base64")}`;
const scenes = [
  {
    id: "01-chat",
    en: ["Your coding agents.", "Wherever you are.", "Follow the work on your own machine."],
    zh: ["开发不必", "守在电脑前", "随时查看 AI 的工作，继续你的开发任务。"],
    crop: [65, 370, 1180, 840],
    tabletCrop: [720, 550, 1580, 380],
  },
  {
    id: "02-tests",
    en: ["See the work.", "Check the results.", "Review the checks behind each change."],
    zh: ["看见执行过程", "验证每个结果", "测试输出清晰可见，进展有据可查。"],
    crop: [65, 540, 1140, 1170],
  },
  {
    id: "03-files",
    en: ["Your project.", "Within reach.", "Explore files without leaving your workspace."],
    zh: ["项目文件", "随手就能查看", "从目录到源码，在同一工作区中浏览。"],
    crop: [50, 560, 1230, 660],
    tabletCrop: [690, 280, 1060, 360],
  },
  {
    id: "04-diff",
    en: ["Every change.", "In clear view.", "Review additions and removals before committing."],
    zh: ["每一处修改", "都看得清楚", "对照代码增删，再决定是否提交。"],
    crop: [20, 550, 1280, 710],
    tabletCrop: [1780, 280, 630, 650],
  },
];
const sizes = { iphone: [1320, 2868], ipad: [2064, 2752] };
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const exports = [];
function panelHtml({
  width,
  height,
  tablet,
  first,
  second,
  body,
  frameLeft,
  frameTop,
  screenWidth,
  screenHeight,
  detailLeft,
  detailTop,
  detailWidth,
  locale,
  screen,
  showDetail,
  detail,
}) {
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:SF;src:url('${data(font, "font/ttf")}');font-weight:1 1000}
*{box-sizing:border-box;margin:0}html,body{width:${width}px;height:${height}px;overflow:hidden}
body{font-family:SF,'PingFang SC',sans-serif;color:#eff7f2;background:#081615;position:relative;-webkit-font-smoothing:antialiased}
.surface{position:absolute;inset:590px -600px -800px -700px;background:linear-gradient(145deg,#183b35,#102827 48%,#081615);transform:rotate(-18deg);border-radius:300px}
.symbol{position:absolute;width:${tablet ? 1500 : 1050}px;right:-210px;bottom:30px;opacity:.055;transform:rotate(-15deg)}
.copy{position:absolute;top:${tablet ? 145 : 145}px;left:${tablet ? 145 : 90}px;right:70px}
h1{font-size:${tablet ? 150 : 108}px;font-weight:670;line-height:1.06;letter-spacing:-.035em}h1 span{display:block;white-space:nowrap}h1 .accent{color:#6ee7b7}
p{font-size:${tablet ? 48 : 39}px;color:#b3cec2;line-height:1.4;margin-top:40px;white-space:nowrap;letter-spacing:-.01em}
.brand{position:absolute;left:${tablet ? 150 : 90}px;top:${tablet ? 590 : 510}px;width:${tablet ? 390 : 310}px}
.device{position:absolute;left:${frameLeft}px;top:${frameTop}px;padding:18px;background:linear-gradient(135deg,#667b72,#263b33 30%,#050908 70%,#81988b);border-radius:${tablet ? 54 : 143}px;box-shadow:16px 48px 100px #0009}
.screen{overflow:hidden;position:relative;border:9px solid #060b09;border-radius:${tablet ? 38 : 126}px;background:#060b09}.screen img{display:block;width:${screenWidth}px;height:${screenHeight}px}
.island{position:absolute;top:24px;left:50%;transform:translateX(-50%);width:260px;height:72px;background:#000;border-radius:45px}
.detail{position:absolute;left:${detailLeft}px;top:${detailTop}px;width:${detailWidth}px;overflow:hidden;border-radius:28px;background:#102827;box-shadow:16px 40px 90px #0009}
.detail img{width:100%;display:block}.caption{padding:20px 28px;color:#6ee7b7;font-size:${tablet ? 32 : 30}px;font-weight:560}
.footer{position:absolute;left:${tablet ? 150 : 90}px;bottom:${tablet ? 58 : 12}px;font-size:28px;color:#98b5aa;letter-spacing:.02em}
</style><div class="surface"></div><img class="symbol" src="${data(symbol, "image/svg+xml")}"><div class="copy"><h1><span>${first}</span><span class="accent">${second}</span></h1><p>${body}</p></div><img class="brand" src="${data(logo, "image/svg+xml")}"><div class="device"><div class="screen"><img src="${screen}">${tablet ? "" : '<div class="island"></div>'}</div></div>${showDetail ? `<div class="detail"><div class="caption">${locale === "en-US" ? "A closer look" : "细节放大"}</div><img src="${detail}"></div>` : ""}<div class="footer">clawmuse.com</div>`;
}

async function renderAll() {
  for (const locale of ["en-US", "zh-CN"]) {
    for (const [device, [width, height]] of Object.entries(sizes)) {
      const tablet = device === "ipad";
      const dir = path.join(output, locale, device);
      await mkdir(dir, { recursive: true });
      const view = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      for (const scene of scenes) {
        if (tablet && scene.id === "02-tests") continue;
        const capture = path.join(source, locale, device, `${scene.id}.png`);
        const metadata = await sharp(capture).metadata();
        const [first, second, body] = scene[locale === "en-US" ? "en" : "zh"];
        const screenWidth = tablet ? 1790 : 940;
        const screenHeight = Math.round((screenWidth * metadata.height) / metadata.width);
        const screen = data(
          await sharp(capture).resize(screenWidth, screenHeight).png().toBuffer(),
        );
        const crop = tablet ? scene.tabletCrop : scene.crop;
        const showDetail = tablet || ["03-files", "04-diff"].includes(scene.id);
        const tabletDetail =
          scene.id === "04-diff"
            ? { width: 880, top: 1580, left: 1040 }
            : { width: 1500, top: 1970, left: 282 };
        const detailLayout = tablet ? tabletDetail : { width: 1110, top: 1680, left: 105 };
        const detailWidth = detailLayout.width;
        const detailHeight = Math.round((detailWidth * crop[3]) / crop[2]);
        const detail = showDetail
          ? data(
              await sharp(capture)
                .extract({ left: crop[0], top: crop[1], width: crop[2], height: crop[3] })
                .resize(detailWidth, detailHeight)
                .png()
                .toBuffer(),
            )
          : "";
        const frameTop = tablet ? 790 : 735;
        const frameLeft = Math.round((width - screenWidth - 36) / 2);
        const detailTop = detailLayout.top;
        const detailLeft = detailLayout.left;
        const html = panelHtml({
          width,
          height,
          tablet,
          first,
          second,
          body,
          frameLeft,
          frameTop,
          screenWidth,
          screenHeight,
          detailLeft,
          detailTop,
          detailWidth,
          locale,
          screen,
          showDetail,
          detail,
        });
        await view.setContent(html);
        await view.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([...document.images].map((img) => img.decode()));
        });
        const valid = await view.evaluate(() => {
          const h = document.querySelector("h1");
          const p = document.querySelector("p");
          return (
            Math.abs(h.clientHeight / parseFloat(getComputedStyle(h).lineHeight) - 2) < 0.05 &&
            p.scrollWidth <= p.clientWidth &&
            [...document.querySelectorAll("h1 span")].every((s) => s.scrollWidth <= s.clientWidth)
          );
        });
        if (!valid) throw new Error(`Text overflow: ${locale}/${device}/${scene.id}`);
        const file = path.join(dir, `${scene.id}.png`);
        await sharp(await view.screenshot())
          .removeAlpha()
          .png()
          .toFile(file);
        exports.push({
          file: path.relative(output, file),
          width,
          height,
          source: path.relative(repo, capture),
        });
        console.log(path.relative(repo, file));
      }
      await view.close();
    }
  }
}
try {
  await renderAll();
} finally {
  await browser.close();
}
for (const locale of ["en-US", "zh-CN"]) {
  const items = [];
  let top = 30;
  for (const device of Object.keys(sizes)) {
    let left = 30;
    let rowHeight = 0;
    for (const item of exports.filter((e) => e.file.startsWith(`${locale}/${device}/`))) {
      const w = device === "ipad" ? 420 : 330;
      const h = Math.round((w * item.height) / item.width);
      items.push({
        input: await sharp(path.join(output, item.file)).resize(w, h).toBuffer(),
        left,
        top,
      });
      left += w + 25;
      rowHeight = Math.max(rowHeight, h);
    }
    top += rowHeight + 30;
  }
  await sharp({ create: { width: 1450, height: top, channels: 3, background: "#edf3ef" } })
    .composite(items)
    .png()
    .toFile(path.join(output, `preview-${locale}.png`));
}
await writeFile(
  path.join(output, "manifest.json"),
  JSON.stringify(
    {
      brand: "ClawMuse",
      captureVersion: manifest.appVersion,
      capturedAt: manifest.capturedAt,
      renderedAt: new Date().toISOString(),
      note: manifest.note,
      daemonVersion: manifest.daemonVersion,
      scenario: manifest.scenario,
      scriptedConversation: true,
      exports,
    },
    null,
    2,
  ),
);
await writeFile(
  path.join(output, "preview.html"),
  `<!doctype html><meta charset="utf-8"><title>ClawMuse screenshots</title><style>body{background:#081615;color:#eff7f2;font:20px system-ui;margin:40px}img{max-width:100%;display:block;margin:24px 0}a{color:#6ee7b7}</style><h1>ClawMuse · App Store screenshots</h1><p>iPhone / iPad · English / 简体中文</p><img src="preview-en-US.png"><img src="preview-zh-CN.png">${exports.map((e) => `<a href="${e.file}">${e.file}</a><br>`).join("")}`,
);
const archive = path.join(output, "ClawMuse-AppStore-screenshots.zip");
await rm(archive, { force: true });
execFileSync("zip", ["-q", archive, ...exports.map((item) => item.file), "manifest.json"], {
  cwd: output,
});
