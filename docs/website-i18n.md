# Website translations

paseo.sh is served in English and Simplified Chinese (`zh-CN`). This doc covers the website in `packages/website`. App UI translations are in [i18n.md](i18n.md).

## ClawMuse website

The independent ClawMuse site lives in `packages/website/clawmuse`, with its own Vite build and static prerenderer. Its core pages use ten locales; Simplified Chinese uses `/zh/`. English stays at the root. Guides, blog articles, the official plugin feature and the Agent directory publish in English and Simplified Chinese only; do not emit untranslated routes or `hreflang` entries for other locales. The language selector preserves the path, query and fragment.

Keep guides under `/docs`, product articles under `/blog`, and selection guides under `/learn`. Register article routes and their collection in `editorial-content.ts`; `content.ts` owns core routes and metadata, and `prerender.tsx` emits HTML, sitemap, RSS and `llms.txt`. New copy keys in `i18n/resources/en.json` need corresponding values in every locale. Existing translation and browser tests cover this site too.

Follow the [ClawMuse brand wording](../branding/README.md#name) when editing marketing copy. Describe concrete tasks and results in short sentences. Keep installation details in guides, data handling in security and privacy pages, and implementation changes in the changelog. Mention a setup requirement beside the feature that needs it; do not repeat it across every section. ClawMuse is open source under Apache-2.0; point readers to the GitHub repository (`sourceUrl` in `content.ts`) instead of describing the product as free, and do not use “free forever”, “currently free” or other price or trial wording. Charges apply to optional add-on services; distinguish these from third-party AI service costs. Keep unlaunched plan proposals in internal planning docs.

Agent landing pages live under `/agents/<slug>`. Verify their support claims against the protocol Provider manifest, bundled plugin registrations and the app's ACP catalog before editing `agents-content.ts`. A catalog entry requires installation and configuration; it is not a claim that the Agent is enabled by default or shares every tool capability. Keep vendor marks tied to their Agent identity and preserve explicit exceptions such as cloud execution and permission limitations.

Each Agent page is a search landing page, so write its intro, description, setup and use case for that Agent alone; do not share boilerplate between pages. `agents-install.ts` holds the vendor's own install and sign-in commands. Copy them from the vendor docs linked by `officialUrl`, and never write one from memory or show ClawMuse launch configuration as an install step.

## URLs own the language

- English pages keep their unprefixed paths. Every other language lives under its tag: `/docs/cli` and `/zh-CN/docs/cli` are the same page. `/en/...` is not a page.
- The server renders the language in the URL. There is no browser-language detection or redirect, so a shared link always opens in the language it was shared in.
- The language selector moves to the same page in the other language and keeps the query and hash. Every internal link on a page carries the page's language, so the choice sticks while the reader navigates. An explicit English URL always renders English.
- The choice is not stored. A stored choice could only take effect by redirecting unprefixed URLs, which are the English pages. First-party links into the site carry the reader's language instead: `README.zh-CN.md` links to `/zh-CN/...`.
- Routes live under `src/routes/{-$locale}/`. Build internal links with `localizePath` or `useLocalizePath` from `~/i18n`. Links inside Markdown are localized by `DocsMarkdown`. Files, `.md` sources, `llms.txt` and API endpoints keep one path for every language (`isPagePath`).
- Give each page's `head` the language-neutral path through `pageMeta` (`src/meta.ts`). It writes the self canonical, the `hreflang` alternates with English as `x-default`, and `og:locale`. The sitemap in `vite.config.ts` lists the same alternates.

## Where copy lives

| Content          | English                                            | Chinese                                                                         |
| ---------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Interface copy   | `src/i18n/resources/en.json`                       | `src/i18n/resources/zh-CN.json`                                                 |
| Docs             | `public-docs/<page>.md`                            | `public-docs/<page>.zh-CN.md`                                                   |
| Blog posts       | `posts/<slug>.md`                                  | `posts/<slug>.zh-CN.md`                                                         |
| Comparison pages | `src/content/alternatives/<slug>.md`               | `src/content/alternatives/<slug>.zh-CN.md`                                      |
| Legal pages      | `legal/<page>.md`                                  | `legal/<page>.zh-CN.md`                                                         |
| Changelog        | `CHANGELOG.md`                                     | `CHANGELOG.zh-CN.md`, see [release.md](release.md#changelog-translations)       |
| Plugin listings  | the plugin's `paseo-plugin.json` and `OVERVIEW.md` | `translations` and `OVERVIEW.zh-CN.md`, see `public-docs/plugins/publishing.md` |

`en.json` types the keys, so typecheck fails when `zh-CN.json` misses one. A translation file is grouped with its English original by name (`src/markdown-content.ts`). A translation without an English original fails the build.

Every first-party page has a translation. The changelog and plugin listings are the exceptions: a release or listing without one renders whole in English under a notice. Pages never mix languages paragraph by paragraph. Navigation order, categories and slugs always come from the English file's frontmatter.

## Editing a translated doc

Edit the English file and its `.zh-CN.md` in the same PR, and add the `.zh-CN.md` with any new page. Code blocks, commands, flags, config keys and links are copied verbatim, so code-only changes are a copy. Never delete a translation to get around an edit, and never leave one that describes behavior the English no longer has.

Translated headings pin the English anchor with a trailing `{#id}`, so `/zh-CN/docs/cli#running-agents` lands on the same section as the English link:

```md
## 运行 Agent {#running-agents}

:::example[回复 Slack 提及 {#answer-a-slack-mention}]
```

When you rename an English heading, change the `{#id}` in the translation to the new slug. `src/content-translations.test.ts` fails when a docs, blog, comparison or legal page has no translation, and when a translation's headings differ from the English in count, level, order or anchor. It cannot tell whether the prose under a heading is current. The `.md` source endpoints serve files verbatim, so `{#id}` shows there as written.

## Chinese style

- Keep code, commands, file paths, IDs, brand and product names, and command output in English.
- Keep these terms in English: Agent, worktree, daemon, Provider, PR, diff, Composer, Hub, workflow, heartbeat, slug.
- Translate these: workspace 工作区, host 主机, relay 中继, plugin 插件, skill 技能, review 审查, schedule 定时任务, orchestration 编排, configuration 配置, prompt 提示词, subagent 子 Agent.
- Quote app UI labels with the app's Chinese wording from `packages/app/src/i18n/resources/zh-CN.ts`, such as **设置 → 插件**. Labels the app has not translated stay in English, as do labels in Hub, GitHub, Slack and Discord. Add the English label in parentheses only where readers search for it, such as an error message.
- Put a space between Chinese and Latin text or numbers: `启动 Agent`, `共 3 个`.
- Bold that ends in full-width punctuation does not render when Chinese text follows it directly: `**注意：**这里` shows the asterisks. Move the punctuation outside the bold (`**注意**：这里`).
