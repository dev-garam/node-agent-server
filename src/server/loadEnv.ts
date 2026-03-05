import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const parseEnvLine = (line: string): { key: string; value: string } | undefined => {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.startsWith("#")) {
    return undefined;
  }

  const eqIndex = trimmed.indexOf("=");
  if (eqIndex <= 0) {
    return undefined;
  }

  const key = trimmed.slice(0, eqIndex).trim();
  let value = trimmed.slice(eqIndex + 1).trim();

  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }

  if (!key) {
    return undefined;
  }

  return { key, value };
};

export const loadEnv = (filePath = ".env"): void => {
  const target = resolve(process.cwd(), filePath);
  if (!existsSync(target)) {
    return;
  }

  const content = readFileSync(target, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }

    if (process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
};
