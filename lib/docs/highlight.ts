/**
 * Minimal syntax highlighter. It tokenizes on the server so no highlighting
 * code ships to the browser. Unknown languages render as plain text.
 */
export type TokenKind = "comment" | "string" | "keyword" | "number" | "prop" | "plain";
export type Token = { kind: TokenKind; text: string };

type Rule = { kind: TokenKind; re: RegExp; lineStart: boolean };

const rule = (kind: TokenKind, source: string, lineStart = false): Rule => ({
  kind,
  re: new RegExp(source, "y"),
  lineStart,
});

const words = (list: string) => `\\b(?:${list.trim().split(/\s+/).join("|")})\\b`;

const DOUBLE = '"(?:\\\\.|[^"\\\\])*"';
const SINGLE = "'(?:\\\\.|[^'\\\\])*'";

const JS_KEYWORDS =
  "const let var function return if else for while await async import from export default new try catch throw class extends typeof null true false undefined of in type interface as";

const LANGS: Record<string, Rule[]> = {
  js: [
    rule("comment", "//[^\\n]*|/\\*[\\s\\S]*?\\*/"),
    rule("string", `${DOUBLE}|${SINGLE}|\`(?:\\\\.|[^\`\\\\])*\``),
    rule("keyword", words(JS_KEYWORDS)),
    rule("number", "\\b\\d+(?:\\.\\d+)?\\b"),
  ],
  json: [
    rule("prop", `${DOUBLE}(?=\\s*:)`),
    rule("string", DOUBLE),
    rule("keyword", "\\b(?:true|false|null)\\b"),
    rule("number", "-?\\b\\d+(?:\\.\\d+)?\\b"),
  ],
  bash: [
    rule("comment", "#[^\\n]*"),
    rule("string", `${DOUBLE}|'[^']*'`),
    rule("prop", "\\$\\{?[A-Za-z_][A-Za-z0-9_]*\\}?"),
    rule("keyword", words("if then else fi for do done while case esac export")),
    rule("keyword", "(?<=\\s)--?[A-Za-z][\\w-]*"),
  ],
  http: [
    rule("keyword", "(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\\b|HTTP/\\d(?:\\.\\d)?", true),
    rule("prop", "[A-Za-z][A-Za-z0-9-]*(?=:)", true),
    rule("string", DOUBLE),
    rule("number", "\\b\\d{3}\\b"),
  ],
  env: [
    rule("comment", "#[^\\n]*"),
    rule("prop", "[A-Za-z_][A-Za-z0-9_]*(?==)", true),
    rule("string", `${DOUBLE}|'[^']*'`),
  ],
};

const ALIASES: Record<string, string> = {
  javascript: "js",
  ts: "js",
  typescript: "js",
  tsx: "js",
  jsx: "js",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  powershell: "bash",
  dotenv: "env",
  gitignore: "bash",
};

export function highlight(code: string, lang: string): Token[] {
  const set = LANGS[ALIASES[lang] ?? lang];
  if (!set) return [{ kind: "plain", text: code }];

  const tokens: Token[] = [];
  let plain = "";
  const flush = () => {
    if (plain) tokens.push({ kind: "plain", text: plain });
    plain = "";
  };

  let pos = 0;
  while (pos < code.length) {
    const atLineStart = pos === 0 || code[pos - 1] === "\n";
    let hit: Token | null = null;
    for (const r of set) {
      if (r.lineStart && !atLineStart) continue;
      r.re.lastIndex = pos;
      const m = r.re.exec(code);
      if (m && m[0].length > 0) {
        hit = { kind: r.kind, text: m[0] };
        break;
      }
    }
    if (hit) {
      flush();
      tokens.push(hit);
      pos += hit.text.length;
    } else {
      plain += code[pos++];
    }
  }
  flush();
  return tokens;
}
