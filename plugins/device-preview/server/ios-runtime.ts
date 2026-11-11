import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, rename, rm, mkdtemp, lstat, open } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { command } from "./process.js";
import { PreviewError } from "./errors.js";

// Upstream release assets were verified against GitHub's asset SHA-256 metadata.
export const runtimeArtifact = {
  version: "0.2.12",
  url: "https://github.com/tddworks/baguette/releases/download/v0.2.12/baguette_v0.2.12_macOS_arm64.tar.gz",
  archiveHash: "32c21cc91c1d3b930bb01e9404139608e6d1ae1d274ef83b4f9dc68d99d8eeac",
  binaryHash: "3c1d93480781928ccc70d3a7f35669250e17510ffde4db588dabbbe319379e6e",
  member: "baguette-v0.2.12-macOS-arm64/Baguette",
} as const;
const MAX_ARCHIVE = 40 * 1024 * 1024;
const runtimeFiles = [
  { path: "Baguette", hash: runtimeArtifact.binaryHash, mode: 0o700 },
  {
    path: "Baguette_Baguette.bundle/HingeControl/HingeControl",
    hash: "785d3757f5918527c171ae55f3f6799fd7ec5163f72628a018e88fb66e3bc511",
    mode: 0o700,
  },
  {
    path: "Baguette_Baguette.bundle/HingeControl/LICENSE.idb",
    hash: "da6d3703ed11cbe42bd212c725957c98da23cbff1998c05fa4b3d976d1a58e93",
    mode: 0o600,
  },
] as const;

async function verified(file: string, expectedHash: string): Promise<boolean> {
  try {
    const metadata = await lstat(file);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 16 * 1024 * 1024)
      return false;
    const hash = createHash("sha256")
      .update(await readFile(file))
      .digest("hex");
    return hash === expectedHash;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw new PreviewError("无法验证 iOS 预览组件");
  }
}

export async function verifyRuntimeFiles(
  root: string,
  files: readonly { path: string; hash: string }[] = runtimeFiles,
): Promise<boolean> {
  return (await Promise.all(files.map((file) => verified(join(root, file.path), file.hash)))).every(
    Boolean,
  );
}

export function createIosRuntime() {
  const root = join(
    process.env.PASEO_HOME ?? join(homedir(), ".paseo"),
    "device-preview",
    "runtimes",
    runtimeArtifact.version,
  );
  const binary = join(root, "Baguette");
  let preparing: Promise<string> | null = null;
  async function install(signal: AbortSignal): Promise<string> {
    if (await verifyRuntimeFiles(root)) return binary;
    await mkdir(root, { recursive: true, mode: 0o700 });
    const staging = await mkdtemp(join(root, "prepare-"));
    const archive = join(staging, "runtime.tar.gz");
    try {
      const timeout = AbortSignal.timeout(90_000);
      const response = await fetch(runtimeArtifact.url, {
        signal: AbortSignal.any([signal, timeout]),
        redirect: "follow",
      });
      if (!response.ok || !response.body)
        throw new PreviewError("无法获取 iOS 预览组件，请检查主机网络后重试");
      const archiveFile = await open(archive, "wx", 0o600),
        hash = createHash("sha256");
      let bytes = 0;
      try {
        for await (const chunk of response.body) {
          bytes += chunk.length;
          if (bytes > MAX_ARCHIVE) throw new PreviewError("iOS 预览组件超过下载上限");
          hash.update(chunk);
          await archiveFile.writeFile(chunk);
        }
      } finally {
        await archiveFile.close();
      }
      if (hash.digest("hex") !== runtimeArtifact.archiveHash)
        throw new PreviewError("iOS 预览组件校验失败，已拒绝运行");
      // describe-ui needs the guest helper beside the executable. Extract only these
      // pinned members, never archive-defined paths or unrelated bundled plugins.
      for (const file of runtimeFiles) {
        const member = `baguette-v${runtimeArtifact.version}-macOS-arm64/${file.path}`;
        const contents = await command("/usr/bin/tar", ["-xOf", archive, member], {
          signal,
          maxBytes: 16 * 1024 * 1024,
          timeout: 15_000,
        });
        if (createHash("sha256").update(contents).digest("hex") !== file.hash)
          throw new PreviewError("iOS 预览组件文件校验失败");
        const output = join(staging, file.path);
        await mkdir(dirname(output), { recursive: true, mode: 0o700 });
        const handle = await open(output, "wx", file.mode);
        try {
          await handle.writeFile(contents);
        } finally {
          await handle.close();
        }
        await chmod(output, file.mode);
      }
      signal.throwIfAborted();
      for (const file of runtimeFiles) {
        const destination = join(root, file.path);
        await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
        await rename(join(staging, file.path), destination);
      }
      return binary;
    } catch (error) {
      if (error instanceof PreviewError) throw error;
      throw new PreviewError("iOS 预览组件准备失败或已取消，请重试");
    } finally {
      await rm(staging, { recursive: true, force: true });
    }
  }
  return {
    async ensure(signal: AbortSignal) {
      preparing ??= install(signal).finally(() => {
        preparing = null;
      });
      return preparing;
    },
  };
}
