import type { Language } from "./i18n/locales";

export interface SeoEntry {
  title: string;
  description: string;
}

export const seoPages = [
  "/",
  "/product",
  "/download",
  "/docs",
  "/docs/linux",
  "/security",
  "/pricing",
  "/about",
  "/changelog",
  "/support",
] as const;
export type SeoPage = (typeof seoPages)[number];

export function isSeoPage(page: string): page is SeoPage {
  return seoPages.some((item) => item === page);
}

// Full document titles for search results. On-page headings and navigation keep their own labels.
// Lead with what people search for; the brand goes last unless the page is about ClawMuse itself.
export const seoCopy: Record<Language, Record<SeoPage, SeoEntry>> = {
  en: {
    "/": {
      title: "Use Claude Code and Codex from your phone or browser — ClawMuse",
      description:
        "Away from your computer? Use Claude Code, Codex and other AI coding agents on your own computer from your phone or the web, with the models you choose. Open source.",
    },
    "/product": {
      title: "Manage AI coding agents from your phone or browser — ClawMuse",
      description:
        "Pick Claude Code, Codex or another AI coding agent for each task, send instructions, review file changes and pick up the work on any device. Try the browser demo.",
    },
    "/download": {
      title: "Download ClawMuse for Windows, macOS, Linux, iOS and Android",
      description:
        "Download ClawMuse for Windows, macOS, Linux, iOS and Android. Install it on your computer, then connect your phone to use your AI coding agents anywhere.",
    },
    "/docs": {
      title: "Reach AI agents on your computer from phone or web — ClawMuse",
      description:
        "Install ClawMuse, sign in and connect your phone to Claude Code, Codex or another agent on your computer, then start your first task.",
    },
    "/docs/linux": {
      title: "Run AI coding agents on a Linux server — ClawMuse",
      description:
        "Set up ClawMuse on a headless Linux server: install it, run the background service, add your agents and connect from your phone or a browser.",
    },
    "/security": {
      title: "ClawMuse security: encrypted connections, where your code stays",
      description:
        "How ClawMuse protects remote access to your AI agents: end-to-end encrypted relay connections, device pairing, host permissions and what model providers receive.",
    },
    "/pricing": {
      title: "Is ClawMuse open source? Plans and costs",
      description:
        "ClawMuse is open source under the Apache-2.0 license, with the code on GitHub. Model subscriptions, API usage and cloud speech are billed separately by their providers.",
    },
    "/about": {
      title: "About ClawMuse: an open-source workspace for AI coding agents",
      description:
        "Why we built ClawMuse: a personal workspace where you choose your AI coding agents, keep projects on your own computers and work across devices.",
    },
    "/changelog": {
      title: "ClawMuse changelog: new features and updates",
      description:
        "See what’s new in ClawMuse, including voice control, regional relay connections, streamed responses and the cross-device workspace.",
    },
    "/support": {
      title: "ClawMuse help: device, sign-in and connection issues",
      description:
        "Get help with ClawMuse setup, offline devices, sign-in and connection issues, and agent workflows. Find the guides and what to include in a support request.",
    },
  },
  "zh-CN": {
    "/": {
      title: "在手机和网页上用 Claude Code、Codex — ClawMuse",
      description:
        "不在电脑前，也能用手机或网页操作自己电脑上的 Claude Code、Codex 等 AI 编程工具：派任务、看改动、语音跟进。模型随你选，代码开源。",
    },
    "/product": {
      title: "用手机和网页管理 AI 编程 Agent — ClawMuse",
      description:
        "按任务选用 Claude Code、Codex 等 AI 编程工具，在手机上发指令、看文件改动，换台设备接着做。打开网页演示就能体验。",
    },
    "/download": {
      title: "下载 ClawMuse：Windows、macOS、Linux、iOS、Android",
      description:
        "下载适用于 Windows、macOS、Linux、iOS 和 Android 的 ClawMuse。在电脑上安装，再连接手机，随时使用你的 AI 编程工具。",
    },
    "/docs": {
      title: "怎么用手机和网页连接电脑上的 AI Agent — ClawMuse",
      description:
        "安装 ClawMuse，登录账号，把手机连到电脑上的 Claude Code、Codex 等工具，开始第一个任务。",
    },
    "/docs/linux": {
      title: "在 Linux 服务器上运行 AI Agent，手机远程使用 — ClawMuse",
      description:
        "在无桌面的 Linux 服务器上安装 ClawMuse：运行后台服务、添加 Agent，再从手机或浏览器连接。",
    },
    "/security": {
      title: "ClawMuse 安全吗：连接加密、代码留在哪里",
      description:
        "了解 ClawMuse 怎么保护远程访问：端到端加密的中继连接、设备授权、电脑权限，以及哪些内容会发给模型服务商。",
    },
    "/pricing": {
      title: "ClawMuse 开源吗？方案与费用说明",
      description:
        "ClawMuse 代码开源，以 Apache-2.0 许可在 GitHub 公开。模型订阅、API 用量和云端语音费用由各服务商另收。",
    },
    "/about": {
      title: "关于 ClawMuse：开源的 AI 编程 Agent 工作台",
      description:
        "为什么做 ClawMuse：让你自己选 AI 编程工具，项目留在自己的电脑上，在不同设备之间接着工作。",
    },
    "/changelog": {
      title: "ClawMuse 更新日志：新功能与改进",
      description: "查看 ClawMuse 的最新更新，包括语音交互、区域中继连接、流式回复和跨设备工作区。",
    },
    "/support": {
      title: "ClawMuse 帮助中心：设备离线、登录和连接问题",
      description: "查找 ClawMuse 安装指南，排查设备离线、登录和连接问题，联系支持。",
    },
  },
  "zh-TW": {
    "/": {
      title: "在手機和網頁上用 Claude Code、Codex — ClawMuse",
      description:
        "不在電腦前，也能用手機或網頁操作自己電腦上的 Claude Code、Codex 等 AI 工具：指派任務、查看變更、透過語音助理跟進。模型隨你選，程式碼開源。",
    },
    "/product": {
      title: "用手機和網頁管理 AI 程式開發 Agent — ClawMuse",
      description:
        "依任務選用 Claude Code、Codex 等 AI 工具，在手機上下指令、查看檔案變更，換台裝置繼續做。開啟網頁示範就能體驗。",
    },
    "/download": {
      title: "下載 ClawMuse：Windows、macOS、Linux、iOS、Android",
      description:
        "下載適用於 Windows、macOS、Linux、iOS 和 Android 的 ClawMuse。在電腦上安裝，再連接手機，隨時使用你的 AI 工具。",
    },
    "/docs": {
      title: "如何用手機和網頁連接電腦上的 AI Agent — ClawMuse",
      description:
        "安裝 ClawMuse、登入帳號，把手機連到電腦上的 Claude Code、Codex 等工具，開始第一個任務。",
    },
    "/docs/linux": {
      title: "在 Linux 伺服器上執行 AI Agent，用手機遠端使用 — ClawMuse",
      description:
        "在無桌面的 Linux 伺服器上安裝 ClawMuse：執行背景服務、新增 Agent，再從手機或瀏覽器連線。",
    },
    "/security": {
      title: "ClawMuse 安全嗎：連線加密、程式碼留在哪裡",
      description:
        "了解 ClawMuse 如何保護遠端存取：端對端加密的中繼連線、裝置授權、電腦權限，以及哪些內容會傳給模型服務商。",
    },
    "/pricing": {
      title: "ClawMuse 開源嗎？方案與費用說明",
      description:
        "ClawMuse 程式碼開源，以 Apache-2.0 授權在 GitHub 公開。模型訂閱、API 用量和雲端語音費用由各服務商另行收取。",
    },
    "/about": {
      title: "關於 ClawMuse：開源的 AI 程式開發 Agent 工作台",
      description:
        "為什麼做 ClawMuse：讓你自己選 AI 工具，專案留在自己的電腦上，在不同裝置之間接著工作。",
    },
    "/changelog": {
      title: "ClawMuse 更新日誌：新功能與改進",
      description: "查看 ClawMuse 的最新更新，包括語音互動、區域中繼連線、串流回覆和跨裝置工作區。",
    },
    "/support": {
      title: "ClawMuse 說明中心：裝置離線、登入和連線問題",
      description: "查找 ClawMuse 安裝指南，排除裝置離線、登入和連線問題，或聯絡支援。",
    },
  },
  ja: {
    "/": {
      title: "スマホとブラウザで Claude Code と Codex を使う — ClawMuse",
      description:
        "外出先でも、スマホやブラウザから自分のパソコンの Claude Code や Codex などの AI コーディングツールを使えます。モデルは自由に選べて、オープンソースです。",
    },
    "/product": {
      title: "スマホとブラウザで AI エージェントを管理 — ClawMuse",
      description:
        "タスクごとに Claude Code や Codex などを選び、スマホから指示を出してファイルの変更を確認し、別のデバイスで続きができます。ブラウザのデモで試せます。",
    },
    "/download": {
      title: "ClawMuse をダウンロード：Windows、macOS、Linux、iOS、Android",
      description:
        "Windows、macOS、Linux、iOS、Android 向けの ClawMuse をダウンロード。パソコンにインストールしてスマホを接続すれば、どこからでも AI ツールを使えます。",
    },
    "/docs": {
      title: "スマホからパソコンの AI エージェントに接続する方法 — ClawMuse",
      description:
        "ClawMuse をインストールしてサインインし、パソコンの Claude Code や Codex などにスマホを接続して、最初のタスクを始めましょう。",
    },
    "/docs/linux": {
      title: "Linux サーバーで AI エージェントを動かしスマホから使う — ClawMuse",
      description:
        "デスクトップのない Linux サーバーに ClawMuse をセットアップ。バックグラウンドサービスを動かし、エージェントを追加して、スマホやブラウザから接続します。",
    },
    "/security": {
      title: "ClawMuse のセキュリティ：暗号化された接続とコードの保存場所",
      description:
        "ClawMuse がリモートアクセスを守る仕組みを説明します。エンドツーエンド暗号化の中継接続、デバイス認証、パソコンの権限、モデル提供元に送られる内容がわかります。",
    },
    "/pricing": {
      title: "ClawMuse はオープンソース？プランと費用",
      description:
        "ClawMuse は Apache-2.0 ライセンスのオープンソースで、コードは GitHub で公開しています。モデルのサブスクリプション、API 利用料、クラウド音声の料金は各提供元が請求します。",
    },
    "/about": {
      title: "ClawMuse について：AI コーディングエージェントのオープンソース作業環境",
      description:
        "ClawMuse を作った理由。AI ツールを自分で選び、プロジェクトは自分のパソコンに置いたまま、デバイスをまたいで作業できます。",
    },
    "/changelog": {
      title: "ClawMuse 更新履歴：新機能と改善",
      description:
        "ClawMuse の最新情報を確認できます。音声操作、地域別の中継接続、ストリーミング応答、デバイス間のワークスペースなど。",
    },
    "/support": {
      title: "ClawMuse ヘルプ：デバイス、サインイン、接続の問題",
      description:
        "ClawMuse のセットアップ、オフラインのデバイス、サインインや接続の問題を解決するガイドと、サポートへの問い合わせ方法を紹介します。",
    },
  },
  ko: {
    "/": {
      title: "휴대폰과 웹에서 Claude Code와 Codex 사용하기 — ClawMuse",
      description:
        "밖에서도 휴대폰이나 웹으로 내 컴퓨터의 Claude Code, Codex 등 AI 코딩 도구를 사용하세요. 모델은 자유롭게 고를 수 있고, 오픈 소스입니다.",
    },
    "/product": {
      title: "휴대폰과 웹으로 AI 코딩 에이전트 관리하기 — ClawMuse",
      description:
        "작업마다 Claude Code, Codex 등을 골라 휴대폰에서 지시하고 파일 변경 사항을 확인한 뒤 다른 기기에서 이어서 작업하세요. 브라우저 데모로 체험할 수 있습니다.",
    },
    "/download": {
      title: "ClawMuse 다운로드: Windows, macOS, Linux, iOS, Android",
      description:
        "Windows, macOS, Linux, iOS, Android용 ClawMuse를 다운로드하세요. 컴퓨터에 설치하고 휴대폰을 연결하면 어디서나 AI 도구를 쓸 수 있습니다.",
    },
    "/docs": {
      title: "휴대폰을 컴퓨터의 AI 에이전트에 연결하는 방법 — ClawMuse",
      description:
        "ClawMuse를 설치하고 로그인한 뒤 컴퓨터의 Claude Code, Codex 등에 휴대폰을 연결해 첫 작업을 시작하세요.",
    },
    "/docs/linux": {
      title: "Linux 서버에서 AI 에이전트를 실행하고 휴대폰으로 사용하기 — ClawMuse",
      description:
        "데스크톱이 없는 Linux 서버에 ClawMuse를 설정하세요. 백그라운드 서비스를 실행하고 에이전트를 추가한 뒤 휴대폰이나 브라우저에서 연결합니다.",
    },
    "/security": {
      title: "ClawMuse 보안: 암호화된 연결과 코드 보관 위치",
      description:
        "ClawMuse가 원격 접속을 보호하는 방식을 알아보세요. 종단 간 암호화 릴레이 연결, 기기 인증, 컴퓨터 권한, 모델 제공업체로 전송되는 내용을 설명합니다.",
    },
    "/pricing": {
      title: "ClawMuse는 오픈 소스인가요? 요금제와 비용",
      description:
        "ClawMuse는 Apache-2.0 라이선스의 오픈 소스이며 코드는 GitHub에 공개되어 있습니다. 모델 구독, API 사용량, 클라우드 음성 비용은 각 제공업체가 별도로 청구합니다.",
    },
    "/about": {
      title: "ClawMuse 소개: AI 코딩 에이전트를 위한 오픈 소스 작업 공간",
      description:
        "ClawMuse를 만든 이유입니다. AI 도구를 직접 고르고, 프로젝트는 내 컴퓨터에 두고, 여러 기기에서 이어서 작업할 수 있습니다.",
    },
    "/changelog": {
      title: "ClawMuse 변경 내역: 새 기능과 개선 사항",
      description:
        "음성 조작, 지역별 릴레이 연결, 스트리밍 응답, 기기 간 작업 공간 등 ClawMuse의 최신 소식을 확인하세요.",
    },
    "/support": {
      title: "ClawMuse 도움말: 기기, 로그인, 연결 문제",
      description:
        "ClawMuse 설치, 오프라인 기기, 로그인과 연결 문제를 해결하는 가이드를 찾고 지원팀에 문의하세요.",
    },
  },
  es: {
    "/": {
      title: "Usa Claude Code y Codex desde el móvil o la web — ClawMuse",
      description:
        "¿Lejos del ordenador? Usa Claude Code, Codex y otros agentes de IA de tu propio ordenador desde el móvil o la web, con los modelos que elijas. Código abierto.",
    },
    "/product": {
      title: "Gestiona agentes de IA desde el móvil o la web — ClawMuse",
      description:
        "Elige Claude Code, Codex u otro agente para cada tarea, da instrucciones, revisa los cambios en los archivos y continúa en cualquier dispositivo. Prueba la demo en el navegador.",
    },
    "/download": {
      title: "Descarga ClawMuse para Windows, macOS, Linux, iOS y Android",
      description:
        "Descarga ClawMuse para Windows, macOS, Linux, iOS y Android. Instálalo en tu ordenador y conecta el móvil para usar tus herramientas de IA desde cualquier lugar.",
    },
    "/docs": {
      title: "Cómo conectar el móvil a los agentes de IA de tu ordenador — ClawMuse",
      description:
        "Instala ClawMuse, inicia sesión y conecta el móvil a Claude Code, Codex u otro agente de tu ordenador para empezar tu primera tarea.",
    },
    "/docs/linux": {
      title: "Agentes de IA en un servidor Linux desde el móvil — ClawMuse",
      description:
        "Configura ClawMuse en un servidor Linux sin escritorio: inicia el servicio en segundo plano, añade tus agentes y conéctate desde el móvil o el navegador.",
    },
    "/security": {
      title: "Seguridad de ClawMuse: conexiones cifradas y dónde queda tu código",
      description:
        "Cómo protege ClawMuse el acceso remoto: conexiones de retransmisión cifradas de extremo a extremo, emparejamiento de dispositivos, permisos del ordenador y qué reciben los proveedores de modelos.",
    },
    "/pricing": {
      title: "¿ClawMuse es de código abierto? Planes y costes",
      description:
        "ClawMuse es de código abierto con licencia Apache-2.0 y su código está en GitHub. Las suscripciones a modelos, el uso de API y la voz en la nube los cobra cada proveedor.",
    },
    "/about": {
      title: "Sobre ClawMuse: espacio de trabajo de código abierto para agentes de IA",
      description:
        "Por qué creamos ClawMuse: tú eliges tus herramientas de IA, mantienes los proyectos en tu ordenador y trabajas desde cualquier dispositivo.",
    },
    "/changelog": {
      title: "Novedades de ClawMuse: nuevas funciones y mejoras",
      description:
        "Consulta las novedades de ClawMuse: control por voz, conexiones de retransmisión regionales, respuestas en streaming y el espacio de trabajo entre dispositivos.",
    },
    "/support": {
      title: "Ayuda de ClawMuse: dispositivos, inicio de sesión y conexión",
      description:
        "Encuentra guías de instalación de ClawMuse, soluciona dispositivos sin conexión y problemas de inicio de sesión o conexión, y contacta con soporte.",
    },
  },
  fr: {
    "/": {
      title: "Claude Code et Codex sur téléphone et sur le web — ClawMuse",
      description:
        "Loin de votre ordinateur ? Utilisez Claude Code, Codex et d’autres agents IA de votre ordinateur depuis votre téléphone ou le web, avec vos modèles. Open source.",
    },
    "/product": {
      title: "Gérez vos agents IA depuis le téléphone ou le web — ClawMuse",
      description:
        "Choisissez Claude Code, Codex ou un autre agent pour chaque tâche, donnez vos instructions, vérifiez les fichiers modifiés et continuez sur n’importe quel appareil. Essayez la démo dans le navigateur.",
    },
    "/download": {
      title: "Télécharger ClawMuse pour Windows, macOS, Linux, iOS et Android",
      description:
        "Téléchargez ClawMuse pour Windows, macOS, Linux, iOS et Android. Installez-le sur votre ordinateur, puis connectez votre téléphone pour utiliser vos outils IA partout.",
    },
    "/docs": {
      title: "Connecter votre téléphone aux agents IA de votre ordinateur — ClawMuse",
      description:
        "Installez ClawMuse, connectez-vous et reliez votre téléphone à Claude Code, Codex ou un autre agent sur votre ordinateur pour lancer votre première tâche.",
    },
    "/docs/linux": {
      title: "Agents IA sur un serveur Linux, depuis le téléphone — ClawMuse",
      description:
        "Installez ClawMuse sur un serveur Linux sans bureau : lancez le service en arrière-plan, ajoutez vos agents et connectez-vous depuis un téléphone ou un navigateur.",
    },
    "/security": {
      title: "Sécurité ClawMuse : connexions chiffrées et lieu de votre code",
      description:
        "Comment ClawMuse protège l’accès à distance : connexions relais chiffrées de bout en bout, appairage des appareils, permissions de l’ordinateur et données reçues par les fournisseurs de modèles.",
    },
    "/pricing": {
      title: "ClawMuse est-il open source ? Offres et coûts",
      description:
        "ClawMuse est open source sous licence Apache-2.0, avec le code sur GitHub. Les abonnements aux modèles, l’usage des API et la voix dans le cloud sont facturés par chaque fournisseur.",
    },
    "/about": {
      title: "À propos de ClawMuse : un espace de travail open source pour agents IA",
      description:
        "Pourquoi nous avons créé ClawMuse : choisir vos outils IA, garder vos projets sur vos ordinateurs et travailler d’un appareil à l’autre.",
    },
    "/changelog": {
      title: "Journal des modifications de ClawMuse : nouveautés et améliorations",
      description:
        "Découvrez les nouveautés de ClawMuse : commande vocale, connexions relais régionales, réponses en continu et espace de travail multi-appareils.",
    },
    "/support": {
      title: "Aide ClawMuse : problèmes d’appareil, de connexion et de compte",
      description:
        "Trouvez les guides d’installation de ClawMuse, résolvez les problèmes d’appareils hors ligne, de compte et de connexion, ou contactez l’assistance.",
    },
  },
  "pt-BR": {
    "/": {
      title: "Use Claude Code e Codex pelo celular ou pela web — ClawMuse",
      description:
        "Longe do computador? Use Claude Code, Codex e outros agentes de IA do seu computador pelo celular ou pela web, com os modelos que escolher. Código aberto.",
    },
    "/product": {
      title: "Gerencie agentes de IA pelo celular ou pela web — ClawMuse",
      description:
        "Escolha Claude Code, Codex ou outro agente para cada tarefa, dê instruções, revise as alterações nos arquivos e continue em qualquer dispositivo. Experimente a demonstração no navegador.",
    },
    "/download": {
      title: "Baixe o ClawMuse para Windows, macOS, Linux, iOS e Android",
      description:
        "Baixe o ClawMuse para Windows, macOS, Linux, iOS e Android. Instale no computador e conecte o celular para usar suas ferramentas de IA de qualquer lugar.",
    },
    "/docs": {
      title: "Como conectar o celular aos agentes de IA do computador — ClawMuse",
      description:
        "Instale o ClawMuse, entre na conta e conecte o celular ao Claude Code, Codex ou outro agente do seu computador para começar a primeira tarefa.",
    },
    "/docs/linux": {
      title: "Rode agentes de IA em um servidor Linux e use pelo celular — ClawMuse",
      description:
        "Configure o ClawMuse em um servidor Linux sem desktop: inicie o serviço em segundo plano, adicione seus agentes e conecte pelo celular ou navegador.",
    },
    "/security": {
      title: "Segurança do ClawMuse: conexões criptografadas e onde fica seu código",
      description:
        "Como o ClawMuse protege o acesso remoto: conexões de retransmissão com criptografia de ponta a ponta, pareamento de dispositivos, permissões do computador e o que os provedores de modelos recebem.",
    },
    "/pricing": {
      title: "O ClawMuse é de código aberto? Planos e custos",
      description:
        "O ClawMuse é de código aberto sob a licença Apache-2.0, com o código no GitHub. Assinaturas de modelos, uso de API e voz na nuvem são cobrados por cada provedor.",
    },
    "/about": {
      title: "Sobre o ClawMuse: espaço de trabalho de código aberto para agentes de IA",
      description:
        "Por que criamos o ClawMuse: você escolhe suas ferramentas de IA, mantém os projetos no seu computador e trabalha em vários dispositivos.",
    },
    "/changelog": {
      title: "Novidades do ClawMuse: novos recursos e melhorias",
      description:
        "Veja as novidades do ClawMuse: controle por voz, conexões de retransmissão regionais, respostas em streaming e o espaço de trabalho entre dispositivos.",
    },
    "/support": {
      title: "Ajuda do ClawMuse: problemas de dispositivo, login e conexão",
      description:
        "Encontre guias de instalação do ClawMuse, resolva dispositivos offline e problemas de login ou conexão, e fale com o suporte.",
    },
  },
  ru: {
    "/": {
      title: "Claude Code и Codex на телефоне и в браузере — ClawMuse",
      description:
        "Не за компьютером? Пользуйтесь Claude Code, Codex и другими ИИ-агентами на своём компьютере с телефона или в браузере, с моделями на ваш выбор. Открытый код.",
    },
    "/product": {
      title: "Управление ИИ-агентами с телефона и в браузере — ClawMuse",
      description:
        "Выбирайте Claude Code, Codex или другого агента под задачу, давайте указания, проверяйте изменения в файлах и продолжайте на любом устройстве. Попробуйте демо в браузере.",
    },
    "/download": {
      title: "Скачать ClawMuse для Windows, macOS, Linux, iOS и Android",
      description:
        "Скачайте ClawMuse для Windows, macOS, Linux, iOS и Android. Установите на компьютер и подключите телефон, чтобы пользоваться ИИ-инструментами где угодно.",
    },
    "/docs": {
      title: "Как подключить телефон к ИИ-агентам на компьютере — ClawMuse",
      description:
        "Установите ClawMuse, войдите в аккаунт и подключите телефон к Claude Code, Codex или другому агенту на компьютере, чтобы начать первую задачу.",
    },
    "/docs/linux": {
      title: "ИИ-агенты на сервере Linux с доступом с телефона — ClawMuse",
      description:
        "Настройте ClawMuse на сервере Linux без рабочего стола: запустите фоновую службу, добавьте агентов и подключитесь с телефона или из браузера.",
    },
    "/security": {
      title: "Безопасность ClawMuse: шифрование соединений и где хранится ваш код",
      description:
        "Как ClawMuse защищает удалённый доступ: ретрансляция со сквозным шифрованием, сопряжение устройств, права на компьютере и данные, которые получают поставщики моделей.",
    },
    "/pricing": {
      title: "У ClawMuse открытый исходный код? Тарифы и расходы",
      description:
        "Код ClawMuse открыт по лицензии Apache-2.0 и размещён на GitHub. Подписки на модели, использование API и облачную речь оплачивают отдельно у каждого поставщика.",
    },
    "/about": {
      title: "О ClawMuse: рабочее пространство с открытым кодом для ИИ-агентов",
      description:
        "Зачем мы создали ClawMuse: вы сами выбираете ИИ-инструменты, храните проекты на своих компьютерах и работаете на разных устройствах.",
    },
    "/changelog": {
      title: "История изменений ClawMuse: новые функции и улучшения",
      description:
        "Что нового в ClawMuse: голосовое управление, региональные ретрансляторы, потоковые ответы и рабочее пространство на разных устройствах.",
    },
    "/support": {
      title: "Справка ClawMuse: проблемы с устройствами, входом и подключением",
      description:
        "Найдите руководства по установке ClawMuse, решите проблемы с устройствами не в сети, входом и подключением или обратитесь в поддержку.",
    },
  },
  ar: {
    "/": {
      title: "استخدم Claude Code وCodex من الهاتف أو الويب — ClawMuse",
      description:
        "بعيد عن حاسوبك؟ استخدم Claude Code وCodex ووكلاء الذكاء الاصطناعي الأخرى على حاسوبك من الهاتف أو الويب، مع النماذج التي تختارها. مفتوح المصدر.",
    },
    "/product": {
      title: "إدارة وكلاء الذكاء الاصطناعي من الهاتف أو الويب — ClawMuse",
      description:
        "اختر Claude Code أو Codex أو وكيلًا آخر لكل مهمة، وأرسل التعليمات وراجع تغييرات الملفات وتابع على أي جهاز. جرّب العرض التوضيحي في المتصفح.",
    },
    "/download": {
      title: "تنزيل ClawMuse لأنظمة Windows وmacOS وLinux وiOS وAndroid",
      description:
        "نزّل ClawMuse لأنظمة Windows وmacOS وLinux وiOS وAndroid. ثبّته على حاسوبك ثم وصّل هاتفك لاستخدام أدوات الذكاء الاصطناعي من أي مكان.",
    },
    "/docs": {
      title: "كيفية توصيل هاتفك بوكلاء الذكاء الاصطناعي على حاسوبك — ClawMuse",
      description:
        "ثبّت ClawMuse وسجّل الدخول ووصّل هاتفك بـ Claude Code أو Codex أو وكيل آخر على حاسوبك لتبدأ مهمتك الأولى.",
    },
    "/docs/linux": {
      title: "وكلاء الذكاء الاصطناعي على خادم Linux من هاتفك — ClawMuse",
      description:
        "أعدّ ClawMuse على خادم Linux بدون سطح مكتب: شغّل الخدمة في الخلفية وأضف وكلاءك واتصل من الهاتف أو المتصفح.",
    },
    "/security": {
      title: "أمان ClawMuse: اتصالات مشفرة وأين تبقى شيفرتك",
      description:
        "كيف يحمي ClawMuse الوصول عن بُعد: اتصالات ترحيل مشفرة من طرف إلى طرف، وإقران الأجهزة، وأذونات الحاسوب، وما يصل إلى مزودي النماذج.",
    },
    "/pricing": {
      title: "هل ClawMuse مفتوح المصدر؟ الخطط والتكاليف",
      description:
        "ClawMuse مفتوح المصدر بترخيص Apache-2.0 وشيفرته متاحة على GitHub. يحاسبك كل مزود على حدة مقابل اشتراكات النماذج واستخدام API والصوت السحابي.",
    },
    "/about": {
      title: "عن ClawMuse: مساحة عمل مفتوحة المصدر لوكلاء الذكاء الاصطناعي",
      description:
        "لماذا أنشأنا ClawMuse: تختار أدوات الذكاء الاصطناعي بنفسك، وتبقي مشاريعك على حاسوبك، وتعمل عبر أجهزتك.",
    },
    "/changelog": {
      title: "سجل تحديثات ClawMuse: ميزات وتحسينات جديدة",
      description:
        "تعرّف على جديد ClawMuse: التحكم الصوتي، واتصالات الترحيل الإقليمية، والردود المتدفقة، ومساحة العمل عبر الأجهزة.",
    },
    "/support": {
      title: "مساعدة ClawMuse: مشكلات الأجهزة وتسجيل الدخول والاتصال",
      description:
        "اعثر على أدلة تثبيت ClawMuse، وحلّ مشكلات الأجهزة غير المتصلة وتسجيل الدخول والاتصال، أو تواصل مع الدعم.",
    },
  },
};
