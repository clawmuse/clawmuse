import type { RpcInput, RpcOutput } from "@getpaseo/plugin";
import {
  startRpc,
  statusRpc,
  frameRpc,
  inputRpc,
  stopRpc,
  type DevicePlatform,
  type Action,
  type PreviewFrame,
} from "../shared/contracts.js";

interface PreviewRpc {
  start(input: RpcInput<typeof startRpc>): Promise<RpcOutput<typeof startRpc>>;
  status(input: RpcInput<typeof statusRpc>): Promise<RpcOutput<typeof statusRpc>>;
  frame(input: RpcInput<typeof frameRpc>): Promise<RpcOutput<typeof frameRpc>>;
  input(input: RpcInput<typeof inputRpc>): Promise<RpcOutput<typeof inputRpc>>;
  stop(input: RpcInput<typeof stopRpc>): Promise<RpcOutput<typeof stopRpc>>;
}
export interface SessionSnapshot {
  phase: "idle" | "preparing" | "ready" | "stopped" | "failed";
  message: string;
  image: PreviewFrame["image"];
  error: string;
  inputPending: boolean;
}

export class PreviewSession {
  private snapshot: SessionSnapshot = {
    phase: "idle",
    message: "选择当前主机上的模拟器",
    image: null,
    error: "",
    inputPending: false,
  };
  private readonly listeners = new Set<() => void>();
  private generation = 0;
  private operationId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(private readonly rpc: PreviewRpc) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(patch: Partial<SessionSnapshot>) {
    if (this.closed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener();
  }

  async connect(platform: DevicePlatform, deviceId: string) {
    const stopping = this.stop();
    const generation = this.generation;
    await stopping;
    if (this.closed || generation !== this.generation) return;
    this.update({ phase: "preparing", message: "正在准备设备", image: null, error: "" });
    try {
      const operation = await this.rpc.start({ platform, deviceId });
      if (generation !== this.generation || this.closed) {
        await this.rpc.stop({ operationId: operation.operationId });
        return;
      }
      this.operationId = operation.operationId;
      void this.poll(generation, operation.operationId);
    } catch {
      if (generation === this.generation)
        this.update({ phase: "failed", error: "无法开始预览。请刷新列表，检查设备是否被占用。" });
    }
  }

  private async poll(generation: number, operationId: string) {
    try {
      if (this.snapshot.phase === "preparing") await this.rpc.status({ operationId });
      if (generation !== this.generation || this.closed) return;
      const frame = await this.rpc.frame({ operationId });
      if (generation !== this.generation || this.closed) return;
      this.update({
        phase: frame.phase,
        message: frame.message,
        image: frame.image ?? this.snapshot.image,
      });
      if (frame.phase === "stopped" || frame.phase === "failed") {
        this.operationId = null;
        return;
      }
    } catch {
      if (generation !== this.generation || this.closed) return;
      this.update({ phase: "failed", error: "预览连接中断，请停止后刷新重试。" });
      return;
    }
    this.timer = setTimeout(() => {
      void this.poll(generation, operationId);
    }, 750);
  }

  async input(action: Action) {
    const operationId = this.operationId;
    if (!operationId || this.snapshot.phase !== "ready" || this.snapshot.inputPending) return;
    const generation = this.generation;
    this.update({ inputPending: true, error: "" });
    try {
      await this.rpc.input({ operationId, action });
      if (generation === this.generation) this.update({ message: "操作已发送" });
    } catch {
      if (generation === this.generation)
        this.update({ error: "操作失败，请检查设备状态后重试。" });
    } finally {
      if (generation === this.generation) this.update({ inputPending: false });
    }
  }

  async stop() {
    const generation = ++this.generation;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const operationId = this.operationId;
    this.operationId = null;
    this.update({
      phase: "stopped",
      message: "预览已停止，模拟器继续运行",
      image: null,
      inputPending: false,
    });
    if (!operationId) return;
    try {
      await this.rpc.stop({ operationId });
    } catch {
      if (generation === this.generation)
        this.update({ error: "停止请求未确认；不再轮询后，占用会在 30 秒内释放。" });
    }
  }

  close() {
    this.closed = true;
    void this.stop();
    this.listeners.clear();
  }
}
