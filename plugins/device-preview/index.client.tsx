import type { PluginClientContext } from "@getpaseo/plugin/client";
import { DevicePreviewPanel } from "./client/panel.js";

export default function contribute(client: PluginClientContext) {
  const removePanel = client.addWorkspacePanel({
    id: "preview",
    title: "设备预览",
    icon: "Smartphone",
    Component: DevicePreviewPanel,
  });
  const removeCommand = client.addCommandCenterItem({
    id: "open-preview",
    title: "打开设备预览",
    icon: "Smartphone",
    context: "workspace",
    keywords: ["device", "simulator", "emulator", "模拟器"],
    onSelect({ openPanel }) {
      openPanel("preview");
    },
  });
  return () => {
    removeCommand();
    removePanel();
  };
}
