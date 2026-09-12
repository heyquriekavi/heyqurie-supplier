// Secure storage on phones; localStorage in the browser, where expo-secure-store does not exist.
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const web = Platform.OS === "web";

export async function getItem(key: string): Promise<string | null> {
  if (web) return typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (web) return void localStorage?.setItem(key, value);
  return SecureStore.setItemAsync(key, value);
}

export async function deleteItem(key: string): Promise<void> {
  if (web) return void localStorage?.removeItem(key);
  return SecureStore.deleteItemAsync(key);
}
