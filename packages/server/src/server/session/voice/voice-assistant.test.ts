import { createVoiceAssistantTaskHost } from "./voice-assistant-host.js";
import { matchesTaskBriefing } from "./task-review.js";
import { createAgentArchiveReview } from "../agent-archive-review.js";
import { buildStoredAgentPayload } from "../../agent/agent-projections.js";
import type { AgentSnapshotPayload } from "../../messages.js";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import {
  VoiceAssistant,
  type AssistantTask,
  type AssistantTaskDetail,
  type VoiceAssistantHost,
} from "./voice-assistant.js";
import type {
  StepRealtimeOptions,
  StepRealtimeEvent,
} from "../../speech/providers/stepfun/realtime.js";
import type { SessionOutboundMessage } from "../../messages.js";

const instances: VoiceAssistant[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  for (const instance of instances.splice(0)) instance.close();
  vi.useRealTimers();
});
const taskId = "11111111-1111-4111-8111-111111111111";
function setup(renewalMs?: number) {
  let tasks: AssistantTask[] = [{ id: taskId, title: "Build", status: "running", attention: null }];
  let listener = () => {};
  const connections: Array<{
    options: StepRealtimeOptions;
    send: ReturnType<typeof vi.fn>;
    appendAudio: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const output: SessionOutboundMessage[] = [];
  const host = {
    listTasks: vi.fn(async () => tasks),
    getTask: vi.fn(
      async (): Promise<AssistantTaskDetail> => ({
        ...tasks[0]!,
        id: taskId,
        updatedAt: "2026-10-31T10:00:00Z",
        revision: "review-1",
        lastMessage: "Completed the task and verified all results",
        recentActivity: "[User] Fix the task",
        lastUserMessage: "Fix the task",
        awaitingAgentReply: false,
        error: null,
        pendingPermissions: [],
        providerUnavailable: false,
      }),
    ),
    archiveTask: vi.fn<VoiceAssistantHost["archiveTask"]>(async () => ({
      agentId: taskId,
      archivedAt: "2026-10-31T11:00:00Z",
    })),
    subscribeTasks: (callback: () => void) => {
      listener = callback;
      return vi.fn();
    },
    createTask: vi.fn(async () => ({ id: taskId })),
    sendTaskMessage: vi.fn(async () => {}),
  };
  const failed = vi.fn();
  const logger = { info: vi.fn() };
  const assistant = new VoiceAssistant({
    config: {
      enabled: true,
      apiKey: "test",
      model: "test",
      voice: "test",
      baseUrl: "ws://localhost",
      maxSessionMinutes: 60,
    },
    host,
    anchorAgentId: taskId,
    emit: (m) => output.push(m),
    onFailure: failed,
    logger,
    renewalMs,
    createConnection: (options) => {
      const connection = {
        options,
        send: vi.fn(),
        appendAudio: vi.fn(),
        close: vi.fn(),
        connect: async () => {},
      };
      connections.push(connection);
      return connection;
    },
  });
  instances.push(assistant);
  return {
    assistant,
    start: async () => {
      await assistant.start();
      await vi.advanceTimersByTimeAsync(1);
      const reader = connections.at(-1)!;
      const request = reader.send.mock.calls.find(
        ([message]) => message.type === "conversation.item.create",
      )![0];
      reader.options.onEvent({
        type: "response.audio_transcript.done",
        response_id: "briefing",
        transcript: request.item.content[0].text,
      });
      reader.options.onEvent({
        type: "response.done",
        response: { id: "briefing", status: "completed" },
      });
      for (const connection of connections) connection.send.mockClear();
    },
    connections,
    output,
    host,
    failed,
    logger,
    event: (event: StepRealtimeEvent) =>
      connections
        .findLast(
          (connection) =>
            connection.options.tools.length > 0 && !connection.close.mock.calls.length,
        )!
        .options.onEvent(event),
    tasks: (next: AssistantTask[]) => {
      tasks = next;
      listener();
    },
  };
}
function response(id: string, callId?: string): StepRealtimeEvent {
  return {
    type: "response.done",
    response: {
      id,
      status: "completed",
      usage: { input_tokens: 10, output_tokens: 20 },
      output: callId
        ? [
            {
              type: "function_call",
              status: "completed",
              call_id: callId,
              name: "create_task",
              arguments: JSON.stringify({ title: "New task", prompt: "Implement and verify" }),
            },
          ]
        : [],
    },
  };
}
function speech(h: ReturnType<typeof setup>, id: string) {
  h.event({ type: "input_audio_buffer.speech_started" });
  h.event({ type: "input_audio_buffer.speech_stopped" });
  h.event({ type: "response.created", response: { id, status: "in_progress" } });
}

function textResponse(id: string, text: string): StepRealtimeEvent {
  return {
    type: "response.done",
    response: { id, status: "completed", output: [{ type: "message", content: [{ text }] }] },
  };
}

async function speakAnswer(h: ReturnType<typeof setup>, id: string, text: string, pcm = "AAAA") {
  h.event(textResponse(id, text));
  await vi.advanceTimersByTimeAsync(1);
  const speaker = h.connections.findLast(
    (c) => c.options.modalities?.includes("audio") && !c.close.mock.calls.length,
  )!;
  speaker.options.onEvent({
    type: "response.audio.delta",
    response_id: id + "-speech",
    item_id: id + "-audio",
    delta: pcm,
  });
  speaker.options.onEvent({
    type: "response.audio_transcript.done",
    response_id: id + "-speech",
    transcript: text,
  });
  speaker.options.onEvent(response(id + "-speech"));
}

test("tool decisions use text and a final answer starts with a short verified speech segment", async () => {
  const h = setup();
  await h.start();
  expect(h.connections[0]!.options.modalities).toEqual(["text"]);
  speech(h, "answer");
  const text = "接入已经成功。" + "后续可以在工作区查看具体的流量统计和验证结果。".repeat(15);
  h.event({
    type: "response.done",
    response: {
      id: "answer",
      status: "completed",
      output: [{ type: "message", content: [{ text }] }],
    },
  });
  await vi.advanceTimersByTimeAsync(1);
  const speaker = h.connections.at(-1)!;
  const request = speaker.send.mock.calls.find(([m]) => m.type === "conversation.item.create")![0];
  expect(request.item.content[0].text).toBe("接入已经成功。");
  expect(speaker.options.tools).toEqual([]);
  expect(h.output.filter((m) => m.type === "audio_output")).toEqual([]);
  speaker.options.onEvent({
    type: "response.audio.delta",
    response_id: "first",
    item_id: "first",
    delta: "AAAA",
  });
  speaker.options.onEvent({
    type: "response.audio_transcript.done",
    response_id: "first",
    transcript: "接入已经成功。",
  });
  speaker.options.onEvent(response("first"));
  expect(h.output.filter((m) => m.type === "audio_output")).toHaveLength(2);
  expect(h.failed).not.toHaveBeenCalled();
});

test("barge-in discards old audio and tool calls without stopping coding work", async () => {
  const h = setup();
  await h.start();
  speech(h, "old");
  h.event({ type: "response.audio.delta", response_id: "old", item_id: "audio", delta: "AAAA" });
  h.event({ type: "input_audio_buffer.speech_started" });
  h.event({ type: "response.audio.delta", response_id: "old", item_id: "audio", delta: "AAAA" });
  h.event(response("old", "call-old"));
  await vi.advanceTimersByTimeAsync(1);
  expect(h.output.filter((m) => m.type === "audio_output")).toHaveLength(0);
  expect(h.host.createTask).not.toHaveBeenCalled();
  expect(h.host.sendTaskMessage).not.toHaveBeenCalled();
  h.assistant.appendAudio(Buffer.alloc(320, 1).toString("base64"), "audio/pcm;rate=16000;bits=16");
  expect(h.connections[0]!.appendAudio).toHaveBeenCalledOnce();
  expect(h.connections[0]!.appendAudio.mock.calls[0]![0].length).toBeGreaterThan(320);
});

test("only completed user calls create tasks, with duplicate responses and calls ignored", async () => {
  const h = setup();
  await h.start();
  speech(h, "r1");
  h.event(response("r1", "c1"));
  h.event(response("r1", "c1"));
  await vi.advanceTimersByTimeAsync(1);
  expect(h.host.createTask).toHaveBeenCalledExactlyOnceWith(
    taskId,
    "New task",
    "Implement and verify",
  );
  speech(h, "r2");
  h.event(response("r2", "c1"));
  await vi.advanceTimersByTimeAsync(1);
  expect(h.host.createTask).toHaveBeenCalledOnce();
  expect(JSON.stringify(h.output)).toContain('"inputTokens":20');
});

test("reminders wait for playback, coalesce state changes, and cannot create tasks", async () => {
  const h = setup();
  await h.start();
  speech(h, "r1");
  await speakAnswer(h, "r1", "任务仍在进行中。");
  h.tasks([{ id: taskId, title: "Build", status: "idle", attention: "permission" }]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(h.connections[0]!.send).not.toHaveBeenCalled();
  expect(
    h.connections.at(-1)!.send.mock.calls.filter(([m]) => m.type === "response.create"),
  ).toHaveLength(1);
  for (const m of h.output) if (m.type === "audio_output") h.assistant.audioPlayed(m.payload.id);
  await vi.advanceTimersByTimeAsync(1);
  const sent = h.connections.at(-1)!.send.mock.calls;
  expect(sent.filter(([m]) => m.type === "response.create")).toHaveLength(2);
  h.connections.at(-1)!.options.onEvent(response("reminder", "injected"));
  await vi.advanceTimersByTimeAsync(1);
  expect(h.host.createTask).not.toHaveBeenCalled();
  expect(h.connections.at(-1)!.options.tools).toEqual([]);
});

test("resolved attention is removed before a queued reminder is spoken", async () => {
  const h = setup();
  await h.start();
  h.tasks([{ id: taskId, title: "Build", status: "idle", attention: "permission" }]);
  h.tasks([{ id: taskId, title: "Build", status: "running", attention: null }]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(h.connections[0]!.send).not.toHaveBeenCalled();
});

test("renewal keeps conversation context without replaying work and the duration cap ends only voice", async () => {
  const h = setup(1000);
  await h.start();
  h.event({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "请记住这个项目",
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(h.connections).toHaveLength(3);
  expect(h.connections[0]!.close).toHaveBeenCalledOnce();
  expect(h.connections.at(-1)!.options.instructions).toContain("请记住这个项目");
  expect(h.host.createTask).not.toHaveBeenCalled();
  h.assistant.close();
  const capped = setup();
  await capped.start();
  await vi.advanceTimersByTimeAsync(60 * 60_000);
  expect(capped.failed).toHaveBeenCalledOnce();
  expect(JSON.stringify(capped.output)).toContain("time limit reached");
  expect(capped.host.sendTaskMessage).not.toHaveBeenCalled();
});

test("slow tools do not block audio input and closing prevents late output", async () => {
  const h = setup();
  await h.start();
  let finish!: (value: { id: string }) => void;
  h.host.createTask.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  speech(h, "r1");
  h.event(response("r1", "c1"));
  await vi.advanceTimersByTimeAsync(1);
  h.assistant.appendAudio(Buffer.alloc(320).toString("base64"), "audio/pcm;rate=16000;bits=16");
  expect(h.connections[0]!.appendAudio).toHaveBeenCalledOnce();
  h.assistant.close();
  finish({ id: taskId });
  await vi.advanceTimersByTimeAsync(1);
  expect(h.connections[0]!.send).not.toHaveBeenCalled();
});

test("opening voice proactively requests a host-wide task briefing", async () => {
  const h = setup();
  await h.assistant.start();
  await vi.advanceTimersByTimeAsync(1);
  const sent = h.connections.at(-1)!.send.mock.calls.map(([message]) => message);
  expect(sent).toContainEqual({ type: "response.create" });
  expect(sent[0]).toMatchObject({
    type: "conversation.item.create",
    item: { type: "message", role: "user" },
  });
  expect(JSON.stringify(sent)).toContain("进行中：Build。");
  expect(h.host.listTasks).toHaveBeenCalledOnce();
});

test("burst audio waits for actual playback instead of overflowing the client's playback queue", async () => {
  const h = setup();
  await h.start();
  speech(h, "burst");
  const pcm = Buffer.alloc(24000 * 2 * 30);
  await speakAnswer(h, "burst", "这是任务结果。", pcm.toString("base64"));
  const initial = h.output.filter((message) => message.type === "audio_output");
  const initialBytes = initial.reduce(
    (total, message) => total + Buffer.from(message.payload.audio, "base64").length,
    0,
  );
  expect(initialBytes).toBeGreaterThan(0);
  expect(initialBytes).toBeLessThanOrEqual(24000 * 2 * 4);
  expect(h.failed).not.toHaveBeenCalled();
  h.assistant.appendAudio(Buffer.alloc(320).toString("base64"), "audio/pcm;rate=16000;bits=16");
  expect(h.connections[0]!.appendAudio).toHaveBeenCalledOnce();
  let playedBytes = 0;
  let index = 0;
  while (index < h.output.length) {
    const message = h.output[index++]!;
    if (message.type !== "audio_output") continue;
    playedBytes += Buffer.from(message.payload.audio, "base64").length;
    h.assistant.audioPlayed(message.payload.id);
  }
  expect(playedBytes).toBe(pcm.length);
  expect(h.output.at(-1)).toMatchObject({
    type: "audio_output",
    payload: { groupId: "burst-audio", audio: "", isLastChunk: true },
  });
});

test("tool follow-up proceeds without playing intermediate progress speech", async () => {
  const h = setup();
  await h.start();
  speech(h, "query");
  h.event({
    type: "response.audio.delta",
    response_id: "query",
    item_id: "query-audio",
    delta: Buffer.alloc(4800).toString("base64"),
  });
  await tool(h, "query", "list_tasks", {});
  expect(h.connections[0]!.send.mock.calls.map(([message]) => message.type)).toEqual([
    "conversation.item.create",
    "response.create",
  ]);
  expect(h.output.filter((message) => message.type === "audio_output")).toEqual([]);
});

test("does not play progress audio from a response that invokes a task tool", async () => {
  const h = setup();
  await h.start();
  speech(h, "query");
  h.event({
    type: "response.audio.delta",
    response_id: "query",
    item_id: "progress",
    delta: Buffer.alloc(4800).toString("base64"),
  });
  h.event({ type: "response.audio.done", response_id: "query", item_id: "progress" });
  h.event({ type: "response.audio_transcript.done", response_id: "query", transcript: "正在读取" });
  expect(h.output.filter((message) => message.type === "audio_output")).toEqual([]);
  await tool(h, "query", "list_tasks", {});
  expect(h.output.filter((message) => message.type === "audio_output")).toEqual([]);
  expect(JSON.stringify(h.output)).not.toContain("正在读取");
  h.event({ type: "response.created", response: { id: "answer", status: "in_progress" } });
  await speakAnswer(h, "answer", "任务还在运行。");
  const audio = h.output.filter((message) => message.type === "audio_output");
  expect(audio).toHaveLength(2);
  expect(audio[1]!.payload).toMatchObject({ audio: "", isLastChunk: true });
  expect(JSON.stringify(h.output)).toContain("任务还在运行。");
});

test("interrupting a buffered response discards every unsent audio chunk", async () => {
  const h = setup();
  await h.start();
  speech(h, "buffered");
  h.event(textResponse("buffered", "任务核对完成。"));
  await vi.advanceTimersByTimeAsync(1);
  const speaker = h.connections.at(-1)!;
  speaker.options.onEvent({
    type: "response.audio.delta",
    response_id: "buffered",
    item_id: "buffered-audio",
    delta: Buffer.alloc(24000 * 2 * 30).toString("base64"),
  });
  h.assistant.interrupt();
  const count = h.output.length;
  for (const message of h.output) {
    if (message.type === "audio_output") h.assistant.audioPlayed(message.payload.id);
  }
  expect(h.output).toHaveLength(count);
});

test("retries a standalone task-reading promise silently and stops if it repeats", async () => {
  const h = setup();
  await h.start();
  speech(h, "promise");
  function promise(id: string) {
    h.event({ type: "response.created", response: { id, status: "in_progress" } });
    h.event(textResponse(id, "现在读取剩余 idle 任务的最新对话。"));
  }
  promise("promise");
  expect(h.output.filter((message) => message.type === "audio_output")).toEqual([]);
  expect(JSON.stringify(h.output)).not.toContain("现在读取");
  expect(
    h.connections[0]!.send.mock.calls.filter(([m]) => m.type === "response.create"),
  ).toHaveLength(1);
  promise("promise-again");
  expect(h.output.filter((message) => message.type === "audio_output")).toEqual([]);
  expect(h.failed).toHaveBeenCalledOnce();
  expect(h.output.at(-2)).toMatchObject({
    type: "voice_input_state",
    payload: {
      assistantState: "connection_failed",
      assistantMessage:
        "语音助理未能取得查询结果，已停止本次语音。请重新开启后重试，编码任务继续运行。",
    },
  });
  expect(
    h.connections[0]!.send.mock.calls.filter(([m]) => m.type === "response.create"),
  ).toHaveLength(1);
});

test.each([
  "正在读取。",
  "好的，我先查询剩余空闲任务的状态，请稍等。",
  "接下来查看其他任务的最新回复。",
])("suppresses standalone progress from the completed response transcript: %s", async (text) => {
  const h = setup();
  await h.start();
  speech(h, "progress");
  h.event({
    type: "response.audio.delta",
    response_id: "progress",
    item_id: "progress",
    delta: "AAAA",
  });
  h.event({
    type: "response.done",
    response: {
      id: "progress",
      status: "completed",
      output: [{ type: "message", content: [{ transcript: text }] }],
    },
  });
  expect(h.output.filter((message) => message.type === "audio_output")).toEqual([]);
  expect(JSON.stringify(h.output)).not.toContain(text);
  await tool(h, "read-after-correction", "list_tasks", {});
  h.event({ type: "response.created", response: { id: "answer", status: "in_progress" } });
  await speakAnswer(h, "answer", "还有一个任务在进行中。");
  expect(h.output.filter((message) => message.type === "audio_output")).toHaveLength(2);
  expect(JSON.stringify(h.output)).toContain("还有一个任务在进行中。");
  expect(h.failed).not.toHaveBeenCalled();
});

test.each([
  "读取任务失败，请检查主机连接。",
  "你听到的“正在读取”是多余的过程播报。",
  "已读取三个任务，其中一个需要你确认。",
  "空闲表示当前没有执行任务，不代表任务已经完成。",
])("keeps actual results and explanations audible: %s", async (text) => {
  const h = setup();
  await h.start();
  speech(h, "answer");
  await speakAnswer(h, "answer", text);
  expect(h.output.filter((message) => message.type === "audio_output")).toHaveLength(2);
  expect(JSON.stringify(h.output)).toContain(text);
  expect(h.connections[0]!.send).not.toHaveBeenCalled();
});

test("a new spoken turn resets the silent correction and discards the old reply", async () => {
  const h = setup();
  await h.start();
  for (const id of ["first", "second"]) {
    speech(h, id);
    h.event(textResponse(id, "正在读取。"));
  }
  expect(h.failed).not.toHaveBeenCalled();
  expect(
    h.connections[0]!.send.mock.calls.filter(([m]) => m.type === "response.create"),
  ).toHaveLength(2);
  h.event({ type: "response.created", response: { id: "correction", status: "in_progress" } });
  h.event({
    type: "response.audio.delta",
    response_id: "correction",
    item_id: "correction",
    delta: "AAAA",
  });
  h.assistant.interrupt();
  h.event({
    type: "response.audio_transcript.done",
    response_id: "correction",
    transcript: "正在读取。",
  });
  h.event(response("correction"));
  expect(h.output.filter((message) => message.type === "audio_output")).toEqual([]);
  expect(h.failed).not.toHaveBeenCalled();
});

async function reviewResponse(h: ReturnType<typeof setup>, text: string) {
  const review = h.connections.findLast(
    (c) =>
      c.options.modalities?.length === 1 && !c.options.tools.length && !c.close.mock.calls.length,
  )!;
  review.options.onEvent(textResponse("review", text));
  await vi.advanceTimersByTimeAsync(1);
}

test("a fabricated spoken archive result is discarded before playback", async () => {
  const h = setup();
  h.tasks([{ id: taskId, title: "Choose navigation", status: "closed", attention: "finished" }]);
  await h.assistant.start();
  await vi.advanceTimersByTimeAsync(1);
  await reviewResponse(
    h,
    JSON.stringify({
      decision: "needs_user",
      completionEvidence: "",
      nextStep: "Choose top or bottom navigation.",
    }),
  );
  const text = "需要你决定：Choose navigation。Choose top or bottom navigation.";
  async function speak(id: string, transcript: string) {
    const speaker = h.connections.at(-1)!;
    speaker.options.onEvent({
      type: "response.audio.delta",
      response_id: id,
      item_id: id,
      delta: "AAAA",
    });
    speaker.options.onEvent({
      type: "response.audio_transcript.done",
      response_id: id,
      transcript,
    });
    speaker.options.onEvent(response(id));
    await vi.advanceTimersByTimeAsync(1);
  }
  await speak("invented", "已归档：Choose navigation。");
  expect(h.output.some((message) => message.type === "audio_output")).toBe(false);
  expect(h.host.archiveTask).not.toHaveBeenCalled();
  await speak("verified", "需要你决定：Choose navigation。");
  expect(h.output.filter((message) => message.type === "audio_output")).toHaveLength(2);
  expect(h.output).toContainEqual({
    type: "voice_input_state",
    payload: { isSpeaking: false, assistantMessage: text },
  });
});

test("briefing verification preserves task names and negation while ignoring spoken punctuation", () => {
  expect(matchesTaskBriefing("已归档：任务 A。", "已归档，任务A。")).toBe(true);
  expect(matchesTaskBriefing("未归档：任务 A。", "已归档：任务 A。")).toBe(false);
  expect(matchesTaskBriefing("已归档：任务 A。", "已归档：任务 B。")).toBe(false);
});

test("speaking during review closes only the review connection and ignores its late result", async () => {
  const h = setup();
  h.tasks([{ id: taskId, title: "Build", status: "closed", attention: "finished" }]);
  await h.assistant.start();
  await vi.advanceTimersByTimeAsync(1);
  const review = h.connections[1]!;
  h.connections[0]!.options.onEvent({ type: "input_audio_buffer.speech_started" });
  review.options.onEvent({
    type: "response.done",
    response: {
      id: "late-review",
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              text: JSON.stringify({
                decision: "completed",
                completionEvidence: "Completed the task",
                nextStep: null,
              }),
            },
          ],
        },
      ],
    },
  });
  await vi.advanceTimersByTimeAsync(1);
  expect(review.close).toHaveBeenCalledOnce();
  expect(h.connections[0]!.close).not.toHaveBeenCalled();
  expect(h.host.archiveTask).not.toHaveBeenCalled();
  h.assistant.appendAudio(Buffer.alloc(320).toString("base64"), "audio/pcm;rate=16000;bits=16");
  expect(h.connections[0]!.appendAudio).toHaveBeenCalledOnce();
});

test("automatic review archives only after a structured decision and broadcasts actual receipts", async () => {
  const h = setup();
  h.tasks([{ id: taskId, title: "Build", status: "closed", attention: "finished" }]);
  await h.assistant.start();
  await vi.advanceTimersByTimeAsync(1);
  expect(h.host.getTask).toHaveBeenCalledExactlyOnceWith(taskId);
  expect(h.connections[1]!.options).toMatchObject({ modalities: ["text"], tools: [] });
  h.assistant.appendAudio(Buffer.alloc(320).toString("base64"), "audio/pcm;rate=16000;bits=16");
  expect(h.connections[0]!.appendAudio).toHaveBeenCalledOnce();
  expect(h.connections[1]!.appendAudio).not.toHaveBeenCalled();
  await reviewResponse(
    h,
    JSON.stringify({
      decision: "completed",
      completionEvidence: "Completed the task and verified all results",
      nextStep: null,
    }),
  );
  expect(h.host.archiveTask).toHaveBeenCalledExactlyOnceWith(
    taskId,
    "review-1",
    "Completed the task and verified all results",
    expect.any(AbortSignal),
  );
  expect(h.output.filter((message) => message.type === "audio_output")).toEqual([]);
  const sent = JSON.stringify(h.connections.flatMap((connection) => connection.send.mock.calls));
  expect(sent).toContain("已归档：Build。");
});

test("a closed task awaiting a user decision stays visible after automatic review", async () => {
  const h = setup();
  h.tasks([{ id: taskId, title: "Choose navigation", status: "closed", attention: "finished" }]);
  const detail = await h.host.getTask();
  h.host.getTask.mockResolvedValue({
    ...detail,
    lastMessage: "Choose top or bottom navigation before I can continue.",
  });
  await h.assistant.start();
  await vi.advanceTimersByTimeAsync(1);
  await reviewResponse(
    h,
    JSON.stringify({
      decision: "needs_user",
      completionEvidence: "Choose top or bottom navigation before I can continue.",
      nextStep: "Choose top or bottom navigation.",
    }),
  );
  expect(h.host.archiveTask).not.toHaveBeenCalled();
  expect(
    JSON.stringify(h.connections.flatMap((connection) => connection.send.mock.calls)),
  ).toContain("需要你决定：Choose navigation。");
});

test.each(["malformed review", "archive refused", "missing completion quote"])(
  "%s never becomes a spoken archive success",
  async (failure) => {
    const h = setup();
    h.tasks([{ id: taskId, title: "Build", status: "closed", attention: "finished" }]);
    h.host.archiveTask.mockRejectedValueOnce(new Error("Task changed since review"));
    await h.assistant.start();
    await vi.advanceTimersByTimeAsync(1);
    const decision = JSON.stringify({
      decision: "completed",
      completionEvidence: failure === "missing completion quote" ? "" : "Completed the task",
      nextStep: "",
    });
    await reviewResponse(h, failure === "malformed review" ? "Both tasks were archived" : decision);
    const sent = JSON.stringify(h.connections.flatMap((connection) => connection.send.mock.calls));
    expect(sent).toContain("未能核对，保留任务：Build。");
    expect(sent).not.toContain("已归档：Build。");
    expect(
      h.output.some(
        (message) =>
          message.type === "voice_input_state" &&
          message.payload.assistantMessage === "Both tasks were archived",
      ),
    ).toBe(false);
  },
);

async function tool(
  h: ReturnType<typeof setup>,
  id: string,
  name: string,
  args: unknown,
  spoken = false,
) {
  if (spoken) speech(h, id);
  else h.event({ type: "response.created", response: { id, status: "in_progress" } });
  h.event({
    type: "response.done",
    response: {
      id,
      status: "completed",
      output: [
        {
          type: "function_call",
          status: "completed",
          call_id: id,
          name,
          arguments: JSON.stringify(args),
        },
      ],
    },
  });
  await vi.advanceTimersByTimeAsync(1);
}

test("stops a repeated task-read loop even when the model gives every call a new ID", async () => {
  const h = setup();
  await h.start();
  await tool(h, "read-1", "get_task", { agentId: taskId }, true);
  await tool(h, "read-2", "get_task", { agentId: taskId });
  await tool(h, "read-3", "get_task", { agentId: taskId });
  expect(h.failed).toHaveBeenCalledOnce();
  expect(h.host.getTask).toHaveBeenCalledTimes(3);
  expect(h.connections[0]!.close).toHaveBeenCalledOnce();
  expect(h.output.at(-2)).toMatchObject({
    type: "voice_input_state",
    payload: {
      assistantState: "connection_failed",
      assistantMessage: expect.stringContaining("重复查询相同任务"),
    },
  });
});

test("stops repeated directory polling with equivalent default arguments", async () => {
  const h = setup();
  await h.start();
  await tool(h, "list-1", "list_tasks", {}, true);
  await tool(h, "list-2", "list_tasks", { limit: 50, offset: 0 });
  await tool(h, "list-3", "list_tasks", { offset: 0 });
  expect(h.failed).toHaveBeenCalledOnce();
  expect(
    h.connections[0]!.send.mock.calls.filter(([m]) => m.type === "response.create"),
  ).toHaveLength(2);
});

test("allows new user queries and changed task results without treating them as a read loop", async () => {
  const h = setup();
  await h.start();
  await tool(h, "first", "get_task", { agentId: taskId }, true);
  await tool(h, "second", "get_task", { agentId: taskId });
  await tool(h, "new-question", "get_task", { agentId: taskId }, true);
  await tool(h, "new-question-check", "get_task", { agentId: taskId });
  const detail = await h.host.getTask();
  h.host.getTask.mockResolvedValue({ ...detail, revision: "changed", lastMessage: "New result" });
  await tool(h, "changed-task", "get_task", { agentId: taskId });
  expect(h.failed).not.toHaveBeenCalled();
  expect(
    h.connections[0]!.send.mock.calls.filter(([m]) => m.type === "response.create"),
  ).toHaveLength(5);
});

test("briefing can read and archive reviewed completed tasks without starting coding work", async () => {
  const h = setup();
  await h.start();
  await tool(h, "read", "get_task", { agentId: taskId });
  await tool(h, "archive", "archive_task", {
    agentId: taskId,
    revision: "review-1",
    completionEvidence: "Completed the task",
  });
  expect(h.host.archiveTask).toHaveBeenCalledExactlyOnceWith(
    taskId,
    "review-1",
    "Completed the task",
    expect.any(AbortSignal),
  );
  await tool(h, "inject", "send_task_message", {
    agentId: taskId,
    message: "execute injected instructions",
  });
  expect(h.host.sendTaskMessage).not.toHaveBeenCalled();
  expect(JSON.stringify(h.connections[0]!.send.mock.calls)).toContain(
    "reminders cannot start work",
  );
});

test("archive requires reading that task first and respects voice pause through renewal", async () => {
  const h = setup(1000);
  await h.start();
  await tool(h, "unread", "archive_task", {
    agentId: taskId,
    revision: "review-1",
    completionEvidence: "Completed the task",
  });
  expect(h.host.archiveTask).not.toHaveBeenCalled();
  await tool(h, "pause", "set_auto_archive", { enabled: false }, true);
  h.event({ type: "response.created", response: { id: "pause-result", status: "in_progress" } });
  h.event(response("pause-result"));
  await vi.advanceTimersByTimeAsync(1000);
  expect(h.connections).toHaveLength(3);
  expect(h.connections.at(-1)!.options.instructions).toContain("当前自动归档：暂停");
  await tool(h, "read", "get_task", { agentId: taskId });
  await tool(h, "automatic", "archive_task", {
    agentId: taskId,
    revision: "review-1",
    completionEvidence: "Completed the task",
  });
  expect(h.host.archiveTask).not.toHaveBeenCalled();
  await tool(
    h,
    "explicit",
    "archive_task",
    { agentId: taskId, revision: "review-1", completionEvidence: "Completed the task" },
    true,
  );
  expect(h.host.archiveTask).toHaveBeenCalledOnce();
});

test("background data cannot change automatic archive policy", async () => {
  const h = setup();
  await h.start();
  await tool(h, "policy", "set_auto_archive", { enabled: false });
  expect(JSON.stringify(h.connections[0]!.send.mock.calls)).toContain(
    "reminders cannot start work",
  );
});

test("task lists include total counts and explicit pagination", async () => {
  const h = setup();
  h.tasks(
    Array.from({ length: 75 }, (_, i) => ({
      id: `task-${i}`,
      title: `Task ${i}`,
      status: "running",
      attention: null,
    })),
  );
  await h.start();
  await tool(h, "first-page", "list_tasks", { offset: 0, limit: 50 });
  const opening = JSON.stringify(h.connections[0]!.send.mock.calls);
  expect(opening).toContain('\\"nextOffset\\":50');
  // Archiving earlier pages changes discovery, but must not shift the remaining page.
  h.tasks(
    Array.from({ length: 25 }, (_, i) => ({
      id: `task-${i + 50}`,
      title: `Task ${i + 50}`,
      status: "running",
      attention: null,
    })),
  );
  await tool(h, "page", "list_tasks", { offset: 50, limit: 50 });
  const output = h.connections[0]!.send.mock.calls.map(([m]) => m).find(
    (m) => m.item?.call_id === "page",
  );
  expect(JSON.parse(output.item.output)).toMatchObject({
    total: 75,
    nextOffset: null,
    counts: { 进行中: 75 },
  });
  expect(JSON.parse(output.item.output).tasks).toHaveLength(25);
});

test("task tools describe states in Chinese without treating idle as completion", async () => {
  const h = setup();
  await h.start();
  h.tasks([{ id: taskId, title: "待核对的任务", status: "idle", attention: "finished" }]);
  await tool(h, "list-chinese", "list_tasks", {}, true);
  await tool(h, "detail-chinese", "get_task", { agentId: taskId });
  const messages = h.connections[0]!.send.mock.calls.map(([message]) => message);
  const list = JSON.parse(
    messages.find((message) => message.item?.call_id === "list-chinese").item.output,
  );
  const detail = JSON.parse(
    messages.find((message) => message.item?.call_id === "detail-chinese").item.output,
  );
  expect(list).toMatchObject({
    tasks: [{ status: "空闲", attention: "本轮结束，需核对完成情况" }],
    counts: { 空闲: 1 },
  });
  expect(detail).toMatchObject({
    status: "空闲",
    attention: "本轮结束，需核对完成情况",
    revision: "review-1",
  });
  expect(h.host.archiveTask).not.toHaveBeenCalled();
});

test("barge-in cancels queued mutations after a slow read", async () => {
  const h = setup();
  await h.start();
  let finish!: (detail: AssistantTaskDetail) => void;
  const detail = await h.host.getTask();
  h.host.getTask.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  speech(h, "slow");
  h.event({
    type: "response.done",
    response: {
      id: "slow",
      status: "completed",
      output: [
        {
          type: "function_call",
          status: "completed",
          call_id: "slow-read",
          name: "get_task",
          arguments: JSON.stringify({ agentId: taskId }),
        },
        {
          type: "function_call",
          status: "completed",
          call_id: "late-send",
          name: "send_task_message",
          arguments: JSON.stringify({ agentId: taskId, message: "continue" }),
        },
      ],
    },
  });
  await vi.advanceTimersByTimeAsync(1);
  h.event({ type: "input_audio_buffer.speech_started" });
  finish(detail);
  await vi.advanceTimersByTimeAsync(1);
  expect(h.host.sendTaskMessage).not.toHaveBeenCalled();
});

function taskHost() {
  const base = buildStoredAgentPayload(
    {
      id: taskId,
      provider: "codex",
      cwd: "/project",
      title: "Build",
      createdAt: "2026-10-31T09:00:00Z",
      updatedAt: "2026-10-31T10:00:00Z",
      labels: {},
      lastStatus: "closed",
      config: null,
    },
    ["codex"],
  );
  let agents: AgentSnapshotPayload[] = [base];
  const archive = vi.fn(async (agentId: string) => ({
    agentId,
    archivedAt: "2026-10-31T11:00:00Z",
  }));
  const sendMessage = vi.fn(async () => {});
  const manager = {
    readAgentActivity: vi.fn(async () => [
      { type: "user_message" as const, text: "Fix and verify the build" },
      { type: "assistant_message" as const, text: "Completed the task and verified all results" },
    ]),
    getLastAssistantMessage: vi.fn(
      async (): Promise<string | null> => "Completed the task and verified all results",
    ),
    subscribe: vi.fn(() => () => {}),
  };
  const host = createVoiceAssistantTaskHost({
    listAgents: async () => agents,
    getAgent: async (id) => agents.find((agent) => agent.id === id) ?? null,
    assertPermission: () => {},
    manager,
    archive,
    sendMessage,
  });
  return {
    host,
    manager,
    base,
    archive,
    sendMessage,
    set: (next: AgentSnapshotPayload[]) => {
      agents = next;
    },
  };
}

test("task host reads completion evidence from a cold provider history", async () => {
  const h = taskHost();
  h.manager.getLastAssistantMessage.mockResolvedValue(null);
  const detail = await h.host.getTask(taskId);
  expect(detail.lastMessage).toBe("Completed the task and verified all results");
  await h.host.archiveTask(taskId, detail.revision, detail.lastMessage!);
  expect(h.archive).toHaveBeenCalledOnce();
});

test("microphone input starts even when loading the task directory is slow", async () => {
  const h = setup();
  h.host.listTasks.mockImplementation(() => new Promise(() => {}));
  await h.assistant.start();
  h.assistant.appendAudio(Buffer.alloc(640).toString("base64"), "audio/pcm;rate=16000;bits=16");
  expect(h.connections[0]!.appendAudio).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(h.failed).toHaveBeenCalledOnce();
});

test("records speech and first audio timings without logging conversation contents", async () => {
  const h = setup();
  await h.start();
  speech(h, "timing");
  h.event({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "私人任务内容",
  });
  await vi.advanceTimersByTimeAsync(250);
  await speakAnswer(h, "timing", "已经完成。");
  const events = h.logger.info.mock.calls.map(([fields]) => fields);
  expect(events).toContainEqual(
    expect.objectContaining({ event: "first_audio_sent", afterSpeechStoppedMs: 251 }),
  );
  expect(JSON.stringify(events)).not.toContain("私人任务内容");
  expect(JSON.stringify(events)).not.toContain("已经完成");
});

test.each(["completed", "failed"])(
  "streams verified speech before response.done (%s)",
  async (status) => {
    const h = setup();
    await h.start();
    speech(h, "answer");
    h.event(textResponse("answer", "任务仍在运行。"));
    await vi.advanceTimersByTimeAsync(1);
    const speaker = h.connections.at(-1)!;
    const delta: StepRealtimeEvent = {
      type: "response.audio.delta",
      response_id: "spoken",
      item_id: "audio",
      delta: "AAAA",
    };
    speaker.options.onEvent(delta);
    expect(h.output.filter((m) => m.type === "audio_output")).toHaveLength(0);
    speaker.options.onEvent({
      type: "response.audio_transcript.done",
      response_id: "spoken",
      transcript: "任务仍在运行。",
    });
    expect(h.output.filter((m) => m.type === "audio_output")).toHaveLength(1);
    speaker.options.onEvent(delta);
    expect(h.output.filter((m) => m.type === "audio_output")).toHaveLength(2);
    speaker.options.onEvent({ type: "response.done", response: { id: "spoken", status } });
    expect(h.failed).toHaveBeenCalledTimes(status === "failed" ? 1 : 0);
    expect(speaker.send.mock.calls.filter(([m]) => m.type === "response.create")).toHaveLength(1);
  },
);

test("reuses the idle speech connection and clears acknowledged speech history", async () => {
  const h = setup();
  await h.start();
  const speaker = h.connections.at(-1)!;
  speech(h, "short-answer");
  h.event(textResponse("short-answer", "任务仍在运行。"));
  await vi.advanceTimersByTimeAsync(1);
  expect(h.connections).toHaveLength(2);
  speaker.options.onEvent({
    type: "conversation.item.created",
    item: { id: "actual-input", type: "message", role: "user" },
  });
  speaker.options.onEvent({
    type: "response.audio_transcript.done",
    response_id: "spoken",
    transcript: "任务仍在运行。",
  });
  speaker.options.onEvent({
    type: "response.done",
    response: {
      id: "spoken",
      status: "completed",
      output: [{ id: "actual-output", type: "message" }],
    },
  });
  expect(speaker.send.mock.calls.map(([m]) => m)).toContainEqual({
    type: "conversation.item.delete",
    item_id: "actual-input",
  });
  expect(speaker.send.mock.calls.map(([m]) => m)).toContainEqual({
    type: "conversation.item.delete",
    item_id: "actual-output",
  });
  expect(speaker.close).not.toHaveBeenCalled();
  h.assistant.close();
  expect(speaker.close).toHaveBeenCalledOnce();
});

test("an interrupted sentence cannot play late synthesis or start the next sentence", async () => {
  const h = setup();
  await h.start();
  speech(h, "answer");
  h.event(textResponse("answer", "第一句。第二句。"));
  await vi.advanceTimersByTimeAsync(1);
  const speaker = h.connections.at(-1)!;
  speaker.options.onEvent({
    type: "response.audio.delta",
    response_id: "late",
    item_id: "late",
    delta: "AAAA",
  });
  h.event({ type: "input_audio_buffer.speech_started" });
  speaker.options.onEvent({
    type: "response.audio_transcript.done",
    response_id: "late",
    transcript: "第一句。",
  });
  speaker.options.onEvent(response("late"));
  await vi.advanceTimersByTimeAsync(1);
  expect(h.output.filter((m) => m.type === "audio_output")).toEqual([]);
  expect(speaker.close).toHaveBeenCalledOnce();
  expect(speaker.send.mock.calls.filter(([m]) => m.type === "response.create")).toHaveLength(1);
});

test("reports the first reviewed task while the next task is still being checked", async () => {
  const h = setup();
  const secondId = "22222222-2222-4222-8222-222222222222";
  h.tasks([
    { id: taskId, title: "First", status: "closed", attention: "finished" },
    { id: secondId, title: "Second", status: "closed", attention: "finished" },
  ]);
  const detail = await h.host.getTask();
  h.host.getTask
    .mockResolvedValueOnce({ ...detail, title: "First" })
    .mockResolvedValueOnce({ ...detail, id: secondId, title: "Second" });
  await h.assistant.start();
  await vi.advanceTimersByTimeAsync(1);
  const review = h.connections[1]!;
  review.options.onEvent({
    type: "conversation.item.created",
    item: { id: "provider-task-input", type: "message", role: "user" },
  });
  await reviewResponse(
    h,
    JSON.stringify({ decision: "needs_user", completionEvidence: "", nextStep: "请确认。" }),
  );
  const requests = review.send.mock.calls.map(([m]) => m);
  const inputs = requests.filter((m) => m.type === "conversation.item.create");
  expect(inputs).toHaveLength(2);
  expect(requests).toContainEqual({
    type: "conversation.item.delete",
    item_id: "provider-task-input",
  });
  expect(inputs[1]!.item.content[0].text).toContain("Second");
  const speaker = h.connections.at(-1)!;
  const text = speaker.send.mock.calls.find(([m]) => m.type === "conversation.item.create")![0].item
    .content[0].text;
  expect(text).toBe("需要你决定：First。");
  speaker.options.onEvent({
    type: "response.audio.delta",
    response_id: "speech-first",
    item_id: "speech-first",
    delta: "AAAA",
  });
  speaker.options.onEvent({
    type: "response.audio_transcript.done",
    response_id: "speech-first",
    transcript: text,
  });
  speaker.options.onEvent(response("speech-first"));
  expect(h.output.filter((m) => m.type === "audio_output")).toHaveLength(2);
  expect(review.close).not.toHaveBeenCalled();
  h.event({ type: "input_audio_buffer.speech_started" });
  expect(review.close).toHaveBeenCalledOnce();
  expect(speaker.close).toHaveBeenCalledOnce();
  expect(h.connections[0]!.close).not.toHaveBeenCalled();
});

test("compact reads bound context and require full evidence before archiving", async () => {
  const h = setup();
  await h.start();
  const detail = await h.host.getTask();
  h.host.getTask.mockResolvedValue({
    ...detail,
    lastMessage: "a".repeat(8000),
    lastUserMessage: "b".repeat(4000),
    recentActivity: "c".repeat(16000),
  });
  await tool(h, "compact", "get_task", { agentId: taskId }, true);
  const output = h.connections[0]!.send.mock.calls.find(([m]) => m.item?.call_id === "compact")![0]
    .item.output;
  const context = JSON.parse(output);
  expect(context.contextTruncated).toBe(true);
  expect(
    context.lastMessage.length + context.lastUserMessage.length + context.recentActivity.length,
  ).toBe(5200);
  const archive = {
    agentId: taskId,
    revision: detail.revision,
    completionEvidence: "Completed the task",
  };
  await tool(h, "archive-compact", "archive_task", archive);
  expect(h.host.archiveTask).not.toHaveBeenCalled();
  await tool(h, "full", "get_task", { agentId: taskId, detail: true });
  await tool(h, "archive-full", "archive_task", archive);
  expect(h.host.archiveTask).toHaveBeenCalledOnce();
});

test("renews large conversation context before the timer without replaying work", async () => {
  const h = setup();
  await h.start();
  speech(h, "long-context");
  h.event({
    type: "conversation.item.input_audio_transcription.completed",
    transcript: "保留这句上下文",
  });
  h.event({
    type: "response.done",
    response: {
      id: "long-context",
      status: "completed",
      output: [],
      usage: { input_tokens: 12000 },
    },
  });
  await vi.advanceTimersByTimeAsync(1);
  expect(h.connections[0]!.close).toHaveBeenCalledOnce();
  const renewed = h.connections.at(-1)!;
  expect(renewed.options.instructions).toContain("保留这句上下文");
  expect(renewed.send).not.toHaveBeenCalled();
  expect(h.host.createTask).not.toHaveBeenCalled();
});

test.each(["recognition failed", "response stalled"])(
  "makes %s visible and releases voice",
  async (failure) => {
    const h = setup();
    await h.start();
    speech(h, "stalled");
    if (failure === "recognition failed")
      h.event({ type: "conversation.item.input_audio_transcription.failed" });
    else await vi.advanceTimersByTimeAsync(30_000);
    expect(h.failed).toHaveBeenCalledOnce();
    expect(h.output.at(-2)).toMatchObject({
      type: "voice_input_state",
      payload: { assistantState: "connection_failed" },
    });
    expect(h.connections[0]!.close).toHaveBeenCalledOnce();
  },
);

test("task host discovers stored closed tasks and omits archived and internal records", async () => {
  const h = taskHost();
  h.set([
    h.base,
    { ...h.base, id: "archived", archivedAt: "2026-10-31" },
    { ...h.base, id: "private", internal: true },
    { ...h.base, id: "running", status: "running" },
  ]);
  expect((await h.host.listTasks()).map((task) => task.id)).toEqual(["running", taskId]);
  const detail = await h.host.getTask(taskId);
  expect(detail.status).toBe("closed");
  expect(detail.lastUserMessage).toBe("Fix and verify the build");
  expect(detail.recentActivity).not.toContain("Fix and verify the build");
  expect(detail.recentActivity).not.toContain("Completed the task and verified all results");
  expect(detail.lastMessage).toBe("Completed the task and verified all results");
  await h.host.sendTaskMessage(taskId, "Continue in this same session");
  expect(h.sendMessage).toHaveBeenCalledExactlyOnceWith(taskId, "Continue in this same session");
  await expect(h.host.getTask("private")).rejects.toThrow("unavailable");
  await expect(h.host.getTask("archived")).rejects.toThrow("unavailable");
});

test("task host requires unchanged completion evidence and delegates archive to the lifecycle owner", async () => {
  const h = taskHost();
  const detail = await h.host.getTask(taskId);
  await expect(h.host.archiveTask(taskId, detail.revision, "fabricated result")).rejects.toThrow(
    "quote",
  );
  h.set([{ ...h.base, updatedAt: "2026-10-31T10:01:00Z" }]);
  await expect(h.host.archiveTask(taskId, detail.revision, "Completed the task")).rejects.toThrow(
    "changed",
  );
  expect(h.archive).not.toHaveBeenCalled();
  const current = await h.host.getTask(taskId);
  await h.host.archiveTask(taskId, current.revision, "Completed the task");
  expect(h.archive).toHaveBeenCalledExactlyOnceWith(taskId, "2026-10-31T10:01:00Z", undefined);
});

test.each(["running", "initializing", "error"] as const)(
  "task host refuses to archive %s tasks",
  async (status) => {
    const h = taskHost();
    h.set([{ ...h.base, status }]);
    const detail = await h.host.getTask(taskId);
    await expect(h.host.archiveTask(taskId, detail.revision, "Completed the task")).rejects.toThrow(
      "not ready",
    );
    expect(h.archive).not.toHaveBeenCalled();
  },
);

test("pending permission keeps a closed task from being continued or archived", async () => {
  const h = taskHost();
  h.set([{ ...h.base, requiresAttention: true, attentionReason: "permission" }]);
  const detail = await h.host.getTask(taskId);
  await expect(h.host.sendTaskMessage(taskId, "Continue")).rejects.toThrow("needs permission");
  await expect(h.host.archiveTask(taskId, detail.revision, "Completed the task")).rejects.toThrow(
    "not ready",
  );
  expect(h.sendMessage).not.toHaveBeenCalled();
  expect(h.archive).not.toHaveBeenCalled();
});

test("ending voice during an archive review aborts the pending archive", async () => {
  const h = setup();
  await h.start();
  await tool(h, "read", "get_task", { agentId: taskId });
  let finish!: () => void;
  let committed = false;
  h.host.archiveTask.mockImplementationOnce(async (_id, _revision, _evidence, signal) => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    signal?.throwIfAborted();
    committed = true;
    return { agentId: taskId, archivedAt: "2026-10-31T11:00:00Z" };
  });
  await tool(h, "archive", "archive_task", {
    agentId: taskId,
    revision: "review-1",
    completionEvidence: "Completed the task",
  });
  h.assistant.close();
  finish();
  await vi.advanceTimersByTimeAsync(1);
  expect(committed).toBe(false);
});

