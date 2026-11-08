import { accountUrl, contactEmail } from "./content";
import { useSiteTranslation } from "./i18n/i18n";
import { Note, PageIntro, PageLink, type Localized } from "./ui";

export function AccountData({ language }: Localized) {
  const { t } = useSiteTranslation(language);
  const sections = [
    [t("policy.accountsAndDevices"), t("policy.registrationAndSignInAreHandledByTheClawmuse")],
    [t("policy.projectsAndTasks"), t("policy.projectFilesAgentsAndTerminalsLiveOnTheMachine")],
    [t("policy.optionalServices"), t("policy.optionalServicesBody")],
    [t("policy.yourControls"), t("policy.youCanSignOutRemoveDeviceDirectoryEntriesAnd")],
    [t("policy.retentionTitle"), t("policy.retentionBody")],
  ];
  return (
    <>
      <PageIntro eyebrow="ClawMuse" title={t("accountData.title")}>
        {t("accountData.intro")}
      </PageIntro>
      <article className="container policy-body narrow">
        {sections.map(([title, body]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}
        <Note>{t("accountData.privateRequest")}</Note>
        <p>
          <a
            className="button primary"
            href={`mailto:${contactEmail}?subject=ClawMuse%20account%20deletion`}
          >
            {contactEmail}
          </a>
        </p>
        <p>
          <a className="button" href={accountUrl}>
            {t("header.signIn")}
          </a>
        </p>
        <p>
          <PageLink page="/privacy" language={language}>
            {t("policy.readThePrivacyNotice")}
          </PageLink>
        </p>
        <PageLink page="/security" language={language}>
          {t("policy.exploreSecurityBoundaries")}
        </PageLink>
      </article>
    </>
  );
}
