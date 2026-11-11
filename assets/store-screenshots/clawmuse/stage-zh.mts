// Isolated Chinese screenshot fixture. Conversation is scripted; files/tests are real.
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import { createTestPaseoDaemon } from "../../../packages/server/src/server/test-utils/paseo-daemon.js";
import { DaemonClient } from "../../../packages/server/src/server/test-utils/daemon-client.js";
import { ScriptedAgentClient } from "../demo/scripted-agents.mjs";
const root = await mkdtemp(path.join(os.tmpdir(), "clawmuse-store-zh-"));
const code = path.join(root, "旅行清单");
await mkdir(code);
const git = (...args: string[]) =>
  execFileSync(
    "git",
    ["-c", "user.name=ClawMuse Demo", "-c", "user.email=demo@example.invalid", ...args],
    { cwd: code, encoding: "utf8" },
  );
git("init", "-q", "-b", "main");
await writeFile(
  path.join(code, "packing.mjs"),
  "// 生成旅行清单摘要\nexport function summarize(items) {\n  return `共 ${items.length} 件行李`;\n}\n",
);
await writeFile(
  path.join(code, "README.md"),
  "# 旅行清单\n\nClawMuse 中文演示项目。\n\n整理行李、标记已装包物品，出发前检查遗漏。\n",
);
git("add", ".");
git("commit", "-qm", "创建旅行清单项目");
const implementation = `// 旅行清单：进度、筛选和离线保存
export function summarize(items) {
  const packed = items.filter(item => item.packed).length;
  return { total: items.length, packed, remaining: items.length - packed };
}

export function visibleItems(items, pendingOnly) {
  return pendingOnly ? items.filter(item => !item.packed) : items;
}

export function saveList(storage, items) {
  storage.setItem('packing-list', JSON.stringify(items));
}

export function restoreList(storage) {
  try {
    const items = JSON.parse(storage.getItem('packing-list') || '[]');
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}
`;
await writeFile(path.join(code, "packing.mjs"), implementation);
await writeFile(
  path.join(code, "packing.test.mjs"),
  `import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { summarize, visibleItems, saveList, restoreList } from './packing.mjs';
const items = [{name:'护照',packed:true},{name:'充电器',packed:false}];
test('正确统计装包进度',()=>assert.deepEqual(summarize(items),{total:2,packed:1,remaining:1}));
test('空清单显示零进度',()=>assert.deepEqual(summarize([]),{total:0,packed:0,remaining:0}));
test('仅显示未装包物品',()=>assert.deepEqual(visibleItems(items,true),[items[1]]));
test('关闭筛选恢复全部物品',()=>assert.equal(visibleItems(items,false),items));
test('重启后恢复本地清单',()=>{let value;const storage={setItem:(_,v)=>value=v,getItem:()=>value};saveList(storage,items);assert.deepEqual(restoreList(storage),items)});
test('损坏缓存安全回退',()=>assert.deepEqual(restoreList({getItem:()=>'{invalid'}),[]));
`,
);
git("add", "-N", "packing.test.mjs");
const tests = stripVTControlCharacters(
  execFileSync("node", ["--test", "--test-reporter=spec", "packing.test.mjs"], {
    cwd: code,
    encoding: "utf8",
  }),
);
const prompt =
  "旅行清单里东西多了很难找。请增加装包进度和“只看未装包”筛选，退出后保留勾选状态。补齐测试，先不要提交。";
const englishPrompt =
  "Our packing list gets hard to scan before a trip. Add packing progress, an unpacked-only filter, and local persistence. Cover the edge cases with tests. Leave the changes uncommitted.";
const zhAnswer =
  "## 出发前，先看还差什么\n\n已补齐旅行清单的进度、筛选和离线保存逻辑。\n\n- **装包进度**：分别统计总数、已装包和待整理数量。\n- **只看未装包**：隐藏已完成物品，关闭筛选后恢复完整清单。\n- **离线保存**：重新打开后恢复勾选状态，损坏缓存安全回退。\n\n### 验证结果\n\n6 项测试全部通过，覆盖空清单、筛选切换、本地恢复和异常缓存。\n\n```text\n" +
  tests +
  "\n```\n\n修改尚未提交。请先在更改面板检查代码，再决定是否合并。";
const enAnswer =
  "## Know what is left to pack\n\nPacking progress, filtering, and local persistence are ready for review.\n\n- **Progress**: total, packed, and remaining item counts.\n- **Unpacked only**: focus on unfinished items; turn it off to restore the full list.\n- **Offline storage**: restore saved items on reopen, with a safe fallback for invalid cache data.\n\n### Verification\n\nAll 6 tests passed: counts, empty lists, filtering, restoring data, and invalid cache.\n\nChanges are uncommitted. Review the diff before merging.";
const scripts = [
  { prompt, steps: [{ kind: "say" as const, text: zhAnswer }] },
  { prompt: englishPrompt, steps: [{ kind: "say" as const, text: enAnswer }] },
];
const daemon = await createTestPaseoDaemon({
  listen: "127.0.0.1",
  listenPort: 7793,
  paseoHomeRoot: path.join(root, "home"),
  agentClients: { claude: new ScriptedAgentClient("claude", scripts) },
  mcpEnabled: false,
  cleanup: false,
});
const client = new DaemonClient({ url: `ws://127.0.0.1:${daemon.port}/ws`, appVersion: "1.5.5" });
await client.connect();
await client.fetchAgents({ subscribe: {} });
const project = await client.addProject(code);
const result = await client.createWorkspace({
  title: "旅行清单",
  source: { kind: "directory", path: code, projectId: project.project!.projectId },
});
const agent = await client.createAgent({
  provider: "claude",
  cwd: code,
  workspaceId: result.workspace!.id,
  title: "增加装包进度统计",
  initialPrompt: prompt,
});
const englishAgent = await client.createAgent({
  provider: "claude",
  cwd: code,
  workspaceId: result.workspace!.id,
  title: "Packing progress and offline storage",
  initialPrompt: englishPrompt,
});
console.log(
  JSON.stringify({ port: daemon.port, root, workspace: result.workspace, agent, englishAgent }),
);
await writeFile(
  path.join(root, "provenance.json"),
  JSON.stringify({ scriptedConversation: true, realTestOutput: tests, source: code }),
);
console.log("READY");
process.on("SIGTERM", async () => {
  await daemon.close();
  process.exit(0);
});
