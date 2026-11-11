import { OfficialPlugins } from "./plugins";
import { AccountData } from "./account-data";
import { AgentDetail, AgentDirectory } from "./agents";
import { isAgentPage } from "./agents-content";
import { useSiteTranslation } from "./i18n/i18n";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type SyntheticEvent,
} from "react";
import {
  release,
  fileVersion,
  formatSize,
  installerMirrorUrl,
  githubReleaseUrl,
  platformVersion,
  type DownloadFile,
} from "./downloads";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleHelp,
  Copy,
  Download,
  Fingerprint,
  Globe,
  Laptop,
  Monitor,
  ShieldCheck,
  Smartphone,
  Terminal,
} from "lucide-react";
import { Mark, Wordmark } from "./mark";
import { ProductDemo } from "./product-demo";
import { EditorialArticle, Learn, Blog, OwnershipSection } from "./editorial";
import { isArticlePage } from "./editorial-content";
import changelog from "./changelog.json";

import { appUrl, contactEmail, href, sourceUrl, type Page } from "./content";
import {
  CodeBlock,
  FAQ,
  Note,
  PageIntro,
  PageLink,
  SectionHeading,
  useScrollSpy,
  type Localized,
} from "./ui";
import {
  ConnectionDiagram,
  DownloadButton,
  EndCTA,
  FeatureGrid,
  RealDeviceShowcase,
  WebWorkspaceSection,
} from "./site";

