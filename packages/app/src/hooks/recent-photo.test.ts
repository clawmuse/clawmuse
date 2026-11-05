import { describe, expect, it } from "vitest";
import { resolveRecentPhoto, toRecentPhotoRow } from "./recent-photo";

describe("resolveRecentPhoto", () => {
  it("attaches an Android file-scheme asset directly", () => {
    expect(
      resolveRecentPhoto({
        uri: "file:///storage/emulated/0/DCIM/IMG_0012.jpg",
        filename: "IMG_0012.jpg",
      }),
    ).toEqual({
      picked: {
        source: { kind: "file_uri", uri: "file:///storage/emulated/0/DCIM/IMG_0012.jpg" },
        mimeType: "image/jpeg",
        fileName: "IMG_0012.jpg",
      },
      previewUri: "file:///storage/emulated/0/DCIM/IMG_0012.jpg",
    });
  });

  it("swaps an iOS ph:// uri for the asset-info localUri", () => {
    const result = resolveRecentPhoto({
      uri: "ph://AB123",
      localUri: "file:///tmp/AB123.png",
      filename: "Screenshot.png",
    });
    expect(result?.picked.source).toEqual({ kind: "file_uri", uri: "file:///tmp/AB123.png" });
    expect(result?.previewUri).toBe("ph://AB123");
  });

  it("rejects a ph:// asset without a localUri", () => {
    expect(resolveRecentPhoto({ uri: "ph://AB123", filename: "IMG_0001.heic" })).toBeNull();
  });

  it("rejects assets whose filename resolves to no raster mime type", () => {
    expect(resolveRecentPhoto({ uri: "file:///vid.mp4", filename: "vid.mp4" })).toBeNull();
  });

  it("derives the mime type from the uri when the filename is missing", () => {
    expect(resolveRecentPhoto({ uri: "file:///DCIM/pic.webp" })?.picked.mimeType).toBe(
      "image/webp",
    );
  });
});

describe("toRecentPhotoRow", () => {
  it("hides the row when the media library is unavailable", () => {
    expect(
      toRecentPhotoRow({ mediaLibraryAvailable: false, permission: "granted", latestAsset: null }),
    ).toEqual({ state: "hidden" });
    expect(
      toRecentPhotoRow({
        mediaLibraryAvailable: true,
        permission: "unavailable",
        latestAsset: null,
      }),
    ).toEqual({ state: "hidden" });
  });

  it("shows a placeholder while permission is not granted", () => {
    for (const permission of ["undetermined", "denied", "limited"] as const) {
      expect(
        toRecentPhotoRow({ mediaLibraryAvailable: true, permission, latestAsset: null }),
      ).toEqual({ state: "placeholder" });
    }
  });

  it("loads while permission is granted but the asset is not read yet", () => {
    expect(
      toRecentPhotoRow({ mediaLibraryAvailable: true, permission: "granted", latestAsset: null }),
    ).toEqual({ state: "loading" });
  });

  it("is ready with the resolved photo when the latest asset attaches", () => {
    const asset = { uri: "file:///DCIM/last.jpg", filename: "last.jpg" };
    expect(
      toRecentPhotoRow({ mediaLibraryAvailable: true, permission: "granted", latestAsset: asset }),
    ).toEqual({
      state: "ready",
      picked: {
        source: { kind: "file_uri", uri: "file:///DCIM/last.jpg" },
        mimeType: "image/jpeg",
        fileName: "last.jpg",
      },
      previewUri: "file:///DCIM/last.jpg",
    });
  });

  it("falls back to a placeholder when the latest asset cannot attach", () => {
    expect(
      toRecentPhotoRow({
        mediaLibraryAvailable: true,
        permission: "granted",
        latestAsset: { uri: "file:///clip.mov", filename: "clip.mov" },
      }),
    ).toEqual({ state: "placeholder" });
  });
});
