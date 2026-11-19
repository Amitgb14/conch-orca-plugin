// node --test test/
// Checks the generator against a fixture index, and runs a generated
// command for real with a fake conch-sandbox on PATH: the launcher must
// hand it exactly the verb and flags the recipe names, and Orca's
// environment must reach it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { usable, recipe, command } from "../scripts/build-recipes.mjs";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sandbox = (name, ssh, ops = ["create", "get", "list", "start", "stop", "delete"]) => ({
  kind: "sandbox", name, label: name.toUpperCase(), key_env: `${name.toUpperCase()}_KEY`,
  capabilities: { operations: ops, ...(ssh ? { ssh: { key: "account" } } : {}) },
});

test("usable keeps sandboxes with ssh and every verb, sorted by label", () => {
  const index = { entries: [
    sandbox("zeta", true), sandbox("alpha", true), sandbox("nossh", false),
    sandbox("nostop", true, ["create", "get", "start", "delete"]),
    { kind: "ci", name: "circleci", label: "CircleCI" },
  ] };
  assert.deepEqual(usable(index).map((e) => e.name), ["alpha", "zeta"]);
  assert.deepEqual(usable({}), []);
});

test("recipe shape is Orca's", () => {
  const r = recipe(sandbox("hetzner", true), "Zm9v");
  assert.equal(r.schemaVersion, 1);
  assert.equal(r.id, "conch-hetzner");
  assert.equal(r.checkoutMode, "provisioned-root");
  for (const k of ["create", "suspend", "resume", "destroy"]) assert.match(r[k], /^printf %s 'Zm9v' \| base64 -d \| sh -s -- /);
  assert.match(r.create, /create --provider hetzner --from-orca --format orca$/);
  assert.match(r.suspend, /stop --provider hetzner --from-orca$/);
  assert.match(r.resume, /start --provider hetzner --from-orca --format orca$/);
  assert.match(r.destroy, /rm --provider hetzner --from-orca$/);
  assert.match(r.description, /HETZNER_KEY/);
});

test("the shipped recipes and manifest agree", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "orca-plugin.json"), "utf8"));
  assert.equal(manifest.manifestVersion, 2);
  for (const { path: p } of manifest.contributes.vmRecipes) {
    assert.ok(existsSync(path.join(root, p)), `${p} is listed but missing`);
    const r = JSON.parse(readFileSync(path.join(root, p), "utf8"));
    assert.equal(r.id, `conch-${path.basename(p, ".json")}`);
  }
});

test("a generated command runs the launcher, which runs conch-sandbox with the recipe's arguments", () => {
  const launcher = path.join(root, "..", "conch", "scripts", "conch-sandbox.sh");
  const fromEnv = process.env.CONCH_SANDBOX_LAUNCHER;
  const file = fromEnv || launcher;
  if (!existsSync(file)) return test.skip?.("no launcher yet: set CONCH_SANDBOX_LAUNCHER");
  const text = readFileSync(file, "utf8");
  const want = (text.match(/^want=["']?([0-9][^"'\s]*)/m) || [])[1];
  assert.ok(want, "launcher pins a version");

  const dir = mkdtempSync(path.join(tmpdir(), "orca-recipe-"));
  const log = path.join(dir, "args");
  const fake = path.join(dir, "conch-sandbox");
  writeFileSync(fake, `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "conch-sandbox ${want}"; exit 0; fi\nprintf '%s\\n' "$@" > "${log}"\nprintf 'ws=%s\\n' "$ORCA_WORKSPACE_NAME" >> "${log}"\n`);
  chmodSync(fake, 0o755);

  const cmd = command(Buffer.from(text).toString("base64"), "create", "hetzner", true);
  execFileSync("sh", ["-c", cmd], {
    env: { PATH: `${dir}:/usr/bin:/bin`, HOME: dir, ORCA_WORKSPACE_NAME: "feat-login" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.deepEqual(readFileSync(log, "utf8").trim().split("\n"),
    ["create", "--provider", "hetzner", "--from-orca", "--format", "orca", "ws=feat-login"]);
});
