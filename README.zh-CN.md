<p align="center">
  <img src="https://clawmuse.com/brand/clawmuse-mark.svg" width="72" height="72" alt="ClawMuse logo">
</p>

<h1 align="center">ClawMuse</h1>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/clawmuse/clawmuse/stargazers">
    <img src="https://img.shields.io/github/stars/clawmuse/clawmuse?style=flat-square&logo=github" alt="GitHub stars">
  </a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/License-Apache_2.0-5eead4?style=flat-square" alt="Apache-2.0 协议">
  </a>
  <a href="https://clawmuse.com/zh/">
    <img src="https://img.shields.io/badge/官网-clawmuse.com-102827?style=flat-square" alt="ClawMuse 官网">
  </a>
  <a href="https://apps.apple.com/app/clawmuse/id6810076165">
    <img src="https://img.shields.io/badge/iOS-App_Store-0ea5e9?style=flat-square&logo=apple" alt="App Store 下载">
  </a>
  <a href="https://clawmuse.com/zh/download/">
    <img src="https://img.shields.io/badge/全平台-macOS_%7C_Windows_%7C_Linux_%7C_iOS_%7C_Android_%7C_Web-2ea44f?style=flat-square" alt="支持平台">
  </a>
</p>

<p align="center">
  <strong>在桌面端、iPhone、Android、Web 浏览器、实时语音或命令行中，随时操控你电脑上的 Claude Code、Codex、Copilot、OpenCode、Pi、Antigravity 与 Muse Code。项目与代码始终留在你自己的机器上。</strong>
</p>

<p align="center">
  <a href="https://clawmuse.com/zh/"><strong>官方网站</strong></a>
  ·
  <a href="https://clawmuse.com/zh/download/"><strong>下载客户端</strong></a>
  ·
  <a href="https://clawmuse.com/zh/docs/"><strong>使用指南</strong></a>
  ·
  <a href="https://clawmuse.com/zh/plugins/"><strong>官方插件</strong></a>
</p>

<p align="center">
  <img src="https://clawmuse.com/screenshots/zh-wide-diff.webp" alt="ClawMuse 桌面端三栏工作区与代码 Diff 对比视图" width="100%">
</p>

<table>
  <tr>
    <td width="50%" align="center">
      <img src="https://clawmuse.com/screenshots/zh-phone-chat.webp" alt="ClawMuse 移动端会话与工具验证" width="280">
      <br><sub>手机端会话流、测试验证与语音派发</sub>
    </td>
    <td width="50%" align="center">
      <img src="https://clawmuse.com/screenshots/zh-phone-diff.webp" alt="ClawMuse 移动端代码 Diff 审阅" width="280">
      <br><sub>iOS & Android 原生逐行代码 Diff 审查</sub>
    </td>
  </tr>
</table>

---

## 为什么选择 ClawMuse

ClawMuse 是一个本地优先、面向多终端的开源 AI Coding Agent 控制平面。守护进程（Daemon）直接运行在你的 Mac、Linux 或 Windows 主机上，负责拉起各家编码 Agent、隔离 Git Worktree，并将结构化时间线、代码 Diff、仓库文件树与持久化终端实时同步到你手边的任意设备。

