import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { MAX_FRAME_BYTES } from "../shared/contracts.js";

export function compressFrame(png: Buffer, maxEdge = 960, quality = 65) {
  if (png.length > 16 * 1024 * 1024) throw new Error("截图字节超过上限");
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (png.length < 24 || !png.subarray(0, 8).equals(signature)) throw new Error("截图格式无效");
  const screenWidth = png.readUInt32BE(16);
  const screenHeight = png.readUInt32BE(20);
  if (
    !screenWidth ||
    !screenHeight ||
    screenWidth > 4096 ||
    screenHeight > 4096 ||
    screenWidth * screenHeight > 12_000_000
  )
    throw new Error("截图像素超过上限");
  const decoded = PNG.sync.read(png, { checkCRC: true });
  let edge = maxEdge;
  for (let attempt = 0; attempt < 4; attempt++) {
    const scale = Math.min(1, edge / Math.max(screenWidth, screenHeight));
    const width = Math.max(1, Math.round(screenWidth * scale));
    const height = Math.max(1, Math.round(screenHeight * scale));
    const data = Buffer.alloc(width * height * 4);
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const source =
          (Math.min(screenHeight - 1, Math.floor(row / scale)) * screenWidth +
            Math.min(screenWidth - 1, Math.floor(column / scale))) *
          4;
        decoded.data.copy(data, (row * width + column) * 4, source, source + 4);
      }
    }
    const encoded = jpeg.encode({ data, width, height }, quality).data;
    if (encoded.length <= MAX_FRAME_BYTES)
      return { base64: encoded.toString("base64"), width, height, screenWidth, screenHeight };
    edge = Math.floor(edge * 0.7);
  }
  throw new Error("截图字节超过上限");
}
