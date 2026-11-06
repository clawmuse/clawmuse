import type { Language } from "./i18n/locales";

export const pluginLanguages = ["en", "zh-CN"] as const;
export const officialPluginIds = [
  "device-preview",
  "conversation-translation",
  "capacity-retry",
  "usage-display",
  "prompt-prediction",
] as const;
export type OfficialPluginId = (typeof officialPluginIds)[number];
interface PluginStory {
  name: string;
  tagline: string;
  description: string;
  benefits: string[];
  requirement: string;
  enabledByDefault: boolean;
}
interface PluginsCopy {
  title: string;
  description: string;
  eyebrow: string;
  headline: string;
  intro: string;
  download: string;
  explore: string;
  included: string;
  defaultOn: string;
  defaultOff: string;
  example: string;
  setupTitle: string;
  setupIntro: string;
  steps: [string, string][];
  faqTitle: string;
  faq: [string, string][];
  demo: {
    yourInput: string;
    input: string;
    sent: string;
    english: string;
    reply: string;
    original: string;
    retryStatus: string;
    retryNext: string;
    retryDone: string;
    quota: string;
    reset: string;
    cost: string;
    completed: string;
    suggestion: string;
    draft: string;
    confirm: string;
  };
  plugins: Record<OfficialPluginId, PluginStory>;
}
const zh: PluginsCopy = {
  title: "官方插件：让每一轮 AI 协作更顺手",
  description:
    "认识 ClawMuse 的官方插件：设备预览、会话翻译、模型满载自动重试、额度展示和自动下一步提示。支持独立安装和更新，按需开启。",
  eyebrow: "ClawMuse 官方插件",
  headline: "让每一轮 AI 协作，\n更顺手一点。",
  intro:
    "用自己的语言表达想法，少为临时满载停下，随时看清额度，再顺着思路接上下一步。官方插件，照顾从发出任务到继续推进的每一轮协作。",
  download: "下载 ClawMuse",
  explore: "认识官方插件",
  included: "官方维护 · 按需启停",
  defaultOn: "默认开启",
  defaultOff: "默认关闭 · 按需开启",
  example: "功能示意 · 示例内容",
  setupTitle: "按需安装，独立更新。",
  setupIntro:
    "设备预览支持独立安装，无需重新安装 ClawMuse；其他插件随软件提供。每台主机独立管理；插件总开关也会影响它们。",
  steps: [
    ["打开插件设置", "连接主机后，进入「设置 → 主机 → 插件」，在官方插件中找到它们。"],
    [
      "选择需要的功能",
      "额度展示和自动下一步提示默认开启；会话翻译和模型满载自动重试需要手动开启。",
    ],
    [
      "完成配置，继续对话",
      "翻译先选择工具与模型并测试；重试次数和间隔可以自行调整。已保存的选择会保留。",
    ],
  ],
  faqTitle: "开始使用前，你可能想知道",
  faq: [
    [
      "使用官方插件会产生模型费用吗？",
      "这些插件属于 ClawMuse 核心功能，源码同样在 GitHub 公开。会话翻译、下一步建议和重试发起的模型请求，仍按你所用 AI 服务的规则消耗额度或产生费用。",
    ],
    [
      "它们会替我自动发送任务吗？",
      "下一步提示由你确认后发送。开启模型满载自动重试后，它会在识别到指定满载错误时，按你的设置在原会话发送继续请求；你可以手动取消或关闭插件。",
    ],
    [
      "插件会出现在每台主机上吗？",
      "这些功能随 ClawMuse 安装包提供。设备预览可在支持插件来源安装的版本中独立安装；其他插件按安装包提供，并在对应主机的插件设置中管理。翻译还需要该主机上已登录的 Claude Code 或 Codex。",
    ],
    [
      "这是所有社区插件的展示吗？",
      "本专题介绍 ClawMuse 官方插件。第三方插件需经审核才会进入 ClawMuse 目录；你也可以在软件中自行从来源安装插件。",
    ],
  ],
  demo: {
    yourInput: "你这样说",
    input: "帮我修复登录页的布局，保留现有配色。",
    sent: "Agent 收到英文输入",
    english: "Fix the login page layout and keep the existing colors.",
    reply: "布局已调整，保留了现有配色。",
    original: "查看英文原文",
    retryStatus: "模型暂时满载",
    retryNext: "等待 30 秒 · 第 1 / 3 次重试",
    retryDone: "在原会话请求继续",
    quota: "当前账号剩余额度",
    reset: "2 小时后重置",
    cost: "本次任务费用",
    completed: "Agent 已完成这一轮回复",
    suggestion: "建议的下一步",
    draft: "检查手机端布局，并运行相关测试。",
    confirm: "由你确认，再发送",
  },
  plugins: {
    "device-preview": {
      name: "设备预览（预览版）",
      tagline: "主机跑模拟器，手机也能看和操作。",
      description:
        "在工作区右侧查看 iOS 与 Android 模拟器，发送单指和双指手势。画面与操作通过已连接主机的插件通道传递。",
      benefits: [
        "支持独立安装和固定版本更新，无需重新发版或重新安装 ClawMuse。",
        "支持 Android 与 iOS 模拟器切换，按平台提供返回、Home、最近任务、旋转与深浅色按键。",
        "一次只允许一个面板占用设备，停止预览保留模拟器运行。",
      ],
      requirement:
        "iOS 需要 Apple Silicon、macOS 15+ 和 Xcode；Android 需要已有 SDK、AVD 和带认证的 Emulator gRPC。首次 iOS 预览会下载校验过的 Baguette 原生组件。真实模拟器采集、触控及远程帧率尚待手动验证；当前使用图片流，非 H.264。",
      enabledByDefault: false,
    },

    "conversation-translation": {
      name: "会话翻译",
      tagline: "想法用中文，协作用英文。",
      description:
        "用熟悉的语言描述需求，插件在交给 Agent 前将输入译成英文；回复按完成的段落翻译成中文，让你读得顺、接得上。",
      benefits: [
        "随时查看英文原文，保留双语对照。",
        "保护代码、路径和链接，工具调用与结果保持原样。",
        "翻译模型独立于编程模型，按自己的需求选择。",
      ],
      requirement:
        "开启后，需要选择主机上已登录的 Claude Code 或 Codex 及其可用模型。翻译会使用该账号的额度；历史上下文不会被改写。",
      enabledByDefault: false,
    },
    "capacity-retry": {
      name: "模型满载自动重试",
      tagline: "暂时满载，让任务有机会接着走。",
      description:
        "遇到指定的模型满载错误，按设定间隔在原会话请求继续，保留当前模型和上下文，减少反复回来点击的麻烦。",
      benefits: [
        "默认最多重试 3 次，每次等待 30 秒；次数与间隔可调。",
        "重试进度和结束提醒留在原会话中。",
        "手动发消息、取消任务或关闭插件，会取消等待中的重试。",
      ],
      requirement:
        "只处理模型满载错误，登录失败和额度耗尽不会触发重试。继续请求不保证完整重放原任务，已执行操作不会回滚；主机需保持在线。",
      enabledByDefault: false,
    },
    "usage-display": {
      name: "额度展示",
      tagline: "继续之前，心里有数。",
      description:
        "在会话输入区查看当前账号的额度、重置时间和本次任务费用，安排接下来的工作时，少一次切到其他页面查找。",
      benefits: [
        "在会话输入框下方直接显示 5 小时、7 天等窗口剩余百分比与重置倒计时。",
        "实时展示当前会话的累计任务费用或 Token 用量，紧贴输入区。",
        "按当前使用的 Claude Code、Codex 等服务自动匹配对应账号额度。",
      ],
      requirement:
        "可展示的项目取决于当前 AI 服务和账号提供的数据。不同服务的额度统计方式不同；没有数据时不会显示虚构的余额或费用。",
      enabledByDefault: true,
    },
    "prompt-prediction": {
      name: "自动下一步提示",
      tagline: "回复结束，思路接着向前。",
      description:
        "Agent 完成一轮回复后，根据对话生成下一步输入建议。检查改动、补测试、继续完善，都可以从一个建议开始，由你确认后再发送。",
      benefits: [
        "建议跟随当前对话，减少重复组织下一句话。",
        "可以随时关闭，不影响正常输入和对话。",
      ],
      requirement: "需要可用的辅助模型，生成建议可能消耗模型额度。",
      enabledByDefault: true,
    },
  },
};
const en: PluginsCopy = {
  title: "Official plugins for everyday AI work",
  description:
    "Meet ClawMuse official plugins: device preview, conversation translation, model capacity retries, usage display and next-step suggestions. Install and update device preview independently.",
  eyebrow: "ClawMuse official plugins",
  headline: "A little less friction.\nA little more progress.",
  intro:
    "Write in your own language, recover from a busy model, check your allowance and find the next step. Official plugins help you keep moving through everyday AI work.",
  download: "Get ClawMuse",
  explore: "Meet the official plugins",
  included: "Official plugins · Enable your favorites",
  defaultOn: "On by default",
  defaultOff: "Off by default · Enable when needed",
  example: "Illustration · Sample content",
  setupTitle: "Install what you need. Update independently.",
  setupIntro:
    "Device preview can be installed independently without reinstalling ClawMuse. Other plugins ship with the app. Settings belong to each host, and the global plugin switch applies to these plugins.",
  steps: [
    [
      "Open plugin settings",
      "Connect to your host, then open Settings → Hosts → Plugins and find the official plugins.",
    ],
    [
      "Choose what helps",
      "Usage display and next-step suggestions start enabled. Turn on translation and model capacity retries when you need them.",
    ],
    [
      "Configure and continue",
      "Choose and test a translation tool and model. Adjust retry count and interval to suit your work. Saved choices are retained.",
    ],
  ],
  faqTitle: "Before you get started",
  faq: [
    [
      "Do official plugins use my AI service?",
      "These plugins are part of ClawMuse’s core features, and their source is on GitHub too. Model requests made for translation, suggestions and retries still use your AI service’s allowance or incur its normal charges.",
    ],
    [
      "Will they send tasks for me?",
      "You confirm next-step suggestions before sending them. Once enabled, capacity retries send a continuation request in the original conversation after the specific capacity error. You can cancel the wait or disable the plugin.",
    ],
    [
      "Are they available on every host?",
      "They ship with ClawMuse. Update the host and client you want to use, then manage the plugins for that host. Translation also needs Claude Code or Codex signed in on that machine.",
    ],
    [
      "Is this a list of all community plugins?",
      "This feature introduces ClawMuse official plugins. Third-party plugins enter the ClawMuse directory after review. You can also install plugins from your own sources in the app.",
    ],
  ],
  demo: {
    yourInput: "Your words",
    input: "帮我修复登录页的布局，保留现有配色。",
    sent: "English input for the agent",
    english: "Fix the login page layout and keep the existing colors.",
    reply: "布局已调整，保留了现有配色。",
    original: "View the English original",
    retryStatus: "Model temporarily at capacity",
    retryNext: "Wait 30 seconds · Retry 1 of 3",
    retryDone: "Request continuation in the same conversation",
    quota: "Current account allowance remaining",
    reset: "Resets in 2 hours",
    cost: "Task cost",
    completed: "The agent finished this turn",
    suggestion: "Suggested next step",
    draft: "Check the mobile layout and run the relevant tests.",
    confirm: "Review it, then send",
  },
  plugins: {
    "device-preview": {
      name: "Device preview (preview)",
      tagline: "Simulators on your host. A preview in your pocket.",
      description:
        "View iOS and Android simulators in the right-side workspace panel and send one- and two-finger gestures through the authenticated host connection.",
      benefits: [
        "Install and update a pinned plugin version without reinstalling ClawMuse.",
        "Choose a quality setting and use the buttons available on each platform.",
        "One panel per device. Stopping the preview keeps the simulator running.",
      ],
      requirement:
        "iOS requires Apple Silicon, macOS 15+ and Xcode. Android requires an existing SDK, AVD and authenticated Emulator gRPC. Starting iOS preview downloads a checksum-verified Baguette native component. Native capture, input and remote frame rates still need manual verification. The transport uses image frames, not H.264.",
      enabledByDefault: false,
    },

    "conversation-translation": {
      name: "Conversation translation",
      tagline: "Your words. An English conversation.",
      description:
        "Describe your task in Chinese. The plugin translates your input into English before it reaches the agent, then translates completed reply paragraphs back into Chinese.",
      benefits: [
        "Keep the English original within reach for comparison.",
        "Protect code, paths and links. Tool calls and results stay unchanged.",
        "Choose a translation model independently of your coding model.",
      ],
      requirement:
        "Select an available model in Claude Code or Codex, signed in on your host. Translation uses that account’s allowance and does not rewrite earlier context.",
      enabledByDefault: false,
    },
    "capacity-retry": {
      name: "Model capacity retries",
      tagline: "Give a busy model a moment.",
      description:
        "When the specific model-capacity error occurs, request continuation at your chosen interval in the original conversation, keeping its model and context.",
      benefits: [
        "Starts with up to 3 retries, 30 seconds apart. Both settings are adjustable.",
        "Progress and completion messages stay in the original conversation.",
        "Sending a message, cancelling the turn or disabling the plugin cancels pending retries.",
      ],
      requirement:
        "Only model-capacity errors trigger retries. Authentication failures and exhausted quotas do not. Continuation does not guarantee exact replay or undo completed actions. Your host must stay online.",
      enabledByDefault: false,
    },
    "usage-display": {
      name: "Usage display",
      tagline: "Know where you stand before you continue.",
      description:
        "See your current account’s allowance, reset time and task cost near the conversation input, so you can plan the next task without switching pages.",
      benefits: [
        "Shows 5-hour and 7-day window percentages and reset countdowns right below the composer.",
        "Displays live task cost or cumulative token usage for the active conversation.",
        "Automatically matches the quota windows of your active Claude Code or Codex account.",
      ],
      requirement:
        "Available fields depend on your AI service and account. Services measure allowance differently. Missing data is never replaced with an invented balance or cost.",
      enabledByDefault: true,
    },
    "prompt-prediction": {
      name: "Next-step suggestions",
      tagline: "Keep the thought going.",
      description:
        "After an agent finishes a reply, get a suggested next message based on the conversation. Review changes, add tests or continue refining, with you deciding what to send.",
      benefits: [
        "Suggestions follow the conversation, reducing repeated typing.",
        "Turn it off whenever you like and keep chatting as usual.",
      ],
      requirement:
        "A working helper model is required. Generating suggestions may use model allowance.",
      enabledByDefault: true,
    },
  },
};
export function pluginsCopy(language: Language): PluginsCopy {
  return language === "zh-CN" ? zh : en;
}
