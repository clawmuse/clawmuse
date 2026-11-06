import type { AgentSlug } from "./agents-content";

export interface AgentInstallMethod {
  label: string;
  code: string;
}

export interface AgentInstall {
  methods: readonly AgentInstallMethod[];
  signInCommand?: string;
}

const macLinux = "macOS / Linux";
const windows = "Windows PowerShell";

// Commands are copied from each vendor's install docs, linked by officialUrl in agents-content.ts.
// Recheck them against that page when editing; do not write an install command from memory.
export const agentInstalls = {
  "claude-code": {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://claude.ai/install.sh | bash",
      },
      { label: windows, code: "irm https://claude.ai/install.ps1 | iex" },
      { label: "Homebrew", code: "brew install --cask claude-code" },
      { label: "WinGet", code: "winget install Anthropic.ClaudeCode" },
    ],
    signInCommand: "claude",
  },
  codex: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://chatgpt.com/codex/install.sh | sh",
      },
      {
        label: windows,
        code: "irm https://chatgpt.com/codex/install.ps1 | iex",
      },
      { label: "npm", code: "npm install -g @openai/codex" },
      { label: "Homebrew", code: "brew install --cask codex" },
    ],
    signInCommand: "codex",
  },
  copilot: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://gh.io/copilot-install | bash",
      },
      { label: "WinGet", code: "winget install GitHub.Copilot" },
      { label: "npm", code: "npm install -g @github/copilot" },
      { label: "Homebrew", code: "brew install copilot-cli" },
    ],
    signInCommand: "copilot",
  },
  opencode: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://opencode.ai/install | bash",
      },
      { label: "npm", code: "npm install -g opencode-ai" },
      { label: "Homebrew", code: "brew install anomalyco/tap/opencode" },
    ],
    signInCommand: "opencode",
  },
  pi: {
    methods: [
      { label: macLinux, code: "curl -fsSL https://pi.dev/install.sh | sh" },
      { label: windows, code: "irm https://pi.dev/install.ps1 | iex" },
      {
        label: "npm",
        code: "npm install -g --ignore-scripts @earendil-works/pi-coding-agent",
      },
    ],
    signInCommand: "pi",
  },
  omp: {
    methods: [
      { label: macLinux, code: "curl -fsSL https://omp.sh/install | sh" },
      { label: windows, code: "irm https://omp.sh/install.ps1 | iex" },
    ],
    signInCommand: "omp",
  },
  antigravity: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
      },
      {
        label: windows,
        code: "irm https://antigravity.google/cli/install.ps1 | iex",
      },
    ],
    signInCommand: "agy",
  },
  "muse-code": {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://dev.meta.ai/install.sh | bash",
      },
      { label: windows, code: "irm https://dev.meta.ai/install.ps1 | iex" },
    ],
    signInCommand: "muse login",
  },
  agoragentic: {
    methods: [{ label: "npx", code: "npx agoragentic-mcp --acp" }],
  },
  amp: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://ampcode.com/install.sh | bash",
      },
      {
        label: windows,
        code: 'powershell -c "irm https://ampcode.com/install.ps1 | iex"',
      },
      { label: "Homebrew", code: "brew install ampcode/tap/ampcode" },
      { label: "ACP", code: "npm install -g amp-acp" },
    ],
    signInCommand: "amp login",
  },
  auggie: {
    methods: [{ label: "npm", code: "npm install -g @augmentcode/auggie" }],
    signInCommand: "auggie login",
  },
  autohand: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://autohand.ai/install.sh | sh",
      },
      {
        label: windows,
        code: "iwr -useb https://autohand.ai/install.ps1 | iex",
      },
      { label: "Homebrew", code: "brew install autohandai/code/autohand-code" },
    ],
    signInCommand: "autohand",
  },
  cline: {
    methods: [{ label: "npm", code: "npm i -g cline" }],
    signInCommand: "cline auth",
  },
  codebuddy: {
    methods: [{ label: "npm", code: "npm install -g @tencent-ai/codebuddy-code" }],
    signInCommand: "codebuddy",
  },
  codewhale: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://codewhale.net/install.sh | sh",
      },
    ],
    signInCommand: "codewhale auth set --provider deepseek",
  },
  "cortex-code": {
    methods: [
      {
        label: macLinux,
        code: "curl -LsS https://ai.snowflake.com/static/cc-scripts/install.sh | sh",
      },
      {
        label: windows,
        code: "irm https://ai.snowflake.com/static/cc-scripts/install.ps1 | iex",
      },
    ],
    signInCommand: "cortex",
  },
  corust: {
    methods: [],
  },
  crow: {
    methods: [{ label: macLinux, code: "curl -fsSL crow-ai.dev/install.sh | bash" }],
  },
  cursor: {
    methods: [
      { label: macLinux, code: "curl https://cursor.com/install -fsS | bash" },
      {
        label: windows,
        code: "irm 'https://cursor.com/install?win32=true' | iex",
      },
    ],
    signInCommand: "agent login",
  },
  deepagents: {
    methods: [{ label: "npx", code: "npx deepagents-acp" }],
  },
  devin: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://cli.devin.ai/install.sh | bash",
      },
      {
        label: windows,
        code: "irm https://static.devin.ai/cli/setup.ps1 | iex",
      },
    ],
    signInCommand: "devin",
  },
  dimcode: {
    methods: [{ label: "npm", code: "npm i -g dimcode@beta" }],
    signInCommand: "dim",
  },
  dirac: {
    methods: [{ label: "npm", code: "npm install -g dirac-cli" }],
    signInCommand: "dirac",
  },
  "factory-droid": {
    methods: [
      { label: macLinux, code: "curl -fsSL https://app.factory.ai/cli | sh" },
      { label: windows, code: "irm https://app.factory.ai/cli/windows | iex" },
      { label: "Homebrew", code: "brew install --cask droid" },
      { label: "npm", code: "npm install -g droid" },
    ],
    signInCommand: "droid",
  },
  "fast-agent": {
    methods: [{ label: "uv", code: "uvx fast-agent-acp@latest --model sonnet" }],
  },
  gemini: {
    methods: [
      { label: "npm", code: "npm install -g @google/gemini-cli" },
      { label: "Homebrew", code: "brew install gemini-cli" },
    ],
    signInCommand: "gemini",
  },
  "gajae-code": {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://raw.githubusercontent.com/Yeachan-Heo/gajae-code/main/scripts/install.sh | sh",
      },
      { label: "npm", code: "npm install -g gajae-code" },
    ],
    signInCommand: "gjc",
  },
  glm: {
    methods: [{ label: "npm", code: "npm install -g glm-acp-agent@latest" }],
    signInCommand: "export Z_AI_API_KEY=your_key_here",
  },
  goose: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | bash",
      },
      { label: "Homebrew", code: "brew install block-goose-cli" },
    ],
    signInCommand: "goose configure",
  },
  grok: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://x.ai/cli/install.sh | bash",
      },
      { label: windows, code: "irm https://x.ai/cli/install.ps1 | iex" },
    ],
    signInCommand: "grok",
  },
  hermes: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash",
      },
      {
        label: windows,
        code: "iex (irm https://hermes-agent.nousresearch.com/install.ps1)",
      },
      {
        label: "ACP",
        code: "cd ~/.hermes/hermes-agent && python -c \"import pm; pm.sync_venv(['acp'], explicit=True)\"",
      },
    ],
    signInCommand: "hermes setup",
  },
  hoplite: {
    methods: [
      { label: "npm", code: "npm i -g @usehoplite/cli" },
      { label: "Homebrew", code: "brew install usehoplite/tap/hoplite" },
      {
        label: macLinux,
        code: "curl -fsSL https://hoplite.sh/install.sh | sh",
      },
    ],
    signInCommand: "hoplite login",
  },
  junie: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://junie.jetbrains.com/install.sh | bash",
      },
      {
        label: windows,
        code: "powershell -NoProfile -Command \"iex (irm 'https://junie.jetbrains.com/install.ps1')\"",
      },
    ],
    signInCommand: "junie",
  },
  kilo: {
    methods: [{ label: "npm", code: "npm install -g @kilocode/cli" }],
    signInCommand: "kilo",
  },
  kiro: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://cli.kiro.dev/install | bash",
      },
      { label: windows, code: "irm 'https://cli.kiro.dev/install.ps1' | iex" },
    ],
    signInCommand: "kiro-cli login",
  },
  kimi: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash",
      },
      {
        label: windows,
        code: "irm https://code.kimi.com/kimi-code/install.ps1 | iex",
      },
    ],
    signInCommand: "kimi",
  },
  "minimax-code": {
    methods: [{ label: "npm", code: "npm install -g @minimax-ai/code" }],
    signInCommand: "mcode",
  },
  "minion-code": {
    methods: [{ label: "pip", code: "pip install minion-code" }],
  },
  "mistral-vibe": {
    methods: [
      {
        label: macLinux,
        code: "curl -LsSf https://mistral.ai/vibe/install.sh | bash",
      },
      { label: "uv", code: "uv tool install mistral-vibe" },
      { label: "pip", code: "pip install mistral-vibe" },
    ],
    signInCommand: "vibe --setup",
  },
  nova: {
    methods: [{ label: "npm", code: "npm install -g @compass-ai/nova" }],
    signInCommand: "nova",
  },
  poolside: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://downloads.poolside.ai/pool/install.sh | sh",
      },
      {
        label: windows,
        code: "irm https://downloads.poolside.ai/pool/install.ps1 | iex",
      },
    ],
    signInCommand: "pool login",
  },
  qoder: {
    methods: [
      { label: macLinux, code: "curl -fsSL https://qoder.com/install | bash" },
      { label: windows, code: "irm https://qoder.com/install.ps1 | iex" },
      { label: "npm", code: "npm install -g @qoder-ai/qodercli" },
    ],
    signInCommand: "qodercli",
  },
  "qwen-code": {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash",
      },
      {
        label: windows,
        code: "irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex",
      },
      { label: "npm", code: "npm install -g @qwen-code/qwen-code@latest" },
      { label: "Homebrew", code: "brew install qwen-code" },
    ],
    signInCommand: "qwen",
  },
  sigit: {
    methods: [
      { label: "npm", code: "npm install -g @getsigit/sigit" },
      { label: "Homebrew", code: "brew install sigit" },
      { label: "Cargo", code: "cargo install sigit" },
    ],
  },
  stakpak: {
    methods: [
      {
        label: macLinux,
        code: "curl -sSL https://stakpak.dev/install.sh | sh",
      },
      { label: "Homebrew", code: "brew install stakpak" },
    ],
    signInCommand: "stakpak",
  },
  "trae-cli": {
    methods: [
      {
        label: macLinux,
        code: 'sh -c "$(curl -fsSL https://trae.cn/trae-cli/install_v2.sh)"',
      },
      {
        label: windows,
        code: "irm https://trae.cn/trae-cli/install_v2.ps1 | iex",
      },
    ],
    signInCommand: "traecli",
  },
  vtcode: {
    methods: [
      {
        label: macLinux,
        code: "curl -fsSL https://raw.githubusercontent.com/vinhnx/VTCode/main/scripts/install.sh | bash",
      },
      {
        label: windows,
        code: "irm https://raw.githubusercontent.com/vinhnx/VTCode/main/scripts/install.ps1 | iex",
      },
      { label: "Homebrew", code: "brew install vinhnx/tap/vtcode" },
      { label: "Cargo", code: "cargo install vtcode" },
    ],
    signInCommand: "vtcode secret add openai",
  },
} satisfies Record<AgentSlug, AgentInstall>;
