# conch sandboxes for Orca

Run each Orca workspace in its own cloud sandbox: Daytona, Hetzner Cloud,
InstaBox, DigitalOcean, Mosaic, Namespace, Tensorlake or boat.dev. The
plugin adds one entry per provider to the new-workspace **Run on** picker.

- **Create:** a sandbox named after the workspace; the repository's
  `origin` cloned over HTTPS and checked out at the workspace's branch and
  start commit (push it first); Orca gets an ssh connection and installs
  its own server there (`checkoutMode: provisioned-root`).
- **Sleep / wake:** stops and starts the sandbox. Its disk is kept.
- **Delete:** removing the project deletes the sandbox, which ends its
  billing.

If any create step fails, the sandbox is deleted again.

## Nothing else to install

Each recipe command carries a small launcher that fetches
**conch-sandbox**, a few-MB program built from
[conch](https://github.com/Amitgb14/conch)'s provider code, at the version
it pins, checks its sha256, and keeps it under
`~/.local/share/conch-sandbox/<version>/`. You don't need conch. If you have
it, they share keys and settings, and `conch sandbox stats` shows these
sandboxes and what they cost.

## Before you start

- Orca 1.4.245 or later, with Settings → Experimental → Cloud VM on.
- A provider API key: in your environment (`DAYTONA_API_KEY`,
  `HCLOUD_TOKEN`, `INSTABOX_API_KEY`…), or saved once, which Orca started
  from the Dock needs:

  ```sh
  conch-sandbox key set daytona     # reads the key from stdin
  ```

- A repository with an `origin` remote. A private one needs `GH_TOKEN` in
  the sandbox: list it under `env` for that provider in
  `~/.config/conch/config.toml`.

## Development

The recipes are generated from conch-integrations' published index, so a
provider added there becomes a new release here:

```sh
node scripts/build-recipes.mjs --launcher ~/Downloads/conch-sandbox.sh   # a release's launcher, pins filled in
node --test test/*.test.mjs
```

## Status

Early. Recipes follow the format of published Orca VM-recipe plugins. Not
yet run in Orca. To check: how Orca hands `userData` back to suspend and
destroy (read here as `ORCA_VM_INSTANCE_ID`), and whether resume may return
a new connection.

Needs conch for now: the launcher pins conch-sandbox `0.2.2-beta.1` (a pre-release), but conch-sandbox installs provider files only from a signed registry index, which conch's registry does not publish yet. Until it does, it works with provider files conch has already installed.

Apache-2.0.
