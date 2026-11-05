import * as SecureStore from "expo-secure-store";

// ActivityKit wakes the app while locked to deliver a new update token.
const SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

/** Native: the device Keychain / Keystore. `secure-store.web.ts` is the desktop vault. */
export const secureStoreSupported = true;
export const statusSessionIsEphemeral = false;

export function getSecureItem(key: string): Promise<string | null> {
  return SecureStore.getItemAsync(key, SECURE_STORE_OPTIONS);
}

export function setSecureItem(key: string, value: string): Promise<void> {
  return SecureStore.setItemAsync(key, value, SECURE_STORE_OPTIONS);
}

export function deleteSecureItem(key: string): Promise<void> {
  return SecureStore.deleteItemAsync(key, SECURE_STORE_OPTIONS);
}
