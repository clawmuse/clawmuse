import { resolveRasterImageMimeType } from "@/attachments/file-types";
import type { PickedImageAttachmentInput } from "@/hooks/image-attachment-picker";

export interface RecentPhotoAssetLike {
  /** `ph://` on iOS, `file://` on Android. Renders directly in an `Image`. */
  uri: string;
  /** File-scheme URI from `getAssetInfoAsync`; the attachable form on iOS. */
  localUri?: string | null;
  filename?: string | null;
}

export interface ReadyRecentPhoto {
  picked: PickedImageAttachmentInput;
  previewUri: string;
}

export type RecentPhotoRow =
  | { state: "hidden" }
  | { state: "placeholder" }
  | { state: "loading" }
  | ({ state: "ready" } & ReadyRecentPhoto);

export type RecentPhotoPermissionStatus =
  | "unavailable"
  | "undetermined"
  | "denied"
  | "granted"
  /** iOS "Select Photos" access: reading the library re-prompts, so fetch lazily. */
  | "limited";

export interface UseRecentPhotoResult {
  /** Menu row model for the latest photo-library photo; `hidden` where there is none. */
  row: RecentPhotoRow;
  /**
   * Latest photo as composer input, requesting photo-library permission when undetermined.
   * Null when attaching isn't possible — callers fall back to the regular image picker.
   */
  takeRecentPhoto: () => Promise<PickedImageAttachmentInput | null>;
}

/** Maps a photo-library asset onto the composer's picked-image input, or null if unattachable. */
export function resolveRecentPhoto(asset: RecentPhotoAssetLike): ReadyRecentPhoto | null {
  const fileName = asset.filename ?? null;
  const mimeType = resolveRasterImageMimeType({ path: fileName ?? asset.uri });
  if (!mimeType) return null;
  // iOS `ph://` URIs don't survive the attachment persister; only a file scheme does.
  const attachableUri = asset.localUri ?? (asset.uri.startsWith("file://") ? asset.uri : null);
  if (!attachableUri) return null;
  return {
    picked: { source: { kind: "file_uri", uri: attachableUri }, mimeType, fileName },
    previewUri: asset.uri,
  };
}

export function toRecentPhotoRow(input: {
  /** False on web and the F-Droid build, which ships without the media-library module. */
  mediaLibraryAvailable: boolean;
  permission: RecentPhotoPermissionStatus;
  latestAsset: RecentPhotoAssetLike | null;
}): RecentPhotoRow {
  if (!input.mediaLibraryAvailable || input.permission === "unavailable") {
    return { state: "hidden" };
  }
  // Without permission the row is a discoverable placeholder: tapping requests it, and a
  // refusal falls back to the regular picker, so the row never dead-ends. Under iOS
  // limited access the thumbnail stays hidden too — fetching it at mount makes the OS
  // re-prompt; the tap path still attaches the latest selected photo.
  if (input.permission !== "granted") return { state: "placeholder" };
  if (!input.latestAsset) return { state: "loading" };
  const ready = resolveRecentPhoto(input.latestAsset);
  return ready ? { state: "ready", ...ready } : { state: "placeholder" };
}
