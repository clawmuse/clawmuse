import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

export function UsageFooter({ children }: { children: ReactNode }) {
  return <View style={styles.footer}>{children}</View>;
}

const styles = StyleSheet.create({
  // Reduce the composer's 16px sibling gap to 6px for read-only metadata.
  footer: { marginTop: -6 },
});
