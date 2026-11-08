import type { Article, WorkflowArticlePage } from "./editorial-content";

export const chineseWorkflowArticles: Record<WorkflowArticlePage, Article> = {
  "/docs/first-task": {
    updated: "2026-10-29",
    title: "开始第一个任务",
    description: "连接主机，选择已安装的 Agent，提出一个小任务，并从另一台设备检查结果。",
    category: "开始使用",
    lead: "准备一个项目文件夹，让 Agent 介绍它，再从手机继续对话。",
    takeaway:
      "电脑负责执行，手机或其他客户端负责下达指令和查看进度。任务运行时，让主机保持唤醒和联网。",
    sections: [
      {
        id: "prepare",
        title: "1. 准备执行任务的电脑",
        paragraphs: [
          "先在主机上安装受支持的 Agent，完成该 Provider 的登录，并在 Agent 自己的界面里验证一个小请求。ClawMuse 使用这份安装和凭据，不包含模型订阅。",
        ],
        steps: [
          "准备一个允许 Agent 访问的项目文件夹。首次尝试可以使用副本或小型 Git 仓库。",
          "下载适合平台的 ClawMuse 版本，或按 Linux 主机指南安装。打开主机并确认它在线。",
          "选择主机，新建指向项目文件夹的工作区，从主机提供的列表中选择可用 Agent。",
        ],
        links: [
          { title: "下载与平台可用性", page: "/download" },
          { title: "Linux 主机安装", page: "/docs/linux" },
          { title: "选择并准备 Agent", page: "/docs/agents" },
        ],
      },
      {
        id: "first-request",
        title: "2. 给任务一个明确的结束条件",
        paragraphs: [
          "可以先这样说：“阅读这个项目，说明它的用途、最重要的三个文件以及如何预览。不要修改文件，告诉我哪些内容无法验证。”",
          "只读任务能先验证文件夹选择、Agent 登录和对话是否正常。对照实际文件检查回答，再让 Agent 开始修改。",
        ],
        points: [
          "说明输入：使用哪个项目、哪些文件？",
          "说明输出：摘要、草稿、修改后的文件，还是可运行的预览？",
          "说明边界：哪些操作需要你批准，做到什么程度就停止？",
        ],
      },
      {
        id: "continue-away",
        title: "3. 从另一台设备继续",
        paragraphs: [
          "在电脑和手机上登录同一个 ClawMuse 账号，选择已绑定的在线电脑。打开刚才的对话，补充一条指令。",
          "关闭客户端不会关闭主机；电脑休眠或关机会影响可用性。连接失败时，先检查主机电源、网络和所选连接方式。",
        ],
        links: [
          { title: "连接方式与安全边界", page: "/security" },
          { title: "连接问题排查", page: "/support" },
        ],
      },
      {
        id: "review",
        title: "4. 检查成果，再接受结果",
        paragraphs: [
          "修改文件后，查看 diff 并打开生成的文件。程序任务需要运行相关检查，并说明哪些检查通过了。Agent 的肯定回答不能代替验证。",
          "结束前让它留下交接说明：改了什么、结果在哪里、验证了什么、还有什么需要你决定。把说明留在对话中，方便下次接着做。",
        ],
        links: [{ title: "个人工作流", page: "/docs/workflows" }],
      },
    ],
    faq: [
      {
        question: "第一个任务可以不是编程吗？",
        answer:
          "可以，前提是所选 Agent 和工具能处理它。例如用一个笔记文件夹生成摘要或草稿。支持的文件格式、网络访问和应用程序取决于主机上的工具。",
      },
    ],
    related: ["/docs/agents", "/docs/voice", "/docs/workflows"],
  },
  "/docs/agents": {
    updated: "2026-10-29",
    title: "使用自己的 Agent 与模型账号",
    description: "准备受支持的 Agent，了解独立的登录与计费，并为个人任务选择模型和权限。",
    category: "Agent 与模型",
    lead: "ClawMuse 为已安装的 Agent 提供跨设备工作区。模型、登录方式和用量规则仍由各 Provider 决定。",
    takeaway: "先在执行主机上安装并登录 Agent，再从这台主机实际提供的 Provider 与模型中选择。",
    sections: [
      {
        id: "prepare-provider",
        title: "在每台主机上准备 Agent",
        paragraphs: [
          "在 Agent 目录中找到你要用的工具，按详情页安装并登录。OMP 等工具还需要在主机设置中手动启用。",
        ],
        steps: [
          "按照 Agent 自身的官方说明安装。",
          "在将要执行任务的主机上登录，或配置模型凭据。",
          "先在 ClawMuse 之外验证一个小请求，再检查主机的 Agent 设置和可用 Provider 列表。",
          "用该 Provider 创建对话，选择它提供的模型和权限模式。",
        ],
        links: [{ title: "查看全部 Agent 与接入说明", page: "/agents" }],
      },
      {
        id: "billing",
        title: "了解 AI 服务费用",
        paragraphs: [
          "ClawMuse 本身代码开源。模型订阅、API 用量和云端语音费用由对应服务商收取。",
          "一个订阅不会解锁另一家 Provider。更换 Agent 也不会转移私有会话状态或合并模型额度。切换时，为新对话提供简短的项目说明和必要文件。",
        ],
        links: [
          { title: "ClawMuse 方案与独立费用", page: "/pricing" },
          { title: "Claude Code 与 Codex 的使用方式", page: "/compare/claude-code-codex" },
        ],
      },
      {
        id: "permissions",
        title: "按任务选择权限",
        paragraphs: [
          "选择符合任务范围的模式。阅读资料与安装依赖、修改项目所需的权限不同，各 Provider 的模式和审批行为也不同。",
          "保存 Agent 配置时，按用途命名并写清选择说明，例如“只读审查”或“在独立 worktree 中实现”。再次使用前检查保存的模型与权限模式。",
        ],
        links: [{ title: "了解数据与主机权限", page: "/security" }],
      },
      {
        id: "missing-provider",
        title: "找不到 Agent 或模型时",
        paragraphs: [
          "先检查当前选择的主机：Agent 按机器安装。确认 daemon 所在环境能找到可执行文件、登录仍有效，以及当前 ClawMuse 版本支持该集成。",
          "反馈问题时提供主机平台、ClawMuse 版本、Provider 名称和已去除敏感信息的错误文本。不要提交令牌或完整凭据文件。",
        ],
        links: [{ title: "获取帮助", page: "/support" }],
      },
    ],
    faq: [
      {
        question: "使用自己的电脑，就代表模型也在本地吗？",
        answer:
          "不代表。Agent 和工具在主机上运行，但云端模型仍可能接收提示词和选定文件。本地模型需要另行配置兼容方案。",
      },
      {
        question: "一个任务可以使用多个 Agent 吗？",
        answer:
          "配置编排后，可以委派给其他 Agent。先跑通一个 Agent，再为每个执行者明确范围，并检查汇总结果。",
      },
    ],
    related: ["/docs/first-task", "/docs/workflows", "/guides/local-data-and-cloud-models"],
  },
  "/docs/workflows": {
    updated: "2026-10-26",
    title: "围绕一份具体成果建立个人工作流",
    description: "用 Agent 整理草稿、文件和代码，明确输入、隔离并行任务，并保留结果检查环节。",
    category: "个人工作流",
    lead: "每次请求都说清楚想得到什么、保存在哪里、如何检查，你的个人 AI 工作台就更容易发挥作用。",
    takeaway:
      "从小任务开始，保留原始文件，并检查输出。输入彼此独立、各自责任清楚后，再扩展到并行执行。",
    sections: [
      {
        id: "notes-to-draft",
        title: "把一组笔记整理成草稿",
        paragraphs: [
          "在工作区放入需要使用的笔记。让 Agent 先列出来源、指出缺失信息并提出提纲，再撰写草稿。使用的文件格式需要 Agent 已配置的工具能够读取。",
        ],
        points: [
          "示例：“只根据这个文件夹里的笔记，整理一页项目说明。标记假设，保存为新文件，不要修改原始文件。”",
          "对照来源核对人名、日期与引用，在同一对话里继续修改。",
        ],
      },
      {
        id: "files-and-data",
        title: "整理文件或检查数据",
        paragraphs: [
          "先让 Agent 提出文件整理方案或分析计划。处理表格时，说明工作表、列的含义、时间范围和预期输出。主机需要具备相应的解析与分析工具。",
          "保留源数据副本。要求生成新的结果文件，并解释计算方式、排除的数据行和不确定性。授权批量修改前先检查样本。",
        ],
      },
      {
        id: "code-to-preview",
        title: "从项目改动做到可检查的预览",
        steps: [
          "描述期望的行为，以及怎样算完成。",
          "让 Agent 查看项目，说明最小可用改动。",
          "在约定文件范围内实现，检查 diff 和相关验证结果。",
          "使用当前环境可用的工具和连接方式打开预览，最后留下交接说明和未解决问题。",
        ],
        paragraphs: [
          "手机适合下达指令和查看进度。有些细节在电脑上更容易检查，把这些检查也写进完成条件。",
        ],
      },
      {
        id: "parallel-work",
        title: "可以分开处理时，再加入另一个 Agent",
        paragraphs: [
          "代码任务可为独立分支创建各自的 worktree 工作区。每个 worktree 有单独的目录，但仍可能需要安装依赖、准备环境文件和分配不同的服务端口。",
          "需要 Agent 主动委派时，在主机的 Agent 设置中启用内置 Agent 管理工具，然后新建或重载负责协调的 Agent。要求它分配具体文件或只读审查任务、收集结果，并报告检查情况。工具注入是可选项，默认关闭。",
        ],
        points: [
          "第一次委派可以这样做：实现一个小改动，再让另一个 Agent 只审查、不修改文件。",
          "独立 worktree 能减少同时编辑造成的覆盖，但合并冲突和集成测试仍需处理。",
          "跨主机执行需要目标主机可达、已授权，并具备项目与工具。项目文件夹不会因此自动同步。",
        ],
        links: [
          { title: "选择 Agent", page: "/docs/agents" },
          { title: "可选的 Goals 与 Status", page: "/docs/goals-status" },
        ],
      },
    ],
    faq: [],
    related: ["/docs/first-task", "/docs/goals-status", "/blog/from-idea-to-result"],
  },
  "/docs/goals-status": {
    updated: "2026-10-26",
    title: "配置 Goals 与 Status，跟进持续任务",
    description: "了解可选的 Goals 审批、执行次数预算、Status 状态展示，以及当前主机与客户端要求。",
    category: "Goals 与 Status",
    lead: "Goals 让你批准一个有边界的任务，再回来检查报告。Status 帮你在不持续打开对话时了解活动状态。两者都需要额外的服务配置。",
    takeaway:
      "这些功能按需配置，任务仍在自己的主机执行。Goals 的次数预算限制执行轮次，不保证固定金额上限。",
    sections: [
      {
        id: "requirements",
        title: "配置前先确认可用条件",
        paragraphs: [
          "当前 Status 集成支持带 Live Activity 原生模块的 iOS 版本和 Electron 桌面端。Android 与普通浏览器目前没有这项服务集成。桌面端可访问状态和 Goals，不提供 iOS 锁屏胶囊与小组件控制。",
          "兼容主机需先连接 Status 服务。Goals 还需要带 Git 远程地址的合格仓库、已配置的规划与执行 Agent，并在主机上启用 Goals。只有本地目录、没有远程地址的项目目前不能进入 Goals 仓库队列。",
        ],
        links: [
          { title: "下载与版本可用性", page: "/download" },
          { title: "咨询服务配置", page: "/support" },
        ],
      },
      {
        id: "connect",
        title: "连接服务并启用主机",
        steps: [
          "向服务运营方获取 Status 服务的 HTTPS 地址和主机接入凭据。仅注册官网账号不会完成主机配置。",
          "通过已安装 CLI 的“clawmuse status connect”命令传入服务地址，使用令牌文件或标准输入提供凭据。“clawmuse status show”可检查保存的关系。",
          "在受支持客户端的通知设置中，将已配置主机绑定到远程状态。iOS 的通知与 Live Activity 系统设置会影响提醒方式。",
          "使用“clawmuse status goals set --enable”在主机启用 Goals，指定已安装的规划与执行模型。通过“clawmuse status goals show”检查配置。",
        ],
        paragraphs: [
          "保管好服务令牌。Status 关系变更由主机自动读取，不需要重启 daemon。如果当前版本没有相应入口，可继续使用普通对话，并向支持渠道确认兼容配置。",
        ],
      },
      {
        id: "goal-loop",
        title: "执行一个目标，回来检查结果",
        steps: [
          "选择符合条件的项目，请求目标建议，或输入有明确结果的目标。",
          "接受前检查目标内容、执行主机、模型和执行次数预算。仓库的自动规划需要主动开启。",
          "执行时保持所选主机在线。指定到某台主机的目标会等待该主机。",
          "阅读报告并检查实际改动，再批准、放弃，或带着具体指令继续。",
        ],
        paragraphs: [
          "例如，预算为三次表示最多执行三轮后回来待审；继续操作会恢复执行；预算耗尽时可补一轮，受系统上限约束。模型 Token、API 价格与语音费用仍按各服务规则计算。",
          "为避免等待交互审批，Goals 执行可能使用 Provider 的较高权限模式。只对愿意委派的项目和操作启用，并在接受目标前检查范围。",
        ],
      },
      {
        id: "status-meaning",
        title: "分别看活动、额度与更新时间",
        paragraphs: [
          "受支持的 iOS 版本可在锁屏活动中显示任务状态与数量。主屏幕小组件和应用内用量视图展示可获得的 Provider 额度数据。可用数据和重置周期取决于 Provider，百分比不等于账单。",
          "过期快照表示最后已知状态。先看更新时间并重新连接主机，再判断任务是否停止。Status 摘要包含活动与额度数据；Goals 还会向服务发送目标文字、仓库标识和结构化报告。",
        ],
        links: [{ title: "服务与数据边界", page: "/security" }],
      },
    ],
    faq: [],
    related: ["/docs/workflows", "/docs/agents", "/guides/always-on-ai-workstation"],
  },
  "/docs/voice": {
    updated: "2026-10-26",
    title: "用语音记录一个想法",
    description: "配置语音识别，口述并修改请求，了解本地与云端语音处理的区别。",
    category: "语音",
    lead: "想法更适合说出来时，就用听写。检查识别文本、补充必要背景，再交给正在项目中工作的 Agent。",
    takeaway: "语音识别与编程 Agent 分别配置。选择支持你所用语言的服务，发送前检查文字。",
    sections: [
      {
        id: "choose-speech",
        title: "选择支持所用语言的识别方式",
        paragraphs: [
          "识别可使用本地模型、兼容 OpenAI 的语音服务或 STEP Plan。本地默认模型只支持英语；多语言 Parakeet 模型覆盖部分欧洲语言，并不提供中文支持。",
          "中文听写需要配置支持中文的服务。主机语音识别设置可填写 Provider、地址、模型、语言和凭据。STEP Plan 使用独立协议与地址，仅替换 OpenAI 地址无法完成配置。",
        ],
        points: [
          "本地识别使用主机算力，可能需要下载缺失的语音模型。",
          "云端识别会把音频发送给语音服务，并可能产生独立费用。",
          "语音模式还需要语音合成与可用的推理 Agent；听写只负责将语音变为可编辑文字。",
        ],
      },
      {
        id: "dictate",
        title: "先口述一个小请求",
        steps: [
          "确认当前主机已配置可用的识别服务，并允许客户端使用麦克风。",
          "打开目标项目的对话并开始听写，说清结果、相关文件和操作边界。",
          "停止录音后等待最终文本，检查文件名、数字、术语，以及“不要”等否定表达。",
          "编辑草稿再发送。如果想恢复录音前的草稿，可以取消录音。",
        ],
        paragraphs: [
          "例如：“根据这个项目里的笔记列一个简短提纲。保存成新草稿，不要覆盖现有文件。”涉及准确拼写时，用文字补充文件名。",
        ],
      },
      {
        id: "troubleshoot",
        title: "识别不符合预期时",
        paragraphs: [
          "检查麦克风权限、当前主机连接、语音 Provider 与语言支持。编程 Agent 已登录，不代表语音 API 也已配置凭据。",
          "文字有延迟时，等待录音分段与服务处理完成。重试长指令前先测一小段。识别不准确就修改文字或改用键盘，任务仍能在同一对话继续。",
        ],
        links: [
          { title: "获取语音配置帮助", page: "/support" },
          { title: "了解外部服务费用", page: "/pricing" },
        ],
      },
    ],
    faq: [
      {
        question: "本地识别能让整个任务离线吗？",
        answer:
          "不能。本地语音处理只覆盖该语音步骤。所选 Agent 仍可能把文本和项目上下文发送给云端模型。",
      },
      {
        question: "口述内容会触发实际操作吗？",
        answer:
          "会。发送给 Agent 后，语音请求与键盘输入一样属于指令。要求修改文件或执行其他操作前，检查识别文字和权限。",
      },
    ],
    related: ["/docs/first-task", "/docs/workflows", "/guides/local-data-and-cloud-models"],
  },
  "/blog/why-clawmuse": {
    updated: "2026-10-29",
    title: "为什么做 ClawMuse",
    description: "离开电脑后，继续给 AI 下任务、看进度。这是我们做 ClawMuse 的起点。",
    category: "产品想法",
    lead: "Agent 还在电脑上工作，你却该出门了。它接下来问的问题、改好的文件，能不能在手机上接着看？ClawMuse 从这个需求开始。",
    takeaway: "把电脑上的 AI 工具带到手机上，继续同一项任务。",
    sections: [
      {
        id: "the-name",
        title: "想到时，就能开始",
        paragraphs: [
          "散步时想起网站有个地方要改，回家路上想到一段文档怎么写。打开手机，把要求发给电脑上的 Agent。ClawMuse 的名字来自 Claw（行动）和 Muse（灵感），想做的也是这件事。",
        ],
        links: [
          {
            title: "ClawMuse 品牌素材",
            page: "/brand",
          },
        ],
      },
      {
        id: "personal",
        title: "继续用熟悉的工具",
        paragraphs: [
          "项目、依赖和工具已经在你的电脑上。ClawMuse 连接 Claude Code、Codex 等 Agent，让你继续使用已有的环境和账号，从手机或电脑打开同一段对话。",
        ],
      },
      {
        id: "away-from-desk",
        title: "出门后，也能跟进",
        paragraphs: [
          "在手机上看一眼进度、回答一个问题，或者补充刚想到的要求。需要仔细检查时，再回到电脑打开文件。远程使用期间，电脑要保持开机联网。",
        ],
      },
      {
        id: "reviewable-results",
        title: "打开文件，看看做得怎么样",
        paragraphs: [
          "Agent 改了哪些文件，运行了什么命令，结果是否符合你的要求，都可以在工作区查看。发现需要调整的地方，直接在对话里继续说。",
        ],
        links: [
          {
            title: "开始第一个任务",
            page: "/docs/first-task",
          },
        ],
      },
    ],
    faq: [
      {
        question: "ClawMuse 包含 AI 模型吗？",
        answer: "不包含。使用你已安装并登录的 Agent，模型费用由对应服务商收取。",
      },
    ],
    related: ["/blog/from-idea-to-result", "/docs/first-task", "/learn/own-computer-ai-agents"],
  },
  "/blog/from-idea-to-result": {
    updated: "2026-10-29",
    title: "用手机，让 Agent 整理一份阅读笔记",
    description: "以阅读笔记为例，看看怎么交代任务、跟进进度和检查结果。",
    category: "使用案例",
    lead: "笔记越积越多，想找某个主题时却翻不到。可以让电脑上的 Agent 帮你做一份索引，自己从手机跟进。",
    takeaway: "说清要整理的文件和希望得到的结果，再打开成品检查。",
    sections: [
      {
        id: "capture",
        title: "先告诉它要整理什么",
        paragraphs: [
          "打开笔记文件夹对应的工作区，发一条消息：“帮我整理这个文件夹里的阅读笔记，按主题做索引，链接到原文。先给我看分组方案。”让 Agent 先读几份样本，确认能处理这些文件。",
        ],
      },
      {
        id: "scope",
        title: "看过方案，再开始整理",
        paragraphs: [
          "看看分组是否合适，然后补充：“保留原笔记，把索引存成新的 Markdown 文件。每份笔记只出现一次，不确定的分类标出来，读不了的文件单独列出。”",
        ],
      },
      {
        id: "follow-up",
        title: "稍后从手机看进度",
        paragraphs: [
          "电脑保持开机联网，Agent 就能继续处理。你可以先去做别的，稍后打开同一段对话，看它做到哪里，回答问题或调整要求。",
        ],
      },
      {
        id: "inspect",
        title: "点开索引，检查链接",
        paragraphs: [
          "打开生成的文件，抽查几条笔记的分类和链接。发现问题就具体告诉它，例如“这篇是设计笔记，请移到设计组”。结果满意后，保留索引，下一次新增笔记时接着更新。",
        ],
        links: [
          {
            title: "开始第一个任务",
            page: "/docs/first-task",
          },
          {
            title: "设置语音输入",
            page: "/docs/voice",
          },
        ],
      },
    ],
    faq: [
      {
        question: "需要配置 Goals 吗？",
        answer: "不需要，普通对话就可以。Agent 需要能读取这些笔记文件。",
      },
    ],
    related: ["/blog/why-clawmuse", "/docs/workflows", "/docs/goals-status"],
  },
};
