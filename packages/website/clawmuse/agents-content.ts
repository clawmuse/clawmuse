import type { Language } from "./i18n/locales";
import { englishAgentCopy } from "./agents-copy-en";
import { chineseAgentCopy } from "./agents-copy-zh";

export const agentLanguages = ["en", "zh-CN"] as const;
export type AgentCategory = "core" | "plugin" | "acp";

// Snapshot of the host catalog, not a claim that the corresponding CLI is installed.
// Keep IDs and launch settings aligned with packages/app/src/data/acp-provider-catalog.ts.
const agentIdentities = [
  {
    slug: "claude-code",
    page: "/agents/claude-code",
    providerId: "claude",
    name: "Claude Code",
    category: "core",
    officialUrl: "https://code.claude.com/docs/en/overview",
    launchConfig: {
      command: ["claude"],
    },
  },
  {
    slug: "codex",
    page: "/agents/codex",
    providerId: "codex",
    name: "Codex",
    category: "core",
    officialUrl: "https://developers.openai.com/codex/cli/",
    launchConfig: {
      command: ["codex"],
    },
  },
  {
    slug: "copilot",
    page: "/agents/copilot",
    providerId: "copilot",
    name: "GitHub Copilot",
    category: "core",
    officialUrl: "https://github.com/features/copilot/cli/",
    launchConfig: {
      command: ["copilot"],
    },
  },
  {
    slug: "opencode",
    page: "/agents/opencode",
    providerId: "opencode",
    name: "OpenCode",
    category: "core",
    officialUrl: "https://opencode.ai/",
    launchConfig: {
      command: ["opencode"],
    },
  },
  {
    slug: "pi",
    page: "/agents/pi",
    providerId: "pi",
    name: "Pi Agent",
    category: "core",
    officialUrl: "https://pi.dev/",
    launchConfig: {
      command: ["pi"],
    },
  },
  {
    slug: "omp",
    page: "/agents/omp",
    providerId: "omp",
    name: "OMP (Oh My Pi)",
    category: "core",
    officialUrl: "https://github.com/can1357/oh-my-pi",
    launchConfig: {
      command: ["omp"],
      enabled: true,
    },
  },
  {
    slug: "antigravity",
    page: "/agents/antigravity",
    providerId: "antigravity",
    name: "Antigravity",
    category: "plugin",
    officialUrl: "https://antigravity.google/docs/cli/install/",
    launchConfig: {
      command: ["agy"],
    },
  },
  {
    slug: "muse-code",
    page: "/agents/muse-code",
    providerId: "muse",
    name: "Muse Code",
    category: "plugin",
    officialUrl: "https://dev.meta.ai/",
    launchConfig: {
      command: ["muse"],
    },
  },
  {
    slug: "agoragentic",
    page: "/agents/agoragentic",
    providerId: "agoragentic-acp",
    name: "Agoragentic",
    category: "acp",
    officialUrl: "https://agoragentic.com",
    launchConfig: {
      command: ["npx", "-y", "agoragentic-mcp@1.3.6", "--acp"],
      extends: "acp",
    },
  },
  {
    slug: "amp",
    page: "/agents/amp",
    providerId: "amp-acp",
    name: "Amp",
    category: "acp",
    officialUrl: "https://github.com/tao12345666333/amp-acp",
    launchConfig: {
      command: ["amp-acp"],
      extends: "acp",
    },
  },
  {
    slug: "auggie",
    page: "/agents/auggie",
    providerId: "auggie",
    name: "Auggie CLI",
    category: "acp",
    officialUrl: "https://www.augmentcode.com/",
    launchConfig: {
      command: ["npx", "-y", "@augmentcode/auggie@0.33.0", "--acp"],
      extends: "acp",
      env: {
        AUGMENT_DISABLE_AUTO_UPDATE: "1",
      },
    },
  },
  {
    slug: "autohand",
    page: "/agents/autohand",
    providerId: "autohand",
    name: "Autohand Code",
    category: "acp",
    officialUrl: "https://www.autohand.ai/cli/",
    launchConfig: {
      command: ["npx", "-y", "@autohandai/autohand-acp@0.2.1"],
      extends: "acp",
    },
  },
  {
    slug: "cline",
    page: "/agents/cline",
    providerId: "cline",
    name: "Cline",
    category: "acp",
    officialUrl: "https://cline.bot/cli",
    launchConfig: {
      command: ["npx", "-y", "cline@3.0.46", "--acp"],
      extends: "acp",
    },
  },
  {
    slug: "codebuddy",
    page: "/agents/codebuddy",
    providerId: "codebuddy-code",
    name: "Codebuddy Code",
    category: "acp",
    officialUrl: "https://www.codebuddy.cn/cli/",
    launchConfig: {
      command: ["codebuddy", "--acp"],
      extends: "acp",
    },
  },
  {
    slug: "codewhale",
    page: "/agents/codewhale",
    providerId: "codewhale",
    name: "CodeWhale",
    category: "acp",
    officialUrl: "https://codewhale.net/",
    launchConfig: {
      command: ["codewhale", "serve", "--acp"],
      extends: "acp",
    },
  },
  {
    slug: "cortex-code",
    page: "/agents/cortex-code",
    providerId: "cortex-code",
    name: "Cortex Code",
    category: "acp",
    officialUrl: "https://docs.snowflake.com/en/user-guide/cortex-code/cortex-code-cli",
    launchConfig: {
      command: ["cortex", "acp", "serve"],
      extends: "acp",
    },
  },
  {
    slug: "corust",
    page: "/agents/corust",
    providerId: "corust-agent",
    name: "Corust Agent",
    category: "acp",
    officialUrl: "https://github.com/Corust-ai/corust-agent-release/releases",
    launchConfig: {
      command: ["corust-agent-acp"],
      extends: "acp",
    },
  },
  {
    slug: "crow",
    page: "/agents/crow",
    providerId: "crow-cli",
    name: "crow-cli",
    category: "acp",
    officialUrl: "https://crow-ai.dev/",
    launchConfig: {
      command: ["crow-cli", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "cursor",
    page: "/agents/cursor",
    providerId: "cursor",
    name: "Cursor",
    category: "acp",
    officialUrl: "https://docs.cursor.com/en/cli/overview",
    launchConfig: {
      command: ["cursor-agent", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "deepagents",
    page: "/agents/deepagents",
    providerId: "deepagents",
    name: "DeepAgents",
    category: "acp",
    officialUrl: "https://docs.langchain.com/oss/javascript/deepagents/overview",
    launchConfig: {
      command: ["npx", "-y", "deepagents-acp@0.1.20"],
      extends: "acp",
    },
  },
  {
    slug: "devin",
    page: "/agents/devin",
    providerId: "devin",
    name: "Devin CLI",
    category: "acp",
    officialUrl: "https://cli.devin.ai/docs",
    launchConfig: {
      command: ["devin", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "dimcode",
    page: "/agents/dimcode",
    providerId: "dimcode",
    name: "DimCode",
    category: "acp",
    officialUrl: "https://dimcode.dev/docs/acp.html",
    launchConfig: {
      command: ["npx", "-y", "dimcode@0.2.36", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "dirac",
    page: "/agents/dirac",
    providerId: "dirac",
    name: "Dirac",
    category: "acp",
    officialUrl: "https://dirac.run",
    launchConfig: {
      command: ["npx", "-y", "dirac-cli@0.4.22", "--acp"],
      extends: "acp",
    },
  },
  {
    slug: "factory-droid",
    page: "/agents/factory-droid",
    providerId: "factory-droid",
    name: "Factory Droid",
    category: "acp",
    officialUrl: "https://factory.ai/product/cli",
    launchConfig: {
      command: ["npx", "-y", "droid@0.179.0", "exec", "--output-format", "acp-daemon"],
      extends: "acp",
      env: {
        DROID_DISABLE_AUTO_UPDATE: "true",
        FACTORY_DROID_AUTO_UPDATE_ENABLED: "false",
      },
      params: {
        supportsMcpServers: false,
      },
    },
  },
  {
    slug: "fast-agent",
    page: "/agents/fast-agent",
    providerId: "fast-agent",
    name: "fast-agent",
    category: "acp",
    officialUrl: "https://fast-agent.ai/acp/",
    launchConfig: {
      command: ["uvx", "--from", "fast-agent-acp==0.9.22", "fast-agent-acp", "-x"],
      extends: "acp",
    },
  },
  {
    slug: "gemini",
    page: "/agents/gemini",
    providerId: "gemini",
    name: "Gemini CLI",
    category: "acp",
    officialUrl: "https://geminicli.com",
    launchConfig: {
      command: ["npx", "-y", "@google/gemini-cli@0.52.0", "--acp"],
      extends: "acp",
    },
  },
  {
    slug: "gajae-code",
    page: "/agents/gajae-code",
    providerId: "gjc",
    name: "Gajae Code",
    category: "acp",
    officialUrl: "https://gajae-code.com",
    launchConfig: {
      command: ["gjc", "acp"],
      extends: "acp",
      env: {
        GJC_ACP_PERMISSION_MODE: "prompt",
      },
    },
  },
  {
    slug: "glm",
    page: "/agents/glm",
    providerId: "glm-acp-agent",
    name: "GLM Agent",
    category: "acp",
    officialUrl: "https://github.com/stefandevo/glm-acp-agent",
    launchConfig: {
      command: ["npx", "-y", "glm-acp-agent@1.3.0"],
      extends: "acp",
    },
  },
  {
    slug: "goose",
    page: "/agents/goose",
    providerId: "goose",
    name: "goose",
    category: "acp",
    officialUrl: "https://block.github.io/goose/",
    launchConfig: {
      command: ["goose", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "grok",
    page: "/agents/grok",
    providerId: "grok",
    name: "Grok",
    category: "acp",
    officialUrl: "https://docs.x.ai/build/overview",
    launchConfig: {
      command: ["grok", "agent", "stdio"],
      extends: "acp",
    },
  },
  {
    slug: "hermes",
    page: "/agents/hermes",
    providerId: "hermes",
    name: "Hermes",
    category: "acp",
    officialUrl: "https://hermes-agent.nousresearch.com/docs/user-guide/features/acp",
    launchConfig: {
      command: ["hermes", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "hoplite",
    page: "/agents/hoplite",
    providerId: "hoplite",
    name: "Hoplite",
    category: "plugin",
    officialUrl: "https://hoplite.sh/docs/cli#install",
    launchConfig: {
      command: ["hoplite", "acp"],
      enabled: true,
    },
  },
  {
    slug: "junie",
    page: "/agents/junie",
    providerId: "junie",
    name: "Junie",
    category: "acp",
    officialUrl: "https://junie.jetbrains.com/docs/junie-cli-acp.html",
    launchConfig: {
      command: ["junie", "--acp", "true"],
      extends: "acp",
    },
  },
  {
    slug: "kilo",
    page: "/agents/kilo",
    providerId: "kilo",
    name: "Kilo",
    category: "acp",
    officialUrl: "https://kilo.ai/docs/code-with-ai/platforms/cli",
    launchConfig: {
      command: ["kilo", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "kiro",
    page: "/agents/kiro",
    providerId: "kiro",
    name: "Kiro CLI",
    category: "acp",
    officialUrl: "https://kiro.dev/docs/cli/acp/",
    launchConfig: {
      command: ["kiro-cli", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "kimi",
    page: "/agents/kimi",
    providerId: "kimi",
    name: "Kimi Code CLI",
    category: "acp",
    officialUrl: "https://github.com/MoonshotAI/kimi-code",
    launchConfig: {
      command: ["kimi", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "minimax-code",
    page: "/agents/minimax-code",
    providerId: "minimax-code",
    name: "MiniMax Code",
    category: "acp",
    officialUrl: "https://agent.minimax.io",
    launchConfig: {
      command: ["npx", "-y", "@minimax-ai/code@0.1.2", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "minion-code",
    page: "/agents/minion-code",
    providerId: "minion-code",
    name: "Minion Code",
    category: "acp",
    officialUrl: "https://github.com/femto/minion-code",
    launchConfig: {
      command: ["uvx", "--from", "minion-code==0.1.44", "minion-code", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "mistral-vibe",
    page: "/agents/mistral-vibe",
    providerId: "mistral-vibe",
    name: "Mistral Vibe",
    category: "acp",
    officialUrl: "https://github.com/mistralai/mistral-vibe",
    launchConfig: {
      command: ["vibe-acp"],
      extends: "acp",
    },
  },
  {
    slug: "nova",
    page: "/agents/nova",
    providerId: "nova",
    name: "Nova",
    category: "acp",
    officialUrl: "https://www.compassap.ai/portfolio/nova.html",
    launchConfig: {
      command: ["npx", "-y", "@compass-ai/nova@1.1.29", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "poolside",
    page: "/agents/poolside",
    providerId: "poolside",
    name: "Poolside",
    category: "acp",
    officialUrl: "https://docs.poolside.ai/cli/pool",
    launchConfig: {
      command: ["pool", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "qoder",
    page: "/agents/qoder",
    providerId: "qoder",
    name: "Qoder CLI",
    category: "acp",
    officialUrl: "https://qoder.com",
    launchConfig: {
      command: ["npx", "-y", "@qoder-ai/qodercli@1.1.4", "--acp"],
      extends: "acp",
    },
  },
  {
    slug: "qwen-code",
    page: "/agents/qwen-code",
    providerId: "qwen-code",
    name: "Qwen Code",
    category: "acp",
    officialUrl: "https://qwenlm.github.io/qwen-code-docs/en/users/overview",
    launchConfig: {
      command: ["npx", "-y", "@qwen-code/qwen-code@0.20.1", "--acp", "--experimental-skills"],
      extends: "acp",
    },
  },
  {
    slug: "sigit",
    page: "/agents/sigit",
    providerId: "sigit",
    name: "siGit Code",
    category: "acp",
    officialUrl: "https://github.com/getsigit/sigit",
    launchConfig: {
      command: ["sigit"],
      extends: "acp",
    },
  },
  {
    slug: "stakpak",
    page: "/agents/stakpak",
    providerId: "stakpak",
    name: "Stakpak",
    category: "acp",
    officialUrl: "https://stakpak.dev/",
    launchConfig: {
      command: ["stakpak", "acp"],
      extends: "acp",
    },
  },
  {
    slug: "trae-cli",
    page: "/agents/trae-cli",
    providerId: "traecli",
    name: "TRAE CLI",
    category: "acp",
    officialUrl: "https://docs.trae.cn/cli_get-started-with-trae-cli",
    launchConfig: {
      command: ["traecli", "acp", "serve"],
      extends: "acp",
    },
  },
  {
    slug: "vtcode",
    page: "/agents/vtcode",
    providerId: "vtcode",
    name: "VT Code",
    category: "acp",
    officialUrl: "https://github.com/vinhnx/VTCode/blob/main/docs/guides/zed-acp.md",
    launchConfig: {
      command: ["vtcode", "acp"],
      extends: "acp",
      env: {
        VT_ACP_ENABLED: "1",
        VT_ACP_ZED_ENABLED: "1",
      },
    },
  },
] as const;

export type AgentSlug = (typeof agentIdentities)[number]["slug"];
export type AgentPage = (typeof agentIdentities)[number]["page"];
export const agentRoutes = Object.freeze(agentIdentities.map((agent) => agent.page));

export interface AgentTranslation {
  intro: string;
  useCase: string;
  prerequisite: string;
  question: string;
  answer: string;
}

export interface AgentContent {
  page: AgentPage;
  slug: AgentSlug;
  providerId: string;
  name: string;
  category: AgentCategory;
  title: string;
  description: string;
  intro: string;
  useCases: readonly string[];
  prerequisites: readonly string[];
  setup: readonly string[];
  command: string;
  note: string;
  faq: readonly { question: string; answer: string }[];
  officialUrl: string;
  related: readonly AgentPage[];
}

export function isAgentPage(page: string): page is AgentPage {
  return agentRoutes.some((route) => route === page);
}

export const agentsCopy = {
  en: {
    title: "Choose your agent.",
    description: "Find the AI tools you use and see how to connect them to ClawMuse.",
    eyebrow: "THE AGENT DIRECTORY",
    search: "Search agents",
    searchPlaceholder: "Search agent names, e.g. Codex",
    filter: "Integration type",
    all: "All integrations",
    categories: { core: "Built-in provider", plugin: "Bundled plugin", acp: "ACP catalog" },
    results: "agents",
    empty: "No agents match these filters.",
    reset: "Clear filters",
    availableNote:
      "Install and sign in to the agent on your computer first. Each listing explains its setup and supported features.",
    setupTitle: "Connect it to your workspace",
    prerequisitesTitle: "Before you begin",
    useCasesTitle: "Try a task",
    commandTitle: "Host launch configuration",
    commandNote:
      "Provider configuration reference, not an installation command. Use the in-app catalog for current pinned versions.",
    limitationsTitle: "Supported features and limits",
    officialLink: "Setup source",
    faqTitle: "Common questions",
    relatedTitle: "Other agents to explore",
    back: "All agents",
    download: "Get ClawMuse",
    guide: "Agent setup guide",
    showcaseTitle: "Choose the AI for each task.",
    showcaseBody:
      "Choose Claude Code, Codex or another supported tool for the task at hand. Use them in one workspace after installing and signing in on your computer.",
    showcaseLink: "Find your agent",
    coreStep: "Select this agent in the host’s provider settings.",
    pluginStep:
      "Use the provider plugin shipped with a compatible host. Antigravity and Muse Code load by default; add Hoplite from the catalog to enable its plugin.",
    acpStep:
      "In Settings → Hosts → your host → Providers, add this catalog entry. Make the launch command and its required runtime available to the daemon.",
    antigravityFirstTask:
      "Start with a narrowly scoped task. Antigravity tools run without approval prompts; asking for an explanation or read-only work does not create a permission restriction.",
    cloudInstallStep:
      "Install and authenticate the local Hoplite bridge, then verify access to the intended Hoplite cloud project.",
    cloudFirstTask:
      "Check the linked cloud workspace, available models and permissions. Start with a small task in that cloud project and inspect the resulting changes there.",
    firstTaskStep:
      "Select an available model and permission mode. Start with a read-only task in a known project, then inspect the answer before allowing edits.",
    accountBoundary: "Model subscriptions and usage are billed separately by your AI provider.",
    coreBoundary: "The agent runs in the host environment with its configured permissions.",
    pluginBoundary: "The plugin may expose fewer features than the upstream agent.",
    acpBoundary:
      "The catalog configures an ACP connection. Models, modes, history and tool support depend on what the installed agent reports. Catalog inclusion is not a guarantee of feature parity or a ClawMuse endorsement of the provider.",
    cloudBoundary:
      "Hoplite executes in a cloud workspace through a local bridge. Local project files and loopback MCP tools are not available there; check the linked cloud project before starting.",
  },
  "zh-CN": {
    title: "选择你常用的 Agent。",
    description: "找到你在用的 AI 工具，查看如何连接到 ClawMuse。",
    eyebrow: "AGENT 目录",
    search: "搜索 Agent",
    searchPlaceholder: "搜索 Agent 名称，例如 Codex",
    filter: "集成方式",
    all: "全部集成",
    categories: { core: "内置 Provider", plugin: "随附插件", acp: "ACP 目录" },
    results: "个 Agent",
    empty: "没有符合当前筛选条件的 Agent。",
    reset: "清除筛选",
    availableNote: "先在电脑上安装并登录 Agent。各工具的配置方法和支持情况见详情页。",
    setupTitle: "连接到你的工作空间",
    prerequisitesTitle: "开始前的准备",
    useCasesTitle: "试试这个任务",
    commandTitle: "主机启动配置",
    commandNote: "Provider 配置参考，非安装命令。目录项版本以应用内为准。",
    limitationsTitle: "功能与限制",
    officialLink: "安装与接入来源",
    faqTitle: "常见问题",
    relatedTitle: "继续了解其他 Agent",
    back: "全部 Agent",
    download: "获取 ClawMuse",
    guide: "Agent 配置指南",
    showcaseTitle: "每项任务，选你想用的 AI。",
    showcaseBody:
      "Claude Code、Codex 等多种工具，按任务选择，按喜好搭配。先在电脑上安装并登录，就能在同一个工作台使用。",
    showcaseLink: "查看全部 Agent",
    coreStep: "在主机的 Provider 设置中选择该 Agent。",
    pluginStep:
      "使用兼容主机随附的 Provider 插件。Antigravity 与 Muse Code 默认加载，Hoplite 需要从目录添加后启用。",
    acpStep:
      "在设置 → 主机 → 对应主机 → Provider 中添加该目录项，并确保 daemon 能找到启动命令及所需运行环境。",
    antigravityFirstTask:
      "先从范围明确的小任务开始。Antigravity 工具不会请求审批；要求只解释或只读，并不会形成权限限制。",
    cloudInstallStep: "安装并授权本地 Hoplite 桥接 CLI，然后验证对目标 Hoplite 云端项目的访问。",
    cloudFirstTask:
      "核对关联的云工作空间、可用模型与权限，先在该云端项目执行一个小任务，并在那里检查实际改动。",
    firstTaskStep:
      "选择实际可用的模型与权限模式，在熟悉的项目中先执行只读任务，核对答案后再允许修改。",
    accountBoundary: "模型订阅和用量由对应 AI 服务商单独计费。",
    coreBoundary: "Agent 使用主机环境运行，操作受其权限设置控制。",
    pluginBoundary: "插件支持的功能可能少于上游 Agent。",
    acpBoundary:
      "目录配置的是 ACP 连接。模型、模式、历史记录与工具能力取决于已安装 Agent 的实际报告。目录收录不保证与其他 Provider 功能一致，也不代表 ClawMuse 为该服务背书。",
    cloudBoundary:
      "Hoplite 通过本地桥接在云工作空间执行。本地项目文件与回环 MCP 工具在那里不可用，开始前请确认关联的云端项目。",
  },
} as const;

const relatedSlugs: readonly (readonly AgentSlug[])[] = [
  ["claude-code", "codex", "copilot", "cursor", "gemini"],
  ["pi", "omp", "opencode", "dimcode", "mistral-vibe"],
  ["qwen-code", "kimi", "glm", "minimax-code", "codewhale"],
  ["muse-code", "antigravity", "trae-cli", "qoder", "codebuddy"],
  ["deepagents", "fast-agent", "minion-code", "hermes", "goose"],
  ["hoplite", "devin", "factory-droid", "poolside"],
  ["stakpak", "cortex-code", "corust", "vtcode"],
  ["amp", "auggie", "junie", "kilo", "kiro", "cline"],
  ["crow", "dirac", "gajae-code", "sigit"],
  ["autohand", "nova", "agoragentic", "grok"],
];

export function agentFor(page: AgentPage, language: Language): AgentContent {
  const agent = agentIdentities.find((candidate) => candidate.page === page);
  if (!agent) throw new Error(`Unknown agent page: ${page}`);
  const locale = language === "zh-CN" ? "zh-CN" : "en";
  const copy = agentsCopy[locale];
  const translations = locale === "zh-CN" ? chineseAgentCopy : englishAgentCopy;
  const text = translations[agent.slug];
  const steps = { core: copy.coreStep, plugin: copy.pluginStep, acp: copy.acpStep };
  const boundaries = {
    core: copy.coreBoundary,
    plugin: copy.pluginBoundary,
    acp: copy.acpBoundary,
  };
  const relatedGroup = relatedSlugs.find((group) => group.includes(agent.slug));
  if (!relatedGroup) throw new Error(`Missing related agents for ${agent.slug}`);
  const related = agentIdentities
    .filter((candidate) => candidate.slug !== agent.slug && relatedGroup.includes(candidate.slug))
    .map((candidate) => candidate.page);
  const title =
    locale === "zh-CN" ? `在 ClawMuse 中使用 ${agent.name}` : `${agent.name} with ClawMuse`;
  const providerConfig = { ...agent.launchConfig, label: agent.name };
  const command = JSON.stringify(
    { agents: { providers: { [agent.providerId]: providerConfig } } },
    null,
    2,
  );
  const cloudWorkspace = agent.slug === "hoplite";
  const note = cloudWorkspace ? copy.cloudBoundary : boundaries[agent.category];
  let firstTaskStep: string = copy.firstTaskStep;
  if (cloudWorkspace) firstTaskStep = copy.cloudFirstTask;
  if (agent.slug === "antigravity") firstTaskStep = copy.antigravityFirstTask;
  return {
    page: agent.page,
    slug: agent.slug,
    providerId: agent.providerId,
    name: agent.name,
    category: agent.category,
    title,
    description: text.intro,
    intro: text.intro,
    useCases: [text.useCase],
    prerequisites: [text.prerequisite, copy.accountBoundary],
    setup: [
      ...(cloudWorkspace ? [copy.cloudInstallStep] : []),
      steps[agent.category],
      firstTaskStep,
    ],
    command,
    note,
    faq: [{ question: text.question, answer: text.answer }],
    officialUrl: agent.officialUrl,
    related,
  };
}

export function agentEntries(language: Language): AgentContent[] {
  return agentRoutes.map((page) => agentFor(page, language));
}
