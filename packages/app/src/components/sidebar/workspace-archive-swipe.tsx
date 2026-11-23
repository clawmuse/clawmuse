import type { ReactNode } from "react";

export type WorkspaceArchiveSwipeAction = () => void | boolean | Promise<boolean>;

export function WorkspaceArchiveSwipe({
  children,
  disabled: _disabled,
  onArchive: _onArchive,
}: {
  children: ReactNode;
  disabled?: boolean;
  onArchive: WorkspaceArchiveSwipeAction;
}) {
  return children;
}
