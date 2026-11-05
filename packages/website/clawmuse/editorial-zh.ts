import type { Article, LearnArticlePage } from "./editorial-content";

export const chineseArticles: Record<LearnArticlePage, Article> = {
  "/learn/own-computer-ai-agents": {
    title: "把自己的电脑变成个人 AI 工作站",
    description:
      "让常开的 Mac、PC 或 Linux 主机运行你选择的 AI Agent，保留已有项目、工具和配置，通过 ClawMuse 从手机持续推进、审查和掌控工作。",
    category: "产品理念",
    lead: "你已经有一台电脑、一套调试好的开发环境，以及真正属于自己的项目。AI 的工作方式可以建立在这些积累之上，并在你离开书桌后继续发挥作用。",
    takeaway:
      "ClawMuse 把你自己电脑上的编程 Agent 接入统一的桌面、网页和手机工作区。主机由你选择，Agent 按任务选择，手机负责下达指令、查看过程和审查结果。",
    sections: [
      {
        id: "keep-your-environment",
        title: "保留一套真正属于自己的工作环境",
        paragraphs: [
          "一个能完成实际工作的 Agent，需要的不只是聊天窗口。它需要代码仓库、依赖、命令行工具、项目说明，以及你已经配置好的访问权限。让 Agent 在自己的电脑上运行，就能继续使用这些已有环境；项目如何存储、备份和迁移，也由你决定。",
          "例如，让 Agent 为网站补充一个功能，它可以使用你平时开发的同一份工作区和工具。你在手机上查看 diff，回到电脑后继续处理原来的项目。使用 ClawMuse 不要求先把整套开发环境搬进另一个托管空间。",
        ],
      },
      {
        id: "choose-your-resources",
        title: "按实际工作选择硬件和容量",
        paragraphs: [
          "可用的内存、磁盘和 CPU 由所选主机决定。已经购置且仍有余量的工作站，可以承载构建、测试和多个 Agent 会话；希望环境全天可用时，也可以选择一台专门常开的低功耗电脑或服务器。",
          "自己的硬件仍有容量上限，也不必然比云端便宜。并行构建会竞争资源，电费、备份和维护都要计入成本。需要临时扩容或托管可用性时，云环境仍然有价值。ClawMuse 给你的，是根据实际任务作出选择的空间。",
        ],
      },
      {
        id: "choose-your-agent",
        title: "Agent 可以更换，工作方式可以延续",
        paragraphs: [
          "ClawMuse 支持 Claude Code、Codex、GitHub Copilot、OpenCode、Pi、Antigravity 和 Muse Code。在主机上安装并完成相应 Provider 的认证后，可以按任务选择 Agent，在同一套工作区界面中查看对话、工具调用和执行结果。",
          "这不会把不同 Provider 的订阅合并，也不会自动把某个 Provider 的私有会话状态转换给另一个。认证、模型权限、审批行为和费用仍由各自 Provider 决定。统一工作区让你更容易组织这些工作。",
        ],
      },
      {
        id: "work-from-your-phone",
        title: "离开电脑后，仍能推进工作",
        paragraphs: [
          "用手机安排任务、语音补充要求、检查修改、回答权限请求，或切换查看另一台主机。流式回复和会话状态同步，让你不用一直守着电脑窗口，也能了解任务进行到了哪里。",
          "关闭手机客户端后，仍在运行的主机可以继续执行任务。前提是电脑、daemon 和 Agent 进程保持可用；休眠的笔记本无法继续构建。可选的 Goals 提供带审批和执行预算的目标流程，Status 提供经配置的活动与额度视图，它们都不是使用基础工作流的前提。",
        ],
      },
    ],
    faq: [
      {
        question: "自托管 Agent 等于本地大模型吗？",
        answer:
          "不等于。Agent 和工具可以在你的主机上运行，同时由云端模型处理提示词及选定的项目上下文。完全本地的方案需要兼容的本地模型配置和本地工具；ClawMuse 不会自动让云端 Provider 离线运行。",
      },
      {
        question: "必须另外购买服务器吗？",
        answer:
          "不必。可以先使用已有且受支持的电脑。需要更长时间可用时，再考虑专用主机。远程访问期间，主机需要保持供电、唤醒和联网。",
      },
      {
        question: "必须启用所有账号服务吗？",
        answer:
          "底层主机工作流支持本地和直连方式。账号发现、Goals 和 Status 是各自需要配置的附加能力，也有独立的数据边界。可以根据安装指南选择连接方式。",
      },
    ],
    related: [
      "/compare/cloud-ai-agents",
      "/guides/always-on-ai-workstation",
      "/guides/local-data-and-cloud-models",
    ],
  },
  "/compare/cloud-ai-agents": {
    title: "自托管 AI Agent 与云电脑：如何选择自己的工作环境",
    description:
      "从硬件容量、环境持久性、Agent 选择、维护成本和数据边界，对比个人 AI 工作站与托管云电脑，了解 ClawMuse 适合什么场景。",
    category: "方案对比",
    lead: "真正影响使用体验的，是工作环境放在哪里。托管云电脑和自己的工作站解决不同的运维问题，也可以同时存在于你的工作流程中。",
    takeaway:
      "重视已有环境、硬件自主权和多个 Agent 的统一操作，可以选择自己的主机；更重视省去主机维护、按需获取远程算力，可以优先考虑托管环境。",
    sections: [
      {
        id: "compare-the-environment",
        title: "比较工作环境，而不只比较聊天界面",
        paragraphs: [
          "下表比较的是部署方式。同一个平台可能同时提供本地访问、临时任务环境和持久化云电脑，选型时应核对准备使用的具体产品及方案。",
        ],
        table: {
          headers: ["比较维度", "自己的主机 + ClawMuse", "托管云电脑"],
          rows: [
            [
              "CPU、内存与存储",
              "由所选机器决定，可自行升级或迁移主机。",
              "由服务商提供的规格、配额和方案决定。",
            ],
            ["项目环境", "使用主机上已有的文件、工具和依赖。", "在服务中配置或接入相应工作环境。"],
            [
              "持久性",
              "自行管理磁盘、备份与进程可用性。",
              "取决于产品，可能是临时任务，也可能是持久化机器。",
            ],
            [
              "Agent 选择",
              "支持七种 Provider，各自完成安装和认证。",
              "取决于平台支持的 Agent 和集成方式。",
            ],
            [
              "远程操作",
              "手机、网页和桌面客户端，主机必须可达。",
              "使用服务提供的客户端和连接方式。",
            ],
            ["维护责任", "自行负责供电、更新、网络、存储与恢复。", "底层计算服务由服务商维护。"],
            [
              "总成本",
              "硬件、电费、运维与模型或 API 费用。",
              "套餐、计算和存储费用，以及可能独立计费的模型用量。",
            ],
          ],
        },
      },
      {
        id: "platforms-have-options",
        title: "其他平台也在提供持久化和本地选项",
        paragraphs: [
          "Manus 的官方说明包含持久化 Cloud Computer，以及连接实体电脑的 Desktop「My Computer」模式，因此不能把它概括为只有一次性的任务沙箱。具体可用资源应以当前方案为准。",
          "OpenAI 也为 Agents API 提供了自托管沙箱文档。本地计算并非 ClawMuse 独有；ClawMuse 聚焦的是把受支持的不同 Agent 和自己的主机，放进统一的手机与桌面工作区。",
        ],
        sources: [
          {
            title: "Manus：What is the Cloud Computer?",
            url: "https://help.manus.im/en/articles/15392111-what-is-the-cloud-computer",
          },
          {
            title: "OpenAI：Self-hosted sandboxes",
            url: "https://developers.openai.com/api/docs/guides/agents-api/environments/self-hosted",
          },
        ],
      },
      {
        id: "when-your-host-fits",
        title: "什么时候更适合用自己的电脑",
        paragraphs: [
          "如果工作依赖已经调试好的仓库、本地工具或特定硬件，自己的主机通常值得先试。经常在不同 Agent 之间切换、希望集中查看执行过程时，统一工作区也更容易体现价值。",
        ],
        points: [
          "已有机器具备足够余量，可以承担项目的构建和测试。",
          "希望自己决定项目组织方式、工具安装和备份策略。",
          "能够保持主机可用并维护它，或者已经在运营个人服务器。",
        ],
      },
      {
        id: "when-cloud-fits",
        title: "什么时候托管环境更合适",
        paragraphs: [
          "如果笔记本经常休眠、不想管理常开主机，或任务需要超过现有硬件的临时容量，云电脑可能更适合。如果一个 Provider 自带的工作流已经满足需求，直接使用原生工具也更省事。",
          "选型前，拿一个真实任务比较环境准备、构建耗时、远程响应、中断后的恢复方式和持续成本。本文没有实测依据证明任何一种方案总是更快、更便宜或更私密。",
        ],
      },
    ],
    faq: [
      {
        question: "ClawMuse 会提供一台云电脑吗？",
        answer:
          "ClawMuse 连接你提供的主机，可以是个人电脑，也可以是自行管理的服务器。它不附带托管计算实例或模型订阅。",
      },
      {
        question: "本地电脑一定比云电脑性能更好吗？",
        answer:
          "不一定。需要比较实际 CPU、内存、磁盘与工作负载，以及可选云规格。ClawMuse 让你选择主机，但不会增加主机本身的资源。",
      },
      {
        question: "自托管是否代表数据完全不离开电脑？",
        answer:
          "不是。云端模型调用、云端语音处理和可选账号服务都有各自的数据流。项目环境可以保留在主机上，同时把必要上下文发送给 Provider。",
      },
    ],
    related: [
      "/learn/own-computer-ai-agents",
      "/compare/claude-code-codex",
      "/guides/local-data-and-cloud-models",
    ],
  },
  "/compare/claude-code-codex": {
    title: "Claude Code、Codex 与 ClawMuse：各自负责什么",
    description:
      "了解 Claude Code、Codex 的本地能力，以及 ClawMuse 如何把受支持的 Agent 接入手机、网页和桌面工作区，统一查看主机、对话、文件与执行过程。",
    category: "产品对比",
    lead: "Claude Code 和 Codex 负责执行 Agent 工作。ClawMuse 为受支持的 Agent 提供跨主机、跨设备的统一工作区。这些产品可以配合使用。",
    takeaway:
      "原生界面已经满足需求时，可以继续使用；需要从同一套手机、网页和桌面界面操作多个受支持的 Agent 与主机时，再加入 ClawMuse。",
    sections: [
      {
        id: "native-capabilities",
        title: "先看原生工具已经具备的能力",
        paragraphs: [
          "Codex CLI 可以检查和修改本地仓库，调用电脑上已有的工具。Claude Code Remote Control 可以让其他设备操作运行在自己电脑上的会话。不能把这两种工具描述为只能在云端工作。",
          "这些原生能力本身就有价值。ClawMuse 面向的是另一项选择：当你使用多个受支持的 Agent 时，是否希望把它们组织到统一工作区，而不必围绕某一个 Provider 的界面安排全部工作。",
        ],
        sources: [
          { title: "OpenAI：Codex CLI", url: "https://learn.chatgpt.com/docs/codex/cli" },
          {
            title: "Anthropic：Claude Code Remote Control",
            url: "https://code.claude.com/docs/en/remote-control",
          },
        ],
      },
      {
        id: "what-clawmuse-adds",
        title: "把 Agent 周围的工作也组织起来",
        paragraphs: [
          "ClawMuse 把对话与判断结果所需的证据放在一起：工具活动、工作区文件、diff、终端和主机状态。桌面应用还提供内嵌浏览器面板，用于查看本地网页。",
        ],
        table: {
          headers: ["你的需求", "ClawMuse 提供的工作方式"],
          rows: [
            ["使用不同编程 Agent", "在工作区启动受支持的 Provider；认证与模型访问仍各自独立。"],
            ["从手机继续推进", "阅读会话、发送指令、语音起草，并回答权限请求。"],
            ["检查实际修改", "查看主机工作环境中的文件、diff 和命令输出。"],
            ["操作多台电脑", "选择已连接的主机，让任务留在对应环境中。"],
            ["配置持续工作", "按需配置 Goals 的审批和执行预算，以及 Status 的活动与额度视图。"],
          ],
        },
      },
      {
        id: "what-does-not-change",
        title: "Provider 的边界仍然存在",
        paragraphs: [
          "安装 ClawMuse 不会附赠 Claude 或 OpenAI 订阅，不会取消限流，也不会让每个 Provider 拥有完全相同的操作选项。需要先在主机上安装并认证相应 Provider，再确认它支持的功能。",
          "统一界面也不等于自动迁移所有会话状态。换用另一个 Provider 时，仍应提供必要的项目现状和任务说明。多个 Agent 使用同一仓库时，需要留意并行修改，必要时使用独立工作区。",
        ],
      },
      {
        id: "try-a-real-task",
        title: "用一个小任务判断是否适合自己",
        paragraphs: [
          "选择一个仓库，让一个 Agent 完成小范围、可撤销的改动。查看工具过程，检查 diff，运行对应检查。保持主机运行，再从手机连接并补充要求。如果多 Provider 是你的实际需求，再换另一个受支持的 Agent 重复这个过程。",
          "官网演示使用预设数据展示这一流程。真实 Provider 的行为、网络响应与语音质量，需要在自己的安装环境中体验。如果只使用一个 Provider 和一台机器，原生远程能力也可能已经足够。",
        ],
      },
    ],
    faq: [],
    related: [
      "/guides/phone-ai-coding",
      "/compare/cloud-ai-agents",
      "/guides/always-on-ai-workstation",
    ],
  },
  "/guides/always-on-ai-workstation": {
    title: "如何搭建常开的个人 AI 工作站",
    description:
      "从选择电脑、安装 ClawMuse 与 Agent，到手机连接、休眠设置和任务验证，逐步搭建可以长期使用的个人 AI 工作站。",
    category: "部署指南",
    lead: "一个能持续工作的环境，首先需要一台真正可用的主机。先跑通小任务，再按需要加入长期执行和状态服务。",
    takeaway:
      "保持电脑、daemon 和 Agent 可用；先用手机验证一次完整任务，再依赖无人值守工作。可选 Goals 需要单独配置，并在执行前批准范围与预算。",
    sections: [
      {
        id: "choose-a-host",
        title: "1. 根据实际任务选择主机",
        paragraphs: [
          "桌面工作流可以选择受支持的 Mac 或 PC，无图形界面的部署可以选择 Linux 主机。根据项目真实构建和测试所需的内存、磁盘与 CPU 选择配置，同时为系统及并行任务保留余量。",
          "日常使用的笔记本适合起步，但合上屏幕可能会休眠。保持供电的台式机或小型服务器更容易提供持续可用的环境。明确设置电源策略，并保留正常的系统更新和备份流程。",
        ],
      },
      {
        id: "prepare-the-project",
        title: "2. 先把本地项目准备好",
        paragraphs: [
          "按照下载页或 Linux 指南安装 ClawMuse，在同一主机上安装并认证受支持的 Agent Provider。打开目标项目，确认当前用户能够运行平时使用的开发命令和一项有代表性的检查。",
          "密钥放在对应工具要求的凭证或环境配置中。用项目说明写清构建方式、检查方式与审批边界。Agent 能够调用的资源和权限，取决于运行它的进程实际拥有的能力。",
        ],
      },
      {
        id: "connect-your-phone",
        title: "3. 连接手机，并从另一种网络验证",
        paragraphs: [
          "按文档选择直连或账号连接流程。使用账号发现时，在相应客户端使用同一账号，并完成主机配对。发现一台主机不等于已经获得访问权限，仍需完成对应的信任与授权步骤。",
          "分别在局域网 Wi-Fi 和手机移动网络下测试：发送一条简短指令、读取回复、检查一处文件修改。中继选择和流式传输优化可以改善连接体验，但实际响应仍取决于网络路径、主机负载和 Provider。",
        ],
      },
      {
        id: "verify-long-running-work",
        title: "4. 验证长期工作的完整边界",
        paragraphs: [
          "先使用一个范围明确、可以安全中断的任务。准备长时间离开电脑前，检查以下行为。",
        ],
        points: [
          "关闭并重新打开手机客户端，确认仍能查看同一主机上的任务。",
          "确认主机在预期时段保持唤醒，磁盘空间足够。",
          "确认权限请求会等待你的决定，而不是假定已经批准。",
          "检查实际 diff 和测试输出；对话完成不等于改动正确。",
          "明确停止任务的方法，并能用日常版本控制和备份流程恢复项目。",
        ],
      },
      {
        id: "add-optional-services",
        title: "5. 按需要增加 Goals 与 Status",
        paragraphs: [
          "Goals 提供规划器提出的目标卡片、手机审批、主机执行，以及带预算的报告流程。它需要配置对应服务和主机集成，不会因为电脑保持开机就自动启用。执行前应确认任务范围和预算。",
          "Status 可以把配置好的活动和额度信息发布到相应视图，包括 iOS Live Activity 与小组件。这些附加服务各自有独立的数据流。先让主机与手机连接正常，再按需要逐项启用。",
        ],
      },
    ],
    faq: [],
    related: [
      "/guides/phone-ai-coding",
      "/guides/local-data-and-cloud-models",
      "/learn/own-computer-ai-agents",
    ],
  },
  "/guides/phone-ai-coding": {
    title: "在手机上使用 AI 编程 Agent，让项目留在自己的电脑",
    description:
      "体验 ClawMuse 手机工作流：文字或语音下达任务、查看工具活动与 diff、批准操作、切换主机，再回到同一套桌面开发环境。",
    category: "工作流指南",
    lead: "手机适合提出要求、查看进度和作出决定。仓库、开发工具和 Agent，可以继续留在已经能够构建项目的那台电脑上。",
    takeaway:
      "从手机安排任务，让主机执行，查看证据后再决定下一步。需要大面积审查或多面板操作时，再回到桌面。",
    sections: [
      {
        id: "give-a-clear-task",
        title: "从有明确验收方式的任务开始",
        paragraphs: [
          "选择目标主机与工作区，再选择已经配置好的 Agent。描述具体改动，并写明检查方式，例如：为一个页面增加语言切换、保留当前路由、运行对应测试。",
          "文字输入和语音听写都可以进入对话。听写支持暂停、继续，并在发送前编辑草稿。realtime voice 是独立的交互模式，其可用性和质量取决于语音 Provider 与实际配置。",
        ],
      },
      {
        id: "follow-and-review",
        title: "看执行过程，也看实际结果",
        paragraphs: [
          "通过流式回复和工具活动了解 Agent 正在做什么。打开工作区文件，检查 diff；遇到构建失败时，查看终端输出，帮助判断原因。Agent 的总结可以作为线索，实际改动和检查结果才是验收依据。",
          "出现权限请求时，先确认动作内容和作用范围，再决定是否批准。手机上的便捷操作也应保留这个判断过程。最终能执行什么，仍取决于主机进程和 Provider 的权限配置。",
        ],
      },
      {
        id: "use-the-right-screen",
        title: "让不同屏幕各自承担适合的工作",
        paragraphs: [
          "手机适合短指令、状态查看、小范围 diff 和审批。较大的审查、多面板操作和内嵌浏览器更适合桌面应用。ClawMuse 的内嵌浏览器面板是桌面应用功能，不能把它理解为手机上的远程浏览器窗口。",
          "切换主机意味着选择另一个环境。移动于不同机器时，留意仓库、分支和 Provider。统一界面不会默默把工作区或凭证复制到其他主机。",
        ],
      },
      {
        id: "voice-and-network",
        title: "语音与跨网体验，需要放到实际环境中验证",
        paragraphs: [
          "当前优化涉及听写草稿处理、语音状态同步、语音分段、流式文本呈现和区域中继选择，目的是让远程对话更容易跟随。官网用预设文本演示交互，不录制声音，也不把动画时长作为网络性能测试。",
          "安装后，可在 Wi-Fi 与移动网络各执行一次任务：观察首段回复、断线后会话恢复，以及所选语音 Provider 对你所用语言的识别效果。本地与云端语音有不同的配置要求和数据边界。",
        ],
      },
    ],
    faq: [],
    related: [
      "/compare/claude-code-codex",
      "/guides/always-on-ai-workstation",
      "/guides/local-data-and-cloud-models",
    ],
  },
  "/guides/local-data-and-cloud-models": {
    title: "本地 AI Agent、云端模型与数据去向",
    description:
      "梳理 ClawMuse 的数据边界：本地项目文件、模型请求、端到端加密中继、语音 Provider，以及可选的账号、Goals 和 Status 服务。",
    category: "数据与掌控",
    lead: "“在自己的电脑上运行”说明的是执行位置，并不能单独说明每一条提示词、每一段语音和每一次状态更新会去哪里。",
    takeaway:
      "主机保留你的工作环境；云端模型和可选服务可能接收完成其职责所需的数据。应分别理解和选择每一层连接与 Provider。",
    sections: [
      {
        id: "data-boundaries",
        title: "把执行环境与外部服务分开看",
        paragraphs: [
          "ClawMuse 不要求把仓库迁移到由 ClawMuse 托管的开发机器上。Agent 使用你主机上的文件和工具。连接的客户端会接收会话和工作区数据用于显示，因此本地执行也不代表数据不会到达其他设备。",
        ],
        table: {
          headers: ["层次", "处理什么", "需要确认什么"],
          rows: [
            [
              "你的主机",
              "项目文件、工具、Agent 进程和主机端配置。",
              "系统权限、备份、密钥，以及 Agent 能访问的项目范围。",
            ],
            [
              "模型 Provider",
              "Agent 选择的提示词和上下文，可能包含代码与工具输出。",
              "Provider 配置、账号策略和数据条款。",
            ],
            [
              "加密中继",
              "配对端点之间端到端加密的连接流量。",
              "端点信任及连接元数据；中继加密不涵盖独立的模型请求。",
            ],
            [
              "语音 Provider",
              "识别与合成所需的声音或文本。",
              "采用本地还是云端处理，以及实际配置的 Provider。",
            ],
            [
              "可选服务",
              "账号发现、经配置的活动或额度报告，以及目标执行记录。",
              "启用了哪些服务，各自发布什么信息。",
            ],
          ],
        },
      },
      {
        id: "relay-encryption",
        title: "端到端加密保护的是哪一段",
        paragraphs: [
          "受保护的中继连接在配对客户端与主机之间传递加密流量，中继负责传输，主机负责执行。连接两端仍需要可信，连接元数据也应与加密正文分开理解。",
          "Agent 发给模型 Provider 的请求属于另一条连接。中继加密不会阻止 Agent 把选定的项目上下文发送给 Provider。因此，应同时检查连接路径、Provider 与工具配置。",
        ],
      },
      {
        id: "speech-and-services",
        title: "分别选择语音和附加服务",
        paragraphs: [
          "本地语音配置可以在主机上处理语音；配置云端语音 Provider 后，对应服务会接收处理所需的音频或文本。选择本地语音，并不会改变编程 Agent 使用的语言模型 Provider。",
          "账号发现帮助你找到主机，配对建立对应信任。可选 Status 发布配置好的活动和额度信息，Goals 协调已批准的工作与报告。这些信息与主机上的仓库属于不同的数据流，都应该纳入配置判断。",
        ],
      },
      {
        id: "make-a-choice",
        title: "配置一套自己能解释清楚的工作流",
        paragraphs: [
          "处理敏感项目之前，列出涉及的主机、Agent Provider、模型端点、语音 Provider 和可选服务。依据实际配置和所在组织的要求作出判断，单靠产品标签不能确认一个工作流是否满足要求。",
        ],
        points: [
          "把访问范围限制在任务需要的项目和工具内。",
          "理解模型可能接收哪些提示词、代码片段和命令结果。",
          "需要本地处理时，选择受支持的方案并验证实际行为。",
          "设备或主机不再可信时，检查并撤销相应访问权限。",
        ],
      },
    ],
    faq: [
      {
        question: "自托管就是离线运行吗？",
        answer:
          "不是。远程访问需要网络，云端模型也需要联网。离线推理需要兼容的本地模型及配套工具。",
      },
    ],
    related: [
      "/learn/own-computer-ai-agents",
      "/compare/cloud-ai-agents",
      "/guides/always-on-ai-workstation",
    ],
  },
};