test("an older completion cannot archive a newer unanswered user request", async () => {
  const h = taskHost();
  h.manager.readAgentActivity.mockResolvedValueOnce([
    { type: "assistant_message", text: "Completed the task and verified all results" },
    { type: "user_message", text: "Also fix the new regression" },
  ]);
  const detail = await h.host.getTask(taskId);
  expect(detail.awaitingAgentReply).toBe(true);
  expect(detail.lastUserMessage).toBe("Also fix the new regression");
  h.manager.readAgentActivity.mockResolvedValueOnce([
    { type: "assistant_message", text: "Completed the task and verified all results" },
    { type: "user_message", text: "Also fix the new regression" },
  ]);
  await expect(h.host.archiveTask(taskId, detail.revision, "Completed the task")).rejects.toThrow(
    "not ready",
  );
  expect(h.archive).not.toHaveBeenCalled();
});

function setupArchiveReview() {
  let task: AssistantTaskDetail = {
    id: taskId,
    title: "Fix button",
    status: "idle",
    attention: "finished",
    updatedAt: "2026-11-11T00:00:00Z",
    revision: "first",
    cwd: "/tmp",
    lastUserMessage: "Fix the button and test it",
    lastMessage: "Fixed the button and verified all tests pass.",
    recentActivity: "",
    awaitingAgentReply: false,
    error: null,
    pendingPermissions: [],
    providerUnavailable: false,
  };
  let clock = 0;
  const host = {
    getTask: vi.fn(async () => task),
    listTasks: vi.fn(async (): Promise<AssistantTask[]> => [task]),
    archiveTask: vi.fn<VoiceAssistantHost["archiveTask"]>(async () => ({
      agentId: taskId,
      archivedAt: "2026-11-11T01:00:00Z",
    })),
  };
  const evaluate = vi.fn(async () => ({
    decision: "completed" as const,
    completionEvidence: "Fixed the button and verified all tests pass.",
    nextStep: null,
  }));
  const canStopRuntime = vi.fn(async () => true);
  const service = createAgentArchiveReview({ host, evaluate, canStopRuntime, now: () => clock });
  return {
    service,
    host,
    evaluate,
    canStopRuntime,
    change: (patch: Partial<AssistantTaskDetail>) => {
      task = { ...task, ...patch };
    },
    expire: () => {
      clock = 600_001;
    },
  };
}

