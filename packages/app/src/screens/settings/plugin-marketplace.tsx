import { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import type { PluginListItem } from "@getpaseo/protocol/messages";
import { SettingsCard, SettingsRow } from "@/components/settings";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, FormTextInput } from "@/components/ui/form-field";
import { SelectField } from "@/components/ui/select-field";
import { StatusBadge } from "@/components/ui/status-badge";
import { useFetchQuery } from "@/data/query";
import {
  filterMarketplace,
  installedMarketplacePlugin,
  loadMarketplace,
  marketplaceListing,
  marketplaceMatches,
  MARKETPLACE_URL,
  type PublishedPlugin,
} from "./plugin-marketplace-model";

interface MarketplaceProps {
  installed: PluginListItem[];
  pending: boolean;
  installingId: string | null;
  canInstall: boolean;
  onInstall(plugin: PublishedPlugin): void;
  onEnable(plugin: PluginListItem): void;
  onManage(): void;
}

function CommunityPlugin({
  plugin,
  installed,
  pending,
  installingId,
  canInstall,
  onInstall,
  onManage,
}: Omit<MarketplaceProps, "onEnable"> & { plugin: PublishedPlugin }) {
  const { t, i18n } = useTranslation();
  const listing = marketplaceListing(plugin, i18n.resolvedLanguage ?? i18n.language);
  const current = installedMarketplacePlugin(plugin, installed);
  let actionLabel = "settings.plugins.install";
  if (installingId === plugin.id) actionLabel = "settings.plugins.installing";
  if (current) actionLabel = "settings.plugins.manage";
  const install = useCallback(() => onInstall(plugin), [onInstall, plugin]);
  const badge = useMemo(
    () =>
      current ? (
        <StatusBadge variant="muted" label={t("settings.plugins.marketplace.installed")} />
      ) : undefined,
    [current, t],
  );
  const description = useMemo(
    () => (
      <View style={styles.details}>
        <Text style={styles.description}>{listing.description}</Text>
        <Text style={styles.metadata}>
          {plugin.id} · {plugin.author.name ?? plugin.author.github}
        </Text>
        <Text style={styles.metadata}>
          {plugin.artifact.kind === "npm"
            ? plugin.artifact.version
            : plugin.artifact.commit.slice(0, 12)}
        </Text>
      </View>
    ),
    [listing.description, plugin],
  );
  return (
    <SettingsRow
      label={listing.name}
      labelAccessory={badge}
      hint={description}
      testID={`marketplace-plugin-${plugin.id}`}
    >
      <Button
        variant="outline"
        size="sm"
        disabled={pending || (!current && !canInstall)}
        onPress={current ? onManage : install}
      >
        {t(actionLabel)}
      </Button>
    </SettingsRow>
  );
}

function OfficialPlugin({
  plugin,
  pending,
  onEnable,
  onManage,
}: Pick<MarketplaceProps, "pending" | "onEnable" | "onManage"> & { plugin: PluginListItem }) {
  const { t } = useTranslation();
  const enable = useCallback(() => onEnable(plugin), [onEnable, plugin]);
  const description = useMemo(
    () => <Text style={styles.description}>{plugin.description}</Text>,
    [plugin.description],
  );
  const badge = useMemo(
    () => (
      <StatusBadge
        variant={plugin.enabled ? "success" : "muted"}
        label={t(
          plugin.enabled ? "settings.plugins.marketplace.installed" : "settings.plugins.bundled",
        )}
      />
    ),
    [plugin.enabled, t],
  );
  return (
    <SettingsRow
      label={plugin.name ?? plugin.id}
      labelAccessory={badge}
      hint={description}
      testID={`marketplace-plugin-${plugin.id}`}
    >
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onPress={plugin.enabled ? onManage : enable}
      >
        {t(plugin.enabled ? "settings.plugins.manage" : "settings.plugins.actions.enable")}
      </Button>
    </SettingsRow>
  );
}

