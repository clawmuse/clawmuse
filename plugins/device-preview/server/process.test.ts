import { expect, test, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CommandRunner } from "./process.js";

test("commands preserve argv literally and bound binary output", async () => {
  const runner = new CommandRunner();
  const signal = new AbortController().signal;
  try {
    const args = ["a;b", "a|b", "a b", "a\nb"];
    const output = await runner.run(
      process.execPath,
      ["-e", "process.stdout.write(JSON.stringify(process.argv.slice(1)))", ...args],
      { signal },
    );
    expect(JSON.parse(output.toString())).toEqual(args);
    await expect(
      runner.run(process.execPath, ["-e", "process.stdout.write(Buffer.alloc(10000))"], {
        signal,
        maxBytes: 100,
      }),
    ).rejects.toThrow("设备命令");
  } finally {
    await runner.close();
  }
});

test("cancellation joins the command and its child process before returning", async () => {
  const directory = await mkdtemp(join(tmpdir(), "preview-process-test-"));
  const pidFile = join(directory, "child.pid");
  const runner = new CommandRunner();
  const controller = new AbortController();
  const source = `const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); child.on('spawn',()=>require('node:fs').writeFileSync(${JSON.stringify(pidFile)},String(child.pid))); setInterval(()=>{},1000)`;
  const task = runner.run(process.execPath, ["-e", source], {
    signal: controller.signal,
    timeoutMs: 3000,
    maxBytes: 100,
  });
  const rejected = expect(task).rejects.toThrow("设备命令");
  try {
    await vi.waitFor(async () =>
      expect(Number(await readFile(pidFile, "utf8"))).toBeGreaterThan(0),
    );
    const pid = Number(await readFile(pidFile, "utf8"));
    controller.abort();
    await rejected;
    expect(() => process.kill(pid, 0)).toThrow();
  } finally {
    await runner.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("cleanup cancels outstanding commands and rejects future work", async () => {
  const runner = new CommandRunner();
  const options = { signal: new AbortController().signal };
  const task = runner.run(process.execPath, ["-e", "setInterval(()=>{},1000)"], options);
  const rejection = expect(task).rejects.toThrow("设备命令");
  await runner.close();
  await rejection;
  await expect(runner.run(process.execPath, ["-e", ""], options)).rejects.toThrow("设备命令");
});
