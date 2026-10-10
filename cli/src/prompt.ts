import readline from "node:readline";
import { CliError } from "./errors.js";

/** All prompts go to stderr so stdout stays clean for piping. */

export const interactive = () =>
  Boolean(process.stdin.isTTY && process.stderr.isTTY);

export async function selectOne<T>(
  title: string,
  items: { label: string; value: T }[],
): Promise<T> {
  if (items.length === 0) throw new CliError(`Nothing to choose from: ${title}`);
  if (items.length === 1) return items[0].value;
  if (!interactive())
    throw new CliError(
      `${title}: several options exist and this is not an interactive terminal. Pass the choice with flags.`,
    );

  process.stderr.write(`${title}\n`);
  items.forEach((item, i) => process.stderr.write(`  ${i + 1}) ${item.label}\n`));

  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  try {
    for (;;) {
      const answer = await new Promise<string>((resolve) => rl.question("Choose a number: ", resolve));
      const n = Number(answer.trim());
      if (Number.isInteger(n) && n >= 1 && n <= items.length) return items[n - 1].value;
      process.stderr.write(`Enter a number from 1 to ${items.length}.\n`);
    }
  } finally {
    rl.close();
  }
}

/** Reads all of stdin (for piped values). */
export async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

/** Prompts without echoing what is typed. Requires a terminal. */
export function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY)
    throw new CliError(
      "Cannot prompt for a value without a terminal. Pipe it in with --stdin.",
    );
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stderr.write(question);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const finish = (cb: () => void) => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      process.stderr.write("\n");
      cb();
    };
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish(() => resolve(value));
        if (ch === "\u0003") return finish(() => reject(new CliError("Cancelled.", 130)));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else if (ch >= " ") value += ch;
      }
    };
    stdin.on("data", onData);
  });
}
