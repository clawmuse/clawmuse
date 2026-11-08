interface StepCopy {
  title: string;
  description: string;
  action: string;
}

/**
 * `ready` is pluralized. The bare key is the fallback the key-parity test anchors plural
 * variants to; `few`/`many` exist for languages such as Russian.
 */
interface CountedStepCopy extends StepCopy {
  ready: string;
  ready_one: string;
  ready_few?: string;
  ready_many?: string;
  ready_other: string;
}

export interface OpenProjectOnboardingResources {
  title: string;
  subtitle: string;
  heading: string;
  progress: string;
  done: string;
  steps: { providers: CountedStepCopy; project: CountedStepCopy; task: StepCopy };
  import: StepCopy;
  shortcuts: { label: string; newWorkspace: string; search: string };
}

const english: OpenProjectOnboardingResources = {
  title: "Welcome to ClawMuse",
  subtitle:
    "Run AI coding agents on your own computer and check in from your phone or desktop. These steps get you started.",
  heading: "Get started",
  progress: "{{done}} of {{total}} done",
  done: "Done",
  steps: {
    providers: {
      title: "Connect an agent",
      description:
        "ClawMuse runs the Claude Code, Codex and other agents installed on this computer",
      ready_one: "{{count}} agent ready",
      ready: "{{count}} agents ready",
      ready_other: "{{count}} agents ready",
      action: "Set up",
    },
    project: {
      title: "Add a project",
      description: "Pick a code folder. Agents work inside it",
      ready_one: "{{count}} project added",
      ready: "{{count}} projects added",
      ready_other: "{{count}} projects added",
      action: "Add project",
    },
    task: {
      title: "Start your first task",
      description: "Create a workspace and tell the agent what to do in one sentence",
      action: "New workspace",
    },
  },
  import: {
    title: "Already using Claude Code or Codex in a terminal?",
    description: "Import a recent session and keep going here",
    action: "Import",
  },
  shortcuts: {
    label: "Shortcuts",
    newWorkspace: "New workspace",
    search: "Search",
  },
};

const zhCN: OpenProjectOnboardingResources = {
  title: "欢迎使用 ClawMuse",
  subtitle: "让 AI 编程 agent 在你自己的电脑上工作，手机和电脑随时查看。跟着下面几步开始。",
  heading: "开始使用",
  progress: "已完成 {{done}}/{{total}}",
  done: "已完成",
  steps: {
    providers: {
      title: "连接 agent",
      description: "ClawMuse 会调用这台电脑上已安装的 Claude Code、Codex 等",
      ready_one: "{{count}} 个 agent 可用",
      ready: "{{count}} 个 agent 可用",
      ready_other: "{{count}} 个 agent 可用",
      action: "设置",
    },
    project: {
      title: "添加 project",
      description: "选一个代码文件夹，agent 会在里面工作",
      ready_one: "已添加 {{count}} 个 project",
      ready: "已添加 {{count}} 个 project",
      ready_other: "已添加 {{count}} 个 project",
      action: "添加 project",
    },
    task: {
      title: "开始第一个任务",
      description: "新建 workspace，一句话告诉 agent 要做什么",
      action: "新建 workspace",
    },
  },
  import: {
    title: "已经在终端里用过 Claude Code 或 Codex？",
    description: "把最近的会话导入进来，接着在这里继续",
    action: "导入",
  },
  shortcuts: {
    label: "快捷键",
    newWorkspace: "新建 workspace",
    search: "搜索",
  },
};

const ja: OpenProjectOnboardingResources = {
  title: "ClawMuse へようこそ",
  subtitle:
    "AI コーディングエージェントを自分のコンピューターで動かし、スマホやデスクトップから確認できます。次の手順で始めましょう。",
  heading: "はじめに",
  progress: "{{total}} 件中 {{done}} 件完了",
  done: "完了",
  steps: {
    providers: {
      title: "エージェントを接続",
      description: "このコンピューターにインストールされた Claude Code や Codex などを使います",
      ready_one: "{{count}} 個のエージェントが利用可能",
      ready: "{{count}} 個のエージェントが利用可能",
      ready_other: "{{count}} 個のエージェントが利用可能",
      action: "設定",
    },
    project: {
      title: "プロジェクトを追加",
      description: "コードのフォルダーを選びます。エージェントはその中で作業します",
      ready_one: "{{count}} 件のプロジェクトを追加済み",
      ready: "{{count}} 件のプロジェクトを追加済み",
      ready_other: "{{count}} 件のプロジェクトを追加済み",
      action: "プロジェクトを追加",
    },
    task: {
      title: "最初のタスクを始める",
      description: "ワークスペースを作り、やってほしいことを一文で伝えます",
      action: "新しいワークスペース",
    },
  },
  import: {
    title: "ターミナルで Claude Code や Codex を使っていますか？",
    description: "最近のセッションを取り込んで、ここで続けられます",
    action: "インポート",
  },
  shortcuts: {
    label: "ショートカット",
    newWorkspace: "新しいワークスペース",
    search: "検索",
  },
};

