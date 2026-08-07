# DevDoc

> A native-feeling developer workspace for macOS.

DevDoc is a local-first desktop workspace for collecting project notes, launching development projects, and organizing early product thinking in one focused place.

## What it includes

- A polished macOS-inspired dashboard, project browser, notes library, and settings view
- **Start / Stop** — one press opens every app a project needs, another press closes them
- A custom app picker that reads your real `/Applications` catalog, with native bundle icons
- Keyboard-first navigation, including a `⌘K` command palette and `⌘↩` to start or stop
- Local project creation with native folder selection
- Focus time measured from real sessions, not estimates
- Project-specific feature planning and status management
- Native Finder reveal and image selection in the packaged desktop app
- Local persistence so created projects remain available after relaunching

## Starting and stopping a project

Pick the apps a project needs from the app picker (`⌘⇧A`), then press **Start**.

- Apps that accept a directory — editors, terminals, IDEs — are handed the project's
  workspace folder, so they open straight into it. DevDoc decides this per app by
  reading `CFBundleDocumentTypes` from the bundle, and you can override it per app
  with the **Opens folder** toggle.
- An app that is already running is never launched a second time. If it takes a
  folder, the folder is opened in the existing instance instead.
- **Stop** quits only the apps DevDoc actually opened. Anything that was already
  running before you pressed Start is left alone. Settings has a toggle if you want
  Stop to quit everything in the project instead.
- If you quit the apps yourself, DevDoc notices and ends the session on its own.

The first time DevDoc quits another application, macOS asks for Automation
permission. If you decline, DevDoc falls back to a normal termination signal, which
still lets apps save and close cleanly.

## Creating a project

**New Project** asks for the three things a project actually needs: a name, the apps
that should open with it, and where it lives. The app grid resolves one tile per kind
of tool — notes, terminal, editor, browser, source control, design, AI — to whichever
candidate is installed on this Mac, so it offers your editor rather than a guess.
**More apps** searches the full catalog. The workspace folder is proposed as
`~/Dev/Projects/<name>` and created on save. A project can also carry a custom icon
image, downscaled before storage.

## Notes

Notes are separate from projects and are for writing.

- **New Note** opens straight into an empty note with the cursor in the title. An
  unnamed note takes its name from its first line.
- The body is Markdown with a live **Preview** — headings, bold, inline and fenced
  code, lists, `- [ ]` tasks, quotes and links. It renders to elements rather than
  HTML, so note text is never treated as markup.
- Search covers the body, not just the title, so a note is findable by what is
  written in it. Filter by tag or starred, and sort by edited, created or title.
- Opening a note rolls the note list out under **Notes** in the sidebar so you can
  move between them without going back to the grid.
- A note can be converted to a project once the idea graduates; its text carries over
  as the project overview.

## Feature planning

Each project tracks feature ideas with a status of Building, Planned, Idea or **Done**,
and every feature can hold its own photos — screenshots, references, or sketches
attached to that one feature rather than the project as a whole.

## Stack

- React + Vite
- Electron
- Lucide icons

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run build:mac
```

`build:mac` creates an Apple-silicon DMG in `outputs/`. Native file-picker and Finder actions are available in the Electron app; the browser development view intentionally uses safe fallbacks.

## About this repository

This repository contains the source code for the DevDoc portfolio project. The macOS build is unsigned and not notarized, so macOS may require an explicit approval before first launch.
