// expo-env.d.ts is gitignored, so CI's clean checkout lacks the web style props (transition*)
// that local typecheck gets from it. Reference the same declarations from a tracked file.
/// <reference types="expo/types" />
import "react-native";

declare module "react-native" {
  interface PressableStateCallbackType {
    hovered?: boolean;
  }
}
