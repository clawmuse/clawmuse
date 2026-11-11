import { useEffect, useRef, useState } from "react";
import type { AttachmentMetadata } from "@/attachments/types";
import { releaseAttachmentPreviewUrl, resolveAttachmentPreviewUrl } from "@/attachments/service";

export type AttachmentPreviewUrlState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "missing" }
  | { status: "error" };

export function useAttachmentPreviewUrl(
  attachment: AttachmentMetadata | null | undefined,
): AttachmentPreviewUrlState {
  const [state, setState] = useState<AttachmentPreviewUrlState>({ status: "idle" });
  const activeAttachmentRef = useRef<AttachmentMetadata | null>(null);
  const attachmentRef = useRef(attachment);
  attachmentRef.current = attachment;

  const id = attachment?.id;
  const storageType = attachment?.storageType;
  const storageKey = attachment?.storageKey;
  const mimeType = attachment?.mimeType;

  useEffect(() => {
    let disposed = false;
    let currentUrl: string | null = null;
    const current = attachmentRef.current;

    activeAttachmentRef.current = current ?? null;
    if (!current) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });

    void (async () => {
      try {
        const resolved = await resolveAttachmentPreviewUrl(current);
        if (disposed) {
          await releaseAttachmentPreviewUrl({ attachment: current, url: resolved });
          return;
        }
        currentUrl = resolved;
        setState({ status: "ready", url: resolved });
      } catch (error) {
        // Attachment-gone is a normal outcome — an old message can outlive the blob it
        // pointed at, and the row just renders without a preview. Anything else is real.
        const isMissing =
          error instanceof Error && /was not found|not found in/i.test(error.message);
        if (!disposed) {
          setState(isMissing ? { status: "missing" } : { status: "error" });
        }
        if (!isMissing) {
          console.error("[attachments] Failed to resolve preview URL", {
            attachmentId: current.id,
            error: error instanceof Error ? { name: error.name, message: error.message } : error,
          });
        }
      }
    })();

    return () => {
      disposed = true;
      const activeAttachment = activeAttachmentRef.current;
      if (!currentUrl || !activeAttachment) {
        return;
      }
      void releaseAttachmentPreviewUrl({
        attachment: activeAttachment,
        url: currentUrl,
      });
    };
  }, [id, storageType, storageKey, mimeType]);

  return state;
}
