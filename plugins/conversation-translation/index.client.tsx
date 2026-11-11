import type { PluginClientContext } from "@getpaseo/plugin/client";
import { enqueueTranslation } from "./client/queue.js";
import { fieldsRpc } from "./shared/contracts.js";
import { TranslationRow, translationQueue } from "./client/row.js";

import { TranslationSettings } from "./client/settings.js";
import { settingsRpc } from "@getpaseo/plugin";
import { preferences, configuredPreferencesSchema, rowSchema } from "./shared/contracts.js";

export default function contribute(client: PluginClientContext) {
  client.addSettingsScreen({
    id: "translation",
    title: "会话翻译",
    icon: "Languages",
    Component: TranslationSettings,
  });
  client.addCommandCenterItem({
    id: "translation-settings",
    title: "会话翻译",
    icon: "Languages",
    context: "global",
    onSelect({ openSettings }) {
      openSettings("translation");
    },
  });
  client.addTimelineRenderer({
    kind: "translation",
    version: 1,
    schema: rowSchema,
    Component: TranslationRow,
  });
  let removeTransforms: (() => void)[] = [];
  let removeContentTranslator: (() => void) | undefined;
  let contentRevision: string | undefined;
  let disposed = false;
  let refreshVersion = 0;
  async function refresh() {
    const version = ++refreshVersion;
    const state = await client.rpc(settingsRpc(preferences.id).read, {});
    if (disposed || version !== refreshVersion) return;
    const configured =
      state.status === "ready" && configuredPreferencesSchema.safeParse(state.values).success;
    if (!configured) {
      for (const remove of removeTransforms) remove();
      removeTransforms = [];
      removeContentTranslator?.();
      removeContentTranslator = undefined;
      contentRevision = undefined;
      return;
    }
    // COMPAT(pluginContentTranslator): added in v1.5.2, remove after 2027-05-05.
    if (typeof client.addContentTranslator === "function" && contentRevision !== state.revision) {
      removeContentTranslator?.();
      contentRevision = state.revision;
      removeContentTranslator = client.addContentTranslator({
        id: "questions",
        revision: state.revision,
        translate: (texts, signal) =>
          enqueueTranslation(
            async () => {
              const result = await client.rpc(fieldsRpc, { texts, revision: state.revision });
              return result.texts;
            },
            signal,
            true,
          ),
      });
    }
    if (removeTransforms.length) return;
    removeTransforms.push(
      client.addTimelineTransformer({
        id: "assistant-translation",
        query: { itemType: "assistant_message" },
        transform: ({ item, phase }) => ({
          items: [
            {
              type: "plugin",
              kind: "translation",
              version: 1,
              data: { text: item.text, role: "assistant", phase },
            },
          ],
        }),
      }),
    );
    removeTransforms.push(
      client.addTimelineTransformer({
        id: "user-translation",
        query: { itemType: "user_message" },
        transform: ({ item, phase }) => ({
          items: [
            {
              type: "plugin",
              kind: "translation",
              version: 1,
              data: {
                text: item.text,
                role: "user",
                phase,
                ...(item.clientMessageId ? { clientMessageId: item.clientMessageId } : {}),
              },
            },
          ],
        }),
      }),
    );
  }
  function update() {
    void refresh().catch((error: unknown) =>
      console.error("Conversation translation settings could not load", error),
    );
  }
  const events = client.paseo.observeEvents(["status.plugin_settings_changed"]);
  const unsubscribe = events.subscribe({ snapshot: update, update, error: update });
  void events.ready.catch(update);
  update();
  return async () => {
    disposed = true;
    translationQueue.close();
    unsubscribe();
    removeContentTranslator?.();
    for (const remove of removeTransforms) remove();
    await events.release();
  };
}
