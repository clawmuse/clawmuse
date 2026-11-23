import { describe, expect, it } from "vitest";
import { droppedItemsToPickedImages, droppedItemsToSelectedFiles } from "./drop";

describe("composer dropped attachments", () => {
  it("extracts raster images from both web files and desktop paths in drop order", () => {
    const jsonFile = new File([JSON.stringify({ ok: true })], "config.json", {
      type: "application/json",
    });
    const firstImage = new File([new Uint8Array([1])], "first.png", { type: "image/png" });
    const secondImage = new File([new Uint8Array([2])], "second.jpg", { type: "image/jpeg" });
    const desktopImage = "C:\\Users\\alice\\third.webp";

    const images = droppedItemsToPickedImages([
      { kind: "web-file", file: firstImage },
      { kind: "web-file", file: jsonFile },
      { kind: "web-file", file: secondImage },
      { kind: "desktop-path", path: desktopImage },
    ]);

    expect(images).toEqual([
      { source: { kind: "blob", blob: firstImage }, mimeType: "image/png", fileName: "first.png" },
      {
        source: { kind: "blob", blob: secondImage },
        mimeType: "image/jpeg",
        fileName: "second.jpg",
      },
      {
        source: { kind: "file_uri", uri: desktopImage },
        mimeType: "image/webp",
        fileName: "third.webp",
      },
    ]);
  });
  it("turns non-image browser files into selected files and leaves raster images for image handling", async () => {
    const jsonFile = new File([JSON.stringify({ ok: true })], "config.json", {
      type: "application/json",
    });
    const imageFile = new File([new Uint8Array([0])], "screen.png", { type: "image/png" });

    const files = droppedItemsToSelectedFiles([
      { kind: "web-file", file: jsonFile },
      { kind: "web-file", file: imageFile },
    ]);

    expect(files.map(({ fileName, mimeType }) => ({ fileName, mimeType }))).toEqual([
      { fileName: "config.json", mimeType: "application/json" },
    ]);
    expect(await files[0]?.readBytes()).toEqual(new Uint8Array(await jsonFile.arrayBuffer()));
  });

  it("reads desktop paths lazily and leaves raster images for image handling", async () => {
    const windowsPath = "C:\\Users\\alice\\config.json";
    const posixPath = "/Users/alice/notes/readme.txt";
    const imagePath = "C:\\Users\\alice\\screen.png";
    const bytesByPath = new Map([
      [windowsPath, new Uint8Array([1, 2, 3])],
      [posixPath, new Uint8Array([4, 5])],
    ]);
    const readPaths: string[] = [];

    const files = droppedItemsToSelectedFiles(
      [
        { kind: "desktop-path", path: windowsPath },
        { kind: "desktop-path", path: imagePath },
        { kind: "desktop-path", path: posixPath },
      ],
      {
        readDesktopFileBytes: async (path) => {
          readPaths.push(path);
          const bytes = bytesByPath.get(path);
          if (!bytes) {
            throw new Error(`Unexpected desktop read: ${path}`);
          }
          return bytes;
        },
      },
    );

    expect(files.map(({ fileName, mimeType }) => ({ fileName, mimeType }))).toEqual([
      { fileName: "config.json", mimeType: "application/octet-stream" },
      { fileName: "readme.txt", mimeType: "application/octet-stream" },
    ]);
    expect(readPaths).toEqual([]);

    expect(await files[0]?.readBytes()).toEqual(new Uint8Array([1, 2, 3]));
    expect(await files[1]?.readBytes()).toEqual(new Uint8Array([4, 5]));
    expect(readPaths).toEqual([windowsPath, posixPath]);
  });
});
