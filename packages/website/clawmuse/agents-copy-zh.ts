import type { AgentSlug, AgentTranslation } from "./agents-content";

export const chineseAgentCopy = {
  "claude-code": {
    intro: "Anthropic 官方的编程 Agent，在终端里读代码、改文件、跑命令。",
    about:
      "Claude Code 是 Anthropic 做的命令行编程工具。它能读懂整个项目，直接改文件、跑测试、提交代码，还能通过 MCP 接入外部工具，用 CLAUDE.md 记住项目约定。适合从读陌生代码到做完整功能的各种活。",
    setup: "第一次运行 claude，按提示在浏览器里登录 Claude 账号，或者用 Anthropic Console 的账号。",
    useCase:
      "下班路上想起一个 bug，在手机上让 Claude 查原因、改好、跑一遍测试。回到电脑前，改动已经在项目里等你看了。",
    question: "ClawMuse 里的 Claude Code 和终端里的是同一个吗？",
    answer:
      "是。ClawMuse 调用的就是你电脑上装的 claude 命令，账号和用量都还是你自己的，ClawMuse 不提供模型额度。",
  },
  codex: {
    intro: "OpenAI 的开源编程 Agent，用 ChatGPT 账号或 API Key 登录。",
    about:
      "Codex CLI 是 OpenAI 的开源编程 Agent，在你自己的电脑上运行。它能读项目、改代码、跑命令，可以用 ChatGPT 账号直接登录，也可以用 API Key。",
    setup: "运行 codex，选择用 ChatGPT 账号或 API Key 登录。",
    useCase:
      "给 Codex 一个说得清楚的小任务，比如补一组测试。手机上看它改了什么、跑了哪些检查，不对就接着说。",
    question: "ClawMuse 包含 Codex 的模型用量吗？",
    answer: "不包含。用量走你自己的 OpenAI 账号或 API Key，ClawMuse 不提供模型额度。",
  },
  copilot: {
    intro: "GitHub 的终端 Agent，和仓库、Issue、PR 打通。",
    about:
      "GitHub Copilot CLI 把 Copilot 的编程 Agent 搬到了终端。它和 GitHub 打通，可以直接处理仓库、Issue 和 PR。使用前需要有效的 Copilot 订阅。",
    setup: "运行 copilot，没登录的话输入 /login，按提示登录 GitHub 账号。",
    useCase: "手机上收到新 Issue，直接让 Copilot 在电脑上的仓库里开始修，回头再看改动。",
    question: "连接的是编辑器里的 Copilot 扩展吗？",
    answer: "不是。ClawMuse 启动的是 Copilot CLI，只装编辑器扩展不够，要按上面的命令装 CLI。",
  },
  opencode: {
    intro: "开源的终端编程 Agent，模型服务商随便选。",
    about:
      "OpenCode 是开源的终端编程 Agent，不绑定某一家模型，可以接多家服务商，也可以接本地模型。如果你想自己决定用什么模型，它是常见的选择。",
    setup: "运行 opencode，在里面输入 /connect，选服务商并填好账号或 API Key。",
    useCase: "同一个项目，这次用便宜的模型做整理，下次换强一点的模型做重构，都在手机上选。",
    question: "OpenCode 1 和 2 怎么选？",
    answer:
      "两个版本都用 opencode 命令，不能同时装。上面是 OpenCode 官方文档里的版本 1 命令，想用版本 2 请看官方的 V2 文档。模型配置都由 OpenCode 自己管。",
  },
  pi: {
    intro: "轻量的终端编程 Agent，用扩展和技能按自己的习惯改造。",
    about:
      "Pi 是一个很轻的终端编程 Agent，核心功能不多，靠扩展、技能和提示词模板按自己的习惯搭。支持多家模型服务商，可以用 API Key 或 OAuth 登录，会话中用 /model 切换模型。",
    setup: "运行 pi，按提示用 API Key 或 OAuth 登录模型服务商。",
    useCase: "在电脑上让 Pi 查文件、起草修改，出门后在手机上接着同一段对话。",
    question: "Pi 能用我电脑上已有的环境吗？",
    answer: "能。Pi 就在你的电脑上跑，用的是这台电脑的命令和配置。先拿小任务试一下模型和项目权限。",
  },
  omp: {
    intro: "基于 Pi 的增强版终端 Agent，开箱自带更多功能。",
    about:
      "OMP（Oh My Pi）是基于 Pi 发展出来的终端编程 Agent，内置的功能比 Pi 更多，可以用已有的模型订阅登录。已经习惯 Pi 又想少折腾配置的人可以试试。",
    setup: "运行 omp，在里面输入 /login 选择模型服务商。",
    connectNote: "OMP 默认关闭。要在主机配置里把 agents.providers.omp.enabled 设成 true 才会出现。",
    useCase: "继续用你在 OMP 里习惯的工作流，在手机上看文件和对话，跟进任务结果。",
    question: "为什么 Provider 列表里没有 OMP？",
    answer: "OMP 默认关闭。把 agents.providers.omp.enabled 设成 true，再确认这台电脑上能运行 omp。",
  },
  antigravity: {
    intro: "Google Antigravity 的命令行版本，命令是 agy。",
    about:
      "Antigravity CLI 是 Google 的 Agent 开发平台 Antigravity 的命令行工具，命令叫 agy。ClawMuse 自带它的插件，装好 CLI 就能用。",
    setup: "运行 agy，按提示登录 Google 账号。",
    connectNote: "这个集成只有完整访问模式，工具执行时不会停下来询问，建议先从范围小的任务开始。",
    useCase: "任务交给 agy 之后就可以离开电脑，在手机上看进度，随时补充要求。",
    question: "有哪些权限与历史限制？",
    answer:
      "ClawMuse 启动 agy 时会跳过权限询问。后台服务重启后 Agent 能保留对话状态，但历史记录不会回放到 ClawMuse。ClawMuse 内置的 MCP 工具不可用。",
  },
  "muse-code": {
    intro: "Meta 的编程 Agent，用 Muse 系列模型写代码。",
    about:
      "Muse Code 是 Meta 的编程 Agent，背后是 Meta 的 Muse 系列模型。ClawMuse 自带它的插件，通过 Muse Session Protocol 连接。需要 1.3.0 或更新的版本。",
    setup: "运行 muse login 登录，或者配置 META_API_KEY。",
    connectNote: "集成默认关闭沙箱并信任工作区。需要沙箱的话，请在 Provider 选项里打开。",
    useCase: "用 Muse 模型改项目，在手机上看对话和改动。",
    question: "Muse 的沙箱和审批模式是同一设置吗？",
    answer:
      "不是，这是两个设置。沙箱默认关闭，需要时在 Provider 选项里配置。ClawMuse 内置的 MCP 工具目前有上游兼容限制。",
  },
  cursor: {
    intro: "Cursor 的命令行 Agent，不开编辑器也能用。",
    about:
      "Cursor CLI 把 Cursor 的 Agent 带到终端，不打开编辑器也能让它改代码。安装后的命令是 agent，旧命令 cursor-agent 也还能用。",
    setup: "运行 agent login，在浏览器里登录 Cursor 账号。",
    useCase: "白天在 Cursor 里写到一半，路上用手机让 Agent 接着把剩下的改完。",
    question: "只装 Cursor 编辑器就够了吗？",
    answer: "不够。ClawMuse 启动的是 cursor-agent acp，要按上面的命令单独装 CLI。",
  },
  gemini: {
    intro: "Google 的开源终端 Agent，用 Google 账号就能登录。",
    about:
      "Gemini CLI 是 Google 开源的终端 Agent，把 Gemini 模型带进命令行。它能读写文件、跑命令，支持 MCP，还能用 Google 搜索查资料。",
    setup: "运行 gemini，选择用 Google 账号登录，或者配置 API Key。",
    useCase: "让 Gemini 先讲清楚项目结构，再做一个小补丁，手机上看结果。",
    question: "手机上的 Google 登录能授权电脑上的 Gemini CLI 吗？",
    answer: "不能。Gemini CLI 要在运行它的那台电脑上登录，手机登录 ClawMuse 不会传递这个授权。",
  },
  hermes: {
    intro: "Nous Research 的 Agent，有长期记忆和可积累的技能。",
    about:
      "Hermes 是 Nous Research 做的 Agent，能记住之前的事，把做过的事沉淀成技能。模型可以选 Nous Portal、OpenRouter、OpenAI 或你自己的接口。",
    setup:
      "接入 ClawMuse 要用 ACP，所以装好后还要跑上面的 ACP 那条命令。然后运行 hermes setup 完成配置。",
    useCase: "把需要 Hermes 已有工具和记忆的项目问题交给它，在手机上看回答。",
    question: "ClawMuse 会配置 Hermes 的记忆和工具吗？",
    answer: "不会。这些都由 Hermes 管，先按它的文档配好，再从 ClawMuse 派任务。",
  },
  "qwen-code": {
    intro: "阿里通义千问的开源终端 Agent。",
    about:
      "Qwen Code 是通义千问团队开源的终端编程 Agent，针对 Qwen 模型做了优化。可以用安装脚本、npm 或 Homebrew 安装。",
    setup: "运行 qwen，在里面输入 /auth 配置账号或 API Key。",
    useCase: "在配好模型的仓库里用 Qwen Code 改代码，换台设备接着聊。",
    question: "所有 Qwen 技能都保证可用吗？",
    answer:
      "不保证。ClawMuse 打开了上游的实验性技能参数，能用哪些取决于 Qwen Code 版本和项目配置。",
  },
  kimi: {
    intro: "月之暗面的 Kimi Code CLI，用 Kimi 模型写代码。",
    about:
      "Kimi Code CLI 是月之暗面（Moonshot AI）的终端编程 Agent，用 Kimi 模型。可以用 Kimi Code 账号登录，也可以用 Moonshot 开放平台的 API Key。",
    setup: "运行 kimi，在里面输入 /login，选 Kimi Code 账号或 Moonshot API Key。",
    useCase: "让 Kimi 先出实现方案，离开工位后在手机上跟进文件改动。",
    question: "Kimi 的模型列表从哪里来？",
    answer: "ClawMuse 向电脑上配好的 Kimi CLI 查询。能用哪些模型，看你的账号权限和安装版本。",
  },
  amp: {
    intro: "多模型编程 Agent，能在云端机器上继续跑任务。",
    about:
      "Amp 是一个多模型的编程 Agent，会按任务选用不同的模型，还能在云端的 Orb 机器上跑任务。ClawMuse 通过社区维护的 amp-acp 适配器连接它。",
    setup: "除了 Amp 本身，还要装 amp-acp 适配器（上面的 ACP 那条命令）。然后运行 amp login 登录。",
    useCase: "先拿一个小任务试通适配器，再把已有的 Amp 工作流放到 ClawMuse 里继续。",
    question: "amp-acp 是 Amp 官方的集成吗？",
    answer: "不是。它是独立的社区适配器，兼容性取决于适配器和你装的 Amp 版本。",
  },
  auggie: {
    intro: "Augment Code 的命令行 Agent，擅长读懂大型代码库。",
    about:
      "Auggie 是 Augment Code 的命令行 Agent，强项是它的 Context Engine，能在大项目里找到改动真正牵涉的代码。需要 Node.js 20 或更新版本。",
    setup: "运行 auggie login，在浏览器里登录 Augment 账号。",
    useCase: "动手前先让 Auggie 列出这次改动牵涉哪些文件，确认后再开始改。",
    question: "Auggie 会自动更新吗？",
    answer: "ClawMuse 目录里固定了版本，也关掉了 CLI 自动更新。要新版本时看目录有没有更新。",
  },
  cline: {
    intro: "开源编程 Agent Cline 的命令行版本。",
    about:
      "Cline 是一个开源编程 Agent，最早是编辑器扩展，现在也有命令行版本。可以用 Cline 自己的服务，也可以接你自己的模型账号。",
    setup: "运行 cline auth，选择服务商和模型。",
    useCase: "给 Cline 一个小范围的文件修改，手机上看改动和它跑过的命令。",
    question: "浏览器工具一定能从 ClawMuse 用吗？",
    answer: "不一定。这取决于 CLI 和电脑上的配置，添加目录项不会自动带上浏览器环境。",
  },
  codebuddy: {
    intro: "腾讯的 AI 编程助手，在终端里用。",
    about:
      "CodeBuddy Code 是腾讯的 AI 编程助手的命令行版本，能在终端里理解项目、改代码。命令是 codebuddy，也可以用短命令 cbc。",
    setup: "运行 codebuddy，按提示登录账号。",
    useCase: "把已经用 CodeBuddy 打理的项目放进 ClawMuse，手机上接着对话。",
    question: "添加目录项就会安装 CodeBuddy 吗？",
    answer: "不会。目录项调用的是已有的 codebuddy --acp 命令，要先按上面的命令装好 CLI。",
  },
  codewhale: {
    intro: "开源终端编程 Agent，托管模型和本地模型都能接。",
    about:
      "CodeWhale 是开源的终端编程 Agent，能读项目、改文件、跑测试。模型可以接 DeepSeek 这样的托管服务，也可以接本地模型，也支持用 ChatGPT 账号。",
    setup:
      "配置要用的模型，比如用下面的命令连接 DeepSeek。想用 ChatGPT 账号就运行 codewhale auth chatgpt。",
    useCase: "用 DeepSeek 跑日常改动，手机上看结果，需要时再换模型。",
    question: "用 CodeWhale 就代表模型在本地运行吗？",
    answer:
      "不代表。模型在本地还是云端，看你怎么配。用云端模型时，提示词和文件内容会发给对应服务商。",
  },
  "cortex-code": {
    intro: "Snowflake 的 AI 编程 Agent，懂你的数据和权限。",
    about:
      "Cortex Code 是 Snowflake 的命令行 Agent，专门做和 Snowflake 相关的开发，比如 SQL、数据管道和数据应用。它用你的 Snowflake 账号和角色权限工作。",
    setup: "第一次运行 cortex，跟着设置向导连接 Snowflake 账号。",
    useCase: "手机上让它查一段 SQL 或改一条数据管道，改之前先确认用的是哪个角色。",
    question: "ClawMuse 会授予 Snowflake 数据访问权限吗？",
    answer: "不会。Cortex 用的是你配置的 Snowflake 权限，读写前先确认角色和数据范围。",
  },
  corust: {
    intro: "专门面向 Rust 项目的编程 Agent。",
    about:
      "Corust Agent 是 Corust.ai 做的编程 Agent，主要面向 Rust 项目。它用预编译版本发布，支持 macOS、Linux 和 Windows。",
    setup:
      "官方没有一键安装脚本。到下方的发布页下载对应系统的压缩包，解压后把 corust-agent-acp 放到命令行能找到的目录，再配置模型访问。",
    useCase: "让它解释一个 Rust 模块，或者做局部修改，再跑项目自己的检查。",
    question: "ClawMuse 会安装 Rust 工具链吗？",
    answer: "不会。Agent 用的是电脑上的环境，编译或测试前要自己装好 Rust 和项目依赖。",
  },
  crow: {
    intro: "原生支持 ACP 的精简编程 Agent，内置联网搜索。",
    about:
      "crow-cli 是原生支持 ACP 的编程 Agent，有状态、内置 web_search 和 web_fetch，还有公开的技能目录。官方的说法很直接：它和你有一样的权限，信任它才用。安装脚本会同时装上 Crow ADE 客户端。",
    setup: "安装后配置好模型凭据。",
    useCase: "先用单文件解释或小补丁感受一下它的工作方式。",
    question: "crow-cli 提供哪些功能？",
    answer:
      "以它实际上报的能力为准。在 ClawMuse 里看这台电脑提供的模式和工具，别套用其他 Agent 的功能。",
  },
  deepagents: {
    intro: "基于 LangChain 的 Deep Agents，通过 ACP 使用。",
    about:
      "Deep Agents 是 LangChain 做的 Agent 框架，deepagents-acp 把它包装成 ACP 服务。默认用 Anthropic 模型，要配 ANTHROPIC_API_KEY。不用单独安装，npx 会自动拉取。",
    setup: "上面的命令可以先试运行。配置好 ANTHROPIC_API_KEY 后再接入 ClawMuse。",
    useCase: "用 Deep Agents 读项目、整理资料和草稿。",
    question: "装好后就有所有 LangChain 集成吗？",
    answer: "没有。能用的工具由 ACP 包和电脑上的配置决定，外部集成要分别配置。",
  },
  devin: {
    intro: "Cognition 的 Devin，在你的终端里运行。",
    about:
      "Devin CLI 是 Cognition 的命令行工具，把 Devin 带到你自己的电脑上，在本地项目里干活。Windows 上要在 PowerShell 里运行安装命令，不能用 Git Bash 或 CMD。",
    setup: "运行 devin，按提示登录账号。",
    useCase: "在 ClawMuse 里给 Devin 派项目任务，手机上跟进。",
    question: "这会自动创建云电脑吗？",
    answer: "不会。添加 CLI 连接不会购买或开通云工作空间，环境和权益请在 Devin 里确认。",
  },
  dimcode: {
    intro: "带交互界面的终端编程 Agent，模型自己选。",
    about:
      "DimCode 是一个带交互式界面的终端编程 Agent，命令是 dim。你在它里面配置模型服务，ClawMuse 通过 ACP 连接。",
    setup: "运行 dim，配置要用的模型服务。",
    useCase: "用同一份项目说明试试不同模型，再决定把大改动交给谁。",
    question: "目录包含 DimCode 模型访问权益吗？",
    answer: "不包含。目录只负责启动它，模型账号和费用看你在 DimCode 里配的服务。",
  },
  dirac: {
    intro: "讲究效率的开源编程 Agent，用锚点方式精确改代码。",
    about:
      "Dirac 是开源的编程 Agent，主打在复杂的真实代码库里更省、更准。它用锚点定位来改文件，还支持 AST 操作。除了 CLI，也有 VS Code 扩展。",
    setup: "运行 dirac，配置要用的模型。",
    useCase: "做一次边界清楚的代码转换，再看补丁有没有改变原有行为。",
    question: "能保证节省模型费用吗？",
    answer: "不能。实际用量看模型、任务大小和验证工作，这里不承诺节省比例。",
  },
  "factory-droid": {
    intro: "Factory 的编程 Agent Droid，在终端里用。",
    about:
      "Droid 是 Factory 的编程 Agent，命令是 droid。首次运行时在浏览器登录 Factory 账号，就能在项目目录里开始用。",
    setup: "在项目目录运行 droid，按提示在浏览器里登录 Factory。",
    useCase: "在准备好的仓库里让 Droid 做任务，手机上看补丁。",
    question: "Droid 能用 ClawMuse 注入的 MCP 工具吗？",
    answer: "不能。这个目录项关掉了 MCP 注入，Droid 会话里没有 ClawMuse 的编排工具。",
  },
  "fast-agent": {
    intro: "Python 的 Agent 框架，能接多家模型。",
    about:
      "fast-agent 是一个 Python 写的 Agent 框架，能接多家模型服务商。fast-agent-acp 是它的 ACP 入口，用 uvx 直接运行，不用单独安装。",
    setup:
      "先装好 uv，配置模型的 API Key（比如 OPENAI_API_KEY），用上面的命令试运行，--model 换成你要的模型。",
    useCase: "把配好的 Agent 环境接进项目流程，不用每台设备重新配置。",
    question: "为什么需要 uvx？",
    answer: "fast-agent 是 Python 包，ClawMuse 通过 uvx 启动它，所以这台电脑要装好 uv。",
  },
  "gajae-code": {
    intro: "先规划再动手的编程 Agent，可以用已有的订阅登录。",
    about:
      "Gajae Code（gjc）是一个编程 Agent 外壳，可以用你已有的模型订阅或 API Key。它可以先访谈、出方案、再审一遍才动手，提问还能转到 Telegram、Discord 和 Slack。目前是 Beta，用的时候多留意结果。",
    setup: "运行 gjc，在里面输入 /login 选你的订阅或服务商。",
    useCase: "需要先想清楚的改动，用它的规划流程走一遍，手机上看方案。",
    question: "这能绕过模型订阅规则吗？",
    answer: "不能。能用哪种访问方式，看 Gajae 和各家服务商的规定。目录的设置不会给你模型权益。",
  },
  glm: {
    intro: "社区适配器，用 Z.AI Coding Plan 跑智谱 GLM 模型。",
    about:
      "glm-acp-agent 是社区做的 ACP Agent，用智谱 Z.AI 的 GLM 系列模型，并支持 Coding Plan 的工具。它不是智谱官方产品。",
    setup: "把 Z.AI 的 API Key 配到环境变量里，或者运行 glm-acp-agent --setup。",
    useCase: "用 Coding Plan 里的 GLM 模型改项目，手机上看工具输出。",
    question: "这等于修改 Claude Code 的 API 地址吗？",
    answer: "不等于。这里启动的是一个独立的 ACP Agent，和给 Claude Code 换接口是两回事。",
  },
  goose: {
    intro: "开源可扩展的 AI Agent，有 CLI 也有桌面版。",
    about:
      "goose 是开源的 AI Agent，有命令行版和桌面版，能接多家模型，靠扩展连接各种工具。它用你在电脑上配置的工具干活。Windows 的安装方式见下方官方文档。",
    setup: "运行 goose configure，选模型服务商并填好密钥。",
    useCase: "把用到 goose 扩展的工程任务交给它，手机上检查它做了什么。",
    question: "所有 goose 扩展都会默认启用吗？",
    answer: "不会。扩展由 goose 配置，开始前看一下启用了哪些工具。",
  },
  grok: {
    intro: "xAI 的编程 Agent Grok Build。",
    about:
      "Grok Build 是 xAI 的编程 Agent，用 grok 命令在终端里运行。能不能用要看你的 xAI 账号和套餐。",
    setup: "运行 grok，按提示登录 xAI 账号。",
    useCase: "让 Grok 拆解代码改动，手机上跟进执行。",
    question: "ClawMuse 包含 Grok 订阅吗？",
    answer: "不包含。使用资格由 xAI 决定，先确认 CLI 能用你的账号跑起来。",
  },
  hoplite: {
    intro: "云端编程工作空间，本地只要一个 CLI 做桥接。",
    about:
      "Hoplite 的 Agent 在云工作空间里运行，本地的 hoplite 命令（也可以写 hplt）只负责连接。适合不想让任务占着自己电脑的情况。ClawMuse 自带插件，从目录添加后启用。",
    setup: "运行 hoplite login 登录。",
    connectNote: "添加后关联项目，或者配置 HOPLITE_PROJECT_ID。",
    useCase: "跟进已经关联 Hoplite 的仓库任务，改动在云端项目里看。",
    question: "Hoplite 直接操作本地项目文件吗？",
    answer:
      "不会。Agent 在 Hoplite 云工作空间运行，本地文件和 ClawMuse 的本地 MCP 工具在那里都用不了。",
  },
  junie: {
    intro: "JetBrains 的编程 Agent，不开 IDE 也能用。",
    about:
      "Junie 是 JetBrains 的编程 Agent。Junie CLI 让它脱离 IDE，在终端里独立运行，用 JetBrains 账号或 Junie API Key 都行。",
    setup: "运行 junie，选择在浏览器里登录，或者用 JUNIE_API_KEY。",
    useCase: "让 Junie 给已有代码库出方案，换台设备看改动。",
    question: "需要一直开着 JetBrains IDE 吗？",
    answer: "不需要。ClawMuse 连的是 Junie CLI，不依赖 IDE 窗口。",
  },
  kilo: {
    intro: "Kilo Code 的开源命令行版本。",
    about:
      "Kilo CLI 是开源编程 Agent Kilo Code 的命令行版本，能接多家模型服务商，通过 kilo acp 接入 ClawMuse。",
    setup: "运行 kilo，在里面输入 /connect 配置服务商。",
    useCase: "用现有的模型账号继续 Kilo 任务，文件和对话都在 ClawMuse 里看。",
    question: "Kilo 编辑器配置会自动生效吗？",
    answer: "别这么假设。CLI 和编辑器不一定共享设置，到运行 CLI 的电脑上核对模型和凭据。",
  },
  kiro: {
    intro: "AWS 的 Kiro，命令行版本是 kiro-cli。",
    about:
      "Kiro 是 AWS 推出的 AI 开发工具，有 IDE 也有 CLI。kiro-cli 支持 macOS、Linux 和 Windows 11，原生支持 ACP，所以接 ClawMuse 很直接。",
    setup: "运行 kiro-cli login 登录。Windows 上要在 PowerShell 里安装，不要用命令提示符。",
    useCase: "在准备好的 Kiro 工作空间里做小改动，手机和电脑之间来回看。",
    question: "只装 Kiro IDE 够吗？",
    answer: "不够。ClawMuse 启动的是 kiro-cli acp，要按上面的命令单独装 CLI。",
  },
  "minimax-code": {
    intro: "MiniMax 的终端编程 Agent，命令是 mcode。",
    about:
      "MiniMax Code 是 MiniMax 的终端编程 Agent，安装后的命令是 mcode。它对 Node.js 版本有要求，需要 22.19 以上。",
    setup: "运行 mcode，按提示配置 MiniMax 账号。",
    useCase: "先让 MiniMax Code 解释项目，再交给它一个小的实现任务。",
    question: "任意 MiniMax API Key 都能用吗？",
    answer: "不一定。请按 MiniMax Code 自己的要求来，其他产品的 Key 不一定适用。",
  },
  "minion-code": {
    intro: "基于 Minion 框架的 Python 编程助手。",
    about:
      "Minion Code 是基于 Minion 框架的 AI 编程助手，自带文件操作、命令执行、网页搜索等十多种工具，支持 ACP。命令是 mcode，模型配置放在 ~/.minion/config.yaml。",
    setup: "在 ~/.minion/config.yaml 里配好模型。ClawMuse 用 uvx 启动它，所以电脑上还要有 uv。",
    useCase: "试试需要它内置工具的开发任务。",
    question: "电脑上为什么需要 Python 工具？",
    answer: "Minion Code 是 Python 包，ClawMuse 通过 uvx 启动它，和手机环境无关。",
  },
  "mistral-vibe": {
    intro: "Mistral 的开源命令行编程助手。",
    about:
      "Mistral Vibe 是 Mistral 开源的命令行编程助手，用 Mistral 的模型。安装后除了 vibe 命令，还有接编辑器用的 vibe-acp，ClawMuse 用的就是它。",
    setup: "运行 vibe --setup 配置 API Key，也可以直接设置 MISTRAL_API_KEY。",
    useCase: "给 Vibe 一个小改动，手机上看补丁和测试结果。",
    question: "ClawMuse 会更改 Vibe 的模型端点吗？",
    answer: "不会。端点和凭据都由 Vibe 管。连不上时先在电脑上确认 Vibe 自己能跑。",
  },
  nova: {
    intro: "Compass AI 的命令行 Agent，不是 Amazon Nova。",
    about:
      "Nova 是 Compass AI 的命令行工具，和 IDE 配合，带着开发者一步步把代码写出来。名字容易和 Amazon Nova 模型混淆，这里是两个不同的东西。",
    setup: "运行 nova，按提示完成账号或模型配置。",
    useCase: "先用一个简短的仓库任务确认它的工具都能用，再放开做大一点的改动。",
    question: "这是 Amazon Nova 吗？",
    answer: "不是。这里是 Compass AI 的 Nova，和同名的模型系列没有关系。",
  },
  poolside: {
    intro: "Poolside 的编程 Agent，命令行工具叫 pool。",
    about:
      "Poolside Agent CLI 是 Poolside 的编程 Agent，命令是 pool。能在终端交互，也能跑自动化任务，通过 pool acp 接入编辑器和 ClawMuse。Windows 版还在 Beta。",
    setup:
      "运行 pool login 登录。公司自己部署的话，加上管理员给的地址：pool login --api-url <api-url>。",
    useCase: "在有 Poolside 授权的项目里派任务，手机上跟进。",
    question: "ClawMuse 账号提供 Poolside 访问权限吗？",
    answer: "不提供。pool CLI 要用你自己的 Poolside 授权。",
  },
  qoder: {
    intro: "Qoder 的命令行 Agent，命令是 qodercli。",
    about:
      "Qoder CLI 是 AI 编程工具 Qoder 的命令行版本，命令是 qodercli，在终端里理解项目、写代码。ClawMuse 通过它的 ACP 模式连接。",
    setup: "运行 qodercli，在里面输入 /login 登录。",
    useCase: "让 Qoder 给个人项目出方案，在手机上接着聊。",
    question: "这会同步已有的 Qoder 编辑器窗口吗？",
    answer: "不会。ClawMuse 启动的是独立的 CLI 会话，编辑器里的对话和设置不会自动带过来。",
  },
  sigit: {
    intro: "默认在本机跑模型的编程 Agent。",
    about:
      "siGit Code 是一个默认在本机推理的编程 Agent，通过 Onde 推理 SDK 在设备上跑模型。适合不想把代码发给云端模型的人。注意 snap 装的是桌面应用，不是这里要用的终端版。",
    setup: "安装后选择要用的模型后端。",
    useCase: "用本地模型试试工作流，再看任务里哪些环节还会用到外部服务。",
    question: "本地优先能保证完全离线吗？",
    answer: "不能。要看实际用的模型后端和联网工具，才能判断数据有没有出这台电脑。",
  },
  stakpak: {
    intro: "用 Rust 写的 DevOps Agent，专门管基础设施。",
    about:
      "Stakpak 是专门做 DevOps 的 Agent，用 Rust 写的，处理部署、基础设施配置这类事。可以用 Stakpak 的 API Key，也可以用自己的 Anthropic 或 OpenAI Key。",
    setup: "运行 stakpak，按提示创建 API Key。用自己的 Key 的话，见官方文档的 stakpak auth login。",
    useCase: "半夜收到告警，先在手机上让它解释配置、查问题，再决定要不要改。",
    question: "添加 Stakpak 会授予云平台权限吗？",
    answer: "不会。云平台凭据来自这台电脑的配置，动手前先确认目标账号和环境。",
  },
  "trae-cli": {
    intro: "字节跳动 TRAE 的命令行版本，命令是 traecli。",
    about:
      "TRAE CLI 是字节跳动 AI 编程工具 TRAE 的命令行版本，命令是 traecli。ClawMuse 通过 traecli acp serve 连接。",
    setup: "运行 traecli，按提示登录账号。",
    useCase: "让 TRAE CLI 看项目、准备补丁，换台设备再看。",
    question: "TRAE 的命令会立即全部出现吗？",
    answer: "不一定。CLI 可能陆续上报命令和技能，等发现完成再看。",
  },
  vtcode: {
    intro: "用 Rust 写的开源终端 Agent，托管和本地模型都支持。",
    about:
      "VT Code 是开源的终端编程 Agent，支持多家托管模型和本地模型，可以按任务选。API Key 存在系统密钥串或加密文件里，不用明文写进配置。",
    setup: "把你的模型服务商 Key 存进去，下面的命令以 OpenAI 为例，openai 换成你用的服务商。",
    useCase: "配好模型后，试试需要跑 shell 命令的代码任务。",
    question: "为什么目录里带着环境参数？",
    answer:
      "ACP 模式需要 VT_ACP_ENABLED 和 VT_ACP_ZED_ENABLED。如果改了启动命令路径，这两个要保留。",
  },
  agoragentic: {
    intro: "Agent 服务市场，通过 ACP 浏览和调用各种能力。",
    about:
      "Agoragentic 是一个 Agent 服务市场，上面有很多可调用的 AI 能力，部分服务要付费，用 Base 链上的 USDC 结算。agoragentic-mcp 把它接到 ACP，不用单独安装，npx 会自动拉取。",
    setup: "浏览市场不需要账号。需要认证的工具再配置 AGORAGENTIC_API_KEY。",
    useCase: "先看清外部服务的输入、输出和价格，再试某项具体能力。",
    question: "ClawMuse 包含市场服务费用吗？",
    answer: "不包含。外部服务有自己的条款和付费方式，调用可能收费的服务前先看清楚。",
  },
  autohand: {
    intro: "能导入 Claude、Codex、Cursor 配置的终端 Agent。",
    about:
      "Autohand Code 是一个终端编程 Agent，支持 15 家以上的模型服务商，也能跑 Ollama 这样的本地模型。换过来很省事：用 /import claude、/import codex 或 /import cursor 就能把原来的设置和技能带过来。",
    setup: "运行 autohand，登录账号或配置自己的 Key。",
    useCase: "先做一个小范围的项目修改，看过生成的文件再放开。",
    question: "ACP 包就是模型订阅吗？",
    answer: "不是。它只负责连接，账号和模型费用另算。",
  },
} satisfies Record<AgentSlug, AgentTranslation>;