export function PluginMarketplace(props: MarketplaceProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [limit, setLimit] = useState(20);
  const search = useCallback((value: string) => {
    setQuery(value);
    setLimit(20);
  }, []);
  const selectCategory = useCallback((value: string) => {
    setCategory(value);
    setLimit(20);
  }, []);
  const loadMore = useCallback(() => setLimit((value) => value + 20), []);
  const directory = useFetchQuery({
    queryKey: ["plugin-marketplace", MARKETPLACE_URL],
    queryFn: ({ signal }) => loadMarketplace(signal),
    dataShape: "value",
    staleTimeMs: 300_000,
    retry: 1,
  });
  const refresh = useCallback(() => {
    void directory.refetch();
  }, [directory]);
  const options = useMemo(
    () => [
      { id: "all", value: "all", label: t("settings.plugins.marketplace.all") },
      { id: "official", value: "official", label: t("settings.plugins.marketplace.official") },
      ...(directory.data?.categories.map(({ slug, label }) => ({ id: slug, value: slug, label })) ??
        []),
    ],
    [directory.data, t],
  );
  const selectedDisplay = useMemo(
    () => ({ label: options.find(({ value }) => value === category)?.label ?? category }),
    [category, options],
  );
  const official = props.installed.filter(
    (plugin) =>
      plugin.bundled &&
      (category === "all" || category === "official") &&
      marketplaceMatches(query, [plugin.id, plugin.name ?? "", plugin.description ?? ""]),
  );
  const community =
    directory.data && category !== "official"
      ? filterMarketplace(directory.data, query, category, language)
      : [];
  const showCommunity = category !== "official";
  return (
    <View style={styles.container} testID="plugin-marketplace">
      <Field label={t("settings.plugins.marketplace.search")}>
        <FormTextInput
          initialValue=""
          onChangeText={search}
          placeholder={t("settings.plugins.marketplace.search")}
          accessibilityLabel={t("settings.plugins.marketplace.search")}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </Field>
      <SelectField
        label={t("settings.plugins.marketplace.category")}
        value={category}
        selectedDisplay={selectedDisplay}
        options={options}
        onChange={selectCategory}
        placeholder={t("settings.plugins.marketplace.all")}
        emptyText={t("settings.plugins.marketplace.noResults")}
      />
      {official.length ? (
        <SettingsSection title={t("settings.plugins.marketplace.official")}>
          <SettingsCard>
            {official.map((plugin) => (
              <OfficialPlugin
                key={plugin.id}
                plugin={plugin}
                pending={props.pending}
                onEnable={props.onEnable}
                onManage={props.onManage}
              />
            ))}
          </SettingsCard>
        </SettingsSection>
      ) : null}
      {showCommunity ? (
        <SettingsSection title={t("settings.plugins.marketplace.community")}>
          <Text style={styles.description}>{t("settings.plugins.marketplace.reviewedHint")}</Text>
          <View style={styles.toolbar}>
            <Button variant="outline" size="sm" onPress={props.onManage}>
              {t("settings.plugins.marketplace.installFromSource")}
            </Button>
            <Button variant="outline" size="sm" onPress={refresh} disabled={directory.isFetching}>
              {t("settings.plugins.marketplace.refresh")}
            </Button>
          </View>
          {directory.isLoading ? (
            <Alert size="sm" title={t("settings.plugins.states.loading")} />
          ) : null}
          {directory.isError ? (
            <Alert
              size="sm"
              variant="error"
              title={t("settings.plugins.states.errorTitle")}
              description={String(directory.error)}
            >
              <Button variant="outline" size="sm" onPress={refresh}>
                {t("settings.plugins.states.retry")}
              </Button>
            </Alert>
          ) : null}
          {!props.canInstall ? (
            <Alert size="sm" title={t("settings.plugins.states.sourceUpdateTitle")} />
          ) : null}
          {community.length ? (
            <SettingsCard>
              {community.slice(0, limit).map((plugin) => (
                <CommunityPlugin key={plugin.id} plugin={plugin} {...props} />
              ))}
            </SettingsCard>
          ) : null}
          {directory.data?.plugins.length === 0 ? (
            <Alert size="sm" title={t("settings.plugins.marketplace.emptyReviewed")} />
          ) : null}
          {community.length > limit ? (
            <Button variant="outline" onPress={loadMore}>
              {t("settings.plugins.marketplace.loadMore")}
            </Button>
          ) : null}
        </SettingsSection>
      ) : null}
      {!official.length &&
      !community.length &&
      (!showCommunity || (!directory.isLoading && !directory.isError)) ? (
        <Alert size="sm" title={t("settings.plugins.marketplace.noResults")} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { gap: theme.spacing[4] },
  toolbar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: theme.spacing[2],
    flexWrap: "wrap",
  },
  details: { gap: theme.spacing[1] },
  description: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base },
  metadata: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.sm },
}));
