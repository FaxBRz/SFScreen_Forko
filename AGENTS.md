# Repository Guidelines

## Project Structure & Module Organization

This repository currently contains planning documents only. Read `PLANO_V0_P2P_DIRETO.md` and `OPCOES_CONECTIVIDADE.md` before changing architecture or scope. When the application is scaffolded, keep Electron processes separated:

- `src/main/`: window lifecycle, capture integration, and privileged APIs.
- `src/preload/`: the minimal, typed `contextBridge` surface.
- `src/renderer/`: React UI and session screens.
- `src/shared/`: shared types, validation, and protocol models.
- `tests/unit/` and `tests/e2e/`: automated tests.
- `assets/`: icons and other packaged resources.

Do not place Node.js or operating-system access in renderer code.

## Build, Test, and Development Commands

There is no executable scaffold yet. The future `package.json` should expose this standard command set:

- `npm install`: install locked dependencies.
- `npm start`: run Electron with Vite in development mode.
- `npm run lint`: run ESLint and formatting checks.
- `npm test`: run unit tests once.
- `npm run test:e2e`: run Electron end-to-end tests.
- `npm run make`: create a Windows test build through Electron Forge.

Update this guide if the implemented toolchain differs.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, and automated formatting with Prettier and ESLint. Prefer small, single-purpose modules and explicit types; avoid `any`. Name React components and types with `PascalCase`, functions and variables with `camelCase`, and non-component modules with `kebab-case`. Use `*.test.ts` or `*.test.tsx` for unit tests. IPC channels must be narrow, typed, validated, and documented.

## Testing Guidelines

Use Vitest for unit tests and Playwright's Electron support for end-to-end flows. Cover invitation/answer parsing, session-state transitions, IPC validation, and error handling. Network tests must distinguish same-LAN success from expected direct-P2P failure. Document manual hardware tests for screen capture, system audio, 1080p60, and long sessions.

## Commit & Pull Request Guidelines

The history is too small to establish a convention, so use Conventional Commits such as `feat: add invitation parser` or `docs: refine P2P scope`. Keep commits focused. Pull requests must explain purpose and scope, list verification performed, link relevant issues, and include screenshots for UI changes. Call out security, privacy, or connectivity implications explicitly.

## Security & Architecture Constraints

The V0 is direct P2P with manual signaling and no hosted backend, TURN, or mesh VPN dependency. Keep media transport independent from signaling and future fallback providers. Never commit secrets or log SDP, ICE candidates, private addresses, session keys, or captured media. Preserve Electron hardening: sandboxing, context isolation, disabled Node integration, local content, restrictive CSP, and validated IPC.
