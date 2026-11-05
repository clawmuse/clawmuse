import type { ClawMuseGoalRun } from "./client.js";

export const CLAWMUSE_GOAL_REPORT_TOOL = "clawmuse_goal_report";
export const CLAWMUSE_GOAL_PROPOSE_TOOL = "clawmuse_goal_propose";

function bullet(lines: readonly string[]): string {
  return lines.map((line) => `- ${line}`).join("\n");
}

/**
 * Prompts are written in Simplified Chinese because the owner reads the cards
 * and reports on a Chinese phone UI; the agent is told to answer in Chinese
 * too, whatever language the repository uses.
 *
 * The planner reads, never writes. It ends by calling the propose tool once; the
 * service dedupes by title, so the prompt only has to steer away from what is
 * already open.
 */
export function buildClawMuseGoalPlanPrompt(run: ClawMuseGoalRun): string {
  const open =
    run.openGoalTitles.length > 0
      ? `这个仓库已经提出或正在进行的目标（不要重复提，也不要提换个说法的同一件事）：\n${bullet(run.openGoalTitles)}`
      : "这个仓库目前没有进行中的目标。";
  return [
    `你是仓库 ${run.repoDisplayName} 的规划 Agent。你的任务是找出几件能让这个仓库变得更好的工作，以「目标卡片」的形式提出来。主人会在手机上逐张阅读，决定接受还是丢弃；在接受之前什么都不会执行。`,
    "",
    "只读地巡视仓库，不要改动任何东西。按价值从高到低依次看：",
    bullet([
      "未处理的 issue 和 pull request（`gh` 可用且已登录就用，不可用就安静跳过）",
      "失败或不稳定的 CI、坏掉的构建、失败的测试",
      "TODO / FIXME 注释和做了一半的功能",
      "安全通告，以及有明确升级路径的过期依赖",
      "没有测试的模块、和代码不一致的文档",
    ]),
    "",
    "好的目标卡片要有边界（一次 Agent 会话、最多几个小时能做完）、可验证（完成标准能被检查）、值得主人花注意力。三张扎实的提案好过八张泛泛的。最多提五张。",
    "",
    open,
    "",
    `完成后，调用 \`${CLAWMUSE_GOAL_PROPOSE_TOOL}\` 工具（使用 clawmuse_goals MCP 服务器），且只调用一次，把所有提案一起提交。每条提案包含：简短的祈使句 \`title\`（80 字以内）、说明哪里有问题和要改成什么的 \`summary\`、主人能亲自验证的 \`acceptance\` 完成标准，以及 \`priority\`（1 最紧急，5 可做可不做）。`,
    "",
    "语言要求：title、summary、acceptance 一律用简体中文写，不管仓库本身用什么语言。代码标识符、命令、文件路径保持原样。",
    "",
    "规则：不要编辑文件，不要运行会写入工作区的安装或构建命令，不要开分支或 pull request。如果仓库没有值得提的事，就用空列表调用工具。",
  ].join("\n");
}

/**
 * The executor's final report decides the goal's fate (see the service's
 * transition table), so the prompt spells out the five kinds and insists on
 * exactly one closing report.
 */
export function buildClawMuseGoalExecutePrompt(run: ClawMuseGoalRun): string {
  const goal = run.goal;
  if (!goal) {
    throw new Error(`Goal run ${run.runId} has no goal to execute`);
  }
  const history =
    run.priorReports.length > 0
      ? `这个目标之前几轮的汇报：\n${bullet(
          run.priorReports.map(
            (report) =>
              `[${report.kind}] ${report.message}${report.prUrl ? `（${report.prUrl}）` : ""}`,
          ),
        )}\n从那里接着做，不要从头再来。`
      : "这是这个目标的第一轮。";
  const instruction = run.instruction
    ? `主人给这一轮加了指示；与上面内容冲突时以它为准：\n${run.instruction}`
    : null;
  const remaining = Math.max(0, goal.budgetRuns - goal.runsUsed);
  return [
    `你正在无人值守地处理仓库 ${run.repoDisplayName}。没有人盯着这个会话，主人之后会在手机上看结果。`,
    "",
    `目标：${goal.title}`,
    `要做什么、为什么：${goal.summary}`,
    `完成标准：${goal.acceptance}`,
    "报告时提供 evidence：revision 写提交 SHA 或明确的产物版本；checks 逐项填写 name、result（passed/failed/not_run）及 detail；artifacts 填 label 和可访问的 url。证据必须来自本次实际检查，不得把历史通过当成当前通过。",
    `预算：这是第 ${goal.runsUsed + 1} 轮，共 ${goal.budgetRuns} 轮；${remaining > 1 ? `这轮之后还可以再跑 ${remaining - 1} 轮` : "这是最后一轮，除非主人追加"}。`,
    "",
    history,
    ...(instruction ? ["", instruction] : []),
    "",
    "工作方式：",
    bullet([
      "授权范围仅限这个目标的仓库改动、分支提交和本地检查；轮数不是金额预算。",
      "不授权部署、合并、采购、扣款、发信、删除用户数据或绕过权限。需要额外权限时报告 needs_decision 并停止。",
      "在分支上做，绝不直接改默认分支。按目标要求提交；未要求提交时可保留工作区改动供主人审查。",
      "有可供审查的成果时记录分支和改动；只有主人明确授权发布 PR 时才创建或更新 PR。不要合并。",
      "宣布完成之前先跑项目自己的检查（typecheck、lint、测试）。",
      "不要在对话里提问，没有人会回答。需要决策就用下面的工具汇报然后停下。",
      "不要碰无关代码，不要改写历史，不要删除不是你建的分支。",
    ]),
    "",
    `结束前调用 \`${CLAWMUSE_GOAL_REPORT_TOOL}\` 工具（使用 clawmuse_goals MCP 服务器），且只调用一次，给出最终状态。\`kind\` 要如实选：`,
    bullet([
      "`done`：完成标准已达成，产物和检查证据已提交给主人审查。",
      "`progress`：有实质进展但还没做完；预算还有的话下一轮会自动接着跑。写清楚下一轮该做什么。",
      "`blocked`：没法继续（缺权限、环境坏了、依赖失败）。写清楚卡在哪。",
      "`needs_decision`：有两条以上合理路径，该由主人选。简要列出选项。",
      "`nothing_to_do`：目标已经满足，或已经不再适用。",
    ]),
    "有 pull request 就带上 `prUrl`。`message` 用简体中文，写明产物或分支、执行的检查与真实结果、遗留问题。done 仅提交成果，必须由用户验收。",
  ].join("\n");
}
