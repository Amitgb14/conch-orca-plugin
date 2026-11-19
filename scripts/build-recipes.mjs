#!/usr/bin/env node
// Builds one Orca VM recipe per sandbox provider that conch can reach over
// ssh, from conch-integrations' published index, and lists them in
// orca-plugin.json. Each recipe command carries conch-sandbox's launcher
// (base64, so no quoting can break it) and pipes it to sh, so the plugin
// needs no file of its own on disk and nobody installs conch.
//
//   node scripts/build-recipes.mjs --launcher ~/workspace/conch/scripts/conch-sandbox.sh [--index URL|PATH]
import { readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const INDEX = "https://amitgb14.github.io/conch-integrations/index.json";
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NEEDED = ["create", "get", "start", "stop", "delete"];

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function readIndex(where) {
  if (/^https?:/.test(where)) {
    const r = await fetch(where);
    if (!r.ok) throw new Error(`${where}: ${r.status}`);
    return r.json();
  }
  return JSON.parse(await readFile(where, "utf8"));
}

// The providers a recipe can drive: sandboxes with ssh and every verb the
// recipe's four commands call.
export function usable(index) {
  return (index.entries ?? [])
    .filter((e) => e.kind === "sandbox" && e.capabilities?.ssh)
    .filter((e) => NEEDED.every((op) => e.capabilities.operations?.includes(op)))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function command(b64, verb, provider, format) {
  const tail = [verb, "--provider", provider, "--from-orca"];
  if (format) tail.push("--format", "orca");
  return `printf %s '${b64}' | base64 -d | sh -s -- ${tail.join(" ")}`;
}

export function recipe(entry, b64) {
  const key = entry.key_env ? ` Needs a ${entry.label} API key: ${entry.key_env}, or conch-sandbox key set ${entry.name}.` : "";
  return {
    schemaVersion: 1,
    id: `conch-${entry.name}`,
    name: `${entry.label} (conch)`,
    description: `A ${entry.label} sandbox for each workspace, with its branch cloned, made by conch-sandbox.${key}`,
    checkoutMode: "provisioned-root",
    create: command(b64, "create", entry.name, true),
    suspend: command(b64, "stop", entry.name, false),
    resume: command(b64, "start", entry.name, true),
    destroy: command(b64, "rm", entry.name, false),
  };
}

async function main() {
  const launcherPath = arg("--launcher");
  if (!launcherPath) throw new Error("--launcher PATH_TO/conch-sandbox.sh is required");
  const b64 = Buffer.from(await readFile(launcherPath)).toString("base64");
  const entries = usable(await readIndex(arg("--index", INDEX)));
  if (entries.length === 0) throw new Error("the index lists no sandbox provider with ssh");

  const dir = path.join(root, "recipes");
  for (const f of await readdir(dir)) if (f.endsWith(".json")) await unlink(path.join(dir, f));
  for (const e of entries) {
    await writeFile(path.join(dir, `${e.name}.json`), JSON.stringify(recipe(e, b64), null, 2) + "\n");
  }

  const manifestPath = path.join(root, "orca-plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.contributes = { vmRecipes: entries.map((e) => ({ path: `recipes/${e.name}.json` })) };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${entries.length} recipes: ${entries.map((e) => e.name).join(", ")}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
