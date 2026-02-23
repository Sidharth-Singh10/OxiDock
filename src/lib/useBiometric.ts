/**
 * Biometric authentication helpers.
 *
 * On mobile the plugin is available; on desktop we gracefully skip.
 */

import {
  checkStatus,
  authenticate,
  type AuthOptions,
} from "@tauri-apps/plugin-biometric";

/** Check whether biometric hardware is available on this device. */
export async function checkBiometricAvailable(): Promise<{
  available: boolean;
  error?: string;
}> {
  try {
    const status = await checkStatus();
    return {
      available: status.isAvailable,
      error: status.error ?? undefined,
    };
  } catch {
    // Plugin not registered (desktop) → treat as available (no gate)
    return { available: true };
  }
}

/**
 * Prompt biometric authentication.
 * Resolves on success, throws on failure / cancellation.
 * On desktop (plugin not registered) this is a no-op.
 */
export async function requireBiometric(reason: string): Promise<void> {
  try {
    const opts: AuthOptions = {
      allowDeviceCredential: true,
      title: "Authentication Required",
      confirmationRequired: true,
    };
    await authenticate(reason, opts);
  } catch (err: unknown) {
    // If the plugin simply isn't available (desktop), let it pass
    if (
      err instanceof Error &&
      err.message?.includes("plugin biometric not found")
    ) {
      return;
    }
    throw err;
  }
}
