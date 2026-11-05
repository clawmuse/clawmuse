import { expect, test } from "vitest";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";
import { MAX_FRAME_BYTES } from "../shared/contracts.js";
import { compressFrame } from "./image.js";

test("a noisy screenshot is a bounded JPEG with original input dimensions retained", () => {
  const width = 1080;
  const height = 1920;
  const data = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) {
    data[offset] = offset % 251;
    data[offset + 1] = (offset * 31) % 253;
    data[offset + 2] = (offset * 47) % 255;
    data[offset + 3] = 255;
  }
  const png = PNG.sync.write({ width, height, data });
  const result = compressFrame(png);
  const bytes = Buffer.from(result.base64, "base64");
  expect(bytes.length).toBeLessThanOrEqual(MAX_FRAME_BYTES);
  expect(result).toMatchObject({
    screenWidth: width,
    screenHeight: height,
    width: 540,
    height: 960,
  });
  const decoded = jpeg.decode(bytes, { useTArray: true });
  expect([decoded.width, decoded.height]).toEqual([540, 960]);
});

test("invalid formats and oversized headers are refused before decoding", () => {
  expect(() => compressFrame(Buffer.from("not a screenshot"))).toThrow("格式");
  const png = PNG.sync.write({ width: 1, height: 1, data: Buffer.alloc(4) });
  png.writeUInt32BE(99999, 16);
  expect(() => compressFrame(png)).toThrow("像素");
});
