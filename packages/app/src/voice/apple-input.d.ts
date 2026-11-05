import type { LocalVoiceInput } from "./local-input";
export function isAppleInputAvailable(): Promise<boolean>;
export function createAppleInput(): LocalVoiceInput | undefined;
