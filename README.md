# Tarnished Interstice

Cross-application desktop message overlay inspired by Elden Ring style notes.

![Status Beta](https://img.shields.io/badge/Status-Beta-yellow)
![Tech Stack](https://img.shields.io/badge/Tech-Electron%20%7C%20Vue3%20%7C%20Supabase-blue)
![License GPLv3](https://img.shields.io/badge/License-GPLv3-blue)

## Features

- Scene-aware messages based on active window process + title.
- Floating orb interaction for open, close, and quick writing.
- Like/Dislike voting system for visibility and quality.
- Low-overhead polling strategy for long-running desktop usage.
- Multi-resolution scaling support for overlay elements.

## Tech Stack

- Frontend: Vue 3, Vite, Pinia
- Desktop: Electron, Koffi (Win32 API calls)
- Backend: Supabase (PostgreSQL + RLS + RPC)

## Auto Update Strategy

This project uses `electron-updater` with GitHub Releases.

- Installer build (`nsis`):
  - Supports auto update.
  - App checks updates from GitHub Releases.
  - Users download/update through release assets.
- Portable build (`portable`):
  - Auto update is intentionally disabled in code.
  - Users update by manually downloading the latest portable `.exe` from Releases and replacing old file.

Important: It is normal that large `.exe` binaries are not stored in the repository itself. They should be uploaded as Release assets.

## Download for Users

Users should download executables from:

- GitHub repo `Releases` page assets (not from source code tree)

Recommended release assets:

- `Tarnished Interstice Setup x.y.z.exe` (installer)
- `Tarnished Interstice x.y.z.exe` (portable)

## Development Setup

### Prerequisites

- Node.js 18+
- A Supabase project

### Install

```bash
git clone https://github.com/NKzGJTmE/TarnishedInterstice.git
cd TarnishedInterstice
npm install
```

### Environment

Create `.env` in project root:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Then run SQL migrations in Supabase SQL editor:

- `db_secure_free.sql`
- `db_content_validation.sql`

## Scripts

```bash
# dev
npm run dev

# lint
npm run lint

# build renderer/main
npm run build

# build installer + portable
npm run pack:win

# build portable only
npm run pack:win:portable
```

## Build Output

Build artifacts are generated under:

- `dist_electron/`

Common files:

- installer `.exe` (NSIS)
- portable `.exe`
- `latest.yml` and blockmap files (for updater)

## Release Checklist

1. Update app version in `package.json`.
2. Run `npm run pack:win`.
3. Create GitHub Release with same version tag (example: `v1.0.1`).
4. Upload generated installer/portable/update metadata files.
5. Verify installer channel can detect updates.

## License

GPL-3.0. See `LICENSE`.
