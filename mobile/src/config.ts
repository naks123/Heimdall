/**
 * Default API base for **Android Emulator**: `10.0.2.2` is the host machine’s localhost.
 * Override with EXPO_PUBLIC_API_BASE for iOS Simulator (`http://127.0.0.1:3001`) or a physical device.
 */
export const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE ?? "http://10.0.2.2:3001";
