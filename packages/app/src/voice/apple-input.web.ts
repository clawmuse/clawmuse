import type { LocalVoiceInput } from "./local-input";
export async function isAppleInputAvailable(): Promise<boolean> {
  return false;
}
export function createAppleInput(): LocalVoiceInput | undefined {
  return undefined;
}
