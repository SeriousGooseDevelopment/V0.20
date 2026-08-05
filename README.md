# DevDoc

> A native-feeling developer workspace for macOS.

DevDoc is a local-first desktop workspace for collecting project notes, launching development projects, and organizing early product thinking in one focused place.

## What it includes

- A polished macOS-inspired dashboard, project browser, notes library, and settings view
- Keyboard-first navigation, including a `⌘K` command palette
- Local project creation with native folder selection
- Project-specific feature planning and status management
- Native Finder reveal and image selection in the packaged desktop app
- Local persistence so created projects remain available after relaunching

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

## Notes

This repository contains the source code for the DevDoc portfolio project. The macOS build is unsigned and not notarized, so macOS may require an explicit approval before first launch.
