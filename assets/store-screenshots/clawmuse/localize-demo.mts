import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { DaemonClient } from "../../../packages/server/src/server/test-utils/daemon-client.js";
const log = process.argv[2];
if (!log) throw new Error("Usage: npx tsx localize-demo.mts <stage-log>");
const info = JSON.parse((await readFile(log, "utf8")).split("\n")[0]);
const c = new DaemonClient({ url: "ws://127.0.0.1:7793/ws", appVersion: "1.5.5" });
await c.connect();
await c.renameProject(info.workspace.projectId, "Packing List");
await c.setWorkspaceTitle(info.workspace.id, "Packing List");
await c.updateAgent(info.agent.id, { name: "Progress implementation" });
const code = path.join(info.root, "旅行清单");
const git = (...args: string[]) =>
  execFileSync(
    "git",
    ["-c", "user.name=ClawMuse Demo", "-c", "user.email=demo@example.invalid", ...args],
    { cwd: code, encoding: "utf8" },
  );
const baseline =
  "// Packing list summary\nexport function summarize(items) {\n  return `${items.length} items to pack`;\n}\n";
const hash = execFileSync("git", ["hash-object", "-w", "--stdin"], {
  cwd: code,
  input: baseline,
  encoding: "utf8",
}).trim();
git("update-index", "--cacheinfo", `100644,${hash},packing.mjs`);
const readme =
  "# Packing List\n\nTrack packing progress, filter unfinished items, and keep your list offline.\n";
const readmeHash = execFileSync("git", ["hash-object", "-w", "--stdin"], {
  cwd: code,
  input: readme,
  encoding: "utf8",
}).trim();
git("update-index", "--cacheinfo", `100644,${readmeHash},README.md`);
git("commit", "--amend", "-qm", "Create packing list project");
let implementation = await readFile(path.join(code, "packing.mjs"), "utf8");
implementation = implementation.replace(
  "// 旅行清单：进度、筛选和离线保存",
  "// Packing progress, filtering, and offline storage",
);
await writeFile(path.join(code, "packing.mjs"), implementation);
let tests = await readFile(path.join(code, "packing.test.mjs"), "utf8");
for (const [a, b] of Object.entries({
  正确统计装包进度: "counts packed and remaining items",
  空清单显示零进度: "handles an empty list",
  仅显示未装包物品: "filters unpacked items",
  关闭筛选恢复全部物品: "restores all items when filter is off",
  重启后恢复本地清单: "restores saved items after reopening",
  损坏缓存安全回退: "recovers from invalid cache",
  护照: "Passport",
  充电器: "Charger",
}))
  tests = tests.replaceAll(a, b);
await writeFile(path.join(code, "packing.test.mjs"), tests);
await writeFile(
  path.join(code, "README.md"),
  "# Packing List\n\nTrack packing progress, filter unfinished items, and keep your list offline.\n",
);
process.exit(0);
