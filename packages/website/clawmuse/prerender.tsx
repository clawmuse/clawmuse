import { officialPluginIds, pluginsCopy } from "./plugins-content";
import { renderToString } from "react-dom/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Site } from "./site";
import { descriptionFor, href, pageLanguages, routes, titleFor, type Page } from "./content";
import { languages, locales, type Language } from "./i18n/locales";
import { agentFor, agentRoutes, isAgentPage } from "./agents-content";
import {
  articleFor,
  articleRoutes,
  blogArticleRoutes,
  docArticleRoutes,
  learnArticleRoutes,
  editorialDate,
  editorialLanguages,
  isArticlePage,
  learnCopy,
  editorialLanguage,
} from "./editorial-content";

const output = resolve(import.meta.dirname, "../dist/clawmuse");
const template = await readFile(resolve(output, "index.html"), "utf8");
const origin = "https://clawmuse.com";
function escapeAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function structuredData(page: Page, language: Language) {
  const url = `${origin}${href(page, language)}`;
  const organization = { "@type": "Organization", name: "ClawMuse", url: origin };
  if (page === "/plugins") {
    const copy = pluginsCopy(language);
    return [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: copy.title,
        description: copy.description,
        url,
        inLanguage: language,
        publisher: organization,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: officialPluginIds.length,
          itemListElement: officialPluginIds.map((id, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: copy.plugins[id].name,
            url: `${url}#${id}`,
          })),
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: copy.faq.map(([question, answer]) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ];
  }
  if (page === "/agents") {
    return [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: titleFor(page, language),
        description: descriptionFor(language, page),
        url,
        inLanguage: language,
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: agentRoutes.length,
          itemListElement: agentRoutes.map((route, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: agentFor(route, language).name,
            url: `${origin}${href(route, language)}`,
          })),
        },
      },
    ];
  }
  if (isAgentPage(page)) {
    const agent = agentFor(page, language);
    return [
      {
        "@context": "https://schema.org",
        "@type": "WebPage",
        name: agent.title,
        description: agent.description,
        url,
        inLanguage: language,
        publisher: organization,
        citation: agent.officialUrl,
        about: {
          "@type": "SoftwareApplication",
          name: agent.name,
          applicationCategory: "DeveloperApplication",
        },
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "ClawMuse",
            item: `${origin}${href("/", language)}`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: titleFor("/agents", language),
            item: `${origin}${href("/agents", language)}`,
          },
          { "@type": "ListItem", position: 3, name: agent.name, item: url },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: agent.faq.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ];
  }
  if (isArticlePage(page)) {
    const article = articleFor(page, language);
    const date = article.updated ?? editorialDate;
    let collection: Page = "/learn";
    if (page.startsWith("/docs/")) collection = "/docs";
    if (page.startsWith("/blog/")) collection = "/blog";
    return [
      {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: article.title,
        description: article.description,
        inLanguage: language,
        mainEntityOfPage: url,
        datePublished: date,
        dateModified: date,
        author: organization,
        publisher: organization,
        image: `${origin}/brand/clawmuse-social.png`,
        citation: article.sections.flatMap(
          (section) => section.sources?.map((source) => source.url) ?? [],
        ),
      },
      {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: titleFor(collection, language),
            item: `${origin}${href(collection, language)}`,
          },
          { "@type": "ListItem", position: 2, name: article.title, item: url },
        ],
      },
      {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: article.faq.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      },
    ];
  }
  const isCollection = page === "/learn" || page === "/blog" || page === "/docs";
  if (isCollection) {
    let entries: readonly Page[] = learnArticleRoutes;
    if (page === "/blog") entries = blogArticleRoutes;
    if (page === "/docs") {
      entries = ["/docs/linux"];
      if (editorialLanguages.includes(language)) entries = [...entries, ...docArticleRoutes];
    }
    return [
      {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: titleFor(page, language),
        description: descriptionFor(language, page),
        url,
        inLanguage: language,
        hasPart: entries.map((route) => ({
          "@type": "Article",
          name: titleFor(route, language),
          url: `${origin}${href(route, language)}`,
        })),
      },
    ];
  }
  if (page !== "/") return [];
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "ClawMuse",
      url,
      inLanguage: language,
      publisher: organization,
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "ClawMuse",
      url,
      applicationCategory: "DeveloperApplication",
      operatingSystem: "macOS, Windows, Linux, iOS, Android, Web",
      description: descriptionFor(language, page),
    },
  ];
}
async function renderPage(page: Page, language: Language, found = true) {
  const missingPath = `${locales[language].prefix}/404.html`;
  const path = found ? href(page, language) : missingPath;
  const title = `${found ? titleFor(page, language) : "404"} — ClawMuse`;
  const description = descriptionFor(language, page);
  let html = template
    .replace(/<html lang="[^"]*"/, `<html lang="${language}" dir="${locales[language].dir}"`)
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeAttribute(title)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      `<meta name="description" content="${escapeAttribute(description)}" />`,
    )
    .replace(
      /<link rel="canonical" href="[^"]*"\s*\/>/,
      found
        ? `<link rel="canonical" href="${origin}${path}" />`
        : '<meta name="robots" content="noindex" />',
    )
    .replace(
      '<div id="root"></div>',
      `<div id="root">${renderToString(<Site page={page} language={language} found={found} />)}</div>`,
    );
  const meta = [
    `<meta property="og:type" content="${found && isArticlePage(page) ? "article" : "website"}" />`,
    `<meta property="og:site_name" content="ClawMuse" />`,
    `<meta property="og:title" content="${escapeAttribute(title)}" />`,
    `<meta property="og:description" content="${escapeAttribute(description)}" />`,
    `<meta property="og:url" content="${origin}${path}" />`,
    `<meta property="og:image" content="${origin}/brand/clawmuse-social.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:locale" content="${locales[language].ogLocale}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttribute(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttribute(description)}" />`,
    `<meta name="twitter:image" content="${origin}/brand/clawmuse-social.png" />`,
  ];
  if (found)
    for (const lang of pageLanguages(page))
      meta.push(`<link rel="alternate" hreflang="${lang}" href="${origin}${href(page, lang)}" />`);
  if (found)
    meta.push(`<link rel="alternate" hreflang="x-default" href="${origin}${href(page, "en")}" />`);
  if (found && isArticlePage(page)) {
    const date = articleFor(page, language).updated ?? editorialDate;
    meta.push(
      `<meta property="article:published_time" content="${date}" />`,
      `<meta property="article:modified_time" content="${date}" />`,
    );
  }
  if (found)
    for (const data of structuredData(page, language))
      meta.push(
        `<script type="application/ld+json">${JSON.stringify(data).replaceAll("<", "\\u003c")}</script>`,
      );
  if (found && editorialLanguages.includes(language))
    meta.push(
      `<link rel="alternate" type="application/rss+xml" title="ClawMuse" href="${origin}${locales[language].prefix}/feed.xml" />`,
    );
  html = html.replace("</head>", `${meta.join("\n")}\n</head>`);
  const file = found ? resolve(output, `.${path}`, "index.html") : resolve(output, `.${path}`);
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file, html);
}
for (const language of languages) {
  for (const page of routes)
    if (pageLanguages(page).includes(language)) await renderPage(page, language);
  await renderPage("/", language, false);
}
const urls = routes.flatMap((page) =>
  pageLanguages(page).map(
    (language) =>
      `<url><loc>${origin}${href(page, language)}</loc>${isArticlePage(page) ? `<lastmod>${articleFor(page, language).updated ?? editorialDate}</lastmod>` : ""}${pageLanguages(
        page,
      )
        .map(
          (lang) =>
            `<xhtml:link rel="alternate" hreflang="${lang}" href="${origin}${href(page, lang)}" />`,
        )
        .join(
          "",
        )}<xhtml:link rel="alternate" hreflang="x-default" href="${origin}${href(page, "en")}" /></url>`,
  ),
);
await writeFile(
  resolve(output, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join("\n")}</urlset>`,
);
// AI training crawlers are refused here rather than by Cloudflare's managed robots.txt, whose list
// also blocks Baiduspider and PetalBot: those are search engines, and they serve the Chinese site.
const trainingCrawlers = [
  "Amazonbot",
  "Applebot-Extended",
  "Bytespider",
  "CCBot",
  "ClaudeBot",
  "Diffbot",
  "Google-Extended",
  "GPTBot",
  "meta-externalagent",
  "omgili",
];
await writeFile(
  resolve(output, "robots.txt"),
  [
    "User-agent: Baiduspider",
    "User-agent: PetalBot",
    "Allow: /",
    "",
    ...trainingCrawlers.map((agent) => `User-agent: ${agent}`),
    "Disallow: /",
    "",
    "User-agent: *",
    "Content-Signal: search=yes,ai-train=no,use=reference",
    "Allow: /",
    "",
    `Sitemap: ${origin}/sitemap.xml`,
    "",
  ].join("\n"),
);
for (const language of editorialLanguages) {
  const copy = learnCopy[editorialLanguage(language)];
  const items = [...blogArticleRoutes, ...learnArticleRoutes].map((page) => {
    const article = articleFor(page, language);
    const url = `${origin}${href(page, language)}`;
    const date = article.updated ?? editorialDate;
    return `<item><title>${escapeAttribute(article.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><description>${escapeAttribute(article.description)}</description><pubDate>${new Date(`${date}T00:00:00Z`).toUTCString()}</pubDate></item>`;
  });
  await writeFile(
    resolve(output, `.${locales[language].prefix}/feed.xml`),
    `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${escapeAttribute(copy.title)} — ClawMuse</title><link>${origin}${href("/learn", language)}</link><description>${escapeAttribute(copy.description)}</description><language>${language}</language>${items.join("\n")}</channel></rss>`,
  );
}
await writeFile(
  resolve(output, "llms.txt"),
  `# ClawMuse\n\n> Put your ideas into action. ClawMuse is a personal workspace where you choose AI tools such as Claude Code and Codex for each task. Give instructions and review results across your computer and phone.\n\nProjects and tools run on your host. Cloud models, speech providers and optional services have separate data flows. The website demo uses preset browser-local data.\n\n## Product\n- [Official plugins](${origin}/plugins/)\n- [Brand](${origin}/brand/)\n- [Personal plans](${origin}/pricing/)\n- [Blog](${origin}/blog/)\n- [Account and data](${origin}/account-deletion/)\n- [Product](${origin}/product/)\n- [Setup](${origin}/docs/)\n- [Security](${origin}/security/)\n- [Privacy](${origin}/privacy/)\n\n## Supported agents\n- [Agent directory](${origin}/agents/)\n${agentRoutes.map((page) => `- [${titleFor(page, "en")}](${origin}${href(page, "en")})`).join("\n")}\n\n## Guides and comparisons\n${editorialLanguages.flatMap((language) => articleRoutes.map((page) => `- [${titleFor(page, language)}](${origin}${href(page, language)})`)).join("\n")}\n`,
);
console.log(`Prerendered ${urls.length} pages and ${languages.length} localized 404 pages.`);