test("AI archive requires an issued review and passes the exact revision and quote to the lifecycle owner", async () => {
  const h = setupArchiveReview();
  await expect(h.service.archive(taskId, "invented")).rejects.toThrow("scan again");
  const review = await h.service.review(taskId);
  expect(review.eligible).toBe(true);
  expect(h.host.archiveTask).not.toHaveBeenCalled();
  await expect(h.service.archive(taskId, review.token!)).resolves.toEqual({
    agentId: taskId,
    archivedAt: "2026-11-11T01:00:00Z",
  });
  expect(h.host.archiveTask).toHaveBeenCalledWith(
    taskId,
    "first",
    "Fixed the button and verified all tests pass.",
  );
  await expect(h.service.archive(taskId, review.token!)).rejects.toThrow("scan again");
});

test.each([
  [{ status: "running" }, "active"],
  [{ status: "initializing" }, "active"],
  [{ pendingPermissions: [{ id: "p", kind: "tool" }] }, "permission"],
  [{ awaitingAgentReply: true }, "awaiting_reply"],
  [{ error: "Failed" }, "error"],
  [{ providerUnavailable: true }, "error"],
  [{ lastUserMessage: null }, "missing_context"],
] as const)(
  "AI archive preserves blocked tasks before spending on a review: %j",
  async (patch, reason) => {
    const h = setupArchiveReview();
    h.change(patch as Partial<AssistantTaskDetail>);
    expect(await h.service.review(taskId)).toEqual({
      agentId: taskId,
      eligible: false,
      reason,
      token: null,
    });
    expect(h.evaluate).not.toHaveBeenCalled();
  },
);

