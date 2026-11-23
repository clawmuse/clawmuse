import { retainAttachmentForGarbageCollection } from "@/attachments/gc-retention";
import type { AttachmentMetadata } from "@/attachments/types";
import { deleteAttachments, persistAttachmentFromBlob } from "@/attachments/service";
import { resolveRasterImageMimeType } from "@/attachments/file-types";

export interface ClipboardItemLike {
  kind?: string;
  type?: string;
  getAsFile?: () => File | null;
}

export interface ClipboardDataLike {
  items?: ArrayLike<ClipboardItemLike> | null;
}

export type ImageAttachmentFromFile = AttachmentMetadata;

export interface ClipboardImageFile {
  file: File;
  mimeType: string;
}

export function collectImageFilesFromClipboardData(
  clipboardData?: ClipboardDataLike | null,
): ClipboardImageFile[] {
  if (!clipboardData?.items) {
    return [];
  }

  const files: ClipboardImageFile[] = [];
  for (const item of Array.from(clipboardData.items)) {
    if (item?.kind !== "file") {
      continue;
    }
    const mimeType = resolveRasterImageMimeType({ mimeType: item.type });
    if (!mimeType) {
      continue;
    }
    const file = item.getAsFile?.();
    if (!file) {
      continue;
    }
    files.push({ file, mimeType });
  }

  return files;
}

export async function filesToImageAttachments(
  files: readonly ClipboardImageFile[],
): Promise<ImageAttachmentFromFile[]> {
  const saved: ImageAttachmentFromFile[] = [];
  const releases: Array<() => void> = [];
  try {
    return await Promise.all(
      files.map(async ({ file, mimeType }) => {
        const attachment = await persistAttachmentFromBlob({
          blob: file,
          mimeType,
          fileName: file.name,
        });
        releases.push(retainAttachmentForGarbageCollection(attachment.id));
        saved.push(attachment);
        return attachment;
      }),
    );
  } catch (error) {
    for (const release of releases) release();
    releases.length = 0;
    await deleteAttachments(saved);
    throw error;
  } finally {
    for (const release of releases) release();
  }
}
