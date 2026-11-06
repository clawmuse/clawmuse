import type { Language } from "./i18n/locales";
import { englishAgentCopy } from "./agents-copy-en";
import { chineseAgentCopy } from "./agents-copy-zh";
import { agentInstalls, type AgentInstall, type AgentInstallMethod } from "./agents-install";

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
    officialUrl: "https://code.claude.com/docs/en/setup",
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
    officialUrl: "https://github.com/github/copilot-cli",
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
    officialUrl: "https://opencode.ai/docs/",
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
    officialUrl: "https://antigravity.google/docs/install?tab=cli",
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
    officialUrl: "https://ampcode.com/manual",
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
    officialUrl: "https://docs.augmentcode.com/cli/setup-auggie/install-auggie-cli",
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
    officialUrl: "https://github.com/rustingai/corust-agent-release/releases",
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
    officialUrl: "https://cursor.com/docs/cli/installation",
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
    officialUrl: "https://docs.factory.ai/cli/getting-started/quickstart",
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
    officialUrl: "https://goose-docs.ai/docs/getting-started/installation",
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
    officialUrl: "https://junie.jetbrains.com/docs/junie-cli.html",
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
    officialUrl: "https://kiro.dev/docs/cli/installation/",
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
    officialUrl: "https://docs.poolside.ai/cli/install",
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
    officialUrl: "https://qoder.com/cli",
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
  about: string;
  setup: string;
  connectNote?: string;
  useCase: string;
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
  about: string;
  install: readonly AgentInstallMethod[];
  setup: string;
  signInCommand?: string;
  connect: readonly string[];
  useCase: string;
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
    categories: {
      core: "Built-in provider",
      plugin: "Bundled plugin",
      acp: "ACP catalog",
    },
    results: "agents",
    empty: "No agents match these filters.",
    reset: "Clear filters",
    aboutTitle: (name: string) => `What is ${name}?`,
    installTitle: (name: string) => `Install ${name}`,
    connectTitle: "Connect it to ClawMuse",
    useCasesTitle: "Try this from your phone",
    signInLabel: "Sign in",
    officialLink: (name: string) => `Official ${name} install docs`,
    faqTitle: "Common questions",
    relatedTitle: "Other agents to explore",
    back: "All agents",
    download: "Get ClawMuse",
    guide: "Agent setup guide",
    showcaseTitle: "Choose the AI for each task.",
    showcaseBody:
      "Choose Claude Code, Codex or another supported tool for the task at hand. Use them in one workspace after installing and signing in on your computer.",
    showcaseLink: "Find your agent",
    agentTitle: (name: string) => `How to install ${name} and use it from your phone`,
    pageSummary: "Official install commands, plus how to use it from your phone with ClawMuse.",
    checkStep: (name: string) =>
      `Open ClawMuse and go to Settings → Hosts → your computer → Providers. Check that ${name} is listed.`,
    pluginStep: (name: string) =>
      `ClawMuse ships with the ${name} plugin. Go to Settings → Hosts → your computer → Providers and check that it is listed.`,
    addStep: (name: string) =>
      `Open ClawMuse, go to Settings → Hosts → your computer → Providers, and add ${name} from the catalog.`,
    npxStep: "This entry starts through npx, so your computer needs Node.js.",
    uvxStep: "This entry starts through uvx, so your computer needs uv.",
    startStep: (name: string) =>
      `Start a conversation and choose ${name} and a model. While your computer is on, you can pick it up from your phone.`,
    catalogStartStep: (name: string) =>
      `Start a conversation and choose ${name}. Available models and features are whatever it reports.`,
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
    aboutTitle: (name: string) => `${name} 是什么`,
    installTitle: (name: string) => `安装 ${name}`,
    connectTitle: "接入 ClawMuse",
    useCasesTitle: "在手机上可以这样用",
    signInLabel: "登录",
    officialLink: (name: string) => `${name} 官方安装文档`,
    faqTitle: "常见问题",
    relatedTitle: "继续了解其他 Agent",
    back: "全部 Agent",
    download: "获取 ClawMuse",
    guide: "Agent 配置指南",
    showcaseTitle: "每项任务，选你想用的 AI。",
    showcaseBody:
      "Claude Code、Codex 等多种工具，按任务选择，按喜好搭配。先在电脑上安装并登录，就能在同一个工作台使用。",
    showcaseLink: "查看全部 Agent",
    agentTitle: (name: string) => `${name} 怎么安装，怎么在手机上用`,
    pageSummary: "这里有官方安装命令，以及接入 ClawMuse 后在手机上使用的方法。",
    checkStep: (name: string) =>
      `打开 ClawMuse，进入设置 → 主机 → 你的电脑 → Provider，确认列表里有 ${name}。`,
    pluginStep: (name: string) =>
      `ClawMuse 自带 ${name} 插件。进入设置 → 主机 → 你的电脑 → Provider，确认列表里有它。`,
    addStep: (name: string) =>
      `打开 ClawMuse，进入设置 → 主机 → 你的电脑 → Provider，从目录添加 ${name}。`,
    npxStep: "这一项通过 npx 启动，电脑上要装好 Node.js。",
    uvxStep: "这一项通过 uvx 启动，电脑上要装好 uv。",
    startStep: (name: string) => `新建对话，选 ${name} 和模型。电脑开着，就能在手机上接着用。`,
    catalogStartStep: (name: string) =>
      `新建对话，选 ${name}。能用的模型和功能以它实际提供的为准。`,
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

