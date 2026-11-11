import { describe, expect, it } from "vitest";
import { command, launch } from "./process.js";
import { verifyRuntimeFiles } from "./ios-runtime.js";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
describe("owned preview subprocesses", () => {
  it("requires every pinned runtime resource and refuses corrupted or symlinked helpers", async () => {
    const root = await mkdtemp(join(tmpdir(), "preview-runtime-"));
    const bytes = Buffer.from("runtime fixture");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const files = [
      { path: "Baguette", hash },
      { path: "bundle/HingeControl", hash },
    ];
    try {
      await writeFile(join(root, "Baguette"), bytes);
      expect(await verifyRuntimeFiles(root, files)).toBe(false);
      await mkdir(join(root, "bundle"));
      await writeFile(join(root, "bundle/HingeControl"), bytes);
      expect(await verifyRuntimeFiles(root, files)).toBe(true);
      await writeFile(join(root, "bundle/HingeControl"), "corrupt");
      expect(await verifyRuntimeFiles(root, files)).toBe(false);
      await rm(join(root, "bundle/HingeControl"));
      await symlink(join(root, "Baguette"), join(root, "bundle/HingeControl"));
      expect(await verifyRuntimeFiles(root, files)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("caps output and joins a cancelled process before returning", async () => {
    await expect(
      command(
        process.execPath,
        ["-e", "process.stdout.write('x'.repeat(100000));setInterval(()=>{},1000)"],
        { signal: AbortSignal.timeout(3000), maxBytes: 1024 },
      ),
    ).rejects.toThrow("未完成");
    const owned = launch(process.execPath, [
      "-e",
      "process.stdout.write('ready');setInterval(()=>{},1000)",
    ]);
    await new Promise<void>((resolve) => owned.child.stdout.once("data", () => resolve()));
    await owned.stop();
    expect(await owned.closed).not.toBe(0);
  });
  it("passes argv literally without invoking a shell", async () => {
    const literal = "a; echo $HOME | cat\n'quoted'";
    const result = await command(
      process.execPath,
      ["-e", "process.stdout.write(process.argv[1])", literal],
      { signal: AbortSignal.timeout(3000) },
    );
    expect(result.toString()).toBe(literal);
  });
});
