import { memo, useMemo } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { ComposerTrackPill, ComposerTrackRow } from "@/composer/tracks";
import { TaskListRow } from "@/components/task-list-row";
import type { TodoEntry } from "@/types/stream";

export const AgentTaskList = memo(function AgentTaskList({
  tasks,
  rail = false,
}: {
  tasks: TodoEntry[] | undefined;
  /** Inside the composer's action rail — see `ComposerTrackPill`'s `rail`. */
  rail?: boolean;
}) {
  if (!tasks?.length) return null;
  return <TaskListCard tasks={tasks} rail={rail} />;
});

const TaskListCard = memo(function TaskListCard({
  tasks,
  rail,
}: {
  tasks: TodoEntry[];
  rail: boolean;
}) {
  const { t } = useTranslation();
  const completed = useMemo(
    () => tasks.filter((task) => task.completed || task.status === "completed").length,
    [tasks],
  );
  // Counts only. The active task used to ride along in the header, where it was the first thing
  // truncated on a phone; the panel shows it in full, in place, with the rest of the list.
  const label = t("message.todo.tasksProgress", { completed, total: tasks.length });
  const segments = useMemo(() => [{ bucket: null, text: label }], [label]);

  return (
    <ComposerTrackPill
      testID="agent-task-list-header"
      segments={segments}
      panelTitle={t("message.todo.title")}
      rail={rail}
    >
      {tasks.map((task, index) => (
        <ComposerTrackRow key={task.id ?? `${index}:${task.text}`}>
          <View style={styles.taskRow}>
            <TaskListRow task={task} />
          </View>
        </ComposerTrackRow>
      ))}
    </ComposerTrackPill>
  );
});

const styles = StyleSheet.create(() => ({
  // The task row draws its own icon and text; this only lets it span the shared row frame.
  // Basis stays `auto` so the text's width reaches the panel's measurement — see track.tsx.
  taskRow: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
  },
}));
