import { describe, expect, it, vi } from "vitest";
import { submitAgentInput } from "./submit";

function createDeferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return {
    promise,
    resolve,
    reject,
  };
}

describe("submitAgentInput", () => {
  it("clears the composer before an in-flight submit resolves", async () => {
    const deferred = createDeferredPromise<void>();
    const queueMessage = vi.fn();
    const submitMessage = vi.fn(async () => {
      await deferred.promise;
    });
    const clearDraft = vi.fn();
    const setUserInput = vi.fn();
    const setAttachments = vi.fn();
    const setSendError = vi.fn();
    const setIsProcessing = vi.fn();

    const submitPromise = submitAgentInput({
      message: "  hello world  ",
      attachments: [],
      isAgentRunning: false,
      canSubmit: true,
      queueMessage,
      submitMessage,
      clearDraft,
      setUserInput,
      setAttachments,
      setSendError,
      setIsProcessing,
    });

    expect(queueMessage).not.toHaveBeenCalled();
    expect(submitMessage).toHaveBeenCalledWith({
      message: "hello world",
      attachments: [],
    });
    expect(setUserInput).toHaveBeenCalledWith("");
    expect(setAttachments).toHaveBeenCalledWith([]);
    expect(clearDraft).toHaveBeenCalledTimes(1);
    expect(clearDraft).toHaveBeenCalledWith("sent");
    expect(setSendError).toHaveBeenCalledWith(null);
    expect(setIsProcessing).toHaveBeenCalledWith(true);

    deferred.resolve();

    await expect(submitPromise).resolves.toBe("submitted");
    expect(clearDraft).toHaveBeenCalledTimes(1);
  });

  it("preserves attachments and text added while an earlier submit is still in flight", async () => {
    const deferred = createDeferredPromise<void>();
    let currentDraftText = "  first message  ";
    let currentDraftAttachments = [{ id: "img-1" }];
    let persistedDraft: { text: string; attachments: Array<{ id: string }>; lifecycle: string } = {
      text: currentDraftText,
      attachments: currentDraftAttachments,
      lifecycle: "active",
    };

    const submitPromise = submitAgentInput({
      message: currentDraftText,
      attachments: currentDraftAttachments,
      isAgentRunning: false,
      canSubmit: true,
      queueMessage: vi.fn(),
      submitMessage: async () => {
        await deferred.promise;
      },
      clearDraft: (lifecycle) => {
        persistedDraft = { text: "", attachments: [], lifecycle };
      },
      setUserInput: (text) => {
        currentDraftText = text;
        persistedDraft = {
          ...persistedDraft,
          text,
          lifecycle: text || persistedDraft.attachments.length > 0 ? "active" : "abandoned",
        };
      },
      setAttachments: (attachments) => {
        currentDraftAttachments = attachments;
        persistedDraft = {
          ...persistedDraft,
          attachments,
          lifecycle: persistedDraft.text || attachments.length > 0 ? "active" : "abandoned",
        };
      },
      setSendError: vi.fn(),
      setIsProcessing: vi.fn(),
    });

    // Second image finishes persisting while first image upload is still in flight
    currentDraftAttachments = [{ id: "img-2" }];
    persistedDraft = {
      text: "",
      attachments: [{ id: "img-2" }],
      lifecycle: "active",
    };

    deferred.resolve();
    await expect(submitPromise).resolves.toBe("submitted");

    expect(currentDraftAttachments).toEqual([{ id: "img-2" }]);
    expect(persistedDraft).toEqual({
      text: "",
      attachments: [{ id: "img-2" }],
      lifecycle: "active",
    });
  });

  it("preserves the composer before an in-flight submit resolves when requested", async () => {
    const deferred = createDeferredPromise<void>();
    const attachments = [{ id: "img-1" }];
    const queueMessage = vi.fn();
    const submitMessage = vi.fn(async () => {
      await deferred.promise;
    });
    const clearDraft = vi.fn();
    const setUserInput = vi.fn();
    const setAttachments = vi.fn();
    const setSendError = vi.fn();
    const setIsProcessing = vi.fn();

    const submitPromise = submitAgentInput({
      message: "  keep me  ",
      attachments,
      submitBehavior: "preserve-and-lock",
      isAgentRunning: false,
      canSubmit: true,
      queueMessage,
      submitMessage,
      clearDraft,
      setUserInput,
      setAttachments,
      setSendError,
      setIsProcessing,
    });

    expect(queueMessage).not.toHaveBeenCalled();
    expect(submitMessage).toHaveBeenCalledWith({
      message: "keep me",
      attachments,
    });
    expect(setUserInput).not.toHaveBeenCalled();
    expect(setAttachments).not.toHaveBeenCalled();
    expect(setSendError).toHaveBeenCalledWith(null);
    expect(setIsProcessing).toHaveBeenCalledWith(true);
    expect(clearDraft).not.toHaveBeenCalled();

    deferred.resolve();

    await expect(submitPromise).resolves.toBe("submitted");
    expect(clearDraft).toHaveBeenCalledWith("sent");
  });

  it("queues while the agent is running and clears the composer immediately", async () => {
    const queueMessage = vi.fn();
    const submitMessage = vi.fn();
    const clearDraft = vi.fn();
    const setUserInput = vi.fn();
    const setAttachments = vi.fn();
    const setSendError = vi.fn();
    const setIsProcessing = vi.fn();

    await expect(
      submitAgentInput({
        message: "  queued message  ",
        attachments: [{ id: "img-1" }],
        isAgentRunning: true,
        canSubmit: true,
        queueMessage,
        submitMessage,
        clearDraft,
        setUserInput,
        setAttachments,
        setSendError,
        setIsProcessing,
      }),
    ).resolves.toBe("queued");

    expect(queueMessage).toHaveBeenCalledWith({
      message: "queued message",
      attachments: [{ id: "img-1" }],
    });
    expect(submitMessage).not.toHaveBeenCalled();
    expect(setUserInput).toHaveBeenCalledWith("");
    expect(setAttachments).toHaveBeenCalledWith([]);
    expect(setSendError).not.toHaveBeenCalled();
    expect(setIsProcessing).not.toHaveBeenCalled();
    expect(clearDraft).not.toHaveBeenCalled();
  });

  it("restores the composer when submit fails", async () => {
    const submitError = new Error("No host selected");
    const queueMessage = vi.fn();
    const submitMessage = vi.fn(async () => {
      throw submitError;
    });
    const clearDraft = vi.fn();
    const setUserInput = vi.fn();
    const setAttachments = vi.fn();
    const setSendError = vi.fn();
    const setIsProcessing = vi.fn();
    const onSubmitError = vi.fn();
    const attachments = [{ id: "img-1" }];

    await expect(
      submitAgentInput({
        message: "  hello world  ",
        attachments,
        isAgentRunning: false,
        canSubmit: true,
        queueMessage,
        submitMessage,
        clearDraft,
        setUserInput,
        setAttachments,
        setSendError,
        setIsProcessing,
        onSubmitError,
      }),
    ).resolves.toBe("failed");

    expect(onSubmitError).toHaveBeenCalledWith(submitError);
    expect(setUserInput).toHaveBeenNthCalledWith(1, "");
    expect(setUserInput).toHaveBeenNthCalledWith(2, "hello world");
    expect(setAttachments).toHaveBeenNthCalledWith(1, []);
    expect(setAttachments).toHaveBeenNthCalledWith(2, attachments);
    expect(setSendError).toHaveBeenNthCalledWith(1, null);
    expect(setSendError).toHaveBeenNthCalledWith(2, "No host selected");
    expect(setIsProcessing).toHaveBeenNthCalledWith(1, true);
    expect(setIsProcessing).toHaveBeenNthCalledWith(2, false);
    expect(clearDraft).toHaveBeenCalledTimes(1);
    expect(clearDraft).toHaveBeenCalledWith("sent");
  });

  it("merges failed draft with attachments added while the submit was in flight when restoreDraftOnError is provided", async () => {
    const deferred = createDeferredPromise<void>();
    let currentText = "first";
    let currentAttachments = [{ id: "img-1" }];

    const submitPromise = submitAgentInput({
      message: currentText,
      attachments: currentAttachments,
      isAgentRunning: false,
      canSubmit: true,
      queueMessage: vi.fn(),
      submitMessage: async () => {
        await deferred.promise;
        throw new Error("Upload rejected");
      },
      clearDraft: vi.fn(),
      setUserInput: (text) => {
        currentText = text;
      },
      setAttachments: (next) => {
        currentAttachments = next;
      },
      restoreDraftOnError: (failed) => {
        currentText = currentText ? `${failed.message}\n${currentText}` : failed.message;
        currentAttachments = [...failed.attachments, ...currentAttachments];
      },
      setSendError: vi.fn(),
      setIsProcessing: vi.fn(),
    });

    currentText = "second";
    currentAttachments = [{ id: "img-2" }];

    deferred.reject(new Error("Upload rejected"));
    await expect(submitPromise).resolves.toBe("failed");

    expect(currentText).toBe("first\nsecond");
    expect(currentAttachments).toEqual([{ id: "img-1" }, { id: "img-2" }]);
  });

  it("restores a steered active-turn draft after an ambiguous immediate-send error", async () => {
    const error = new Error("connection lost after delivery");
    const setUserInput = vi.fn();
    const setAttachments = vi.fn();
    const setSendError = vi.fn();
    const setIsProcessing = vi.fn();

    await expect(
      submitAgentInput({
        message: "  steer this turn  ",
        attachments: [{ id: "img-1" }],
        forceSend: true,
        isAgentRunning: true,
        canSubmit: true,
        queueMessage: vi.fn(),
        submitMessage: async () => {
          throw error;
        },
        clearDraft: vi.fn(),
        setUserInput,
        setAttachments,
        setSendError,
        setIsProcessing,
      }),
    ).resolves.toBe("failed");

    expect(setUserInput).toHaveBeenNthCalledWith(1, "");
    expect(setUserInput).toHaveBeenNthCalledWith(2, "steer this turn");
    expect(setAttachments).toHaveBeenNthCalledWith(1, []);
    expect(setAttachments).toHaveBeenNthCalledWith(2, [{ id: "img-1" }]);
    expect(setSendError).toHaveBeenLastCalledWith("connection lost after delivery");
  });

  it("submits when empty submit is explicitly allowed", async () => {
    const queueMessage = vi.fn();
    const submitMessage = vi.fn(async () => {});
    const clearDraft = vi.fn();
    const setUserInput = vi.fn();
    const setAttachments = vi.fn();
    const setSendError = vi.fn();
    const setIsProcessing = vi.fn();

    await expect(
      submitAgentInput({
        message: "   ",
        attachments: [],
        allowEmptySubmit: true,
        isAgentRunning: false,
        canSubmit: true,
        queueMessage,
        submitMessage,
        clearDraft,
        setUserInput,
        setAttachments,
        setSendError,
        setIsProcessing,
      }),
    ).resolves.toBe("submitted");

    expect(queueMessage).not.toHaveBeenCalled();
    expect(submitMessage).toHaveBeenCalledWith({
      message: "",
      attachments: [],
    });
    expect(clearDraft).toHaveBeenCalledWith("sent");
  });
});
