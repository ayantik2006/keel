import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { accessSync, constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CliError } from "./errors.js";

/**
 * Starts a command with an extra environment and mirrors its lifecycle:
 * termination signals are forwarded, the child is cleaned up if this process
 * goes away, and its exit status becomes ours.
 *
 * The command and its arguments are always passed as an array. There is no
 * shell string built from user or secret input. On Windows, batch shims such
 * as npm.cmd can only be started through cmd.exe, so arguments are escaped for
 * it (same rules as the cross-spawn library).
 */
export async function runCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const target = resolveExecutable(command);
  const plan = planSpawn(target, args);

  const child = spawn(plan.file, plan.args, {
    env,
    stdio: "inherit",
    shell: false,
    windowsVerbatimArguments: plan.verbatim,
  });

  return supervise(child, command);
}

function supervise(child: ChildProcess, label: string): Promise<number> {
  return new Promise((resolve, reject) => {
    let exited = false;
    const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

    const kill = (signal: NodeJS.Signals) => {
      if (exited || child.pid === undefined) return;
      if (process.platform === "win32") {
        // Signals are not delivered on Windows; end the whole process tree
        // so grandchildren (for example npm -> node) do not linger.
        spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      } else {
        child.kill(signal);
      }
    };

    const handlers = signals.map((sig) => {
      const fn = () => kill(sig);
      process.on(sig, fn);
      return [sig, fn] as const;
    });
    const onExit = () => kill("SIGTERM");
    process.on("exit", onExit);

    const cleanup = () => {
      for (const [sig, fn] of handlers) process.removeListener(sig, fn);
      process.removeListener("exit", onExit);
    };

    child.on("error", (err: NodeJS.ErrnoException) => {
      exited = true;
      cleanup();
      reject(
        new CliError(
          err.code === "ENOENT"
            ? `Command not found: ${label}`
            : `Could not start ${label}.`,
          127,
        ),
      );
    });

    child.on("exit", (code, signal) => {
      exited = true;
      cleanup();
      if (code !== null) return resolve(code);
      const num = signal ? os.constants.signals[signal] : undefined;
      resolve(128 + (num ?? 1));
    });
  });
}

const isWin = () => process.platform === "win32";

/** Finds the executable using the PARENT's PATH, never a secret-supplied one. */
export function resolveExecutable(command: string): string {
  const hasDir = command.includes("/") || command.includes("\\");
  const exts = isWin()
    ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean)
    : [""];
  const dirs = hasDir
    ? [""]
    : (process.env.PATH ?? process.env.Path ?? "").split(path.delimiter).filter(Boolean);

  for (const dir of dirs) {
    const base = hasDir ? command : path.join(dir, command);
    const candidates = isWin()
      ? [base, ...exts.map((e) => base + e.toLowerCase()), ...exts.map((e) => base + e)]
      : [base];
    for (const candidate of candidates) {
      try {
        accessSync(candidate, isWin() ? constants.F_OK : constants.X_OK);
        if (!isWin() || /\.[A-Za-z0-9]+$/.test(candidate)) return candidate;
      } catch {
        /* next */
      }
    }
  }
  throw new CliError(`Command not found: ${command}`, 127);
}

const META = /([()\][%!^"`<>&|;, *?])/g;

function escapeArgument(arg: string, doubleEscape: boolean) {
  let s = `${arg}`;
  s = s.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
  s = s.replace(/(?=(\\+?)?)\1$/, "$1$1");
  s = `"${s}"`;
  s = s.replace(META, "^$1");
  if (doubleEscape) s = s.replace(META, "^$1");
  return s;
}

export function planSpawn(file: string, args: string[]) {
  if (!isWin() || !/\.(cmd|bat)$/i.test(file))
    return { file, args, verbatim: false };

  const shim = /node_modules[\\/]\.bin[\\/][^\\/]+\.cmd$/i.test(file);
  const line = [file.replace(META, "^$1"), ...args.map((a) => escapeArgument(a, shim))].join(" ");
  return {
    file: process.env.comspec || "cmd.exe",
    args: ["/d", "/s", "/c", `"${line}"`],
    verbatim: true,
  };
}