const ko: OpenProjectOnboardingResources = {
  title: "ClawMuse에 오신 것을 환영합니다",
  subtitle:
    "AI 코딩 에이전트를 내 컴퓨터에서 실행하고 휴대폰이나 데스크톱에서 확인하세요. 아래 단계로 시작하세요.",
  heading: "시작하기",
  progress: "{{total}}개 중 {{done}}개 완료",
  done: "완료",
  steps: {
    providers: {
      title: "에이전트 연결",
      description: "이 컴퓨터에 설치된 Claude Code, Codex 등을 사용합니다",
      ready_one: "에이전트 {{count}}개 사용 가능",
      ready: "에이전트 {{count}}개 사용 가능",
      ready_other: "에이전트 {{count}}개 사용 가능",
      action: "설정",
    },
    project: {
      title: "프로젝트 추가",
      description: "코드 폴더를 선택하세요. 에이전트가 그 안에서 작업합니다",
      ready_one: "프로젝트 {{count}}개 추가됨",
      ready: "프로젝트 {{count}}개 추가됨",
      ready_other: "프로젝트 {{count}}개 추가됨",
      action: "프로젝트 추가",
    },
    task: {
      title: "첫 작업 시작",
      description: "워크스페이스를 만들고 할 일을 한 문장으로 알려 주세요",
      action: "새 워크스페이스",
    },
  },
  import: {
    title: "터미널에서 Claude Code나 Codex를 쓰고 있나요?",
    description: "최근 세션을 가져와 여기서 이어서 작업하세요",
    action: "가져오기",
  },
  shortcuts: {
    label: "단축키",
    newWorkspace: "새 워크스페이스",
    search: "검색",
  },
};

const es: OpenProjectOnboardingResources = {
  title: "Te damos la bienvenida a ClawMuse",
  subtitle:
    "Ejecuta agentes de programación con IA en tu propio ordenador y revísalos desde el móvil o el escritorio. Empieza con estos pasos.",
  heading: "Primeros pasos",
  progress: "{{done}} de {{total}} completados",
  done: "Hecho",
  steps: {
    providers: {
      title: "Conecta un agente",
      description: "ClawMuse usa Claude Code, Codex y otros agentes instalados en este ordenador",
      ready_one: "{{count}} agente listo",
      ready: "{{count}} agentes listos",
      ready_other: "{{count}} agentes listos",
      action: "Configurar",
    },
    project: {
      title: "Añade un proyecto",
      description: "Elige una carpeta de código. Los agentes trabajan dentro de ella",
      ready_one: "{{count}} proyecto añadido",
      ready: "{{count}} proyectos añadidos",
      ready_other: "{{count}} proyectos añadidos",
      action: "Añadir proyecto",
    },
    task: {
      title: "Empieza tu primera tarea",
      description: "Crea un workspace y dile al agente qué hacer en una frase",
      action: "Nuevo workspace",
    },
  },
  import: {
    title: "¿Ya usas Claude Code o Codex en una terminal?",
    description: "Importa una sesión reciente y continúa aquí",
    action: "Importar",
  },
  shortcuts: {
    label: "Atajos",
    newWorkspace: "Nuevo workspace",
    search: "Buscar",
  },
};

const fr: OpenProjectOnboardingResources = {
  title: "Bienvenue dans ClawMuse",
  subtitle:
    "Faites travailler des agents de code IA sur votre propre ordinateur et suivez-les depuis votre téléphone ou votre bureau. Commencez par ces étapes.",
  heading: "Premiers pas",
  progress: "{{done}} sur {{total}} terminées",
  done: "Terminé",
  steps: {
    providers: {
      title: "Connecter un agent",
      description:
        "ClawMuse utilise Claude Code, Codex et les autres agents installés sur cet ordinateur",
      ready_one: "{{count}} agent prêt",
      ready: "{{count}} agents prêts",
      ready_other: "{{count}} agents prêts",
      action: "Configurer",
    },
    project: {
      title: "Ajouter un projet",
      description: "Choisissez un dossier de code. Les agents travaillent à l'intérieur",
      ready_one: "{{count}} projet ajouté",
      ready: "{{count}} projets ajoutés",
      ready_other: "{{count}} projets ajoutés",
      action: "Ajouter un projet",
    },
    task: {
      title: "Lancer votre première tâche",
      description: "Créez un workspace et dites à l'agent quoi faire en une phrase",
      action: "Nouveau workspace",
    },
  },
  import: {
    title: "Vous utilisez déjà Claude Code ou Codex dans un terminal ?",
    description: "Importez une session récente et continuez ici",
    action: "Importer",
  },
  shortcuts: {
    label: "Raccourcis",
    newWorkspace: "Nouveau workspace",
    search: "Rechercher",
  },
};

