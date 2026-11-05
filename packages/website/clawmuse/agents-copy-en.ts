import type { AgentSlug, AgentTranslation } from "./agents-content";

export const englishAgentCopy = {
  "claude-code": {
    intro:
      "Bring Anthropic’s Claude Code into the same personal workspace you reach from your phone.",
    useCase:
      "Ask Claude to explain an unfamiliar project, prepare a change plan, then inspect its edits in the workspace.",
    prerequisite:
      "Install Claude Code and complete its own authentication on the host. Select a mode that matches the task.",
    question: "Can I review before allowing edits?",
    answer:
      "Choose Claude’s plan or approval-oriented mode for the task. Provider permissions still govern tools; switching devices does not change them.",
  },
  codex: {
    intro:
      "Use OpenAI’s Codex with your project files and follow its work across your own devices.",
    useCase:
      "Give Codex a bounded implementation task, inspect the diff and ask it to report the checks it actually ran.",
    prerequisite:
      "Install and authenticate Codex on the execution host. Check the selected model and permission mode before starting.",
    question: "Is Codex model usage included in ClawMuse?",
    answer:
      "No. Codex authentication and model access come from your OpenAI account or configured credentials; ClawMuse access does not provide a model allowance.",
  },
  copilot: {
    intro: "Connect GitHub Copilot’s CLI to ClawMuse through its built-in ACP integration.",
    useCase:
      "Continue a repository task from your phone while Copilot uses the environment already prepared on your host.",
    prerequisite:
      "Install the Copilot CLI and sign in with an account entitled to use it. The CLI must be visible to the daemon.",
    question: "Does this connect to the Copilot editor extension?",
    answer:
      "This integration launches the Copilot CLI over ACP. An editor extension alone is not the executable ClawMuse needs.",
  },
  opencode: {
    intro: "Keep OpenCode’s provider choice while using ClawMuse to direct work across devices.",
    useCase:
      "Compare a plan with an implementation in a project whose OpenCode model configuration you already maintain.",
    prerequisite:
      "Install OpenCode and configure a working model provider on the host. Available models come from that setup.",
    question: "Does ClawMuse replace OpenCode’s model configuration?",
    answer:
      "No. OpenCode owns its provider credentials and model configuration. Select the models the connected host actually exposes.",
  },
  pi: {
    intro:
      "Reach Pi’s terminal agent from a personal workspace without moving your project to another machine.",
    useCase:
      "Use a small Pi task to inspect files or draft a change, then continue the conversation on another device.",
    prerequisite:
      "Install Pi and configure its model credentials on the host. ClawMuse uses Pi’s RPC integration.",
    question: "Can Pi use my existing host setup?",
    answer:
      "The agent runs with the configured host executable and environment. Check model access and project permissions with a small task first.",
  },
  omp: {
    intro:
      "OMP (Oh My Pi) has a dedicated integration for people who already use this Pi-derived agent.",
    useCase:
      "Keep an OMP-based project workflow and inspect its task output through ClawMuse’s files and conversation views.",
    prerequisite:
      "Install and authenticate OMP, then explicitly enable the omp provider in the host configuration; it is disabled by default.",
    question: "Why is OMP missing from my provider list?",
    answer:
      "OMP is deliberately disabled by default. Set agents.providers.omp.enabled to true and ensure its executable and model configuration work on that host.",
  },
  antigravity: {
    intro: "Use the installed Antigravity agy CLI through a provider plugin bundled with ClawMuse.",
    useCase:
      "Follow an agy task remotely when you are comfortable granting that task full tool access.",
    prerequisite:
      "Install agy and sign in on the host. This integration only offers full access and does not pause for tool approval.",
    question: "Which permission and history limits matter?",
    answer:
      "The integration starts agy with permission prompts skipped. After a daemon restart, the agent can remember its conversation but does not replay the transcript into ClawMuse. Built-in ClawMuse MCP tools are unavailable.",
  },
  "muse-code": {
    intro:
      "Meta’s Muse Code connects through the bundled provider plugin and its Muse Session Protocol.",
    useCase:
      "Use your Muse models to make a project change, with the conversation and results reachable from your phone.",
    prerequisite:
      "Install Muse Code 1.3.0 or newer and use muse login or configure META_API_KEY. Review the provider’s sandbox settings.",
    question: "Are Muse’s sandbox and approvals the same setting?",
    answer:
      "No. The integration defaults to sandbox disabled and workspace trusted; approval mode is separate. Configure provider options when you need a sandbox. Built-in ClawMuse MCP tools have an upstream compatibility limitation.",
  },
  cursor: {
    intro: "Connect Cursor’s CLI through ACP while keeping the desktop editor a separate choice.",
    useCase:
      "Continue a Cursor repository task from a phone, then inspect the changes at your computer.",
    prerequisite:
      "Install and authenticate cursor-agent on the host. Use a current CLI that exposes model discovery through ACP.",
    question: "Is installing the Cursor editor enough?",
    answer:
      "ClawMuse launches cursor-agent acp. Confirm that command works in the daemon environment; the editor installation alone is not the connection.",
  },
  gemini: {
    intro: "Bring Google’s Gemini CLI into a workspace you can revisit from another device.",
    useCase:
      "Ask Gemini to explain project structure and prepare a small patch using the tools installed on your host.",
    prerequisite:
      "Add Gemini CLI from the host catalog and complete its own sign-in or credential setup. The catalog launch uses npx.",
    question: "Does a Google login on my phone authorize the host?",
    answer:
      "No. Gemini CLI must be authorized in the host environment that runs it. Phone access to ClawMuse does not transfer provider credentials.",
  },
  hermes: {
    intro: "Use Nous Research’s Hermes through its ACP entry point.",
    useCase:
      "Give Hermes a project question that benefits from its configured tools, then review the answer in the same personal workspace.",
    prerequisite:
      "Install Hermes, configure its model and tools, and confirm hermes acp is available on the host.",
    question: "Does ClawMuse configure Hermes memory and tools?",
    answer:
      "Hermes owns those settings. Prepare and inspect them using its documentation before delegating work from ClawMuse.",
  },
  "qwen-code": {
    intro: "Add Alibaba’s Qwen Code using the host’s ACP catalog.",
    useCase:
      "Use Qwen Code on a repository with an existing model configuration and carry the conversation between devices.",
    prerequisite:
      "The catalog uses the Qwen Code npm package with ACP and experimental skills enabled. Configure supported model credentials first.",
    question: "Are all Qwen skills guaranteed to work here?",
    answer:
      "The catalog enables the upstream experimental skills flag. Available skills and behavior still depend on the installed Qwen Code version and project configuration.",
  },
  kimi: {
    intro: "Connect Moonshot AI’s Kimi Code CLI to your personal ClawMuse workspace.",
    useCase:
      "Review a Kimi-generated implementation plan and follow the resulting file changes away from your desk.",
    prerequisite:
      "Install and authorize Kimi Code on the host, then add the catalog entry that launches kimi acp.",
    question: "Where does Kimi’s model list come from?",
    answer:
      "The integration asks the configured Kimi CLI. Account access and installed version determine what the host can offer.",
  },
  amp: {
    intro: "Reach Amp through the catalog’s community ACP adapter.",
    useCase:
      "Continue an existing Amp coding workflow in ClawMuse after verifying the adapter against a small repository task.",
    prerequisite:
      "Install Amp and the amp-acp adapter, and complete Amp’s required authentication. Follow the adapter’s setup source below.",
    question: "Is amp-acp the same as a built-in Amp integration?",
    answer:
      "No. This catalog entry launches a separate ACP adapter. Its compatibility and supported behavior depend on that adapter and the installed Amp version.",
  },
  auggie: {
    intro: "Use Augment Code’s Auggie CLI with the repository context it can access on your host.",
    useCase:
      "Ask Auggie to trace a change across related project files before you approve an implementation.",
    prerequisite:
      "Add Auggie from the catalog, ensure Node.js and npx are available, and finish Augment authentication.",
    question: "Will the catalog update Auggie automatically?",
    answer:
      "The catalog pins a package version and disables the CLI’s automatic updater. Review catalog or provider updates when you need a newer version.",
  },
  cline: {
    intro: "Connect the Cline CLI through ACP for tasks involving project files and host tools.",
    useCase:
      "Give Cline a small file-editing task, then inspect the changes and commands it reports.",
    prerequisite:
      "Use the CLI catalog entry and configure the model provider Cline will use. Its editor extension is a separate installation.",
    question: "Does the browser tool always work from ClawMuse?",
    answer:
      "Browser actions depend on the CLI’s tools and host setup. Verify a small task first; a catalog entry does not supply a browser environment.",
  },
  codebuddy: {
    intro: "Use Tencent Cloud’s Codebuddy Code through its CLI ACP mode.",
    useCase:
      "Bring a project already prepared for Codebuddy into a conversation you can follow from your phone.",
    prerequisite:
      "Install codebuddy manually and complete its account or API credential setup before adding the catalog entry.",
    question: "Does adding the catalog entry install Codebuddy?",
    answer:
      "This entry launches the existing codebuddy --acp command. Install the CLI and make it available to the daemon first.",
  },
  codewhale: {
    intro: "CodeWhale is a terminal coding agent oriented toward DeepSeek and other open models.",
    useCase:
      "Use a configured CodeWhale model to inspect or change a project, then review the output across devices.",
    prerequisite:
      "Install CodeWhale, configure its chosen model service, and expose codewhale serve --acp to the host.",
    question: "Does CodeWhale mean my model runs locally?",
    answer:
      "No. The model may be local or remote depending on your CodeWhale configuration. Check where prompts and files are sent.",
  },
  "cortex-code": {
    intro: "Connect Snowflake’s Cortex Code CLI through its ACP server mode.",
    useCase:
      "Work on a Snowflake-related project while keeping your account access and local files under review.",
    prerequisite:
      "Install the Cortex CLI and configure the Snowflake identity and resources the task needs.",
    question: "Does ClawMuse grant access to Snowflake data?",
    answer:
      "No. Cortex uses your configured Snowflake access. Verify roles and data scope before asking it to inspect or change anything.",
  },
  corust: {
    intro: "Corust Agent offers a Rust-oriented partner through its ACP executable.",
    useCase:
      "Ask for an explanation of a Rust module or a focused change, then run the project’s own checks.",
    prerequisite:
      "Install the Corust ACP release and configure its model access. Prepare the Rust toolchain if the task needs compilation.",
    question: "Will ClawMuse install my Rust toolchain?",
    answer:
      "No. The agent uses the host environment. Install the project’s required compiler and dependencies before asking it to build or test.",
  },
  crow: {
    intro: "crow-cli provides a minimal ACP-native agent for a focused host workflow.",
    useCase:
      "Start with a single file explanation or a tightly scoped patch to check the agent’s working loop.",
    prerequisite:
      "Install crow-cli and configure its model credentials before enabling the catalog command.",
    question: "What features should I expect from crow-cli?",
    answer:
      "The installed agent reports its ACP capabilities. Verify the modes and tools available on your host instead of assuming features from another provider.",
  },
  deepagents: {
    intro: "Use a LangChain-powered DeepAgents setup through the catalog’s ACP package.",
    useCase:
      "Try a task that combines project reading and a draft, using the tools configured for your DeepAgents environment.",
    prerequisite:
      "The catalog starts deepagents-acp with npx. Prepare its model credentials and any tools the task needs.",
    question: "Does installing this give me every LangChain integration?",
    answer:
      "No. The ACP package and your host configuration determine available tools. Configure and test each external integration separately.",
  },
  devin: {
    intro: "Connect Cognition’s Devin CLI through its terminal ACP entry point.",
    useCase:
      "Direct a Devin project task from ClawMuse while checking which environment the CLI uses for execution.",
    prerequisite:
      "Install Devin CLI and complete its own account setup. Follow Devin’s documentation for workspace and service access.",
    question: "Does this automatically create a cloud machine?",
    answer:
      "No. Adding the CLI connection does not purchase or provision a cloud workspace. Confirm the environment and account entitlements in Devin itself.",
  },
  dimcode: {
    intro: "DimCode brings its model choices to ClawMuse through ACP.",
    useCase:
      "Use the same project brief to evaluate a configured DimCode model before committing to a larger edit.",
    prerequisite:
      "Add DimCode from the catalog and configure the model providers you intend to use.",
    question: "Does the catalog include access to DimCode’s models?",
    answer:
      "No. It supplies a launch configuration. Model credentials, availability and charges remain with the services you configure in DimCode.",
  },
  dirac: {
    intro:
      "Dirac is an open-source agent whose editing approach includes hash-anchored changes and AST operations.",
    useCase:
      "Try a bounded code transformation and inspect whether the resulting patch preserves your project’s behavior.",
    prerequisite:
      "Add the pinned Dirac CLI catalog entry and prepare a supported model configuration.",
    question: "Should I expect a guaranteed cost saving?",
    answer:
      "No. The directory makes no savings or speed promise. Model choice, task size and verification work determine your actual usage.",
  },
  "factory-droid": {
    intro: "Factory Droid connects through the CLI’s ACP daemon output mode.",
    useCase:
      "Follow a Factory task on a prepared repository and review its patch through ClawMuse.",
    prerequisite:
      "Use the catalog entry, complete Factory authentication and check the CLI’s own tool configuration.",
    question: "Can Droid receive ClawMuse’s injected MCP tools?",
    answer:
      "This catalog entry explicitly disables MCP server injection. Do not rely on ClawMuse orchestration tools being available in a Droid session.",
  },
  "fast-agent": {
    intro: "fast-agent exposes a multi-provider agent environment through ACP.",
    useCase:
      "Bring a deliberately configured agent setup into a project workflow instead of recreating it for each device.",
    prerequisite:
      "Install uv tooling, use the catalog’s fast-agent-acp launch entry, and prepare its model and agent configuration.",
    question: "Why does this entry need uvx?",
    answer:
      "The catalog launches a Python package through uvx. That launcher and the agent’s model credentials must be available in the host environment.",
  },
  "gajae-code": {
    intro: "Gajae Code emphasizes planning before changes and evidence before execution.",
    useCase:
      "Use its planning flow for a project change whose shell actions and edits you want to review explicitly.",
    prerequisite:
      "Install gjc, configure a supported account arrangement, and add its ACP entry. The catalog sets permission mode to prompt.",
    question: "Does this bypass provider subscription rules?",
    answer:
      "No. Verify the access supported by Gajae and each underlying provider. The catalog’s permission prompt setting does not grant model entitlement.",
  },
  glm: {
    intro: "Use the GLM ACP adapter for a Z.AI Coding Plan workflow.",
    useCase:
      "Work on a project with the GLM models your configured account exposes and inspect the agent’s actual tool output.",
    prerequisite:
      "Add the glm-acp-agent package and configure the credentials required by its adapter documentation.",
    question: "Is this the same as changing Claude Code’s API endpoint?",
    answer:
      "No. This entry starts a separate ACP agent. A custom endpoint for another provider is a different integration with different configuration.",
  },
  goose: {
    intro: "goose is an extensible agent that can use the tools you configure on your host.",
    useCase:
      "Try an engineering task involving a known goose extension, then check its actions in the project context.",
    prerequisite:
      "Install goose, configure its model provider and extensions, and verify goose acp works on the host.",
    question: "Are all goose extensions enabled by default?",
    answer:
      "No. Extension configuration belongs to goose. Review which tools are enabled and what they can access before running the task.",
  },
  grok: {
    intro: "Connect xAI’s Grok Build CLI using its stdio agent mode.",
    useCase:
      "Use the CLI’s planning workflow to break down a code change before following execution from ClawMuse.",
    prerequisite:
      "Install the Grok CLI and verify current account eligibility in xAI’s documentation. The catalog starts grok agent stdio.",
    question: "Does ClawMuse include a Grok subscription?",
    answer:
      "No. Grok access and plan eligibility are controlled by xAI. Confirm your CLI works with your account before adding it here.",
  },
  hoplite: {
    intro:
      "Hoplite connects a cloud coding workspace through a local CLI bridge and an opt-in bundled plugin.",
    useCase:
      "Follow work in a repository already linked to a Hoplite project, with its cloud execution boundary kept explicit.",
    prerequisite:
      "Install Hoplite, run hoplite login and add it from the host catalog. Link a project or configure HOPLITE_PROJECT_ID.",
    question: "Does Hoplite run against my local project files?",
    answer:
      "The agent runs in Hoplite’s cloud workspace. Local files and ClawMuse’s loopback MCP tools are not available there. Your local CLI acts as the bridge.",
  },
  junie: {
    intro: "Use JetBrains’ Junie CLI through its documented ACP mode.",
    useCase:
      "Review a Junie plan for an existing codebase, then inspect the resulting project changes from another device.",
    prerequisite:
      "Install Junie CLI, authenticate it and ensure the host can launch junie with ACP enabled.",
    question: "Does this require an open JetBrains IDE?",
    answer:
      "The connection uses the Junie CLI, not an IDE window. Follow the CLI’s own setup and account requirements.",
  },
  kilo: {
    intro: "Kilo’s open-source CLI is available through the ACP catalog.",
    useCase:
      "Continue a Kilo task using the model provider you already configured, and keep files and conversation together.",
    prerequisite: "Install Kilo CLI and configure its provider credentials before using kilo acp.",
    question: "Does my Kilo editor configuration automatically apply?",
    answer:
      "Do not assume the CLI shares every editor setting. Verify the CLI’s model, credentials and tools directly on the execution host.",
  },
  kiro: {
    intro: "Connect Kiro CLI through its native ACP endpoint.",
    useCase:
      "Use a prepared Kiro workspace for a scoped change and carry the review between your phone and computer.",
    prerequisite:
      "Install and authenticate kiro-cli, then add the catalog entry that starts kiro-cli acp.",
    question: "Does the website install Kiro for me?",
    answer:
      "No. The catalog points to an existing CLI command. Follow Kiro’s official installation guide and verify it in the host environment.",
  },
  "minimax-code": {
    intro: "MiniMax Code connects its terminal agent through the catalog’s npm-based ACP launch.",
    useCase:
      "Ask MiniMax Code for a project explanation before handing it a small implementation task.",
    prerequisite:
      "Ensure Node.js and npx are available, then configure the account or model access required by MiniMax Code.",
    question: "Is any MiniMax API key sufficient?",
    answer:
      "Follow MiniMax Code’s own access requirements. A key for another product or endpoint is not automatically valid for this CLI.",
  },
  "minion-code": {
    intro: "Minion Code brings a Minion-framework agent into the ACP workspace.",
    useCase:
      "Try a development task that uses the tools available in your Minion Code configuration.",
    prerequisite:
      "Prepare uvx and the package’s model configuration; the catalog launches the Python-based minion-code ACP command.",
    question: "Why does the host need Python package tooling?",
    answer:
      "The catalog uses uvx to run Minion Code. The launcher and required runtime dependencies must exist on the host, independently of your phone.",
  },
  "mistral-vibe": {
    intro: "Mistral Vibe brings Mistral’s open-source coding assistant to the ACP workspace.",
    useCase:
      "Give Vibe a small change in a repository with working model credentials, then inspect the patch and test report.",
    prerequisite:
      "Install Mistral Vibe and configure its model access. Ensure vibe-acp is visible to the daemon.",
    question: "Does ClawMuse change Vibe’s model endpoint?",
    answer:
      "No. Vibe owns its endpoint and credentials. Verify that setup locally before troubleshooting the ClawMuse connection.",
  },
  nova: {
    intro: "Nova is Compass AI’s agent, available through the catalog’s ACP launch configuration.",
    useCase:
      "Use a short repository task to establish Nova’s tool access, then follow a larger change from your devices.",
    prerequisite:
      "Add the @compass-ai/nova catalog entry and complete the account or model configuration required by Nova.",
    question: "Is this Amazon Nova?",
    answer:
      "This directory entry is Nova by Compass AI. Its product and setup source are linked below; do not confuse it with a similarly named model family.",
  },
  poolside: {
    intro: "Connect Poolside’s coding agent through the pool CLI.",
    useCase:
      "Work within a project and service environment already authorized for your Poolside account.",
    prerequisite:
      "Install the pool CLI and prepare the service access described by Poolside’s documentation.",
    question: "Does a ClawMuse account provide Poolside access?",
    answer:
      "No. The pool CLI needs its own authorized service configuration. Adding it to the directory does not create an account or grant an entitlement.",
  },
  qoder: {
    intro: "Use Qoder CLI’s ACP mode to bring its agent into ClawMuse.",
    useCase:
      "Start with a Qoder plan for a personal project and keep the follow-up conversation accessible from your phone.",
    prerequisite:
      "The catalog launches @qoder-ai/qodercli through npx. Prepare the CLI’s authentication and model access.",
    question: "Does this mirror an existing Qoder editor window?",
    answer:
      "The integration starts a CLI session on the host. Do not assume an editor window’s conversation or settings are automatically imported.",
  },
  sigit: {
    intro:
      "siGit Code is a local-first agent with optional on-device model inference through Onde.",
    useCase:
      "Explore a workflow with your chosen local model, then verify which parts of the task still use external services.",
    prerequisite:
      "Install sigit and configure its model backend. The catalog launches the sigit executable directly.",
    question: "Does local-first guarantee an offline task?",
    answer:
      "No. Local inference is an optional configuration. Verify the actual model backend and any network tools before assuming all data stays offline.",
  },
  stakpak: {
    intro: "Stakpak is a Rust-based DevOps agent available through ACP.",
    useCase:
      "Ask it to explain infrastructure configuration before authorizing a narrowly scoped operational change.",
    prerequisite:
      "Install Stakpak and configure its model and infrastructure access. Start with a low-impact environment.",
    question: "Does adding Stakpak grant cloud permissions?",
    answer:
      "No. Infrastructure credentials and access come from your host configuration. Check the target account and environment before approving operations.",
  },
  "trae-cli": {
    intro: "Connect ByteDance’s TRAE CLI through its ACP server command.",
    useCase:
      "Use a TRAE CLI task to inspect a project and prepare a patch you can review from another device.",
    prerequisite:
      "Install and authenticate traecli, then verify traecli acp serve in the daemon environment.",
    question: "Do TRAE commands appear immediately?",
    answer:
      "The CLI can publish commands and skills asynchronously. Available actions depend on what the running CLI reports, so allow discovery to complete.",
  },
  vtcode: {
    intro: "VT Code is an open-source agent with multi-provider model support and shell controls.",
    useCase:
      "Try a shell-assisted code task after checking the agent’s model and command-approval configuration.",
    prerequisite:
      "Install VT Code and configure model credentials. The catalog supplies the ACP enablement environment flags.",
    question: "Why keep the catalog’s environment flags?",
    answer:
      "This entry sets VT_ACP_ENABLED and VT_ACP_ZED_ENABLED. Preserve the documented launch configuration when overriding the executable path.",
  },
  agoragentic: {
    intro: "Agoragentic connects an agent-service marketplace through an ACP package.",
    useCase:
      "Explore a specific external capability only after checking the service’s inputs, output and payment requirements.",
    prerequisite:
      "Add the ACP package and configure any account or wallet required by the selected marketplace service.",
    question: "Are marketplace payments included in ClawMuse?",
    answer:
      "No. External agent services have their own terms and payment arrangements. Review a service before authorizing a call that can spend funds.",
  },
  autohand: {
    intro: "Autohand Code is available through the catalog’s dedicated Autohand ACP package.",
    useCase:
      "Use it for a small project edit and inspect the generated files before broadening the task.",
    prerequisite:
      "Prepare Node.js and npx, add @autohandai/autohand-acp from the catalog and configure the access required by Autohand.",
    question: "Is the ACP package a model subscription?",
    answer:
      "No. It supplies the connection to the agent. Autohand account access, model usage and any provider charges are separate.",
  },
} satisfies Record<AgentSlug, AgentTranslation>;
