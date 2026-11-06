import type { AgentSlug, AgentTranslation } from "./agents-content";

export const englishAgentCopy = {
  "claude-code": {
    intro:
      "Anthropic’s coding agent. It reads code, edits files and runs commands in your terminal.",
    about:
      "Claude Code is Anthropic’s command-line coding tool. It understands a whole project, edits files, runs tests and commits, connects to outside tools through MCP, and keeps project conventions in CLAUDE.md. It handles anything from reading unfamiliar code to building a full feature.",
    setup:
      "Run claude once and sign in with your Claude account in the browser, or use an Anthropic Console account.",
    useCase:
      "Remember a bug on the way home? Ask Claude from your phone to find the cause, fix it and run the tests. The change is waiting in your project when you get back.",
    question: "Is Claude Code in ClawMuse the same as in my terminal?",
    answer:
      "Yes. ClawMuse runs the claude command installed on your computer, with your own account and usage. ClawMuse does not provide a model allowance.",
  },
  codex: {
    intro: "OpenAI’s open-source coding agent. Sign in with ChatGPT or an API key.",
    about:
      "Codex CLI is OpenAI’s open-source coding agent, running on your own computer. It reads projects, edits code and runs commands. Sign in with your ChatGPT account or use an API key.",
    setup: "Run codex and sign in with your ChatGPT account or an API key.",
    useCase:
      "Give Codex a clear, small task such as adding a set of tests. Check what it changed and which checks it ran from your phone, then keep going.",
    question: "Is Codex model usage included in ClawMuse?",
    answer:
      "No. Usage comes from your own OpenAI account or API key. ClawMuse does not provide a model allowance.",
  },
  copilot: {
    intro: "GitHub’s terminal agent, connected to your repos, issues and pull requests.",
    about:
      "GitHub Copilot CLI brings Copilot’s coding agent to the terminal. It is connected to GitHub, so it can work with repositories, issues and pull requests directly. You need an active Copilot subscription.",
    setup: "Run copilot. If you are not signed in, enter /login and follow the steps.",
    useCase:
      "A new issue comes in while you are out. Have Copilot start on it in the repo on your computer, then review the change later.",
    question: "Does this connect to the Copilot editor extension?",
    answer:
      "No. ClawMuse launches the Copilot CLI, so the editor extension alone is not enough. Install the CLI with the commands above.",
  },
  opencode: {
    intro: "An open-source terminal coding agent that works with the model provider you pick.",
    about:
      "OpenCode is an open-source terminal coding agent that isn’t tied to one model vendor. It connects to many providers as well as local models, which makes it a common pick if you want to choose your own model.",
    setup: "Run opencode, enter /connect, then choose a provider and add your account or API key.",
    useCase:
      "Use a cheaper model for cleanup today and a stronger one for a refactor tomorrow, picked from your phone.",
    question: "OpenCode 1 or 2?",
    answer:
      "Both use the opencode command and can’t be installed side by side. The commands above are for OpenCode 1, from the official docs. For version 2, see OpenCode’s V2 docs. OpenCode manages model settings either way.",
  },
  pi: {
    intro: "A lightweight terminal coding agent you shape with extensions and skills.",
    about:
      "Pi is a small terminal coding agent. The core stays minimal, and you build on it with extensions, skills and prompt templates. It supports many model providers through API keys or OAuth, and /model switches models mid-session.",
    setup: "Run pi and sign in to a model provider with an API key or OAuth.",
    useCase:
      "Have Pi check files or draft a change at your desk, then continue the same conversation on your phone.",
    question: "Can Pi use my existing computer setup?",
    answer:
      "Yes. Pi runs on your computer with its commands and configuration. Try a small task first to check model access and project permissions.",
  },
  omp: {
    intro: "A batteries-included terminal agent built on Pi.",
    about:
      "OMP (Oh My Pi) is a terminal coding agent built on Pi, with more included out of the box. You can sign in with model subscriptions you already have. Worth a look if you like Pi but want less setup.",
    setup: "Run omp and enter /login to choose a model provider.",
    connectNote:
      "OMP is off by default. Set agents.providers.omp.enabled to true in the host configuration to make it appear.",
    useCase:
      "Keep the OMP workflow you know, and follow results through ClawMuse’s file and conversation views on your phone.",
    question: "Why is OMP missing from the provider list?",
    answer:
      "OMP is off by default. Set agents.providers.omp.enabled to true and make sure omp runs on that computer.",
  },
  antigravity: {
    intro: "The command-line version of Google Antigravity. The command is agy.",
    about:
      "Antigravity CLI is the command-line tool for Google Antigravity, Google’s agent development platform. The command is agy. ClawMuse ships with its plugin, so it works once the CLI is installed.",
    setup: "Run agy and sign in with your Google account.",
    connectNote:
      "This integration only has full access mode, so tools run without stopping to ask. Start with a small task.",
    useCase:
      "Hand a task to agy, leave your desk, and follow progress on your phone. Add instructions whenever you like.",
    question: "What are the permission and history limits?",
    answer:
      "ClawMuse starts agy with permission prompts skipped. The agent keeps conversation state after a background service restart, but history isn’t replayed into ClawMuse. ClawMuse’s built-in MCP tools aren’t available.",
  },
  "muse-code": {
    intro: "Meta’s coding agent, powered by the Muse models.",
    about:
      "Muse Code is Meta’s coding agent, built on Meta’s Muse models. ClawMuse ships with its plugin and connects through the Muse Session Protocol. You need version 1.3.0 or later.",
    setup: "Run muse login, or set META_API_KEY.",
    connectNote:
      "The integration turns the sandbox off and trusts the workspace by default. Turn the sandbox on in the provider options if you need it.",
    useCase:
      "Use Muse models to change a project, and check the conversation and edits from your phone.",
    question: "Are Muse’s sandbox and approval mode the same setting?",
    answer:
      "No, they are separate. The sandbox is off by default and set in the provider options. ClawMuse’s built-in MCP tools currently have an upstream compatibility limit.",
  },
  cursor: {
    intro: "Cursor’s command-line agent. No editor window needed.",
    about:
      "Cursor CLI brings Cursor’s agent to the terminal, so it can change code without the editor open. The installed command is agent, and the older cursor-agent command still works.",
    setup: "Run agent login and sign in to Cursor in the browser.",
    useCase:
      "Got halfway through something in Cursor? Have the agent finish the rest from your phone on the way home.",
    question: "Is the Cursor editor enough?",
    answer:
      "No. ClawMuse launches cursor-agent acp, so install the CLI separately with the commands above.",
  },
  gemini: {
    intro: "Google’s open-source terminal agent. Sign in with a Google account.",
    about:
      "Gemini CLI is Google’s open-source terminal agent, bringing Gemini models to the command line. It reads and writes files, runs commands, supports MCP and can look things up with Google Search.",
    setup: "Run gemini and sign in with your Google account, or set an API key.",
    useCase:
      "Ask Gemini to explain a project’s structure, then prepare a small patch and review it on your phone.",
    question: "Does signing in to Google on my phone authorize Gemini CLI on my computer?",
    answer:
      "No. Gemini CLI signs in on the computer that runs it. Signing in to ClawMuse on your phone doesn’t pass that along.",
  },
  hermes: {
    intro: "Nous Research’s agent, with long-term memory and skills it builds up over time.",
    about:
      "Hermes is an agent from Nous Research that remembers past work and turns it into reusable skills. Choose models from Nous Portal, OpenRouter, OpenAI or your own endpoint.",
    setup:
      "ClawMuse connects over ACP, so also run the ACP command above after installing. Then run hermes setup.",
    useCase:
      "Give Hermes project questions that need its tools and memory, and read the answers on your phone.",
    question: "Does ClawMuse configure Hermes memory and tools?",
    answer:
      "No. Hermes manages those. Set them up from its docs before sending tasks from ClawMuse.",
  },
  "qwen-code": {
    intro: "The open-source terminal agent from Alibaba’s Qwen team.",
    about:
      "Qwen Code is an open-source terminal coding agent from the Qwen team, tuned for Qwen models. You can install it with a script, npm or Homebrew.",
    setup: "Run qwen and enter /auth to set up your account or API key.",
    useCase: "Use Qwen Code in a repo with models already set up, then continue on another device.",
    question: "Are all Qwen skills guaranteed to work?",
    answer:
      "No. ClawMuse turns on the upstream experimental skills flag, but what works depends on your Qwen Code version and project setup.",
  },
  kimi: {
    intro: "Kimi Code CLI, the terminal coding agent from Moonshot AI.",
    about:
      "Kimi Code CLI is Moonshot AI’s terminal coding agent, using Kimi models. Sign in with a Kimi Code account or a Moonshot AI Open Platform API key.",
    setup: "Run kimi, enter /login, and choose Kimi Code OAuth or a Moonshot API key.",
    useCase:
      "Have Kimi draft a plan, then follow the file changes from your phone after you leave your desk.",
    question: "Where does Kimi’s model list come from?",
    answer:
      "ClawMuse asks the Kimi CLI on your computer. Your account and installed version decide which models appear.",
  },
  amp: {
    intro: "A multi-model coding agent that can keep working on cloud machines.",
    about:
      "Amp is a multi-model coding agent that picks models by task and can run work on cloud machines called orbs. ClawMuse connects through amp-acp, a community-maintained adapter.",
    setup:
      "Besides Amp itself, install the amp-acp adapter with the ACP command above. Then run amp login.",
    useCase:
      "Check the adapter with a small task, then move your existing Amp workflow into ClawMuse.",
    question: "Is amp-acp an official Amp integration?",
    answer:
      "No. It is a separate community adapter, and compatibility depends on the adapter and your Amp version.",
  },
  auggie: {
    intro: "Augment Code’s command-line agent, good at large codebases.",
    about:
      "Auggie is Augment Code’s command-line agent. Its strength is the Context Engine, which finds the code a change really touches in a big project. It needs Node.js 20 or later.",
    setup: "Run auggie login and sign in to Augment in the browser.",
    useCase: "Before any edits, ask Auggie which files a change touches, then let it start.",
    question: "Does Auggie update itself?",
    answer:
      "The ClawMuse catalog pins a version and turns CLI auto-update off. Check the catalog when you want a newer one.",
  },
  cline: {
    intro: "The command-line version of Cline, the open-source coding agent.",
    about:
      "Cline is an open-source coding agent that began as an editor extension and now has a CLI too. Use Cline’s own service or connect your own model account.",
    setup: "Run cline auth and choose a provider and model.",
    useCase: "Give Cline a small file change, then check the edits and commands from your phone.",
    question: "Do browser tools always work from ClawMuse?",
    answer:
      "Not always. It depends on the CLI and your computer’s setup. Adding the catalog entry doesn’t provide a browser environment.",
  },
  codebuddy: {
    intro: "Tencent’s AI coding assistant, in your terminal.",
    about:
      "CodeBuddy Code is the command-line version of Tencent’s AI coding assistant. It understands your project and edits code from the terminal. The command is codebuddy, or cbc for short.",
    setup: "Run codebuddy and sign in.",
    useCase:
      "Bring a project you already run with CodeBuddy into ClawMuse and continue from your phone.",
    question: "Does adding the catalog entry install CodeBuddy?",
    answer:
      "No. The entry calls the existing codebuddy --acp command, so install the CLI with the command above first.",
  },
  codewhale: {
    intro: "An open-source terminal coding agent for hosted or local models.",
    about:
      "CodeWhale is an open-source terminal coding agent that reads projects, edits files and runs tests. Connect a hosted service such as DeepSeek or a local model, or use a ChatGPT plan.",
    setup:
      "Set up the model you want. The command below connects DeepSeek. To use a ChatGPT plan, run codewhale auth chatgpt.",
    useCase:
      "Run everyday changes on DeepSeek, check results on your phone, and switch models when needed.",
    question: "Does using CodeWhale mean the model runs locally?",
    answer:
      "No. That depends on your setup. With a hosted model, prompts and file contents go to that provider.",
  },
  "cortex-code": {
    intro: "Snowflake’s AI coding agent, aware of your data and permissions.",
    about:
      "Cortex Code is Snowflake’s command-line agent for Snowflake work such as SQL, data pipelines and data apps. It works with your Snowflake account and role permissions.",
    setup:
      "Run cortex for the first time and follow the setup wizard to connect your Snowflake account.",
    useCase:
      "Ask it to check some SQL or change a pipeline from your phone. Confirm which role it uses first.",
    question: "Does ClawMuse grant Snowflake data access?",
    answer:
      "No. Cortex uses the Snowflake permissions you configured. Check the role and data scope before reads or writes.",
  },
  corust: {
    intro: "A coding agent built for Rust projects.",
    about:
      "Corust Agent comes from Corust.ai and focuses on Rust projects. It ships as prebuilt releases for macOS, Linux and Windows.",
    setup:
      "There is no install script. Download the archive for your system from the releases page below, put corust-agent-acp on your PATH, and configure model access.",
    useCase:
      "Ask it to explain a Rust module or make a local change, then run the project’s own checks.",
    question: "Does ClawMuse install the Rust toolchain?",
    answer:
      "No. The agent uses your computer’s environment. Install Rust and project dependencies before building or testing.",
  },
  crow: {
    intro: "A lean ACP-native coding agent with built-in web search.",
    about:
      "crow-cli is a stateful ACP-native coding agent with web_search and web_fetch built in, plus a public skill catalog. Its docs put it plainly: it has the same access you do, so run it only if you trust it. The installer also adds the Crow ADE client.",
    setup: "After installing, set up your model credentials.",
    useCase: "Start with a single-file explanation or a small patch to see how it works.",
    question: "What features does crow-cli offer?",
    answer:
      "Whatever it reports over ACP. Check the modes and tools shown for your computer rather than assuming they match other agents.",
  },
  deepagents: {
    intro: "LangChain’s Deep Agents, used over ACP.",
    about:
      "Deep Agents is LangChain’s agent framework, and deepagents-acp wraps it as an ACP server. It uses Anthropic models by default, so it needs ANTHROPIC_API_KEY. There’s nothing to install separately because npx fetches it.",
    setup:
      "Try the command above first, then set ANTHROPIC_API_KEY before connecting it to ClawMuse.",
    useCase: "Use Deep Agents to read a project and organize notes and drafts.",
    question: "Does this include every LangChain integration?",
    answer:
      "No. Available tools depend on the ACP package and your setup. Outside integrations are configured separately.",
  },
  devin: {
    intro: "Cognition’s Devin, running in your own terminal.",
    about:
      "Devin CLI is Cognition’s command-line tool. It brings Devin to your own computer to work in local projects. On Windows, run the install command in PowerShell, not Git Bash or CMD.",
    setup: "Run devin and follow the sign-in steps.",
    useCase: "Send project tasks to Devin from ClawMuse and follow them on your phone.",
    question: "Does this create a cloud computer?",
    answer:
      "No. Adding the CLI doesn’t buy or set up a cloud workspace. Check your environment and plan in Devin.",
  },
  dimcode: {
    intro: "A terminal coding agent with an interactive UI and your choice of models.",
    about:
      "DimCode is a terminal coding agent with an interactive interface. The command is dim. You set up model services inside it, and ClawMuse connects over ACP.",
    setup: "Run dim and set up the model service you want.",
    useCase: "Try different models on the same project brief before giving one a bigger change.",
    question: "Does the catalog include DimCode model access?",
    answer:
      "No. The catalog only launches it. Model accounts and costs depend on what you set up in DimCode.",
  },
  dirac: {
    intro: "An efficiency-minded open-source agent with precise anchored edits.",
    about:
      "Dirac is an open-source coding agent focused on working efficiently in complex, real codebases. It edits files through anchors and supports AST operations. There is also a VS Code extension.",
    setup: "Run dirac and set up the model you want.",
    useCase:
      "Try a well-bounded code transformation and check that the patch keeps existing behavior.",
    question: "Is it guaranteed to save on model costs?",
    answer:
      "No. Real usage depends on the model, task size and verification work. No savings are promised here.",
  },
  "factory-droid": {
    intro: "Droid, Factory’s coding agent for the terminal.",
    about:
      "Droid is Factory’s coding agent. The command is droid. Sign in to Factory in your browser on first run and start from your project folder.",
    setup: "Run droid in your project folder and sign in to Factory in the browser.",
    useCase: "Let Droid work in a prepared repo and review the patch from your phone.",
    question: "Can Droid use MCP tools from ClawMuse?",
    answer:
      "No. This catalog entry turns MCP injection off, so ClawMuse tools aren’t available in Droid sessions.",
  },
  "fast-agent": {
    intro: "A Python agent framework that connects to many model providers.",
    about:
      "fast-agent is a Python agent framework with support for many model providers. fast-agent-acp is its ACP entry point, and uvx runs it without a separate install.",
    setup:
      "Install uv, set your model API key (OPENAI_API_KEY, for example) and try the command above. Change --model to the one you want.",
    useCase: "Bring a tuned agent setup into your project flow without redoing it on each device.",
    question: "Why does this need uvx?",
    answer:
      "fast-agent is a Python package and ClawMuse launches it through uvx, so uv must be on that computer.",
  },
  "gajae-code": {
    intro: "A plan-first coding agent that works with subscriptions you already have.",
    about:
      "Gajae Code (gjc) is a coding-agent harness that uses your existing model subscription or API key. It can interview you, plan and review before touching code, and route questions to Telegram, Discord or Slack. It is in beta, so check its output closely.",
    setup: "Run gjc, enter /login, and pick your plan or provider.",
    useCase:
      "For a change that needs thinking first, run its planning flow and read the plan on your phone.",
    question: "Does this get around model subscription rules?",
    answer:
      "No. Check which access routes Gajae and each provider support. Catalog settings don’t grant model access.",
  },
  glm: {
    intro: "A community adapter for Zhipu’s GLM models through a Z.AI Coding Plan.",
    about:
      "glm-acp-agent is a community-built ACP agent that uses Z.AI’s GLM models and supports Coding Plan tools. It isn’t an official Zhipu product.",
    setup: "Put your Z.AI API key in the environment, or run glm-acp-agent --setup.",
    useCase:
      "Use GLM models from your Coding Plan on a project and check the tool output from your phone.",
    question: "Is this the same as changing Claude Code’s API URL?",
    answer:
      "No. This starts a separate ACP agent. Pointing Claude Code at another endpoint is a different setup.",
  },
  goose: {
    intro: "An open-source, extensible AI agent with a CLI and a desktop app.",
    about:
      "goose is an open-source AI agent with command-line and desktop versions. It connects to many models and reaches tools through extensions, working with the tools you set up on your computer. For Windows, see the official docs below.",
    setup: "Run goose configure, choose a model provider and add your key.",
    useCase:
      "Give goose an engineering task that uses its extensions and check its actions from your phone.",
    question: "Are all goose extensions on by default?",
    answer: "No. goose configures extensions, so check which tools are on before starting.",
  },
  grok: {
    intro: "Grok Build, xAI’s coding agent.",
    about:
      "Grok Build is xAI’s coding agent, run from the terminal with the grok command. Access depends on your xAI account and plan.",
    setup: "Run grok and sign in to your xAI account.",
    useCase: "Have Grok break down a code change, then follow the work from your phone.",
    question: "Does ClawMuse include a Grok subscription?",
    answer: "No. xAI decides access. Make sure the CLI runs with your account first.",
  },
  hoplite: {
    intro: "Cloud coding workspaces, with a small local CLI as the bridge.",
    about:
      "Hoplite agents run in cloud workspaces, and the local hoplite command (hplt for short) only makes the connection. It suits work you don’t want tying up your own computer. ClawMuse ships with its plugin, which you add from the catalog.",
    setup: "Run hoplite login.",
    connectNote: "After adding it, link a project or set HOPLITE_PROJECT_ID.",
    useCase: "Follow repo tasks linked to Hoplite and check the changes in the cloud project.",
    question: "Does Hoplite work on my local project files?",
    answer:
      "No. The agent runs in a Hoplite cloud workspace, where local files and ClawMuse’s local MCP tools aren’t available.",
  },
  junie: {
    intro: "JetBrains’ coding agent, usable without an IDE.",
    about:
      "Junie is JetBrains’ coding agent. Junie CLI runs it on its own in the terminal, with a JetBrains login or a Junie API key.",
    setup: "Run junie and sign in through the browser, or use JUNIE_API_KEY.",
    useCase:
      "Have Junie plan work on an existing codebase, then check the changes on another device.",
    question: "Does a JetBrains IDE need to stay open?",
    answer: "No. ClawMuse connects to Junie CLI, not an IDE window.",
  },
  kilo: {
    intro: "The open-source command-line version of Kilo Code.",
    about:
      "Kilo CLI is the command-line version of Kilo Code, an open-source coding agent. It works with many model providers and connects to ClawMuse through kilo acp.",
    setup: "Run kilo and enter /connect to set up a provider.",
    useCase:
      "Continue Kilo work with your model account and keep files and conversation in ClawMuse.",
    question: "Do Kilo editor settings carry over?",
    answer: "Don’t assume so. Check the model and credentials on the computer that runs the CLI.",
  },
  kiro: {
    intro: "Kiro from AWS. The command-line version is kiro-cli.",
    about:
      "Kiro is an AI development tool from AWS, available as an IDE and a CLI. kiro-cli runs on macOS, Linux and Windows 11, and it supports ACP natively, so connecting it to ClawMuse is direct.",
    setup: "Run kiro-cli login. On Windows, install from PowerShell rather than Command Prompt.",
    useCase:
      "Make a small change in a prepared Kiro workspace and review it across phone and computer.",
    question: "Is the Kiro IDE enough?",
    answer:
      "No. ClawMuse launches kiro-cli acp, so install the CLI separately with the commands above.",
  },
  "minimax-code": {
    intro: "MiniMax’s terminal coding agent. The command is mcode.",
    about:
      "MiniMax Code is MiniMax’s terminal coding agent, installed as the mcode command. It needs Node.js 22.19 or later.",
    setup: "Run mcode and set up your MiniMax account.",
    useCase: "Ask MiniMax Code to explain a project, then give it a small implementation task.",
    question: "Does any MiniMax API key work?",
    answer:
      "Not necessarily. Follow MiniMax Code’s own requirements, since keys for other products may not apply.",
  },
  "minion-code": {
    intro: "A Python coding assistant built on the Minion framework.",
    about:
      "Minion Code is an AI coding assistant built on the Minion framework, with more than a dozen tools for files, commands and web search, plus ACP support. The command is mcode and model settings live in ~/.minion/config.yaml.",
    setup:
      "Set up your model in ~/.minion/config.yaml. ClawMuse launches it with uvx, so you also need uv.",
    useCase: "Try development tasks that need its built-in tools.",
    question: "Why does my computer need Python tooling?",
    answer:
      "Minion Code is a Python package that ClawMuse starts through uvx. Your phone doesn’t need any of it.",
  },
  "mistral-vibe": {
    intro: "Mistral’s open-source command-line coding assistant.",
    about:
      "Mistral Vibe is Mistral’s open-source command-line coding assistant, using Mistral models. Besides the vibe command it installs vibe-acp for editors, which is what ClawMuse uses.",
    setup: "Run vibe --setup to add your API key, or set MISTRAL_API_KEY.",
    useCase: "Give Vibe a small change and check the patch and test results from your phone.",
    question: "Does ClawMuse change Vibe’s model endpoint?",
    answer:
      "No. Vibe manages its endpoint and credentials. If it won’t connect, check that Vibe runs on its own first.",
  },
  nova: {
    intro: "Compass AI’s command-line agent. Not Amazon Nova.",
    about:
      "Nova is Compass AI’s command-line tool. It works with your IDE and guides you through building code. The name is easy to mix up with Amazon’s Nova models, but they are unrelated.",
    setup: "Run nova and finish the account or model setup.",
    useCase: "Check its tools with a short repo task before giving it bigger changes.",
    question: "Is this Amazon Nova?",
    answer: "No. This is Compass AI’s Nova, unrelated to the model family with the same name.",
  },
  poolside: {
    intro: "Poolside’s coding agent. The CLI is called pool.",
    about:
      "Poolside Agent CLI is Poolside’s coding agent, run with the pool command. Use it interactively or for automated tasks, and connect it to editors and ClawMuse through pool acp. The Windows version is in beta.",
    setup:
      "Run pool login. For a company deployment, add the address from your admin: pool login --api-url <api-url>.",
    useCase:
      "Send tasks in projects covered by your Poolside access and follow them on your phone.",
    question: "Does a ClawMuse account provide Poolside access?",
    answer: "No. The pool CLI needs your own Poolside access.",
  },
  qoder: {
    intro: "Qoder’s command-line agent. The command is qodercli.",
    about:
      "Qoder CLI is the command-line version of the Qoder AI coding tool. The command is qodercli, and it understands projects and writes code from the terminal. ClawMuse connects through its ACP mode.",
    setup: "Run qodercli and enter /login.",
    useCase:
      "Have Qoder plan work on a personal project, then continue the conversation on your phone.",
    question: "Does this mirror my Qoder editor window?",
    answer:
      "No. ClawMuse starts a separate CLI session, so editor conversations and settings don’t carry over.",
  },
  sigit: {
    intro: "A coding agent that runs models on your own machine by default.",
    about:
      "siGit Code is a coding agent that runs inference on your device by default, through the Onde inference SDK. It suits people who don’t want code going to cloud models. Note that the snap package installs the desktop app, not this terminal agent.",
    setup: "After installing, choose your model backend.",
    useCase: "Try a workflow on a local model, then see which steps still use outside services.",
    question: "Does local-first guarantee fully offline work?",
    answer:
      "No. Check your actual model backend and network tools to know whether data leaves the computer.",
  },
  stakpak: {
    intro: "A DevOps agent written in Rust, built for infrastructure work.",
    about:
      "Stakpak is an agent for DevOps, written in Rust, handling deployments and infrastructure configuration. Use a Stakpak API key or your own Anthropic or OpenAI key.",
    setup:
      "Run stakpak and follow the steps to create an API key. To use your own key, see stakpak auth login in the official docs.",
    useCase:
      "An alert at midnight? Ask it to explain the config and look into the problem from your phone first.",
    question: "Does adding Stakpak grant cloud access?",
    answer:
      "No. Cloud credentials come from your computer’s setup. Check the target account and environment first.",
  },
  "trae-cli": {
    intro: "The command-line version of ByteDance’s TRAE. The command is traecli.",
    about:
      "TRAE CLI is the command-line version of ByteDance’s TRAE AI coding tool. The command is traecli, and ClawMuse connects through traecli acp serve.",
    setup: "Run traecli and sign in.",
    useCase:
      "Have TRAE CLI look through a project and prepare a patch, then review it on another device.",
    question: "Do all TRAE commands appear right away?",
    answer:
      "Not always. The CLI may report commands and skills gradually, so give discovery a moment.",
  },
  vtcode: {
    intro: "An open-source terminal agent in Rust, for hosted and local models.",
    about:
      "VT Code is an open-source terminal coding agent that works with hosted and local models, chosen per task. API keys go into the system keyring or an encrypted file instead of plain config.",
    setup:
      "Store your provider key. The command below uses OpenAI, so replace openai with your provider.",
    useCase: "Once models are set up, try a code task that needs shell commands.",
    question: "Why does the catalog entry set environment variables?",
    answer:
      "ACP mode needs VT_ACP_ENABLED and VT_ACP_ZED_ENABLED. Keep them if you change the command path.",
  },
  agoragentic: {
    intro: "An agent service marketplace, browsed and called over ACP.",
    about:
      "Agoragentic is a marketplace of callable AI capabilities. Some services are paid and settle in USDC on Base. agoragentic-mcp connects it to ACP, and npx fetches it, so there’s nothing to install separately.",
    setup: "Browsing doesn’t need an account. Set AGORAGENTIC_API_KEY for tools that need sign-in.",
    useCase: "Check a service’s inputs, outputs and price before trying it.",
    question: "Does ClawMuse cover marketplace costs?",
    answer:
      "No. Outside services have their own terms and payment. Read them before calling anything that charges.",
  },
  autohand: {
    intro: "A terminal agent that imports your Claude, Codex and Cursor setup.",
    about:
      "Autohand Code is a terminal coding agent that supports more than 15 model providers and local models through tools such as Ollama. Switching is easy: /import claude, /import codex or /import cursor brings your settings and skills along.",
    setup: "Run autohand and sign in, or add your own key.",
    useCase:
      "Start with a small project change and check the generated files before going further.",
    question: "Is the ACP package a model subscription?",
    answer: "No. It only handles the connection. Accounts and model costs are separate.",
  },
} satisfies Record<AgentSlug, AgentTranslation>;
