import type { Article, WorkflowArticlePage } from "./editorial-content";

export const englishWorkflowArticles: Record<WorkflowArticlePage, Article> = {
  "/docs/first-task": {
    updated: "2026-10-29",
    title: "Start your first task",
    description:
      "Connect a host, choose an installed agent, give it a small task and review the result from another device.",
    category: "Getting started",
    lead: "Choose a project folder, ask an agent to explain it, then continue the conversation from your phone.",
    takeaway:
      "The computer does the work. Your phone or another client sends instructions and shows progress. Keep the host awake and connected while a task is running.",
    sections: [
      {
        id: "prepare",
        title: "1. Prepare the computer that will do the work",
        paragraphs: [
          "Install a supported agent on the host and finish that provider’s sign-in. Run a small request in the agent’s own interface first. ClawMuse uses that installation and its credentials; it does not include a model subscription.",
        ],
        steps: [
          "Choose a project folder with material you are comfortable giving to the agent. For a first attempt, use a copy or a small Git repository.",
          "Download the ClawMuse build for your platform, or follow the Linux host guide. Open the host and confirm it is online.",
          "Select the host and create a workspace pointing to your project folder. Choose an agent that the host reports as available.",
        ],
        links: [
          { title: "Downloads and platform availability", page: "/download" },
          { title: "Linux host setup", page: "/docs/linux" },
          { title: "Choose and prepare an agent", page: "/docs/agents" },
        ],
      },
      {
        id: "first-request",
        title: "2. Ask for a result with a clear stopping point",
        paragraphs: [
          "Try this: “Read the files in this project and explain its purpose, the three most important files and how to preview it. Do not change files. Tell me what you could not verify.”",
          "A read-only first task checks the selected folder, agent authentication and conversation flow. Review the answer against the files before asking the agent to make a change.",
        ],
        points: [
          "Name the input: which project or files should it use?",
          "Name the output: a summary, a draft, a changed file or a working preview?",
          "Name the boundary: what needs your approval, and when should it stop?",
        ],
      },
      {
        id: "continue-away",
        title: "3. Continue from a second device",
        paragraphs: [
          "Sign in to the same ClawMuse account on your computer and phone. Select your linked computer, open the conversation and send a follow-up.",
          "Closing a client does not turn off the host. Sleeping or shutting down the computer interrupts its availability. If a connection fails, first check host power, network and the chosen connection method.",
        ],
        links: [
          { title: "Connection and security boundaries", page: "/security" },
          { title: "Connection troubleshooting", page: "/support" },
        ],
      },
      {
        id: "review",
        title: "4. Inspect the result before accepting it",
        paragraphs: [
          "For a file change, inspect the diff and open the generated file. For a program, ask the agent to run the relevant checks and report which ones passed. A confident message is not evidence that the output works.",
          "Finish by requesting a short handoff: what changed, where the result lives, what was tested and what still needs your decision. Keep that record in the conversation so the next instruction has context.",
        ],
        links: [{ title: "Personal workflows", page: "/docs/workflows" }],
      },
    ],
    faq: [
      {
        question: "Can I start with a non-code task?",
        answer:
          "Yes, if your chosen agent and tools can handle it. Start with a folder of notes and ask for a summary or draft. File formats, network access and applications depend on the host’s tools.",
      },
    ],
    related: ["/docs/agents", "/docs/voice", "/docs/workflows"],
  },
  "/docs/agents": {
    updated: "2026-10-29",
    title: "Use your own agents and model accounts",
    description:
      "Prepare a supported agent, keep its authentication and billing separate, and choose a model and permissions for each personal task.",
    category: "Agents and models",
    lead: "ClawMuse gives your installed agents a shared workspace across devices. The agent provider still owns its models, authentication and usage rules.",
    takeaway:
      "Install and authenticate an agent on the execution host first. Choose from the providers and models that host actually exposes.",
    sections: [
      {
        id: "prepare-provider",
        title: "Prepare an agent on each host",
        paragraphs: [
          "Find your tool in the agent directory and follow its setup instructions. Some agents, such as OMP, also need to be enabled in the host settings.",
        ],
        steps: [
          "Install the underlying agent using its own official instructions.",
          "Sign in or configure its model credentials on the same host that will run the task.",
          "Verify a small request outside ClawMuse, then check the host’s agent settings and available provider list.",
          "Create a conversation with that provider and select an offered model and permission mode.",
        ],
        links: [{ title: "Browse all agents and setup requirements", page: "/agents" }],
      },
      {
        id: "billing",
        title: "Understand AI service costs",
        paragraphs: [
          "ClawMuse itself is open source. Model subscriptions, API usage and cloud speech are billed by their providers.",
          "One subscription does not unlock another provider. Changing the agent does not transfer private session state or create a shared model allowance. When changing providers, give the new conversation a concise project brief and the files it needs.",
        ],
        links: [
          { title: "ClawMuse plans and separate costs", page: "/pricing" },
          { title: "Claude Code and Codex workflows", page: "/compare/claude-code-codex" },
        ],
      },
      {
        id: "permissions",
        title: "Choose permissions for the task",
        paragraphs: [
          "Use a mode that matches the task’s scope. A reading task needs a different level of access from a task that installs dependencies or edits a project. Provider modes and approval behavior differ.",
          "If you save an agent profile, name it by purpose and include useful selection notes: for example, “review only” or “implement in an isolated worktree.” Check the saved model and mode before reusing it.",
        ],
        links: [{ title: "Understand data and host permissions", page: "/security" }],
      },
      {
        id: "missing-provider",
        title: "If an agent or model is missing",
        paragraphs: [
          "Check the selected host first: agents are installed per machine. Confirm the executable is available to the daemon’s environment, that authentication still works and that your installed ClawMuse version supports the integration.",
          "For an error report, include the host platform, ClawMuse version, provider name and the error text with secrets removed. Do not include tokens or complete credential files.",
        ],
        links: [{ title: "Get help", page: "/support" }],
      },
    ],
    faq: [
      {
        question: "Does using my computer mean the model is local?",
        answer:
          "No. The agent and tools run on your host, but a cloud model may receive prompts and selected files. A local model requires separate compatible configuration.",
      },
      {
        question: "Can one task use several agents?",
        answer:
          "Configured orchestration can delegate work to other agents. Start with one working agent, then give each worker a clear scope and review the combined result.",
      },
    ],
    related: ["/docs/first-task", "/docs/workflows", "/guides/local-data-and-cloud-models"],
  },
  "/docs/workflows": {
    updated: "2026-10-26",
    title: "Build a personal workflow around a concrete result",
    description:
      "Practical workflows for drafts, files and code, with clear inputs, isolated parallel work and a review step.",
    category: "Personal workflows",
    lead: "Your personal AI workspace becomes more useful when every request names a result, a place to save it and a way to check it.",
    takeaway:
      "Start small, preserve your originals, and inspect the output. Expand into parallel work when tasks have independent inputs and clear ownership.",
    sections: [
      {
        id: "notes-to-draft",
        title: "Turn a folder of notes into a draft",
        paragraphs: [
          "Create a workspace containing the notes you want to use. Ask the agent to list its sources, identify missing information and propose an outline before writing the draft. This works with files the agent’s configured tools can read.",
        ],
        points: [
          "Example request: “Use only the notes in this folder to draft a one-page project brief. Mark assumptions and save a new file without changing the originals.”",
          "Check names, dates and source references in the result. Ask for revisions in the same conversation.",
        ],
      },
      {
        id: "files-and-data",
        title: "Organize files or examine data",
        paragraphs: [
          "Ask for a proposed file map or an analysis plan first. For a spreadsheet, specify the sheet, column meanings, date range and expected output. Parsing and analysis require compatible tools on the host.",
          "Keep a copy of source data. Ask the agent to produce a new result file and a short explanation of calculations, omitted rows and uncertainties. Review a sample before authorizing a larger batch of changes.",
        ],
      },
      {
        id: "code-to-preview",
        title: "Take a project change through to a preview",
        steps: [
          "Describe the behavior you want and how you will recognize success.",
          "Ask the agent to inspect the project and explain the smallest useful change.",
          "Let it implement within the agreed files. Inspect the diff and the relevant checks.",
          "Open the preview using the tools and connection method available in your setup, then ask for a handoff with any remaining issues.",
        ],
        paragraphs: [
          "Your phone can direct the task and inspect progress. Some detailed checks are easier at your computer; keep those checks in the acceptance criteria.",
        ],
      },
      {
        id: "parallel-work",
        title: "Add another agent when the work can be separated",
        paragraphs: [
          "For code changes, create separate worktree-backed workspaces for independent branches. Each worktree has its own working directory, but may still need dependencies, environment files and a separate service port.",
          "For agent-led delegation, enable the host’s built-in agent-management tools in its agent settings, then start or reload the coordinating agent. Ask it to assign specific files or a read-only review, collect the results and report what was checked. Tool injection is optional and disabled by default.",
        ],
        points: [
          "A useful first delegation: implement a small change, then ask a second agent to review it without editing files.",
          "Separate worktrees reduce overlapping edits; they do not remove merge conflicts or the need to test the integrated result.",
          "Cross-host work requires a reachable, authorized host with the right project and tools. Do not assume a project folder is automatically synchronized.",
        ],
        links: [
          { title: "Choose your agents", page: "/docs/agents" },
          { title: "Optional Goals and Status", page: "/docs/goals-status" },
        ],
      },
    ],
    faq: [],
    related: ["/docs/first-task", "/docs/goals-status", "/blog/from-idea-to-result"],
  },
  "/docs/goals-status": {
    updated: "2026-10-26",
    title: "Set up Goals and Status for ongoing work",
    description:
      "Understand optional Goals approval, execution-run budgets, Status reporting and their current host and client requirements.",
    category: "Goals and Status",
    lead: "Goals lets you approve a bounded piece of work and review its report. Status helps you see activity without leaving a conversation open. Both require an additional service relationship.",
    takeaway:
      "These are optional, configured features. Work still runs on your host. A Goals run limit counts execution runs; it is not a guaranteed spending cap.",
    sections: [
      {
        id: "requirements",
        title: "Check availability before setting up",
        paragraphs: [
          "The current Status integration supports iOS builds with the native Live Activity module and the Electron desktop app. Android and ordinary browsers do not currently have this service integration. Desktop offers status and Goals access without iOS lock-screen or widget controls.",
          "A compatible host must be connected to a Status service. Goals also needs an eligible repository with a Git remote, configured planner/executor agents and Goals enabled on that host. A local-only folder is not eligible for the current Goals repository queue.",
        ],
        links: [
          { title: "Download and build availability", page: "/download" },
          { title: "Ask about service setup", page: "/support" },
        ],
      },
      {
        id: "connect",
        title: "Connect the service and enable the host",
        steps: [
          "Obtain the Status service HTTPS address and your host enrollment credentials from your service operator. A website account alone does not configure the host.",
          "Use the installed CLI’s “clawmuse status connect” command with the supplied address and a token file or standard input. “clawmuse status show” displays the stored relationship.",
          "On a supported client, open notification settings and bind the configured host to remote status. iOS notification and Live Activity settings affect the available alerts.",
          "Enable Goals on the host using “clawmuse status goals set --enable”, specifying installed planner and executor models. Use “clawmuse status goals show” to inspect the settings.",
        ],
        paragraphs: [
          "Keep service tokens private. Your host reads changes to the Status relationship without a daemon restart. If setup is unavailable in your release, keep using ordinary conversations and ask support about the supported configuration.",
        ],
      },
      {
        id: "goal-loop",
        title: "Run one goal and review the outcome",
        steps: [
          "Choose an eligible project. Request suggestions, or enter a goal with an observable outcome.",
          "Review the goal text, target host, model and execution-run budget before accepting it. Automatic planning is opt-in per repository.",
          "Keep the chosen host online while it runs. A goal pinned to a host waits for that host.",
          "Read the report and inspect the resulting changes. Approve, discard or continue with a specific next instruction.",
        ],
        paragraphs: [
          "For example, a budget of three runs allows up to three execution runs before review. Continuing resumes execution; an exhausted run budget can grow by one, up to the system limit. Model tokens, API prices and speech charges remain governed by their providers.",
          "Goal runs can use broad provider permissions so they can proceed without interactive approval. Enable them only for projects and actions you are comfortable delegating, and review the proposed scope before accepting.",
        ],
      },
      {
        id: "status-meaning",
        title: "Read activity, quota and freshness separately",
        paragraphs: [
          "On supported iOS builds, the lock-screen activity shows task status and counts. The home-screen widget and in-app usage view show available provider quota data. Availability and reset windows depend on the provider; percentages are not an invoice.",
          "A stale snapshot is the last known state. Check its update time and reconnect to the host before concluding a task is stopped. Status summaries contain activity and quota data; Goals additionally sends goal text, repository identity and structured reports to the service.",
        ],
        links: [{ title: "Service and data boundaries", page: "/security" }],
      },
    ],
    faq: [],
    related: ["/docs/workflows", "/docs/agents", "/guides/always-on-ai-workstation"],
  },
  "/docs/voice": {
    updated: "2026-10-26",
    title: "Capture a thought with voice",
    description:
      "Configure speech recognition, dictate and edit a request, and understand local and cloud voice processing.",
    category: "Voice",
    lead: "Use dictation when a thought is easier to say than type. Read the transcript, add the missing context and send it to the agent working on your project.",
    takeaway:
      "Speech recognition is a separate configuration from your coding agent. Choose a service that supports your language and verify the transcript before sending.",
    sections: [
      {
        id: "choose-speech",
        title: "Choose recognition for your language",
        paragraphs: [
          "Recognition can use local models, an OpenAI-compatible speech service or STEP Plan. Local defaults are English-only; the multilingual local Parakeet model covers selected European languages and does not add Chinese support.",
          "For Chinese dictation, configure a service that supports Chinese. The host’s speech-recognition settings accept a provider, endpoint, model, language and credentials. STEP Plan has a dedicated protocol and endpoint; changing an OpenAI URL alone is not sufficient.",
        ],
        points: [
          "Local recognition uses host compute and may download missing speech models.",
          "Cloud recognition sends audio to the speech service and can have separate usage charges.",
          "Voice mode also requires speech synthesis and an available reasoning agent; dictation only turns speech into editable text.",
        ],
      },
      {
        id: "dictate",
        title: "Dictate one small request",
        steps: [
          "Confirm the selected host has working recognition settings and allow microphone access on your client.",
          "Open the intended project conversation and start dictation. Say the desired result, the relevant files and any limits.",
          "Stop recording and wait for the final transcript. Check file names, numbers, technical terms and whether negations were recognized.",
          "Edit the draft and send it. Cancel recording if you want to restore the previous draft instead.",
        ],
        paragraphs: [
          "Try: “Use the notes in this project to make a short outline. Save it as a new draft and do not overwrite existing files.” Follow up with typed file names when spelling matters.",
        ],
      },
      {
        id: "troubleshoot",
        title: "If recognition does not behave as expected",
        paragraphs: [
          "Check microphone permission, the current host connection, the chosen speech provider and its language support. An authenticated coding agent does not automatically authenticate a speech API.",
          "For delayed text, allow the recording segment and service processing to finish. Test a short recording before retrying a long instruction. If recognition is inaccurate, edit the text or switch to typing; the task can continue in the same conversation.",
        ],
        links: [
          { title: "Get help with voice setup", page: "/support" },
          { title: "Understand external service costs", page: "/pricing" },
        ],
      },
    ],
    faq: [
      {
        question: "Does local recognition make the whole task offline?",
        answer:
          "No. Local speech processing only covers that speech step. The chosen agent may still send the transcript and project context to a cloud model.",
      },
      {
        question: "Can spoken instructions trigger real actions?",
        answer:
          "Yes. Once sent to an agent, a spoken request is an instruction like typed text. Review the transcript and permissions before asking for file changes or other actions.",
      },
    ],
    related: ["/docs/first-task", "/docs/workflows", "/guides/local-data-and-cloud-models"],
  },
  "/blog/why-clawmuse": {
    updated: "2026-10-29",
    title: "Why we’re building ClawMuse",
    description:
      "Keep giving your AI agents tasks and checking their work after you step away from your computer. That’s where ClawMuse started.",
    category: "Product notes",
    lead: "Your agent is still working, but it’s time to head out. Could you answer its next question and check its changes from your phone? That’s the problem ClawMuse started with.",
    takeaway: "Reach your computer’s AI tools from your phone and continue the same task.",
    sections: [
      {
        id: "the-name",
        title: "Start while the idea is fresh",
        paragraphs: [
          "You remember a website change on a walk, or think of a better paragraph on your way home. Open your phone and send the request to your agent. ClawMuse combines Claw for action and Muse for inspiration. This is what we want it to help you do.",
        ],
        links: [
          {
            title: "ClawMuse brand assets",
            page: "/brand",
          },
        ],
      },
      {
        id: "personal",
        title: "Keep the tools you know",
        paragraphs: [
          "Your projects, dependencies and tools are already on your computer. ClawMuse connects to agents like Claude Code and Codex so you can keep using that environment and those accounts, with the same conversation on your phone and computer.",
        ],
      },
      {
        id: "away-from-desk",
        title: "Follow up while you’re out",
        paragraphs: [
          "Check progress, answer a question or add a detail from your phone. Return to your computer when you need to inspect the files closely. Keep it awake and online while you’re using it remotely.",
        ],
      },
      {
        id: "reviewable-results",
        title: "Open the files and see how it went",
        paragraphs: [
          "See which files the agent changed, which commands it ran and whether the result matches your request. If something needs another pass, continue the conversation.",
        ],
        links: [
          {
            title: "Start your first task",
            page: "/docs/first-task",
          },
        ],
      },
    ],
    faq: [
      {
        question: "Does ClawMuse include AI models?",
        answer:
          "No. Use an agent you have installed and signed in to. Its provider bills for model access.",
      },
    ],
    related: ["/blog/from-idea-to-result", "/docs/first-task", "/learn/own-computer-ai-agents"],
  },
  "/blog/from-idea-to-result": {
    updated: "2026-10-29",
    title: "Organize your reading notes from your phone",
    description: "A reading-notes example: explain the task, follow progress and check the result.",
    category: "Using ClawMuse",
    lead: "Your notes keep growing, but finding a topic takes too long. Ask an agent on your computer to build an index, then follow up from your phone.",
    takeaway: "Specify the files and the result you want, then open the output and check it.",
    sections: [
      {
        id: "capture",
        title: "Show it what to organize",
        paragraphs: [
          "Open the workspace for your notes folder and send: “Organize these reading notes into a topic index with links to the originals. Show me the proposed groups first.” Have the agent read a few samples to confirm it can handle the files.",
        ],
      },
      {
        id: "scope",
        title: "Check the plan before it starts",
        paragraphs: [
          "Review the groups, then add: “Keep the original notes. Save the index as a new Markdown file. Include each note once, flag uncertain categories and list any files you can’t read.”",
        ],
      },
      {
        id: "follow-up",
        title: "Check progress from your phone",
        paragraphs: [
          "Leave the computer awake and online while the agent works. You can do something else and return to the same conversation later to see progress, answer questions or adjust the request.",
        ],
      },
      {
        id: "inspect",
        title: "Open the index and try the links",
        paragraphs: [
          "Open the output and check a few categories and links. Give specific corrections, such as “This is a design note; move it to the design group.” Keep the index when you’re happy with it and ask for an update when you add more notes.",
        ],
        links: [
          {
            title: "Start your first task",
            page: "/docs/first-task",
          },
          {
            title: "Set up dictation",
            page: "/docs/voice",
          },
        ],
      },
    ],
    faq: [
      {
        question: "Does this need Goals?",
        answer:
          "No. An ordinary conversation is enough. The agent needs to be able to read your note files.",
      },
    ],
    related: ["/blog/why-clawmuse", "/docs/workflows", "/docs/goals-status"],
  },
};
