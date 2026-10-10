import { homedir } from "node:os";
import path from "node:path";

/** Where credentials live. Override with KEEL_CONFIG_DIR. */
export function configDir(): string {
  const override = process.env.KEEL_CONFIG_DIR;
  if (override) return path.resolve(override);
  if (process.platform === "win32") {
    return path.join(
      process.env.APPDATA ?? path.join(homedir(), "AppData", "Roaming"),
      "keel-cli",
    );
  }
  const xdg = process.env.XDG_CONFIG_HOME;
  return path.join(xdg ?? path.join(homedir(), ".config"), "keel-cli");
}

export const PROJECT_CONFIG_NAME = ".keel.json";
