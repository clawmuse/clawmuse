import type { Preferences } from "../shared/settings.js";

export function isCapacityError(text: string): boolean {
  return /^(?:\[System Error\]\s*)?Selected model is at capacity\.(?:\s*Please try a different model\.)?\s*$/i.test(
    text.trim(),
  );
}

interface RetryPorts {
  settings(): Promise<Preferences | null>;
  schedule(callback: () => Promise<void>, milliseconds: number): () => void;
  available(agentId: string): Promise<boolean>;
  send(agentId: string, messageId: string): Promise<void>;
  notice(agentId: string, text: string): Promise<void>;
  report(error: unknown): void;
}

interface Job {
  attempts: number;
  phase: "checking" | "waiting" | "sent";
  cancel(): void;
  messageId: string | null;
  turnId: string | null;
}

export function createRetry(ports: RetryPorts) {
  const jobs = new Map<string, Job>();
  let disposed = false;
  let sequence = 0;

  function cancel(agentId: string) {
    jobs.get(agentId)?.cancel();
    jobs.delete(agentId);
  }

  function clear() {
    for (const agentId of jobs.keys()) cancel(agentId);
  }

  function stop(agentId: string) {
    if (!jobs.has(agentId)) return;
    cancel(agentId);
    void ports.notice(agentId, "自动重试已停止。").catch(ports.report);
  }

  async function ended(
    agentId: string,
    turnId: string | null,
    inspect: () => Promise<boolean>,
    canceled: boolean,
  ) {
    if (disposed) return;
    if (canceled) {
      stop(agentId);
      return;
    }
    const previous = jobs.get(agentId);
    if (previous && (previous.phase !== "sent" || (turnId !== null && previous.turnId === turnId)))
      return;
    const job: Job = previous ?? {
      attempts: 0,
      phase: "checking",
      cancel() {},
      messageId: null,
      turnId: null,
    };
    job.phase = "checking";
    job.turnId = turnId;
    jobs.set(agentId, job);
    try {
      const capacity = await inspect();
      if (jobs.get(agentId) !== job) return;
      if (!capacity) {
        cancel(agentId);
        if (job.attempts > 0)
          await ports.notice(
            agentId,
            `容量重试已结束（已重试 ${job.attempts} 次），请查看本轮结果。`,
          );
        return;
      }
      const settings = await ports.settings();
      if (jobs.get(agentId) !== job) return;
      if (!settings) {
        cancel(agentId);
        await ports.notice(agentId, "自动重试已停止：设置无效，请打开插件设置修正。");
        return;
      }
      if (job.attempts >= settings.maxRetries) {
        cancel(agentId);
        await ports.notice(
          agentId,
          `模型仍处于满载状态，已用完 ${job.attempts} 次自动重试。请稍后重试或更换模型。`,
        );
        return;
      }
      await ports.notice(
        agentId,
        `模型满载，${settings.intervalSeconds} 秒后自动重试（${job.attempts + 1}/${settings.maxRetries}）。`,
      );
      if (jobs.get(agentId) !== job) return;
      job.phase = "waiting";
      job.cancel = ports.schedule(async () => {
        try {
          const available = await ports.available(agentId);
          if (jobs.get(agentId) !== job) return;
          if (!available) {
            stop(agentId);
            return;
          }
          job.attempts++;
          job.phase = "sent";
          job.messageId = `capacity-retry-${Date.now()}-${++sequence}`;
          await ports.send(agentId, job.messageId);
        } catch (error) {
          cancel(agentId);
          ports.report(error);
          await ports.notice(agentId, "自动重试发送失败，已停止。请检查会话后手动重试。");
        }
      }, settings.intervalSeconds * 1000);
    } catch (error) {
      cancel(agentId);
      ports.report(error);
      await ports.notice(agentId, "自动重试检查失败，已停止。请检查会话后手动重试。");
    }
  }

  return {
    ended,
    cancel,
    clear,
    prompt(agentId: string, messageId: string | undefined) {
      const job = jobs.get(agentId);
      if (job && job.messageId !== messageId) stop(agentId);
    },
    dispose() {
      disposed = true;
      clear();
    },
  };
}
