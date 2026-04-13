/**
 * Concatenate text sources into one file for copy-paste / external AI review.
 * Run from project root: node scripts/export-codebase-for-review.mjs [--out path|-]
 */
import fs from "fs";
import path from "path";

const SEP = "=".repeat(80);
const MAX_BYTES = 512 * 1024;

const SKIP_DIR_NAMES = new Set([
  "node_modules",
  ".next",
  "out",
  "build",
  "coverage",
  ".git",
  ".vercel",
  ".cursor",
  "dist",
]);

const LOCKFILES = new Set(["package-lock.json", "pnpm-lock.yaml", "yarn.lock"]);

const BINARY_EXT = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".woff",
  ".woff2",
  ".pdf",
  ".zip",
  ".mp4",
  ".mp3",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
]);

const INCLUDE_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".sql",
  ".md",
]);

function parseArgs() {
  const cwd = process.cwd();
  let outPath = path.join(cwd, "code-review-bundle.txt");
  let useStdout = false;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) {
      const v = argv[++i];
      if (v === "-") useStdout = true;
      else outPath = path.isAbsolute(v) ? v : path.join(cwd, v);
    }
  }
  return { outPath, useStdout, cwd };
}

function shouldSkipFile(relPosix, baseName) {
  if (baseName === ".env" || baseName === ".env.local") return true;
  if (/^\.env\..+\.local$/i.test(baseName) && baseName !== ".env.local.example") return true;
  if (LOCKFILES.has(baseName)) return true;
  if (baseName.endsWith(".pem")) return true;
  const ext = path.extname(baseName).toLowerCase();
  if (BINARY_EXT.has(ext)) return true;
  if (!INCLUDE_EXT.has(ext)) return true;
  return false;
}

function* walkDir(absDir, rootAbs) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(absDir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR_NAMES.has(e.name)) continue;
      yield* walkDir(full, rootAbs);
    } else if (e.isFile()) {
      const rel = path.relative(rootAbs, full);
      const relPosix = rel.split(path.sep).join("/");
      yield { full, rel: relPosix };
    }
  }
}

function main() {
  const { outPath, useStdout, cwd } = parseArgs();
  const collected = [];
  for (const { full, rel } of walkDir(cwd, cwd)) {
    const base = path.basename(rel);
    if (shouldSkipFile(rel, base)) continue;
    collected.push({ full, rel });
  }
  collected.sort((a, b) => a.rel.localeCompare(b.rel, "en"));

  const parts = [];
  for (const { full, rel } of collected) {
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    parts.push(`${SEP}\nFILE: ${rel}\n${SEP}\n`);
    if (st.size > MAX_BYTES) {
      parts.push(`[OMITTED: file larger than ${MAX_BYTES} bytes]\n\n`);
      continue;
    }
    try {
      parts.push(fs.readFileSync(full, "utf8"));
    } catch {
      parts.push(`[OMITTED: could not read file]\n\n`);
      continue;
    }
    parts.push("\n\n");
  }

  const body = parts.join("");
  if (useStdout) {
    process.stdout.write(body);
  } else {
    fs.writeFileSync(outPath, body, "utf8");
    process.stderr.write(`Wrote ${outPath} (${collected.length} files, ${body.length} chars)\n`);
  }
}

main();
