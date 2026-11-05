import type { ReactNode } from "react";

export function WorkspaceArchiveSwipe({
  children,
  disabled: _disabled,
  onArchive: _onArchive,
}: {
  children: ReactNode;
  disabled?: boolean;
  onArchive: () => void;
}) {
  return children;
}
