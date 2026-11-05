import type { PluginServerContext } from "@getpaseo/plugin/server";
import {
  capabilitiesRpc,
  listRpc,
  startRpc,
  statusRpc,
  frameRpc,
  inputRpc,
  stopRpc,
} from "./shared/contracts.js";
import { LocalDeviceAdapter } from "./server/adapter.js";
import { DevicePreviewService } from "./server/service.js";

export default function contribute(server: PluginServerContext) {
  const service = new DevicePreviewService(new LocalDeviceAdapter());
  server.handle(capabilitiesRpc, () => service.capabilities());
  server.handle(listRpc, ({ platform }) => service.list(platform));
  server.handle(startRpc, ({ platform, deviceId }) => service.start(platform, deviceId));
  server.handle(statusRpc, ({ operationId }) => service.status(operationId));
  server.handle(frameRpc, ({ operationId }) => service.frame(operationId));
  server.handle(inputRpc, ({ operationId, action }) => service.input(operationId, action));
  server.handle(stopRpc, ({ operationId }) => service.stop(operationId));
  return () => service.close();
}
