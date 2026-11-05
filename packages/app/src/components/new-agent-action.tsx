import { useTranslation } from "react-i18next";
import { SquarePen } from "lucide-react-native";
import { FloatingActionButton } from "@/components/ui/floating-action-button";
import { useOpenNewWorkspace } from "@/hooks/use-open-new-workspace";

export function NewAgentAction({
  onBeforeNavigate,
  testID,
}: {
  onBeforeNavigate?: () => void;
  testID: string;
}) {
  const { t } = useTranslation();
  const openNewWorkspace = useOpenNewWorkspace(onBeforeNavigate);
  const label = t("workspace.header.actions.newAgent");

  return (
    <FloatingActionButton
      compact
      icon={SquarePen}
      accessibilityLabel={label}
      onPress={openNewWorkspace}
      testID={testID}
    />
  );
}