type Props = Localized & { page: Page };
export function InnerPage({ page, language }: Props) {
  if (isAgentPage(page)) return <AgentDetail page={page} language={language} />;
  if (isArticlePage(page)) return <EditorialArticle page={page} language={language} />;
  switch (page) {
    case "/plugins":
      return <OfficialPlugins language={language} />;
    case "/agents":
      return <AgentDirectory language={language} />;
    case "/account-deletion":
      return <AccountData language={language} />;
    case "/blog":
      return <Blog language={language} />;
    case "/learn":
      return <Learn language={language} />;
    case "/product":
      return <Product language={language} />;
    case "/download":
      return <Downloads language={language} />;
    case "/docs":
      return <Docs language={language} />;
    case "/docs/linux":
      return <LinuxGuide language={language} />;
    case "/security":
      return <Security language={language} />;
    case "/pricing":
      return <Pricing language={language} />;
    case "/about":
      return <About language={language} />;
    case "/brand":
      return <Brand language={language} />;
    case "/changelog":
      return <Changelog language={language} />;
    case "/support":
      return <Support language={language} />;
    case "/privacy":
    case "/terms":
      return <Policy page={page} language={language} />;
    default:
      return null;
  }
}
function Product({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  return (
    <>
      <PageIntro
        eyebrow={t("product.theProductClawmuse")}
        title={t("product.yourAiWorkAlwaysWithinReach")}
      >
        {t("product.theCodingToolsYouKnowTheEnvironmentYouOwn")}
      </PageIntro>
      <div className="container product-intro-actions">
        <DownloadButton language={language} label={t("home.getStarted")} />
        <a className="button ghost" href="#product-demo">
          {t("product.tryInteractiveDemo")}
          <ArrowRight size={17} />
        </a>
      </div>
      <section
        id="product-demo"
        className="container experience home-product-showcase product-demo-section"
        aria-labelledby="product-demo-heading"
      >
        <h2 id="product-demo-heading" className="sr-only">
          {t("tour.interactive")}
        </h2>
        <ProductDemo language={language} />
      </section>
      <section className="section container">
        <SectionHeading
          eyebrow={t("home.02StayInTheFlow")}
          title={t("home.lessSwitchingMoreMaking")}
        />
        <FeatureGrid language={language} />
      </section>
      <RealDeviceShowcase language={language} />
      <WebWorkspaceSection language={language} />
      <OwnershipSection language={language} />
      <EndCTA language={language} />
    </>
  );
}
function Downloads({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  const [checksumsOpen, setChecksumsOpen] = useState(false);
  const openChecksums = useCallback(() => setChecksumsOpen(true), []);
  const macVersion = platformVersion("macos");
  const hasSplitDesktopVersion = macVersion !== release.version;
  useEffect(() => {
    if (window.location.hash === "#checksums") setChecksumsOpen(true);
  }, []);
  const platforms = [
    {
      id: "windows",
      name: "Windows",
      icon: Monitor,
      description: t("downloads.windowsInstallerDescription"),
    },
    {
      id: "macos",
      name: "macOS",
      icon: Laptop,
      description: t("downloads.macosInstallerDescription"),
    },
    {
      id: "linux",
      name: "Linux",
      icon: Terminal,
      description: t("downloads.keepYourRemoteDevelopmentEnvironmentOnlineWithoutAGraphical"),
    },
    {
      id: "android",
      name: "Android",
      icon: Smartphone,
      description: t("downloads.androidInstallerDescription"),
    },
  ] as const;
  return (
    <>
      <PageIntro title={t("downloads.chooseYourMachineMakeYourFirstConnection")} />
      {release.files.length > 0 && (
        <div className="container release-summary">
          {hasSplitDesktopVersion ? (
            <>
              <span className="pill">macOS v{macVersion}</span>
              <span className="pill">Windows · Linux · Android v{release.version}</span>
            </>
          ) : (
            <span className="pill">ClawMuse v{release.version}</span>
          )}
          <a className="text-link checksums-jump" href="#checksums" onClick={openChecksums}>
            <ShieldCheck size={15} />
            {t("downloads.checksumsTitle")}
          </a>
        </div>
      )}
      <section className="container download-grid" aria-label={t("downloads.platformInstallers")}>
        {platforms.map(({ id, name, icon: Icon, description }) => {
          const files = release.files.filter((file) => file.platform === id);
          const { primaryFiles, secondaryFiles, triggerFile } = partitionPlatformFiles(id, files);
          return (
            <article className="download-card" key={id}>
              <div className="download-card-head">
                <Icon size={32} />
              </div>
              <div className="download-card-title">
                <h2>{name}</h2>
                <span className="pill download-version-pill">v{platformVersion(id)}</span>
              </div>
              {description && <p>{description}</p>}
              {files.length > 0 ? (
                <div className="installer-list">
                  {primaryFiles.map((file) => (
                    <Installer file={file} key={file.filename} />
                  ))}
                  {triggerFile && (
                    <SecondaryDownloads
                      id={id}
                      files={secondaryFiles}
                      triggerFile={triggerFile}
                      moreLabel={t("downloads.moreFormats")}
                    />
                  )}
                </div>
              ) : (
                <p className="availability">{t("downloads.installerInPreparation")}</p>
              )}
              {id === "windows" && (
                <p className="download-card-note">{t("downloads.windowsUnsignedInstaller")}</p>
              )}
            </article>
          );
        })}
        <article className="download-card">
          <div className="download-card-head">
            <Smartphone size={32} />
          </div>
          <div className="download-card-title">
            <h2>iOS</h2>
            <span className="pill download-version-pill">App Store</span>
          </div>
          <p>{t("downloads.iosAvailableOnAppStore")}</p>
          <a className="button primary" href={release.ios.url}>
            {t("downloads.downloadOnAppStore")}
            <ArrowUpRight size={17} />
          </a>
        </article>
        <WebDownloadCard language={language} />
      </section>
      {release.files.length > 0 && (
        <ChecksumsSection language={language} open={checksumsOpen} onToggle={setChecksumsOpen} />
      )}
      <section className="container download-footer">
        <PageLink page="/docs" language={language}>
          {t("home.readTheGettingStartedGuide")}
        </PageLink>
        <a
          className="text-link"
          href={githubReleaseUrl()}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t("downloads.githubBackup")} <ArrowUpRight size={15} />
        </a>
      </section>
    </>
  );
}

function ChecksumsSection({
  language,
  open,
  onToggle,
}: Localized & { open: boolean; onToggle: (next: boolean) => void }) {
  const { t } = useSiteTranslation(language);
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const handleToggle = useCallback(
    (event: SyntheticEvent<HTMLDetailsElement>) => onToggle(event.currentTarget.open),
    [onToggle],
  );
  const copyHash = useCallback(async (event: MouseEvent<HTMLButtonElement>) => {
    const { filename, sha256 } = event.currentTarget.dataset;
    if (!filename || !sha256) return;
    try {
      await navigator.clipboard.writeText(`${sha256}  ${filename}`);
      setCopiedFile(filename);
    } catch {
      setCopiedFile(null);
    }
  }, []);
  useEffect(() => {
    if (!copiedFile) return;
    const timer = window.setTimeout(() => setCopiedFile(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copiedFile]);

  return (
    <section id="checksums" className="container checksums-section">
      <details className="checksums-panel" open={open} onToggle={handleToggle}>
        <summary className="checksums-summary">
          <span className="checksums-summary-title">
            <ShieldCheck size={17} aria-hidden="true" />
            <strong>{t("downloads.checksumsTitle")}</strong>
            <small>{t("downloads.checksumsDescription")}</small>
          </span>
          <ChevronDown size={17} aria-hidden="true" />
        </summary>
        <div className="checksums-list" dir="ltr">
          {release.files.map((file) => {
            const isCopied = copiedFile === file.filename;
            return (
              <div className="checksum-row" key={file.filename}>
                <div className="checksum-file">
                  <code>{file.filename}</code>
                  <span className="pill">v{fileVersion(file)}</span>
                </div>
                <div className="checksum-hash">
                  <code>{file.sha256}</code>
                  <button
                    type="button"
                    className="checksum-copy"
                    data-filename={file.filename}
                    data-sha256={file.sha256}
                    onClick={copyHash}
                    aria-label={`${t("codeBlock.copy")} ${file.filename}`}
                    title={isCopied ? t("codeBlock.copiedToClipboard") : t("codeBlock.copy")}
                  >
                    {isCopied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </details>
    </section>
  );
}

function WebDownloadCard({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  return (
    <article className="download-card">
      <div className="download-card-head">
        <Globe size={32} />
      </div>
      <div className="download-card-title">
        <h2>{t("webWorkspace.downloadTitle")}</h2>
        <span className="pill download-version-pill">app.clawmuse.com</span>
      </div>
      <p>{t("webWorkspace.downloadBody")}</p>
      <a className="button primary" href={appUrl}>
        {t("header.openWorkspace")}
        <ArrowUpRight size={17} />
      </a>
    </article>
  );
}

function partitionPlatformFiles(id: string, files: DownloadFile[]) {
  let primaryFiles = files;
  if (id === "windows") {
    primaryFiles = files.filter((file) => file.arch === "x64");
  } else if (id === "linux") {
    primaryFiles = files.filter((file) => file.format === "DEB" && file.arch === "x64");
  }
  const secondaryFiles = files.filter((file) => !primaryFiles.includes(file));
  let triggerFile = secondaryFiles[0];
  if (id === "linux") {
    triggerFile =
      secondaryFiles.find((file) => file.format === "DEB" && file.arch === "arm64") ??
      secondaryFiles[0];
  }
  return { primaryFiles, secondaryFiles, triggerFile };
}

function SecondaryDownloads({
  id,
  files,
  triggerFile,
  moreLabel,
}: {
  id: string;
  files: DownloadFile[];
  triggerFile: DownloadFile;
  moreLabel: string;
}) {
  if (id === "linux") {
    return (
      <details className="arm-download arm-download-details">
        <summary className="arm-download-summary">
          <span className="arm-download-summary-copy">
            <span>{moreLabel}</span>
            <small>ARM64 · RPM · AppImage · TAR.GZ</small>
          </span>
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className="arm-download-links">
          {files.map((file) => (
            <a
              className="arm-download-item"
              href={installerMirrorUrl(file)}
              download
              key={file.filename}
            >
              <span>
                {file.format} · {file.arch}
              </span>
              <span>{formatSize(file.size)}</span>
            </a>
          ))}
        </div>
      </details>
    );
  }
  return (
    <div className="arm-download">
      <a className="button arm-download-trigger" href={installerMirrorUrl(triggerFile)} download>
        <Download size={16} />
        {triggerFile.format} · {triggerFile.arch} <span>{formatSize(triggerFile.size)}</span>
      </a>
    </div>
  );
}

function Installer({ file }: { file: DownloadFile }) {
  return (
    <div className="installer">
      <a className="button primary" href={installerMirrorUrl(file)} download>
        <Download size={17} />
        {file.format} · {file.arch} <span>{formatSize(file.size)}</span>
      </a>
    </div>
  );
}

function Checklist({ items }: { items: readonly string[] }) {
  return (
    <ul className="checklist">
      {items.map((item) => (
        <li key={item}>
          <Check size={17} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
function Docs({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  const docSections = useMemo(() => ["prepare", "account", "connect", "first-task"] as const, []);
  const activeDocSection = useScrollSpy(docSections);
  const items1 = useMemo(
    () =>
      [
        t("docs.theComputerCanReachTheServicesYourAiTool"),
        t("docs.projectFilesAreOnTheMachineThatRunsThe"),
        t("docs.keepTheComputerOnlineAndAwakeDuringRemoteUse"),
      ] as const,
    [t],
  );
  return (
    <>
      <PageIntro
        eyebrow={t("docs.guidesGettingStarted")}
        title={t("docs.yourFirstConnectionStartsHere")}
      >
        {t("docs.forUsersWithAClawmuseBetaInstallerPrepareThe")}
      </PageIntro>
      <section className="container guide-directory" aria-label={t("docs.guidesGettingStarted")}>
        {(
          [
            ["/docs/first-task", t("guides.firstTask")],
            ["/docs/agents", t("guides.agents")],
            ["/docs/workflows", t("guides.workflows")],
            ["/docs/goals-status", t("guides.goals")],
            ["/docs/voice", t("guides.voice")],
          ] as const
        ).map(([page, label]) => (
          <a key={page} href={href(page, language)}>
            {label}
            <ArrowRight size={16} />
          </a>
        ))}
      </section>
      <div className="container docs-layout">
        <aside className="docs-nav">
          <strong>{t("docs.onThisPage")}</strong>
          <a href="#prepare" data-active={activeDocSection === "prepare" ? "true" : undefined}>
            01 {t("docs.prepare")}
          </a>
          <a href="#account" data-active={activeDocSection === "account" ? "true" : undefined}>
            02 {t("docs.signIn")}
          </a>
          <a href="#connect" data-active={activeDocSection === "connect" ? "true" : undefined}>
            03 {t("docs.connectYourPhone")}
          </a>
          <a
            href="#first-task"
            data-active={activeDocSection === "first-task" ? "true" : undefined}
          >
            04 {t("docs.firstTask")}
          </a>
          <PageLink page="/docs/linux" language={language}>
            {t("docs.linuxGuide")}
          </PageLink>
        </aside>
        <article className="guide-body">
          <section id="prepare">
            <span className="eyebrow">{t("docs.01Prepare")}</span>
            <h2>{t("docs.prepareYourComputer")}</h2>
            <p>{t("docs.installAndOpenTheClawmuseDesktopAppChooseA")}</p>
            <Checklist items={items1} />
            <PageLink page="/download" language={language}>
              {t("docs.seeClientAvailability")}
            </PageLink>
          </section>
          <section id="account">
            <span className="eyebrow">{t("docs.02SignIn")}</span>
            <h2>{t("docs.signInOnTheDesktop")}</h2>
            <p>{t("docs.chooseSignInToClawmuseAtTheBottomOf")}</p>
            <div className="instruction-preview">
              <div>
                <Monitor size={19} />
                <span>{t("docs.myWorkspace")}</span>
              </div>
              <div className="instruction-account">
                <Mark />
                <span>{t("docs.signInToClawmuse")}</span>
                <ArrowUpRight size={16} />
              </div>
            </div>
          </section>
          <section id="connect">
            <span className="eyebrow">{t("docs.03Connect")}</span>
            <h2>{t("docs.useTheSameAccountOnYourPhone")}</h2>
            <p>{t("docs.openAClawmuseAppBuildWithAccountSupportAnd")}</p>
            <div className="guide-device-list">
              <span>
                <Monitor size={18} />
                {t("docs.workComputer")}
                <i className="live-dot" />
              </span>
              <span>
                <Terminal size={18} />
                Linux<small>{t("docs.connected")}</small>
                <Check size={17} />
              </span>
            </div>
            <p>{t("docs.noConnectionAddressOrPairingScanIsNeededIf")}</p>
          </section>
          <section id="first-task">
            <span className="eyebrow">{t("docs.04MakeSomething")}</span>
            <h2>{t("docs.giveYourAgentItsFirstTask")}</h2>
            <p>{t("docs.openAWorkspaceChooseAConfiguredAgentAndDescribe")}</p>
            <PageLink page="/support" language={language}>
              {t("docs.needAHandConnectingVisitHelp")}
            </PageLink>
          </section>
        </article>
      </div>
    </>
  );
}
function LinuxGuide({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  const debFilename =
    release.files.find((file) => file.platform === "linux" && file.format === "DEB")?.filename ??
    `ClawMuse-${release.version}-amd64.deb`;
  const items1 = useMemo(
    () =>
      [
        t("linuxGuide.useTheSameAccountEmailAsOnYourPhone"),
        t("linuxGuide.enterThePasswordInteractivelyNotAsACommandArgument"),
        t("linuxGuide.waitForTheCommandToConfirmDeviceEnrollment"),
      ] as const,
    [t],
  );
  return (
    <>
      <PageIntro
        eyebrow={t("linuxGuide.guidesLinux")}
        title={t("linuxGuide.noDesktopStillConnected")}
      >
        {t("linuxGuide.runTheClawmuseDaemonOnLinuxLinkTheMachine")}
      </PageIntro>
      <article className="container guide-body narrow">
        <Note>{t("linuxGuide.packagesIncludeDesktopAndLocalService")}</Note>
        <section>
          <h2>{t("linuxGuide.installAndStartLocalService")}</h2>
          <p>{t("linuxGuide.installLinuxPackageAndStartService")}</p>
          <CodeBlock
            language={language}
            code={`sudo apt install ./${debFilename}\nmkdir -p "$HOME/.local/bin"\nln -sf /opt/ClawMuse/resources/bin/paseo "$HOME/.local/bin/clawmuse"\nexport PATH="$HOME/.local/bin:$PATH"\nclawmuse --version\nclawmuse daemon start\nclawmuse daemon status`}
          />
        </section>
        <section>
          <h2>{t("linuxGuide.2LinkThisMachineToYourAccount")}</h2>
          <p>{t("linuxGuide.createAClawmuseAccountThenRunTheCommandBelow")}</p>
          <CodeBlock language={language} code={'clawmuse account login --name "my-linux"'} />
          <Checklist items={items1} />
        </section>
        <section>
          <h2>{t("linuxGuide.3ChooseThisLinuxHostOnYourPhone")}</h2>
          <p>{t("linuxGuide.signInWithTheSameAccountOnYourPhone")}</p>
        </section>
        <section>
          <h2>{t("linuxGuide.4KeepRunningAfterSshDisconnects")}</h2>
          <p>{t("linuxGuide.backgroundDaemonStartup")}</p>
          <CodeBlock language={language} code="clawmuse daemon status" />
          <p>{t("linuxGuide.keepHostOnlineAndToolsReady")}</p>
          <Note>{t("linuxGuide.youDoNotNeedToExposeTheDaemonS")}</Note>
          <PageLink page="/support" language={language}>
            {t("linuxGuide.troubleshootOfflineDevicesAndConnections")}
          </PageLink>
        </section>
      </article>
    </>
  );
}

function Security({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  const boundaries = [
    [
      t("security.whereDoesTheWorkRun"),
      t("security.agentsProjectsAndTerminalsRunOnYourChosenComputer"),
    ],
    [
      t("security.howIsTrafficCarried"),
      t("security.deviceConnectionsUseEndToEndEncryptionTheRelay"),
    ],
    [
      t("security.whatDoesTheAccountServiceStore"),
      t("security.accountIdentitySignInSessionsAndDeviceBindingsConnection"),
    ],
    [
      t("security.whatCanTheAiToolAccess"),
      t("security.thisDependsOnTheToolSPermissionsWorkspaceAnd"),
    ],
  ];
  const items1 = useMemo(
    () =>
      [
        t("security.useAUniquePasswordAndAvoidSharingYourAccount"),
        t("security.connectOnlyMachinesYouOwnOrAreAuthorizedTo"),
        t("security.reviewAgentPermissionsAndChangesBackUpImportantFiles"),
      ] as const,
    [t],
  );
  return (
    <>
      <PageIntro
        eyebrow={t("security.securityYourBoundaries")}
        title={t("security.knowYourBoundariesConnectWithConfidence")}
      >
        {t("security.knowWhereYourCodeRunsWhatYourAccountDoes")}
      </PageIntro>
      <section className="container security-visual">
        <ConnectionDiagram language={language} />
      </section>
      <section className="section container boundary-grid">
        {boundaries.map(([title, body], i) => (
          <article key={title}>
            <span className="step-number">0{i + 1}</span>
            <h2>{title}</h2>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <section className="container editorial-panel security-panel">
        <div>
          <Fingerprint size={32} />
          <h2>{t("security.yourAccountIsAKey")}</h2>
          <p>{t("security.protectItAndEveryMachineThatDoesTheWork")}</p>
        </div>
        <div>
          <Checklist items={items1} />
        </div>
      </section>
      <section className="section container">
        <PageLink page="/privacy" language={language}>
          {t("security.readThePrivacyNotice")}
        </PageLink>
      </section>
    </>
  );
}
function Pricing({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  const items1 = useMemo(
    () =>
      [
        t("pricing.accountSignInAndDeviceDiscovery"),
        t("pricing.desktopWorkspaceAndMobileRemoteAccess"),
        t("pricing.linuxDaemonAccountEnrollment"),
        t("pricing.connectionsToMultipleCodingAgents"),
      ] as const,
    [t],
  );
  return (
    <>
      <PageIntro eyebrow={t("pricing.accessPricing")} title={t("pricing.coreOpenSource")}>
        {t("pricing.intro")}
      </PageIntro>
      <section className="container personal-plans">
        <article className="pricing-card personal-plan-current">
          <h2>{t("pricing.coreFeatures")}</h2>
          <div className="price-status">{t("plans.openSource")}</div>
          <p>{t("plans.openSourceBody")}</p>
          <Checklist items={items1} />
          <PageLink page="/download" language={language} className="button primary">
            {t("pricing.seeHowToGetAccess")}
          </PageLink>
          <a className="pricing-source" href={sourceUrl}>
            {t("plans.viewSource")} <ArrowUpRight size={15} />
          </a>
        </article>
        <aside className="pricing-details">
          <div>
            <h2>{t("pricing.useYourOwnAiServices")}</h2>
            <p>{t("pricing.aiToolAccountsSubscriptionsAndApiCreditsComeFrom")}</p>
          </div>
          <div>
            <h2>{t("pricing.bringYourOwnMachine")}</h2>
            <p>{t("pricing.yourComputerOrLinuxHostRunsTheWorkAutomatically")}</p>
          </div>
          <PageLink page="/docs" language={language}>
            {t("home.readTheGettingStartedGuide")}
          </PageLink>
        </aside>
      </section>
    </>
  );
}
function About({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  return (
    <>
      <PageIntro
        eyebrow={t("about.aboutTheIdeaBehindClawmuse")}
        title={t("about.giveInspirationTheAbilityToAct")}
      >
        {t("brand.personalBody")}
      </PageIntro>
      <section className="container story-hero">
        <div className="story-symbol">
          <Mark />
        </div>
        <div>
          <span className="eyebrow">CLAW + MUSE</span>
          <h2>{t("about.catchTheIdeaTakeItForward")}</h2>
          <p>{t("about.clawIsTheAbilityToGraspActAndMove")}</p>
        </div>
      </section>
      <section className="section container story-copy">
        <span className="eyebrow">{t("about.whyWeAreBuilding")}</span>
        <h2>{t("about.toolsShouldMeetYouInYourRhythm")}</h2>
        <div>
          <p>{t("brand.ideaBody")}</p>
        </div>
      </section>
      <section className="container values-grid">
        {[
          [t("about.agency"), t("about.youChooseTheMachineTheToolAndTheNext")],
          [t("about.continuity"), t("about.workCanCrossDevicesAndKeepUpWithYour")],
          [t("about.clarity"), t("about.keepConnectionDetailsInTheBackgroundAndProgressIn")],
        ].map(([title, body], i) => (
          <article key={title}>
            <span>0{i + 1}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </section>
      <EndCTA language={language} />
    </>
  );
}
function Brand({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  return (
    <>
      <PageIntro
        eyebrow={t("brand.brandTheClawmuseIdentity")}
        title={t("brand.aDepthOfCalmAHintOfGrowth")}
      >
        {t("brand.aVisualLanguageForClawmuseClearFocusedAndCarrying")}
      </PageIntro>
      <section className="container brand-promise">
        <span className="eyebrow">{t("brand.onePromise")}</span>
        <p lang="zh-CN">让灵感拥有行动力。</p>
        <p lang="en">Put your ideas into action.</p>
      </section>
      <section className="container brand-board">
        <div className="brand-lockup" role="img" aria-label="ClawMuse">
          <Mark />
          <Wordmark />
          <small>{t("brand.giveInspirationTheAbilityToAct")}</small>
        </div>
        <div className="brand-construction">
          <div className="construction-grid">
            <Mark />
          </div>
          <p>{t("brand.cAndMShareATopLineBaselineAnd")}</p>
        </div>
      </section>
      <section className="section container">
        <SectionHeading eyebrow={t("brand.01TheMonogram")} title={t("brand.oneMarkManyScales")}>
          {t("brand.fromAnAppIconToASmallPageMark")}
        </SectionHeading>
        <div className="mark-variations">
          <div className="mark-sample sample-dark">
            <Mark />
            <span>{t("brand.deepSea")}</span>
          </div>
          <div className="mark-sample sample-light">
            <Mark />
            <span>{t("brand.mintPaper")}</span>
          </div>
          <div className="mark-sample sample-mint">
            <Mark />
            <span>{t("brand.freshMint")}</span>
          </div>
          <div className="mark-sample sample-scale">
            <div>
              <Mark />
              <Mark />
              <Mark />
            </div>
            <span>{t("brand.smallStillCm")}</span>
          </div>
        </div>
      </section>
      <section className="section container brand-lettering">
        <SectionHeading
          eyebrow={t("brand.02CustomLettering")}
          title={t("brand.aNameWithItsOwnHandwriting")}
        >
          {t("brand.eightIndividuallyDrawnLettersTheOpenCAndAscending")}
        </SectionHeading>
        <div className="lettering-specimen" role="img" aria-label="ClawMuse">
          <Wordmark />
          <div>
            <span>{t("brand.cCurve")}</span>
            <span>{t("brand.mMomentum")}</span>
          </div>
        </div>
      </section>
      <section className="container color-section">
        <SectionHeading eyebrow={t("brand.03ThePalette")} title={t("brand.rootedInDeepSeaMint")}>
          {t("brand.darkForFocusLightForBreathingRoomBothThemes")}
        </SectionHeading>
        <div className="swatch-grid">
          <div className="swatch deep">
            <span>{t("brand.deepSea")}</span>
            <strong>#102827</strong>
          </div>
          <div className="swatch mint">
            <span>{t("brand.freshMint")}</span>
            <strong>#8DE0BF</strong>
          </div>
          <div className="swatch paper">
            <span>{t("brand.mintPaper")}</span>
            <strong>#F3F7F3</strong>
          </div>
          <div className="swatch ink">
            <span>{t("brand.forestInk")}</span>
            <strong>#173B34</strong>
          </div>
        </div>
      </section>
      <section className="section container brand-downloads">
        <div>
          <SectionHeading eyebrow={t("brand.04BrandAssets")} title={t("brand.aConsistentPresence")}>
            {t("brand.theSymbolLetteringAndLockupAreSvgPathsWith")}
          </SectionHeading>
          <div className="hero-actions">
            <a
              className="button primary"
              href="/brand/clawmuse-mark.svg"
              download="clawmuse-icon.svg"
            >
              <Download size={17} />
              {t("brand.downloadIconSvg")}
            </a>
            <a
              className="button ghost"
              href="/brand/clawmuse-symbol.svg"
              download="clawmuse-symbol.svg"
            >
              <Download size={17} />
              {t("brand.downloadSymbolSvg")}
            </a>
            <a className="button ghost" href="/brand/clawmuse-wordmark.svg" download>
              <Download size={17} />
              {t("brand.downloadWordmarkSvg")}
            </a>
            <a className="button ghost" href="/brand/clawmuse-lockup.svg" download>
              <Download size={17} />
              {t("brand.downloadLockupSvg")}
            </a>
          </div>
        </div>
        <div className="brand-usage">
          <strong>ClawMuse</strong>
          <p>{t("brand.writeClawmuseAsOneWordWithCapitalCAnd")}</p>
          <span>{t("brand.clawActionMuseInspiration")}</span>
        </div>
      </section>
    </>
  );
}
function Changelog({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  const releases = language === "zh-CN" ? changelog["zh-CN"] : changelog.en;
  return (
    <>
      <PageIntro
        eyebrow={t("changelog.changelogStillMaking")}
        title={t("changelog.aLittleBetterOneStepAtATime")}
      />
      <section className="container changelog-list">
        {releases.map((entry) => (
          <article key={entry.version}>
            <div>
              <time dateTime={entry.date}>{entry.date.replaceAll("-", ".")}</time>
            </div>
            <div>
              <h2>ClawMuse {entry.version}</h2>
              {entry.sections.map((section) => (
                <section key={section.title}>
                  <span className="eyebrow">{section.title}</span>
                  <ul>
                    {section.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
              {entry.notes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className="section container">
        <PageLink page="/download" language={language}>
          {t("changelog.checkCurrentAvailability")}
        </PageLink>
      </section>
    </>
  );
}
function Support({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  const troubleshooting = useMemo(
    () =>
      [
        [
          t("support.myComputerIsMissingAfterSignIn"),
          t("support.checkThatTheDesktopIsSignedInAndLinked"),
        ],
        [t("support.myDeviceIsOffline"), t("support.checkThatTheHostIsOnlineAwakeAndStill")],
        [
          t("support.linuxSaysCommandNotFound"),
          t("support.checkThatTheInstalledClawmuseRuntimeIncludesAccountSupport"),
        ],
        [
          t("support.connectedButICannotStartATask"),
          t("support.onTheHostCheckTheProjectPathCodingTool"),
        ],
        [
          t("support.linuxGoesOfflineWhenILeaveSsh"),
          t("support.theDaemonMayBeRunningOnlyInTheCurrent"),
        ],
      ] as const,
    [t],
  );
  const report = t("support.clawmuseIssueReportDeviceOsAndVersionClawmuseVersion");
  return (
    <>
      <PageIntro
        eyebrow={t("support.helpKeepThingsMoving")}
        title={t("support.hitALittleFrictionLetSKeepYouMoving")}
      >
        {t("support.startWithYourAccountTheDeviceSOnlineStatus")}
      </PageIntro>
      <section className="container help-shortcuts">
        <a href={href("/docs", language)}>
          <Monitor />
          <strong>{t("support.firstTimeSetup")}</strong>
          <span>{t("support.fromDesktopSignInToMobileAccess")}</span>
          <ArrowRight />
        </a>
        <a href={href("/docs/linux", language)}>
          <Terminal />
          <strong>{t("support.linuxGuide")}</strong>
          <span>{t("support.accountLinkingAndPersistentService")}</span>
          <ArrowRight />
        </a>
        <a href={href("/security", language)}>
          <ShieldCheck />
          <strong>{t("support.securityAndAccounts")}</strong>
          <span>{t("support.understandAccessAndTrustBoundaries")}</span>
          <ArrowRight />
        </a>
      </section>
      <section className="section container narrow">
        <SectionHeading
          eyebrow={t("support.troubleshooting")}
          title={t("support.checkTheseFirst")}
        />
        <FAQ items={troubleshooting} />
      </section>
      <section className="container support-report">
        <div>
          <CircleHelp size={28} />
          <h2>{t("support.stillNeedAHandBringTheUsefulDetails")}</h2>
          <p>{t("support.copyThisTemplateAndSendItThroughTheContact")}</p>
          <a className="button" href={`mailto:${contactEmail}`}>
            {contactEmail}
          </a>
          <a className="button primary" href="https://github.com/endvin/clawmuse-releases/issues">
            {t("support.reportIssue")}
            <ArrowUpRight size={17} />
          </a>
        </div>
        <CodeBlock language={language} caption={t("support.issueTemplate")} code={report} />
      </section>
    </>
  );
}
function Policy({ language, page }: Props) {
  const { t } = useSiteTranslation(language);
  const privacy = page === "/privacy";
  const items = privacy
    ? [
        [t("policy.contactTitle"), t("policy.contactBody")],
        [
          t("policy.browsingThisWebsite"),
          t("policy.thisWebsiteStoresYourLightOrDarkThemePreference"),
        ],
        [t("policy.accountsAndDevices"), t("policy.registrationAndSignInAreHandledByTheClawmuse")],
        [t("policy.projectsAndTasks"), t("policy.projectFilesAgentsAndTerminalsLiveOnTheMachine")],
        [t("policy.optionalServices"), t("policy.optionalServicesBody")],
        [t("policy.localSessions"), t("policy.mobileSessionsUseSystemSecureStorageTheDesktopUses")],
        [t("policy.retentionTitle"), t("policy.retentionBody")],
        [t("policy.yourControls"), t("policy.youCanSignOutRemoveDeviceDirectoryEntriesAnd")],
        [t("policy.rightsTitle"), t("policy.rightsBody")],
      ]
    : [
        [t("policy.betaService"), t("policy.serviceAvailability")],
        [
          t("policy.accountsAndAuthorization"),
          t("policy.protectYourCredentialsAndLinkOnlyMachinesYouOwn"),
        ],
        [
          t("policy.aiToolsAndOutput"),
          t("policy.clawmuseConnectsYourDevelopmentEnvironmentAndDoesNotInclude"),
        ],
        [
          t("policy.acceptableUse"),
          t("policy.followApplicableRulesAndThirdPartyServiceRequirementsDo"),
        ],
        [t("policy.stoppingUseAndFeedback"), t("policy.youCanSignOutAndStopTheClientOr")],
      ];
  return (
    <>
      <PageIntro
        eyebrow={privacy ? t("policy.privacyEyebrow") : t("policy.termsEyebrow")}
        title={privacy ? t("policy.aboutYourData") : t("policy.beforeYouGetStarted")}
      >
        {t("policy.updated")}
      </PageIntro>
      <article className="container policy-body narrow">
        {items.map(([title, body], i) => (
          <section key={title}>
            <span className="micro-label">0{i + 1}</span>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}
        <div className="support-data-links">
          <PageLink page={privacy ? "/security" : "/privacy"} language={language}>
            {privacy ? t("policy.exploreSecurityBoundaries") : t("policy.readThePrivacyNotice")}
          </PageLink>
          <PageLink page="/account-deletion" language={language}>
            {t("support.accountData")}
          </PageLink>
          <PageLink page="/support" language={language}>
            {t("support.helpKeepThingsMoving")}
          </PageLink>
          {privacy && (
            <PageLink page="/terms" language={language}>
              {t("policy.termsEyebrow")}
            </PageLink>
          )}
        </div>
      </article>
    </>
  );
}