- **多 Agent 结构化工作台** — 原生适配 **Claude Code**、**Codex**、**GitHub Copilot**、**OpenCode**、**Pi / OMP**、**Antigravity** 与 **Muse Code**，并支持 **Cursor**、**Kimi**、**Kiro**、**TRAE** 等 ACP Agent。思考过程、工具调用、代码变更和权限审批统一规范化展示，同时提供断连不退出的独立终端 Worker。
- **桌面、原生手机端、Web 与 CLI 全覆盖** — 在桌面端 Electron 开始工作，离开座位后用原生 **iOS**（[App Store](https://apps.apple.com/app/clawmuse/id6810076165)）、**Android** 或 **Web**（`app.clawmuse.com`）随时接手，也能在服务器上直接用 CLI 编排。
- **常驻实时语音助理与听写** — 离开电脑也能免手对话：主动汇总每台主机上正在跑、待审批与已完成的任务，自动核对归档，并口头派发新任务。
- **Tasks & Goals 任务看板（`localGoals`）** — 支持 Planner 扫描仓库提议目标卡片，在手机或桌面审批后进入隔离 Git Worktree 按轮次预算无人值守执行、跑通独立校验并生成 PR，最终由所有者一键 `land` 合并。
- **多机额度面板与近 30 天历史统计** — 统一追踪 5h / 7d 会话限额与跨主机合并的 30 天 Token 消耗，支持 iOS 锁屏灵动岛胶囊与桌面额度小组件。
- **Daemon 托管插件体系与 SDK** — 插件只需在主机侧安装（内置会话翻译、限流自动重试、设备预览、自定义 Provider 与用量数据源等），即可在桌面、手机与 Web 同步呈现 UI 面板。
- **代码与凭据留在本机** — 仓库文件、模型账号、MCP 配置与命令执行均留在你的主机内。

---

## 快速开始

### 前置条件

在执行任务的主机上，至少安装并登录任意一款支持的 AI 编程工具：

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [Codex](https://github.com/openai/codex)
- [GitHub Copilot CLI](https://github.com/features/copilot/cli/)
- [OpenCode](https://github.com/anomalyco/opencode)
- [Pi](https://pi.dev)
- Antigravity CLI / Muse Code / ACP 兼容工具（Cursor、Kimi、Kiro、TRAE 等）

### 1. 官方安装包（推荐）

- **桌面端与 Android**：前往 [clawmuse.com/zh/download](https://clawmuse.com/zh/download/) 下载已签名的 macOS（Apple Silicon / Intel）、Windows、Linux（`.deb` / `.rpm` / `.tar.gz` / `AppImage`）与 Android APK。
- **iOS / iPadOS**：在 [App Store](https://apps.apple.com/app/clawmuse/id6810076165) 直接下载。

### 2. 从开源仓库源码构建与自托管运行

> **开源版范围说明：** 本公开仓库以 **Apache-2.0** 协议完整开源桌面客户端、移动端/Web 前端、Daemon、CLI、通信协议、SDK、Relay 源码与内置插件；ClawMuse 托管商业服务（官方托管中继、账号中心、状态推送后端与云空间服务）不在本仓库内。
>
> 自建环境可通过 **局域网直连**、**SSH 隧道**、**Tailscale / WireGuard**，或自行部署 `packages/relay` 并配置 `PASEO_RELAY_ENDPOINT` 来连接手机与网页端。

环境要求：**Node.js 22+** 与 **npm**：

```bash
git clone https://github.com/clawmuse/clawmuse.git
cd clawmuse
npm ci

# 构建协议、Client SDK、服务端 Daemon 与 CLI 类型声明
npm run build:server

# 启动开发态本地 Daemon（默认使用仓库内 .dev/paseo-home，端口 6768）
npm run dev

# 在另一个终端启动 Electron 桌面端或使用 CLI
npm run dev:desktop
npm run cli -- ls -a -g
```

如需本地调试 Expo 移动端或 Web 端：

```bash
npm run build:app-deps
npm run web
```

---

## CLI 常用命令

桌面与手机端能做的全部操作，都可以通过 CLI 直接驱动同一套 WebSocket Daemon：

```bash
# 在当前目录或独立 Git Worktree 中启动编码 Agent
npm run cli -- run --provider claude/sonnet-4.6 "检查鉴权中间件并补充单元测试"
npm run cli -- run --provider codex/gpt-5.4 --worktree feat-cache "实现缓存淘汰策略"

# 查看列表、流式日志、续发指令或处理权限请求
npm run cli -- ls
npm run cli -- logs <agent-id>
npm run cli -- send <agent-id> "运行 vitest 测试并汇报结果"
npm run cli -- permit allow <request-id>

# 持久化终端与定时任务
npm run cli -- terminal ls
npm run cli -- schedule ls

# 通过局域网、Tailscale 或 SSH 隧道直连远程主机 Daemon
npm run cli -- --host my-workstation.ts.net:6768 ls
```

---

## 仓库目录结构

| 目录                                | 说明                                                                                                                                       |
| :---------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/server`                   | 本地 Node.js Daemon：Agent 生命周期管理、WebSocket API、MCP 工具集、Git/Worktree 编排、Local Goals 与独立终端 Worker                       |
| `packages/app`                      | 跨平台 Expo / React Native 客户端，覆盖 iOS、Android、Web 与桌面共享界面                                                                   |
| `packages/desktop`                  | Electron 桌面外壳：托管本地 Daemon、原生菜单、多窗口与内置可编程浏览器                                                                     |
| `packages/cli`                      | Commander.js 命令行工具（`clawmuse` / `paseo`），适合无桌面服务器与自动化脚本                                                              |
| `packages/protocol`                 | 向后兼容的 Zod 协议 Schema 与终端/文件二进制帧编解码                                                                                       |
| `packages/client`                   | TypeScript SDK（`PaseoClient` / `PaseoApi`），供前端与插件统一调用                                                                         |
| `packages/relay`                    | 基于 Noise `NK` 的零知识端到端加密中继传输层与参考实现                                                                                     |
| `packages/plugin`                   | 插件运行时、清单规范与宿主 IPC 接口                                                                                                        |
| `packages/highlight`                | 代码语法高亮与 Diff 分词引擎                                                                                                               |
| `packages/expo-agent-live-activity` | iOS ActivityKit / WidgetKit 原生模块（灵动岛胶囊与配额小组件）                                                                             |
| `packages/expo-two-way-audio`       | iOS/Android 原生全双工音频模块，支撑低延迟实时语音                                                                                         |
| `packages/website`                  | [clawmuse.com](https://clawmuse.com/zh/) 官网源码                                                                                          |
| `plugins/`                          | 内置官方插件（`antigravity-provider`、`conversation-translation`、`capacity-retry`、`device-preview`、`usage-auto-resume` 及各家用量源等） |

---

## 开源协议与致谢

- **开源协议**：本项目依据 [Apache License, Version 2.0](./LICENSE) 开源；完整版权与声明见 [NOTICE](./NOTICE)。
- **致谢项目**：
  - 衍生自 [Paseo](https://github.com/getpaseo/paseo)（Copyright (c) 2025-present Mohamed Boudra，Apache-2.0）。
  - 提示词推荐相关模块参考并改造自 [Cindy](https://github.com/makecindy/cindy)（Copyright 2026 XD Inc.，Apache-2.0）。

## 问题反馈与联系

- 问题反馈与功能建议：[GitHub Issues](https://github.com/clawmuse/clawmuse/issues)
- 联系邮箱：[hello@clawmuse.com](mailto:hello@clawmuse.com)
- 官方网站：[clawmuse.com](https://clawmuse.com/zh/)