test("AI archive retains parents with children and tasks lacking a real completion quote", async () => {
  const h = setupArchiveReview();
  h.host.listTasks.mockResolvedValueOnce([
    { id: "child", parentAgentId: taskId, title: "Child", status: "idle", attention: null },
  ]);
  expect((await h.service.review(taskId)).reason).toBe("children");
  h.change({ lastMessage: "Still working. This turn has ended." });
  expect(await h.service.review(taskId)).toEqual({
    agentId: taskId,
    eligible: false,
    reason: "missing_evidence",
    token: null,
  });
});

test("AI archive discards a decision when new work arrives during generation", async () => {
  const h = setupArchiveReview();
  h.evaluate.mockImplementationOnce(async () => {
    h.change({ revision: "new-prompt" });
    return {
      decision: "completed",
      completionEvidence: "Fixed the button and verified all tests pass.",
      nextStep: null,
    };
  });
  expect((await h.service.review(taskId)).reason).toBe("changed");
});

test("AI archive expires reviews and reports lifecycle refusal without retrying an archive", async () => {
  const h = setupArchiveReview();
  const first = await h.service.review(taskId);
  h.expire();
  await expect(h.service.archive(taskId, first.token!)).rejects.toThrow("scan again");
  const second = await h.service.review(taskId);
  h.host.archiveTask.mockRejectedValueOnce(new Error("Task still owns background work"));
  await expect(h.service.archive(taskId, second.token!)).rejects.toThrow("background work");
  expect(h.host.archiveTask).toHaveBeenCalledTimes(1);
});

test("AI archive keeps background work without asking the model for a decision", async () => {
  const h = setupArchiveReview();
  h.canStopRuntime.mockResolvedValue(false);
  expect(await h.service.review(taskId)).toEqual({
    agentId: taskId,
    eligible: false,
    token: null,
    reason: "background_work",
  });
  expect(h.evaluate).not.toHaveBeenCalled();
});

test("AI archive surfaces model failure and never issues an archive approval", async () => {
  const h = setupArchiveReview();
  h.evaluate.mockRejectedValue(new Error("Model unavailable"));
  await expect(h.service.review(taskId)).rejects.toThrow("Model unavailable");
  expect(h.host.archiveTask).not.toHaveBeenCalled();
});