function connectSteps(
  agent: (typeof agentIdentities)[number],
  copy: (typeof agentsCopy)[keyof typeof agentsCopy],
  note: string | undefined,
): string[] {
  const launcher = agent.launchConfig.command[0];
  const fromCatalog = agent.category === "acp" || agent.slug === "hoplite";
  let first = copy.checkStep(agent.name);
  if (agent.category === "plugin") first = copy.pluginStep(agent.name);
  if (fromCatalog) first = copy.addStep(agent.name);
  const start = fromCatalog ? copy.catalogStartStep : copy.startStep;
  return [
    first,
    ...(note ? [note] : []),
    ...(launcher === "npx" ? [copy.npxStep] : []),
    ...(launcher === "uvx" ? [copy.uvxStep] : []),
    start(agent.name),
  ];
}

export function agentFor(page: AgentPage, language: Language): AgentContent {
  const agent = agentIdentities.find((candidate) => candidate.page === page);
  if (!agent) throw new Error(`Unknown agent page: ${page}`);
  const locale = language === "zh-CN" ? "zh-CN" : "en";
  const copy = agentsCopy[locale];
  const translations = locale === "zh-CN" ? chineseAgentCopy : englishAgentCopy;
  const text: AgentTranslation = translations[agent.slug];
  const relatedGroup = relatedSlugs.find((group) => group.includes(agent.slug));
  if (!relatedGroup) throw new Error(`Missing related agents for ${agent.slug}`);
  const related = agentIdentities
    .filter((candidate) => candidate.slug !== agent.slug && relatedGroup.includes(candidate.slug))
    .map((candidate) => candidate.page);
  const install: AgentInstall = agentInstalls[agent.slug];
  return {
    page: agent.page,
    slug: agent.slug,
    providerId: agent.providerId,
    name: agent.name,
    category: agent.category,
    title: copy.agentTitle(agent.name),
    description: `${text.intro} ${copy.pageSummary}`,
    intro: text.intro,
    about: text.about,
    install: install.methods,
    setup: text.setup,
    signInCommand: install.signInCommand,
    connect: connectSteps(agent, copy, text.connectNote),
    useCase: text.useCase,
    faq: [{ question: text.question, answer: text.answer }],
    officialUrl: agent.officialUrl,
    related,
  };
}

export function agentEntries(language: Language): AgentContent[] {
  return agentRoutes.map((page) => agentFor(page, language));
}
