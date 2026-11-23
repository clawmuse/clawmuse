import type { WorkspaceFileDragPayload } from "@/attachments/workspace-file-drag";

export interface DroppedFileItem {
  kind: "web-file";
  file: File;
}
export interface DroppedPathItem {
  kind: "desktop-path";
  path: string;
}
export type DroppedItem = DroppedFileItem | DroppedPathItem;

/**
 * What a consumer (e.g. a composer) registers to receive files dropped onto the
 * surrounding FileDropZone. Every dropped file or path arrives via `onGenericFiles`.
 */
export interface FileDropSink {
  onGenericFiles?: (items: DroppedItem[]) => void;
  onWorkspaceFile?: (payload: WorkspaceFileDragPayload) => void;
}
