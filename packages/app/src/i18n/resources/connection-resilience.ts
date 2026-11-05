const english = {
  outbox: {
    waiting: "Waiting for network…",
    failedRetry: "Failed to send. Tap to retry",
    retry: "Retry",
    edit: "Edit",
    deliveryTimedOut: "The host stayed unreachable, so this message was not sent.",
  },
  permission: {
    waiting: "Will submit when back online",
    failed: "Could not submit your response. Try again.",
  },
  banner: {
    offline: "Offline. Messages will send when you're back online",
    unstable: "Network unstable",
  },
  telemetry: {
    title: "Connection quality diagnostics",
    description:
      "Share connection statistics such as relay route, latency and disconnect counts to help improve reliability. Never includes IP addresses, host names, prompts or code.",
  },
};

type ConnectionResilienceResources = typeof english;

const zhCN: ConnectionResilienceResources = {
  outbox: {
    waiting: "等待网络…",
    failedRetry: "发送失败，点击重试",
    retry: "重试",
    edit: "编辑",
    deliveryTimedOut: "主机一直无法连接，这条消息没有发出。",
  },
  permission: {
    waiting: "将在网络恢复后提交",
    failed: "提交失败，请重试。",
  },
  banner: {
    offline: "已离线，恢复后自动发送",
    unstable: "网络不稳定",
  },
  telemetry: {
    title: "连接质量诊断数据",
    description:
      "分享中转线路、延迟和断线次数等连接统计，帮助改进连接稳定性。不包含 IP 地址、主机名、提示词或代码。",
  },
};

const ja: ConnectionResilienceResources = {
  outbox: {
    waiting: "ネットワークを待機中…",
    failedRetry: "送信できませんでした。タップして再試行",
    retry: "再試行",
    edit: "編集",
    deliveryTimedOut: "ホストに接続できなかったため、このメッセージは送信されませんでした。",
  },
  permission: {
    waiting: "オンラインに戻ったら送信します",
    failed: "応答を送信できませんでした。もう一度お試しください。",
  },
  banner: {
    offline: "オフラインです。復帰後にメッセージを送信します",
    unstable: "ネットワークが不安定です",
  },
  telemetry: {
    title: "接続品質の診断データ",
    description:
      "中継ルート、遅延、切断回数などの接続統計を共有し、安定性の改善に役立てます。IP アドレス、ホスト名、プロンプト、コードは含まれません。",
  },
};

const ko: ConnectionResilienceResources = {
  outbox: {
    waiting: "네트워크 대기 중…",
    failedRetry: "전송하지 못했습니다. 탭하여 다시 시도",
    retry: "다시 시도",
    edit: "편집",
    deliveryTimedOut: "호스트에 연결할 수 없어 이 메시지를 보내지 못했습니다.",
  },
  permission: {
    waiting: "다시 온라인이 되면 제출합니다",
    failed: "응답을 제출하지 못했습니다. 다시 시도하세요.",
  },
  banner: {
    offline: "오프라인입니다. 다시 연결되면 메시지를 보냅니다",
    unstable: "네트워크가 불안정합니다",
  },
  telemetry: {
    title: "연결 품질 진단 데이터",
    description:
      "릴레이 경로, 지연 시간, 연결 끊김 횟수 같은 연결 통계를 공유해 안정성 개선에 활용합니다. IP 주소, 호스트 이름, 프롬프트, 코드는 포함되지 않습니다.",
  },
};

const es: ConnectionResilienceResources = {
  outbox: {
    waiting: "Esperando conexión…",
    failedRetry: "No se pudo enviar. Toca para reintentar",
    retry: "Reintentar",
    edit: "Editar",
    deliveryTimedOut: "No se pudo contactar con el host, así que este mensaje no se envió.",
  },
  permission: {
    waiting: "Se enviará cuando vuelvas a tener conexión",
    failed: "No se pudo enviar tu respuesta. Inténtalo de nuevo.",
  },
  banner: {
    offline: "Sin conexión. Los mensajes se enviarán cuando vuelvas a estar en línea",
    unstable: "Red inestable",
  },
  telemetry: {
    title: "Diagnóstico de calidad de conexión",
    description:
      "Comparte estadísticas de conexión, como la ruta del relay, la latencia y las desconexiones, para mejorar la fiabilidad. Nunca incluye direcciones IP, nombres de host, prompts ni código.",
  },
};

