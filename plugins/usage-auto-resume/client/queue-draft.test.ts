import assert from "node:assert/strict";
import test from "node:test";
import { createQueueDraft } from "./queue-draft";

const failure = () => "保存失败，请重试。";

test("keeps the payload and id after an ambiguous write, and clears only after confirmation", async () => {
  let ids = 0;
  const draft = createQueueDraft(() => `message-${++ids}`);
  draft.edit("  补充检查错误恢复  ");
  const attempts: Array<{ id: string; text: string }> = [];
  assert.equal(
    await draft.submit(async (input) => {
      attempts.push(input);
      throw new Error("连接中断");
    }, failure),
    false,
  );
  assert.equal(draft.getSnapshot().text, "  补充检查错误恢复  ");
  assert.equal(draft.getSnapshot().error, "连接中断");
  draft.edit("不能覆盖未确认的内容");
  assert.equal(
    await draft.submit(async (input) => {
      attempts.push(input);
    }, failure),
    true,
  );
  assert.deepEqual(attempts, [
    { id: "message-1", text: "补充检查错误恢复" },
    { id: "message-1", text: "补充检查错误恢复" },
  ]);
  assert.deepEqual(draft.getSnapshot(), { text: "", pending: false, error: null, attempt: null });
  draft.edit("下一条");
  await draft.submit(async (input) => {
    assert.equal(input.id, "message-2");
  }, failure);
});

test("coalesces duplicate clicks while a submission is in flight", async () => {
  const draft = createQueueDraft(() => "same-id");
  draft.edit("下一项任务");
  let resolve!: () => void;
  const first = draft.submit(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
    failure,
  );
  assert.equal(draft.getSnapshot().pending, true);
  let duplicateSent = false;
  assert.equal(
    await draft.submit(async () => {
      duplicateSent = true;
    }, failure),
    false,
  );
  assert.equal(duplicateSent, false);
  resolve();
  assert.equal(await first, true);
});

test("does not send whitespace-only drafts", async () => {
  const draft = createQueueDraft();
  draft.edit(" \n ");
  let sent = false;
  assert.equal(
    await draft.submit(async () => {
      sent = true;
    }, failure),
    false,
  );
  assert.equal(sent, false);
});

test("shows the server's error without SDK request diagnostics", async () => {
  const draft = createQueueDraft();
  draft.edit("保存失败时保留这条内容");
  const userMessage =
    "Request failed: Could not read the saved follow-up queue; existing messages were kept.";
  await draft.submit(async () => {
    throw Object.assign(
      new Error(`${userMessage} requestType=plugin.rpc.invoke.request code=handler_error`),
      { userMessage },
    );
  }, failure);
  assert.equal(
    draft.getSnapshot().error,
    "Could not read the saved follow-up queue; existing messages were kept.",
  );
  assert.equal(draft.getSnapshot().text, "保存失败时保留这条内容");
});

test("translates a known server error when a translator is supplied", async () => {
  const draft = createQueueDraft();
  draft.edit("内容");
  const userMessage =
    "Request failed: Could not read the saved follow-up queue; existing messages were kept.";
  await draft.submit(
    async () => {
      throw Object.assign(new Error(userMessage), { userMessage });
    },
    failure,
    (key) => `zh:${key}`,
  );
  assert.equal(draft.getSnapshot().error, "zh:errorQueueStoreRead");
});