const ptBR: OpenProjectOnboardingResources = {
  title: "Boas-vindas ao ClawMuse",
  subtitle:
    "Execute agentes de programação com IA no seu próprio computador e acompanhe pelo celular ou desktop. Comece com estes passos.",
  heading: "Primeiros passos",
  progress: "{{done}} de {{total}} concluídos",
  done: "Concluído",
  steps: {
    providers: {
      title: "Conecte um agente",
      description: "O ClawMuse usa Claude Code, Codex e outros agentes instalados neste computador",
      ready_one: "{{count}} agente pronto",
      ready: "{{count}} agentes prontos",
      ready_other: "{{count}} agentes prontos",
      action: "Configurar",
    },
    project: {
      title: "Adicione um projeto",
      description: "Escolha uma pasta de código. Os agentes trabalham dentro dela",
      ready_one: "{{count}} projeto adicionado",
      ready: "{{count}} projetos adicionados",
      ready_other: "{{count}} projetos adicionados",
      action: "Adicionar projeto",
    },
    task: {
      title: "Comece sua primeira tarefa",
      description: "Crie um workspace e diga ao agente o que fazer em uma frase",
      action: "Novo workspace",
    },
  },
  import: {
    title: "Já usa Claude Code ou Codex em um terminal?",
    description: "Importe uma sessão recente e continue aqui",
    action: "Importar",
  },
  shortcuts: {
    label: "Atalhos",
    newWorkspace: "Novo workspace",
    search: "Buscar",
  },
};

const ru: OpenProjectOnboardingResources = {
  title: "Добро пожаловать в ClawMuse",
  subtitle:
    "Запускайте ИИ-агентов для программирования на своём компьютере и следите за ними с телефона или компьютера. Начните с этих шагов.",
  heading: "Начало работы",
  progress: "Готово {{done}} из {{total}}",
  done: "Готово",
  steps: {
    providers: {
      title: "Подключите агента",
      description:
        "ClawMuse использует Claude Code, Codex и других агентов, установленных на этом компьютере",
      ready_one: "Доступен {{count}} агент",
      ready_few: "Доступно {{count}} агента",
      ready_many: "Доступно {{count}} агентов",
      ready: "Доступно {{count}} агентов",
      ready_other: "Доступно {{count}} агентов",
      action: "Настроить",
    },
    project: {
      title: "Добавьте проект",
      description: "Выберите папку с кодом. Агенты работают внутри неё",
      ready_one: "Добавлен {{count}} проект",
      ready_few: "Добавлено {{count}} проекта",
      ready_many: "Добавлено {{count}} проектов",
      ready: "Добавлено {{count}} проектов",
      ready_other: "Добавлено {{count}} проектов",
      action: "Добавить проект",
    },
    task: {
      title: "Начните первую задачу",
      description: "Создайте workspace и одной фразой скажите агенту, что сделать",
      action: "Новый workspace",
    },
  },
  import: {
    title: "Уже пользуетесь Claude Code или Codex в терминале?",
    description: "Импортируйте недавнюю сессию и продолжите здесь",
    action: "Импортировать",
  },
  shortcuts: {
    label: "Горячие клавиши",
    newWorkspace: "Новый workspace",
    search: "Поиск",
  },
};

const ar: OpenProjectOnboardingResources = {
  title: "مرحبًا بك في ClawMuse",
  subtitle:
    "شغّل وكلاء البرمجة بالذكاء الاصطناعي على جهازك وتابعهم من هاتفك أو حاسوبك. ابدأ بهذه الخطوات.",
  heading: "البدء",
  progress: "اكتمل {{done}} من {{total}}",
  done: "تم",
  steps: {
    providers: {
      title: "اربط وكيلًا",
      description: "يستخدم ClawMuse ‏Claude Code وCodex وغيرها من الوكلاء المثبتة على هذا الجهاز",
      ready_one: "{{count}} وكيل جاهز",
      ready: "{{count}} وكلاء جاهزون",
      ready_other: "{{count}} وكلاء جاهزون",
      action: "إعداد",
    },
    project: {
      title: "أضف مشروعًا",
      description: "اختر مجلد شيفرة. يعمل الوكلاء داخله",
      ready_one: "أُضيف {{count}} مشروع",
      ready: "أُضيف {{count}} مشاريع",
      ready_other: "أُضيف {{count}} مشاريع",
      action: "إضافة مشروع",
    },
    task: {
      title: "ابدأ مهمتك الأولى",
      description: "أنشئ workspace وأخبر الوكيل بما يجب فعله في جملة واحدة",
      action: "workspace جديد",
    },
  },
  import: {
    title: "هل تستخدم Claude Code أو Codex في الطرفية؟",
    description: "استورد جلسة حديثة وتابع العمل هنا",
    action: "استيراد",
  },
  shortcuts: {
    label: "الاختصارات",
    newWorkspace: "workspace جديد",
    search: "بحث",
  },
};

export const openProjectOnboarding = {
  en: english,
  "zh-CN": zhCN,
  ja,
  ko,
  es,
  fr,
  "pt-BR": ptBR,
  ru,
  ar,
} satisfies Record<string, OpenProjectOnboardingResources>;