const fr: ConnectionResilienceResources = {
  outbox: {
    waiting: "En attente du réseau…",
    failedRetry: "Échec de l'envoi. Touchez pour réessayer",
    retry: "Réessayer",
    edit: "Modifier",
    deliveryTimedOut: "L'hôte est resté injoignable : ce message n'a pas été envoyé.",
  },
  permission: {
    waiting: "Sera envoyé au retour de la connexion",
    failed: "Impossible d'envoyer votre réponse. Réessayez.",
  },
  banner: {
    offline: "Hors ligne. Les messages partiront au retour de la connexion",
    unstable: "Réseau instable",
  },
  telemetry: {
    title: "Diagnostic de la qualité de connexion",
    description:
      "Partagez des statistiques de connexion (route du relais, latence, déconnexions) pour améliorer la fiabilité. N'inclut jamais d'adresses IP, de noms d'hôte, de prompts ni de code.",
  },
};

const ptBR: ConnectionResilienceResources = {
  outbox: {
    waiting: "Aguardando rede…",
    failedRetry: "Falha ao enviar. Toque para tentar de novo",
    retry: "Tentar de novo",
    edit: "Editar",
    deliveryTimedOut: "O host ficou inacessível, então esta mensagem não foi enviada.",
  },
  permission: {
    waiting: "Será enviado quando a conexão voltar",
    failed: "Não foi possível enviar sua resposta. Tente de novo.",
  },
  banner: {
    offline: "Offline. As mensagens serão enviadas quando a conexão voltar",
    unstable: "Rede instável",
  },
  telemetry: {
    title: "Diagnóstico de qualidade da conexão",
    description:
      "Compartilhe estatísticas de conexão, como rota do relay, latência e quedas, para melhorar a estabilidade. Nunca inclui endereços IP, nomes de host, prompts ou código.",
  },
};

const ru: ConnectionResilienceResources = {
  outbox: {
    waiting: "Ожидание сети…",
    failedRetry: "Не удалось отправить. Нажмите, чтобы повторить",
    retry: "Повторить",
    edit: "Изменить",
    deliveryTimedOut: "Хост оставался недоступен, поэтому сообщение не отправлено.",
  },
  permission: {
    waiting: "Отправится, когда сеть вернётся",
    failed: "Не удалось отправить ответ. Попробуйте ещё раз.",
  },
  banner: {
    offline: "Нет сети. Сообщения отправятся, когда связь восстановится",
    unstable: "Нестабильная сеть",
  },
  telemetry: {
    title: "Диагностика качества соединения",
    description:
      "Отправлять статистику соединения (маршрут ретранслятора, задержка, число разрывов), чтобы повышать надёжность. IP-адреса, имена хостов, промпты и код не передаются.",
  },
};

const ar: ConnectionResilienceResources = {
  outbox: {
    waiting: "في انتظار الشبكة…",
    failedRetry: "تعذّر الإرسال. انقر لإعادة المحاولة",
    retry: "إعادة المحاولة",
    edit: "تعديل",
    deliveryTimedOut: "تعذّر الوصول إلى المضيف، لذلك لم تُرسل هذه الرسالة.",
  },
  permission: {
    waiting: "سيُرسل عند عودة الاتصال",
    failed: "تعذّر إرسال ردك. حاول مرة أخرى.",
  },
  banner: {
    offline: "غير متصل. ستُرسل الرسائل عند عودة الاتصال",
    unstable: "الشبكة غير مستقرة",
  },
  telemetry: {
    title: "بيانات تشخيص جودة الاتصال",
    description:
      "شارك إحصاءات الاتصال مثل مسار الترحيل وزمن الاستجابة وعدد مرات الانقطاع للمساعدة في تحسين الاستقرار. لا تتضمن عناوين IP أو أسماء المضيفين أو المطالبات أو الشيفرة.",
  },
};

export const connectionResilience = {
  en: english,
  "zh-CN": zhCN,
  ja,
  ko,
  es,
  fr,
  "pt-BR": ptBR,
  ru,
  ar,
} satisfies Record<string, ConnectionResilienceResources>;
