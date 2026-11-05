---
title: 辅助模型
description: 为下一步提示词预测、工作区标题、提交信息和 PR 文本配置共享辅助模型。
nav: 辅助模型
---

# 辅助模型 {#metadata-generation}

Paseo 会请语言模型替你编写一些简短的文本，省去你自己动手。这与你正在对话的 Agent 无关：它是一次在后台进行的小型单次调用。

共享辅助模型链负责生成：

- **下一步提示词预测**：在对话输入框中推荐一条后续消息。
- **工作区标题**：工作区的简短任务式标签，显示在侧边栏中。
- **worktree 分支名**：新建的 worktree 隔离工作区所用分支的 slug。
- **提交信息**：为你要提交的改动生成简洁的提交信息。
- **PR 标题和正文**：创建 PR 时根据 diff 起草。

工作区标题和它的分支名由同一个提示词一起生成，但它们的措辞可以分别配置（见下文）。

## 如何选择模型 {#how-a-model-is-chosen}

Paseo 有两种模式。**自动** 是默认模式，无需任何配置。**手动** 只使用你选择的模型。

在自动模式下，Paseo 会构建一个有序的候选列表，逐个尝试，直到生成成功，因此慢或不可用的模型会让位给下一个：

1. **内置默认值**，与你已启用的 Provider 的模型进行匹配：
   1. 一个 `haiku` 模型
   2. `gpt-5.4-mini`（低推理）
   3. `minimax-m3`
   4. `nemotron-3-super`
2. 最后的备选：该 Agent 或草稿**当前选中的模型**。

每个默认值按模型 id 或名称匹配，因此第一个提供匹配模型的已启用 Provider 胜出。没有匹配的默认值会被跳过。去除重复项后，生成过程从上到下依次尝试。默认顺序的意图是：对于这些简短任务，优先使用小、快、便宜的模型，最后才退回到你选中的模型。

在手动模式下，Paseo 只按你的顺序尝试你配置的模型。它不会加入内置默认值或当前选中的模型，因此你的提示词和 diff 只会发送给你选择的 Provider。如果所有配置的模型都失败，生成就会失败：不会生成工作区标题和分支名，提交和拉取请求会使用占位文本。请选择适合这些任务的模型。

每次失败都会写入 `$PASEO_HOME/daemon.log`（默认是 `~/.paseo/daemon.log`），包含 Provider、模型和错误。如果手动模型没有生成标题、分支名、提交信息或拉取请求文本，请查看这里。

## 选择模型 {#choose-a-model}

打开 **设置 → 主机 → 辅助模型**，选择 **自动** 或 **手动**。在手动模式下选择主模型，最多添加两个备用模型。Paseo 按显示顺序依次尝试；每个备用模型都可以修改或删除。切换回自动会清空列表。更改保存在主机上，并同步到已连接的客户端。

## 配置自定义的回退顺序 {#configure-a-custom-fallback-order}

也可以直接在 `~/.paseo/config.json` 的 `agents.metadataGeneration.providers` 中配置有序模型链。Paseo 按顺序尝试你的条目，不会尝试其他模型。空列表表示自动。

```json
{
  "agents": {
    "metadataGeneration": {
      "promptPredictions": true,
      "providers": [
        { "provider": "claude", "model": "claude-haiku-4-5-20251001", "thinkingOptionId": "low" },
        { "provider": "opencode" }
      ]
    }
  }
}
```

每个条目接受：

- `provider`（必填）：Provider id。内置 id 为 `claude`、`codex`、`copilot`、`opencode` 和 `pi`；自定义 Provider 使用你为它指定的 id。
- `model`（可选）：特定的模型 id。省略时使用该 Provider 的默认模型。
- `thinkingOptionId`（可选）：支持推理/思考级别的模型所用的级别。如果该值对该模型无效，则使用模型的默认值。

设置界面会保留文件中已有的较长模型链。直接编辑文件后，请重新加载主机配置。

## 下一步提示词预测 {#next-message-predictions}

在辅助模型中启用 **下一步提示词预测**，Agent 回复完成后，输入框会推荐一条后续消息。Codex、Claude Code 和其他受支持的 Agent 会话共用这套辅助模型链。该功能默认开启，调用会消耗所选 Provider 的正常用量。

输入框为空时，点击建议或按 **Tab** 即可填入可编辑的草稿；手机上轻触建议即可。确认内容后再发送。点击关闭按钮或按 **Escape** 可忽略建议。

打开历史会话只复用缓存，不会额外触发模型调用。输入文字、添加附件、听写和语音模式期间会隐藏建议。预测失败时不显示建议。同一条预测由主机在客户端之间共享，在两台设备打开同一会话不会重复生成。

此功能复用 [Cindy 的开源预测代码](https://github.com/makecindy/cindy)，采用 Apache-2.0 许可；来源声明见仓库中的 `NOTICE`。

## 按项目设置指令 {#per-project-instructions}

你可以在仓库根目录的 `paseo.json` 文件中，按仓库调整每类元数据的措辞。Paseo 从基础分支已提交的版本中读取它，方式与读取 worktree 配置相同。

```json
{
  "metadataGeneration": {
    "title": { "instructions": "Keep titles to a few words, no leading verb." },
    "branchName": { "instructions": "Use the format <type>/<scope>-<short-desc>." },
    "commitMessage": { "instructions": "Follow Conventional Commits." },
    "pullRequest": { "instructions": "Include a Testing section in the body." }
  }
}
```

每个键都是可选的；只有你设置的键会受影响。你的指令会**替换**该类元数据的默认风格，而不是追加到默认风格之后，因此你的措辞永远不会与 Paseo 的默认值冲突。功能性要求（要生成什么以及输出格式）始终适用，不能被覆盖。
