# ClawMuse 矢量素材 · V2

CM 的 C、M 共用顶线 y=12、底线 y=52，笔画宽度均为 8。
加上圆头后，两字的可见高度均为 48。字间保留 4 单位净空。
ClawMuse 品牌字由 8 个独立路径绘制，不依赖安装字体。

- `clawmuse-symbol.svg`：薄荷色 CM，透明背景。
- `clawmuse-symbol-ink.svg`：深墨色 CM，适合亮色背景。
- `clawmuse-wordmark.svg`：深墨色品牌字，透明背景。
- `clawmuse-wordmark-light.svg`：浅色品牌字，适合暗色背景。
- `clawmuse-lockup.svg`：深色横向组合标识。
- `clawmuse-lockup-light.svg`：薄荷图标与浅色品牌字组合。
- `clawmuse-mark.svg`：圆角方形应用图标。
- `cm-original.svg`：此前版本，保留作对照。
- `preview.svg` / `preview.png`：深浅背景预览。
- `identity.json`：网站共用的路径数据。

将 SVG 拖入 Figma、Illustrator、Sketch 或 Inkscape 即可编辑。图标中的 C、M 和品牌字的每个字母都有独立路径；组合标识按图标与品牌字分组。

素材保留中心线描边，方便调整弧度、节点、粗细和字距。定稿后可在设计软件中将描边转为轮廓。请等比例缩放；改变颜色只需修改描边颜色。

网站使用 `packages/website/clawmuse/identity.json` 作为几何源文件。修改该文件后运行 `npm run brand:clawmuse -w @getpaseo/website`，会同步导出 SVG 和社交分享图；生产构建也会自动生成。
