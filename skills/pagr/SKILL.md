---
name: pagr
description: Open a folder of markdown files in pagr, a tiny markdown viewer and inline editor. Use when the user asks to "open X in pagr", "view this in pagr", "preview this folder", "show me these notes rendered", or when the user wants to read markdown Claude just wrote (diet plans, journals, trip itineraries, weekly schedules, personal notes — anything folder-shaped and meant for reading, not a codebase). Proactively suggest pagr after writing two or more markdown files into the same folder that the user will want to re-read later.
---

# pagr

pagr is a small macOS app that opens a folder of markdown files and lets the
user read them rendered and click a line to edit it inline. This skill lets
Claude open a folder in pagr from the CLI.

## When to run

Run `pagr` when:

- The user asks explicitly: "open it in pagr", "view this in pagr", "show me
  this folder", "preview these notes".
- You just finished writing or editing two or more markdown files in the same
  folder and the user will want to *read* them (not ship them). Ask first:
  "Want me to open this folder in pagr?" Wait for yes before running.
- The work is personal-life artifacts stored as markdown — weekly plans,
  journals, diets, itineraries, reading lists.

Do NOT run pagr for:

- Codebase docs (READMEs, CHANGELOGs, contributor guides inside a repo).
- A single markdown edit that doesn't benefit from a rendered view.
- Non-markdown work.

## How to run

Use the Bash tool. Always pass an absolute path to the folder:

```bash
pagr /absolute/path/to/folder
```

If `pagr` is already running, the folder opens in a new window on the
existing app — no need to close it first.

Open the app without a folder by running `pagr` alone. Passing a file instead
of a folder is fine; pagr opens the file's parent folder.

## If pagr isn't installed

Check availability with `command -v pagr` before running. If missing:

1. If `/Applications/pagr.app` exists, the CLI wrapper is shipped inside it —
   symlink it onto PATH:

   ```bash
   ln -s /Applications/pagr.app/Contents/Resources/pagr /usr/local/bin/pagr
   ```

2. Otherwise, tell the user how to install pagr:

   ```sh
   brew tap plusminushalf/pagr https://github.com/plusminushalf/pagr
   brew install --cask pagr
   ```

   Or download the DMG from
   <https://github.com/plusminushalf/pagr/releases>.

Don't try to install pagr automatically — surface the commands and let the
user run them.
