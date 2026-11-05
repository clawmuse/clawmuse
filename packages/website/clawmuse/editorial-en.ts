import type { Article, LearnArticlePage } from "./editorial-content";

export const englishArticles: Record<LearnArticlePage, Article> = {
  "/learn/own-computer-ai-agents": {
    title: "Your own computer as a personal AI workstation",
    description:
      "Turn an always-on Mac, PC or Linux host into a personal AI workstation. Keep your development environment, choose your agents and stay in control from your phone.",
    category: "The idea",
    lead: "You have already invested in a computer, a working project and the tools that make it useful. Your AI workflow should be able to build on that investment, even when you leave your desk.",
    takeaway:
      "ClawMuse connects the coding agents on your own machines to a shared desktop, web and mobile workspace. You choose the host and supported agent; your phone becomes a way to direct and review the work.",
    sections: [
      {
        id: "keep-your-environment",
        title: "A working environment that stays yours",
        paragraphs: [
          "A useful agent needs more than a chat window. It needs the repository, dependencies, command-line tools, project instructions and access you have already configured. Running it on your computer lets it work in that existing environment. You decide how to store projects, back them up and upgrade the machine.",
          "For example, a task that builds a website can use the same checkout and development tools you use at your desk. Review its diff on your phone, then return to that project on the computer. There is no mandatory move to a separate hosted workspace to use ClawMuse.",
        ],
      },
      {
        id: "choose-your-resources",
        title: "Choose hardware for your actual workload",
        paragraphs: [
          "Your host sets the available memory, disk and CPU. An existing workstation with spare capacity can be a useful place to run builds, tests and several agent sessions. A small, dedicated machine may be a better fit when you want the environment available throughout the day.",
          "Local hardware is not unlimited or automatically cheaper. Concurrent builds compete for resources; power, backups and maintenance still cost money. Cloud environments remain useful when you need managed availability or temporary capacity. The advantage is that the choice stays with you.",
        ],
      },
      {
        id: "choose-your-agent",
        title: "Keep your workflow as your agent choices change",
        paragraphs: [
          "ClawMuse supports Claude Code, Codex, GitHub Copilot, OpenCode, Pi, Antigravity and Muse Code. Use the installed, authenticated provider that fits a task, then follow its conversation, tools and results through the same workspace interface.",
          "This does not make provider subscriptions interchangeable or transfer one provider’s private session state into another. Each provider keeps its own authentication, model availability, permissions and billing. ClawMuse brings supported workflows into one place.",
        ],
      },
      {
        id: "work-from-your-phone",
        title: "Make progress away from the desk",
        paragraphs: [
          "Use your phone to give a task, dictate a follow-up, inspect changes, answer an approval request or check another host. Streaming responses and synchronized session state help you follow what is happening without keeping a desktop window open.",
          "An active host can keep working after you close the phone client. The host, daemon and agent process must remain available: a sleeping laptop cannot continue a build. Optional Goals adds proposed work with approval and execution budgets; Status adds configured activity and quota views. Neither is required for the core workflow.",
        ],
      },
    ],
    faq: [
      {
        question: "Is a self-hosted agent the same as a local language model?",
        answer:
          "No. The agent and its tools can run on your host while a cloud model processes prompts and selected project context. A fully local setup requires a compatible local model configuration and local tools; ClawMuse does not make a cloud provider offline.",
      },
      {
        question: "Do I need a separate server?",
        answer:
          "No. You can start with a supported computer you already use. A dedicated host is an option if you need longer availability. Keep it powered, awake and connected when you want remote access.",
      },
      {
        question: "Can I use ClawMuse without optional account services?",
        answer:
          "The underlying host workflow supports local and direct connections. Account discovery, Goals and Status add services with their own configuration and data boundaries. Choose the connection method in the setup guide.",
      },
    ],
    related: [
      "/compare/cloud-ai-agents",
      "/guides/always-on-ai-workstation",
      "/guides/local-data-and-cloud-models",
    ],
  },
  "/compare/cloud-ai-agents": {
    title: "Self-hosted AI agents vs cloud computers: how to choose",
    description:
      "Compare your own AI workstation with a managed cloud computer: hardware, persistence, agent choice, costs and data boundaries. See where ClawMuse fits.",
    category: "Comparison",
    lead: "The useful question is where the work should live. A managed cloud computer and your own workstation solve different operational problems, and both can be part of the same workflow.",
    takeaway:
      "Choose your own host when an existing environment, hardware control and multiple agent providers matter. Choose managed compute when avoiding host maintenance and getting remote capacity matter more.",
    sections: [
      {
        id: "compare-the-environment",
        title: "Compare the environment, not only the chat interface",
        paragraphs: [
          "This table compares deployment patterns. A platform may offer several patterns, including local access and persistent cloud machines; check the specific product and plan you intend to use.",
        ],
        table: {
          headers: ["Decision", "Your host with ClawMuse", "Managed cloud computer"],
          rows: [
            [
              "CPU, memory and storage",
              "The machine you select; upgrade or move hosts yourself.",
              "The provider’s available configurations and quotas.",
            ],
            [
              "Project environment",
              "Your existing files, tools and dependencies on the host.",
              "An environment you provision or connect in the service.",
            ],
            [
              "Persistence",
              "You manage disks, backups and process availability.",
              "Depends on the product: temporary tasks or persistent machines.",
            ],
            [
              "Agent choice",
              "Seven supported providers; each needs its own setup.",
              "Depends on the platform and its supported integrations.",
            ],
            [
              "Remote access",
              "Phone, web and desktop clients; host must be reachable.",
              "The service’s clients and access methods.",
            ],
            [
              "Operating responsibility",
              "Power, updates, networking, storage and recovery are yours.",
              "The provider manages the underlying compute service.",
            ],
            [
              "Total cost",
              "Hardware, power, operations and model/API charges.",
              "Plan, compute/storage charges and any model usage charges.",
            ],
          ],
        },
      },
      {
        id: "platforms-have-options",
        title: "Cloud platforms also offer persistent and local options",
        paragraphs: [
          "Manus documents a persistent Cloud Computer and a Desktop “My Computer” mode that connects to a physical computer. Its cloud product should not be described as only a disposable task sandbox. Check its current plans for the resources available to you.",
          "OpenAI also documents self-hosted sandboxes for its Agents API. Local compute is not exclusive to ClawMuse. ClawMuse’s focus is a shared mobile and desktop workspace across supported agent providers and your own hosts.",
        ],
        sources: [
          {
            title: "Manus: What is the Cloud Computer?",
            url: "https://help.manus.im/en/articles/15392111-what-is-the-cloud-computer",
          },
          {
            title: "OpenAI: Self-hosted sandboxes",
            url: "https://developers.openai.com/api/docs/guides/agents-api/environments/self-hosted",
          },
        ],
      },
      {
        id: "when-your-host-fits",
        title: "When your own computer is a good fit",
        paragraphs: [
          "Start with your host if your work depends on an established repository, local tools or a hardware configuration you control. It can also be useful when you regularly switch agent providers and want one place to inspect their work.",
        ],
        points: [
          "You already have a machine with enough spare capacity for the builds and tests you run.",
          "You want to keep project organization, installed tools and backups under your control.",
          "You can keep the host available and maintain it, or already operate a personal server.",
        ],
      },
      {
        id: "when-cloud-fits",
        title: "When managed compute is a better fit",
        paragraphs: [
          "A cloud computer can be the better choice when your laptop is often asleep, you do not want to maintain a host, or you need capacity beyond your own hardware. A provider-native workflow can also be the simpler choice if it already meets your needs.",
          "Compare a representative task before committing: environment setup, build time, remote responsiveness, recovery after interruption and total recurring cost. There is no measured basis here for claiming that either approach is always faster, cheaper or more private.",
        ],
      },
    ],
    faq: [
      {
        question: "Does ClawMuse provide a cloud computer?",
        answer:
          "ClawMuse connects you to a host you supply. That can be your personal computer or a server you operate. It does not include a managed compute instance or a model subscription.",
      },
      {
        question: "Is a local computer always more powerful?",
        answer:
          "No. Compare your actual CPU, memory, storage and workload with the available cloud configurations. ClawMuse lets you choose the host; it does not increase that host’s resources.",
      },
      {
        question: "Does self-hosting mean nothing leaves my computer?",
        answer:
          "No. Cloud model calls, cloud speech processing and optional account services each have their own data flows. The project environment can remain on your host while selected context is sent to a provider.",
      },
    ],
    related: [
      "/learn/own-computer-ai-agents",
      "/compare/claude-code-codex",
      "/guides/local-data-and-cloud-models",
    ],
  },
  "/compare/claude-code-codex": {
    title: "Claude Code, Codex and ClawMuse: what each does",
    description:
      "Use Claude Code and Codex on your own computer, then manage supported agent workflows from your phone. Compare native tools with ClawMuse’s shared workspace.",
    category: "Comparison",
    lead: "Claude Code and Codex do the agent work. ClawMuse gives supported agents a shared workspace across your machines and devices. These products can be used together.",
    takeaway:
      "Keep a provider’s native interface when it already covers your workflow. Add ClawMuse when you want to operate several supported agents and hosts from a consistent mobile, web and desktop interface.",
    sections: [
      {
        id: "native-capabilities",
        title: "Start with what the native tools already do",
        paragraphs: [
          "Codex CLI can inspect and edit a local repository and run tools on your computer. Claude Code Remote Control can let another device interact with a session running on your machine. Neither should be presented as a cloud-only tool.",
          "Those native capabilities are valuable. ClawMuse addresses a different choice: whether you want a common workspace around several supported agent providers, rather than organizing your entire workflow around one provider’s interface.",
        ],
        sources: [
          { title: "OpenAI: Codex CLI", url: "https://learn.chatgpt.com/docs/codex/cli" },
          {
            title: "Anthropic: Claude Code Remote Control",
            url: "https://code.claude.com/docs/en/remote-control",
          },
        ],
      },
      {
        id: "what-clawmuse-adds",
        title: "The workspace around the agent",
        paragraphs: [
          "ClawMuse keeps the conversation alongside the evidence you need to assess it: tool activity, workspace files, diffs, a terminal and host status. The desktop application also provides an embedded browser pane for local page work.",
        ],
        table: {
          headers: ["Need", "ClawMuse’s role"],
          rows: [
            [
              "Use different coding agents",
              "Start supported providers from the workspace; authentication and model access remain provider-specific.",
            ],
            [
              "Continue from a phone",
              "Read the session, send instructions, dictate a draft and respond to approval requests.",
            ],
            [
              "Review actual changes",
              "Inspect files, diffs and command output from the host’s working environment.",
            ],
            [
              "Work across computers",
              "Choose a connected host and keep each task in its intended environment.",
            ],
            [
              "Coordinate optional ongoing work",
              "Configure Goals for approved execution budgets and Status for activity and quota views.",
            ],
          ],
        },
      },
      {
        id: "what-does-not-change",
        title: "Provider boundaries still apply",
        paragraphs: [
          "Installing ClawMuse does not grant a Claude or OpenAI subscription, remove rate limits or make every provider expose identical controls. Use a provider that is installed and authenticated on the host, and check which capabilities it supports.",
          "A shared interface is also not automatic conversation portability. If you start work with another provider, give it the project state and instructions it needs. Review concurrent edits carefully when several agents share a repository.",
        ],
      },
      {
        id: "try-a-real-task",
        title: "Evaluate it with one small task",
        paragraphs: [
          "Choose a repository and ask one agent to make a small, reversible change. Follow the tool activity, inspect the diff and run the relevant check. Connect your phone and add a follow-up while the same host is still running. Then repeat with another supported provider if provider choice matters to you.",
          "The website demo illustrates this sequence with preset data. Use your own installation to assess real provider behavior, network responsiveness and voice quality. Native remote-control tools may already be enough if you only need one provider and one machine.",
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
    title: "Set up an always-on AI workstation on your own computer",
    description:
      "Plan a persistent AI agent host: choose a machine, configure ClawMuse and a provider, connect your phone, and verify sleep, reconnect and review behavior.",
    category: "Setup guide",
    lead: "An always-on workspace starts with a host that is actually available. Build a small working setup first, then add the services you need for longer tasks.",
    takeaway:
      "Keep the computer, daemon and agent available; verify a real task from your phone before relying on unattended work. Optional Goals needs separate setup and explicit execution approval.",
    sections: [
      {
        id: "choose-a-host",
        title: "1. Choose a host for the work you run",
        paragraphs: [
          "Use a supported Mac or PC for a desktop workflow, or a Linux host for a headless setup. Measure the memory, disk and CPU required by your repository’s actual build and tests. Leave capacity for the operating system and concurrent work rather than choosing hardware by model marketing alone.",
          "A daily-use laptop is a good starting point, but closing its lid may put it to sleep. A powered desktop or a small server can be more predictable for long availability. Set the power policy deliberately and keep normal operating-system updates and backups in place.",
        ],
      },
      {
        id: "prepare-the-project",
        title: "2. Make the project work locally first",
        paragraphs: [
          "Install ClawMuse using the download or Linux guide. Install and authenticate a supported agent provider on the same host. Open the intended project and verify that its normal development command and a relevant check work with that account.",
          "Keep secrets in the credential and environment configuration intended for the tool. Use project instructions to explain the build, test and approval boundaries. An agent can only use the resources and permissions available to the process running it.",
        ],
      },
      {
        id: "connect-your-phone",
        title: "3. Connect and verify from another network",
        paragraphs: [
          "Choose the documented direct or account-based connection flow. With account discovery, use the same account and complete the host pairing step. A discovered host still needs the required trust and authorization; a device list is not permission to access every computer.",
          "Test from your phone’s mobile network as well as local Wi-Fi. Send a short instruction, read the response and inspect a changed file. Relay selection and streaming improvements help the connection, but real responsiveness depends on the route, host load and provider.",
        ],
      },
      {
        id: "verify-long-running-work",
        title: "4. Check the full unattended-work boundary",
        paragraphs: [
          "Start with a bounded task that is safe to interrupt. Verify the following before leaving the host to work for longer periods.",
        ],
        points: [
          "Close and reopen the phone client; confirm the same host’s task is still visible.",
          "Confirm the host stays awake for the intended period and has enough disk space.",
          "Check that a permission request waits for your decision instead of assuming approval.",
          "Inspect the resulting diff and test output; a completed conversation is not proof of a correct change.",
          "Know how to stop a task and recover the project using your normal version-control and backup process.",
        ],
      },
      {
        id: "add-optional-services",
        title: "5. Add Goals and Status when you need them",
        paragraphs: [
          "Goals introduces planner-proposed goal cards, phone approval, host execution and reports with configured budgets. It requires its service and host integration; it is not automatically enabled by keeping a computer awake. Approve the scope and budget before execution.",
          "Status can publish activity and quota information to configured views, including iOS Live Activity and widgets. These optional services have their own data flows. Start with a working host and mobile connection, then add each service intentionally.",
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
    title: "Use AI coding agents from your phone without moving your project",
    description:
      "Follow a ClawMuse mobile workflow: send or dictate a task, inspect agent activity and diffs, approve actions, switch hosts and return to your desktop environment.",
    category: "Workflow guide",
    lead: "Your phone is useful for directing work and making decisions. The repository, tools and agent can stay on the computer that already knows how to build your project.",
    takeaway:
      "Give the task on your phone, let the host execute it, then inspect the evidence before approving the next step. Use the desktop for work that benefits from more screen space.",
    sections: [
      {
        id: "give-a-clear-task",
        title: "Start with a task that has a reviewable result",
        paragraphs: [
          "Select the intended host and workspace, then choose a configured agent. Ask for a specific change and say how it should be checked: for example, add a language switch to one page, preserve the current route and run the relevant test.",
          "Text input and dictation both feed the conversation. Dictation supports pausing, resuming and editing the draft before sending it. Real-time voice is a separate interaction mode; its availability and quality depend on the speech provider and configuration.",
        ],
      },
      {
        id: "follow-and-review",
        title: "Follow the work, then check the result",
        paragraphs: [
          "Watch streamed responses and tool activity to see what the agent is doing. Open the workspace files and inspect the diff. Use terminal output to understand a failed build instead of relying only on the agent’s summary.",
          "When a permission request appears, read the action and its scope before approving it. A useful mobile workflow keeps these decisions visible. The host’s process and provider permissions still determine what can run.",
        ],
      },
      {
        id: "use-the-right-screen",
        title: "Use each screen for the work it suits",
        paragraphs: [
          "A phone works well for short instructions, progress checks, small diffs and approvals. Return to the desktop for larger reviews, multiple panels or the embedded browser. The ClawMuse embedded browser pane is a desktop application feature; it is not a remote browser viewport on the phone.",
          "Switching to another host selects another environment. Keep the repository, branch and provider in mind when moving between machines. A common interface does not silently copy a checkout or its credentials between hosts.",
        ],
      },
      {
        id: "voice-and-network",
        title: "Voice and remote responsiveness have real boundaries",
        paragraphs: [
          "Current improvements cover dictation draft handling, voice synchronization, speech segmentation, streamed text delivery and regional relay selection. They aim to make remote conversations easier to follow. The demo illustrates the interaction with preset text and does not record audio or benchmark a connection.",
          "For your installation, try one task on Wi-Fi and mobile data. Check the time to receive the first reply, whether reconnecting preserves the session, and how your chosen speech provider handles your language. Local and cloud speech options have different setup and data requirements.",
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
    title: "Local AI agents, cloud models and where your data goes",
    description:
      "Understand ClawMuse’s data boundaries: local project files, model requests, encrypted relay traffic, speech providers and optional account, Goals and Status services.",
    category: "Data & control",
    lead: "“Runs on my computer” describes where the agent executes. It does not, by itself, describe where every prompt, audio clip or status update goes.",
    takeaway:
      "Your host remains the working environment. Cloud models and optional services can receive the data needed for their role. Choose each connection and provider with that boundary in mind.",
    sections: [
      {
        id: "data-boundaries",
        title: "Separate the execution environment from external services",
        paragraphs: [
          "ClawMuse does not require moving your repository into a ClawMuse-hosted development machine. The agent works against your host’s files and tools. Connected clients receive session and workspace data to display, so local execution is not a claim that data never reaches another device.",
        ],
        table: {
          headers: ["Layer", "What it handles", "What to check"],
          rows: [
            [
              "Your host",
              "Project files, tools, agent processes and host-side configuration.",
              "OS permissions, backups, secrets and which projects the agent can access.",
            ],
            [
              "Model provider",
              "Prompts and context selected by the agent, which can include code and tool output.",
              "Provider configuration, account policies and data terms.",
            ],
            [
              "Encrypted relay",
              "End-to-end encrypted connection traffic between paired endpoints.",
              "Endpoint trust and relay metadata; encryption does not cover a separate model request.",
            ],
            [
              "Speech provider",
              "Audio or text needed for recognition and speech synthesis.",
              "Local versus cloud processing and the configured speech provider.",
            ],
            [
              "Optional services",
              "Account discovery, configured activity/quota reports, or goal execution records.",
              "Which services are enabled and the information each publishes.",
            ],
          ],
        },
      },
      {
        id: "relay-encryption",
        title: "What end-to-end encryption protects",
        paragraphs: [
          "The protected relay connection carries encrypted traffic between the paired client and host. The relay is a transport intermediary, not the execution environment. Endpoints must still be trusted, and connection metadata is distinct from encrypted content.",
          "The agent’s request to a model provider is a separate connection. Relay encryption does not prevent an agent from sending selected project context to that provider. Review the provider and tool configuration as well as the connection path.",
        ],
      },
      {
        id: "speech-and-services",
        title: "Choose speech and optional services deliberately",
        paragraphs: [
          "A local speech configuration can process speech on the host. A configured cloud speech provider receives the audio or text required for its service. Selecting local speech does not change the separate language-model provider used by your coding agent.",
          "Account discovery helps you find hosts; pairing establishes the relevant trust. Optional Status publishes configured activity and quota information, while Goals coordinates approved work and reports. These are separate from the repository on your machine and should be included in your data-flow review.",
        ],
      },
      {
        id: "make-a-choice",
        title: "Make a setup you can explain",
        paragraphs: [
          "Before using a sensitive project, list the host, agent provider, model endpoint, speech provider and optional services involved. Check your organization’s requirements and the actual configuration; a marketing label cannot establish whether a workflow meets them.",
        ],
        points: [
          "Keep access scoped to the projects and tools the task needs.",
          "Understand which prompts, code snippets and command results the model may receive.",
          "Choose local processing where supported and verify it instead of assuming it.",
          "Review and revoke device access when a client or host is no longer trusted.",
        ],
      },
    ],
    faq: [
      {
        question: "Does self-hosted mean offline?",
        answer:
          "No. Remote access needs connectivity, and cloud models need network access. Offline inference requires a compatible local model and tools configured for that purpose.",
      },
    ],
    related: [
      "/learn/own-computer-ai-agents",
      "/compare/cloud-ai-agents",
      "/guides/always-on-ai-workstation",
    ],
  },
};
