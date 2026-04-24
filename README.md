<p align="center">
  <img src="assets/logo/mark.svg" width="128" height="128" alt="pagr logo" />
</p>

# pagr

A tiny, opinionated markdown viewer and editor for folders that Claude wrote.

![pagr showing a diet folder](docs/screenshot.png)

## Install

### Homebrew (macOS, Apple Silicon)

```sh
brew tap plusminushalf/pagr https://github.com/plusminushalf/pagr
brew install --cask pagr
```

This installs pagr into `/Applications`, drops a `pagr` command onto
your `PATH`, and strips the macOS quarantine flag so the unsigned build
launches without the *"pagr is damaged"* dialog.

### Manual download

Builds aren't signed with an Apple Developer certificate yet, so the
first-run involves one extra step. This is a three-command dance; you
only need to do it once per install.

1. **Download** the latest `.dmg` from the
   [Releases page](https://github.com/plusminushalf/pagr/releases).
2. **Install** by double-clicking the DMG and dragging **pagr** to
   your Applications folder.
3. **Strip the macOS quarantine attribute** so Gatekeeper lets the
   unsigned app launch:

   ```sh
   xattr -cr /Applications/pagr.app
   ```

4. **Open** pagr from Applications.

If you skip step 3, macOS will refuse to open the app with
*"pagr is damaged and can't be opened"*. That's Gatekeeper rejecting an
unsigned, quarantined app. The `xattr` command removes the download
quarantine flag; after that, the app launches normally.

## Command line

Once installed, pagr ships a small `pagr` CLI. The Homebrew cask links
it onto your `PATH` automatically; for a manual install, symlink the
wrapper yourself:

```sh
ln -s /Applications/pagr.app/Contents/Resources/pagr /usr/local/bin/pagr
```

Then:

```sh
pagr            # open the app
pagr ~/notes    # open ~/notes as a pagr folder in a new window
pagr .          # open the current directory
```

If pagr is already running, the folder opens in a new window on the
existing app rather than spawning a second Electron process.

## Claude Code skill

If you use [Claude Code](https://claude.com/claude-code), there's a skill
that teaches Claude to open folders in pagr for you — say "open this in
pagr" or let Claude proactively offer after it writes a batch of
markdown files.

Drop the skill file into your Claude config — no repo clone needed:

```sh
mkdir -p ~/.claude/skills/pagr && \
  curl -fsSL https://raw.githubusercontent.com/plusminushalf/pagr/main/skills/pagr/SKILL.md \
    -o ~/.claude/skills/pagr/SKILL.md
```

Re-run the same command later to pull in updates. Restart Claude Code
and the `/pagr` skill becomes available. See
[skills/pagr/SKILL.md](skills/pagr/SKILL.md) for the trigger phrases and
behavior.

## Claude Cowork skill

[Claude Cowork](https://claude.com/) runs in an isolated Linux sandbox,
so the `curl` trick above doesn't reach your real Mac — and Cowork has
no equivalent of Claude Code's `/plugin` command. Instead, it accepts
`.skill` files uploaded through its UI.

1. Download `pagr.skill` from the
   [latest release](https://github.com/plusminushalf/pagr/releases/latest).
2. In Claude Cowork, open **Customize** → **Skills** → **Upload skill**.
3. Drag `pagr.skill` into the drop zone.

The `/pagr` skill becomes available in that Cowork session. Re-upload
the newer `.skill` file when you want to pull in updates.

> **Heads up:** pagr itself is a macOS app. Installing the skill in
> Cowork lets Claude *talk about* pagr and produce the right commands,
> but Cowork can't launch pagr from its sandbox — you'll still run
> `pagr /path/to/folder` yourself on your Mac. Native "click to open in
> pagr" from Cowork is planned via a `pagr://` URL scheme.

## Why this exists

Two things Claude Cowork is genuinely good at:

1. Working inside a folder of files.
2. Writing and editing markdown.

Those overlap nicely, and it turns out you can use Claude for a lot of
personal-life stuff that isn't code. The example that pushed me to build
pagr: a personal weekly diet manager.

It's a folder. `profile.md` holds my body stats, training schedule, eating
preferences, and targets. Then `week-01.md`, `week-02.md`, and so on — one
file per week with the plan. Claude Cowork writes and edits these files
for me. That part works great.

The problem is viewing them.

- **In Claude itself**: it's built to chat about files, not to be the place
  you sit down and read them.
- **In VS Code**: slightly better, but VS Code is a code editor first. Raw
  markdown by default, a file tree tuned for projects, and nothing about
  the interface says "here's your plan for the week, read it."

I wanted something in between: open a folder, click a file, read the
rendered plan. When I spot something to tweak, click that line, fix it,
move on. That's pagr.

## The workflow

```
diet/
├── profile.md
├── week-01.md
├── week-02.md
└── assets/
    └── meal-reference.png
```

1. Shape the files with Claude Cowork.
2. When it's time to actually follow the plan — "what am I eating today?"
   — open pagr, pick the folder, click the week, read.
3. Need to change a line? Click it, edit inline, ⌘S, done.

## Not for you if

- You want a general markdown editor. Use Obsidian, iA Writer, or Typora.
- You want plugins, wikilinks, graph view, daily notes. pagr is
  deliberately tiny.
- You want a code editor with good markdown support. Use VS Code.

pagr is for one narrow case: a folder of markdown files that get drafted
by an AI, reviewed by you, and lightly edited over time. If that's not
your workflow, the other apps will serve you better.

## Stack

- Electron + Vite + TypeScript (via Electron Forge)
- React for the shell (sidebar, file tree, layout)
- [Milkdown Crepe](https://milkdown.dev) for the editor — this is what
  gives you the "click a line, edit as raw markdown, click away, it
  re-renders" behavior out of the box

macOS is the only supported platform for now.

## Running locally

```sh
npm install
npm start
```

Requires Node 20+.

