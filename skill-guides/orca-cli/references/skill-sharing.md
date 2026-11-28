# Artifact and skill publishing commands

Artifact sharing has no publish gate; its boundaries are in the guide body. The
skill-sharing permission is default-off and described in its section below. This is the
command surface for both.

## Artifacts

```text
ORCA artifacts share <file> --json
ORCA artifacts update <file> --json
ORCA artifacts unshare <file> --json
ORCA artifacts list --json
ORCA artifacts delete <id> --json
```

- `share`, `update`, and `unshare` accept `.html`, `.htm`, `.md`, and `.markdown` files.
  Markdown is rendered into a standalone HTML document before upload and published
  through the same host-side link record as the editor's Share as artifact button.
- Sharing runs on the desktop app on this computer and stores links on the self-hosted
  share service. Edit tokens stay on the host and never appear in CLI output.
- `share` creates a link; sharing the same file again publishes new content over the same
  link (`update` is the same operation). The resolved file path identifies the link, so use
  the same path that originally shared the file.
- `list` returns every link this computer created: file path, id, updated time, and URL.
  `unshare <file>` deletes by file path; `delete <id>` deletes by the id from `list`.
  Deleting a link makes it stop working immediately.
- Relative stylesheets, the fonts/images they reference, `<img src>`/`srcset`, `poster` and
  URL references inside element `style` attributes are inlined into the HTML on the host
  before upload, so the share page renders like the local file. This applies to local files
  only; SSH and remote-runtime sources upload as-is. Each inlined resource is capped at
  200 MiB; missing, oversized or non-whitelisted references are kept as-is and logged, never
  blocking the share. External scripts are not inlined. The 200 MiB service limit applies to
  the inlined document; the 800 KB CLI transport limit below applies to the source file
  before inlining.
- The CLI transport limit is 800 KB per command. For larger files (the service accepts up
  to 200 MiB), open the file in Workbench and use Share as artifact.

## Skill sharing

Agents can publish one or more installed skills behind one unlisted link through the
signed-in Orca account. The user must first grant the separate, default-off permission in
Settings → Share Skills ("Allow agents and the Orca CLI to publish skill links"). There is
no CLI or RPC way to grant it. Manual publishing from the reviewed desktop flow remains
available without this agent permission.

```text
ORCA skills installed --json
ORCA skills share --skill <selector> [--skill <selector> ...] --bundle-name <name> --json
```

- `skills installed` returns safe discovery IDs and names. It does not expose local skill
  paths in CLI output. Sharing then verifies that each `SKILL.md` declares a portable
  lowercase name containing only letters, numbers, and hyphens.
- Each `--skill` must be an exact discovery ID or an unambiguous installed-skill name.
  Use IDs when names collide.
- Multiple `--skill` flags create one bundle and one link. `--all` and arbitrary paths are
  intentionally unsupported; name every skill the user asked to publish.
- Skill folders can contain scripts, configuration, or credentials. The permission is
  authority, not intent: publish only the skills the user named and never widen the set.
- A denied command fails with `agent_skill_sharing_disabled`. Do not retry; ask the user to
  enable the switch in the desktop app if they want this action.
- Orca stages one agent-published bundle at a time per host. If another publish is active,
  wait for it to finish before retrying `agent_skill_sharing_busy`.
- Run the command in an Orca terminal on the machine that stores the skills. Forwarded WSL,
  SSH, and paired-runtime invocations fail before discovery so Orca cannot read from the
  wrong filesystem.
- The JSON result contains the unlisted URL and public share/package/version IDs. It never
  includes cloud authentication tokens.
