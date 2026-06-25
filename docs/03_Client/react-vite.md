# React Vite Client

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/01_Architecture/client-server-boundaries.md, docs/02_Security/client-server-trust.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes the React and Vite client observed under `apps/client`.

It covers Vite configuration, application entry points, routing, pages, components, HTTP calls, token storage, Phaser mounting, admin UI entry points, client-side error handling, security boundaries, and unverified client gaps.

It does not define new client behavior and does not treat client-side checks as server-side authorization.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: configured in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

The React Vite client is the browser application shell. It renders authentication, character creation, the game layout, world page, inventory and equipment UI, action panel, health display, coordinates display, and admin-facing panels.

The client can display state and send requests. It is not authoritative for authentication, permissions, ownership, inventory, movement, combat, or admin effects.

## Client application overview

Observed client stack:

- React is mounted from `apps/client/src/main.jsx`.
- React Router defines three route areas in `apps/client/src/App.jsx`.
- Vite serves the app and uses the React plugin.
- HTTP calls use `fetch`.
- Socket.IO client is created in `WorldPage.jsx`.
- Phaser is mounted into the `#game-container` element on the world page.
- Zustand stores hold local character, inventory, equipment, action panel, item, and admin UI state.
- Styling is loaded from `apps/client/src/styles/main.scss`.

## Vite configuration

`apps/client/vite.config.js` uses `defineConfig` with `@vitejs/plugin-react`.

The client package scripts include `dev`, `build`, `lint`, and `preview`. The API base URL is read from `import.meta.env.VITE_API_URL` in observed HTTP and Socket.IO client code.

Production hardening of the Vite build configuration is Not verified.

## Application entry points

- `apps/client/index.html` provides the browser HTML entry.
- `apps/client/src/main.jsx` mounts `<App />` into `#root`.
- `apps/client/src/App.jsx` owns the React Router tree.
- `apps/client/src/layouts/GameLayout.jsx` wraps the world route with persistent game UI panels.
- `apps/client/src/pages/WorldPage.jsx` creates the Socket.IO client and Phaser game.

`StrictMode` is imported in `main.jsx` but not used in the rendered tree in the inspected code.

## Routing

Observed routes:

- `/` renders `LoginPage`.
- `/create-character` renders `CreateCharacterPage`.
- `/world` renders `GameLayout`, whose index route renders `WorldPage`.

`WorldPage` redirects to `/` when no browser token is present. Server-side route protection must still be enforced by the backend and is Not verified by this client-side redirect alone.

## Page inventory

| Page or route | File or component | Main responsibility | Authentication required? | Status |
|---|---|---|---|---|
| `/` | `pages/LoginPage.jsx` | Register or log in, store returned access token, clear local character state, navigate to the next page | No token required | Implemented |
| `/create-character` | `pages/CreateCharacterPage.jsx` | Create a character with name and sex, store returned character, navigate to world | Sends bearer token when present | Implemented |
| `/world` | `layouts/GameLayout.jsx` and `pages/WorldPage.jsx` | Load current character, create socket, mount Phaser, show overlays, delete character, logout | Requires token locally; server protection remains separate | Implemented |

## Component inventory

| Component | Area | Main responsibility | Server interaction observed | Status |
|---|---|---|---|---|
| `GameLayout` | World layout | Wrap world page with character and action panels | None directly | Implemented |
| `CharacterLayout` | Character side panel | Toggle character and admin tabs; decode browser token role for UI display | None directly | Implemented |
| `CharacterLayer` | Character equipment | Display character stats and equipment slots; call unequip action on double click | Uses character store action that sends HTTP request | Implemented |
| `Inventory` | Inventory panel | Display inventory slots; call equip action on double click | Uses character store action that sends HTTP request | Implemented |
| `ActionPanel` | World interaction panel | Display selected target, health bar, resource or creature action, admin console | Emits resource interaction through socket; admin commands through command registry | Implemented |
| `AdminPanel` | Admin tab | Load admin overview and templates; execute admin command registry | Fetches admin overview and templates; command handlers use socket or HTTP | Implemented |
| `CoordinatesLayer` | World overlay | Poll Phaser player coordinates for display | None directly | Implemented |
| `HealthBar` | UI health display | Render health percentage | None directly | Implemented |

## API client usage

| API area | Client file or hook | HTTP method or call pattern | Token usage observed | Status |
|---|---|---|---|---|
| Register | `api/auth.js`, `LoginPage.jsx` | `POST /auth/register` through `registerUser` | No bearer token | Implemented |
| Login | `api/auth.js`, `LoginPage.jsx` | `POST /auth/login` through `loginUser` | Stores returned `access_token` in browser storage | Implemented |
| Character create | `CreateCharacterPage.jsx` | `POST /characters` | Sends `Authorization: Bearer <token>` from browser storage | Implemented |
| Current character load | `store/character.store.js` | `GET /characters/me` | Sends bearer token from browser storage | Implemented |
| Character reload by id | `WorldPage.jsx` | `GET /characters/:id` after equipment changes | Sends bearer token from browser storage | Implemented |
| Character delete | `WorldPage.jsx` | `DELETE /characters/:id` | Sends bearer token from browser storage | Implemented |
| Character equip | `store/character.store.js` | `POST /characters/:id/equip` | Sends bearer token from browser storage | Implemented |
| Character unequip | `store/character.store.js` | `POST /characters/:id/unequip` | Sends bearer token from browser storage | Implemented |
| Admin overview and templates | `components/AdminPanel/AdminPanel.tsx` | `GET /admin/overview`, `GET /admin/templates` | Sends bearer token from browser storage | Implemented |
| Admin template update helper | `phaser/admin/admin.actions.ts` | `PATCH /admin/templates/:key` | Sends bearer token passed by caller | Implemented |

## Authentication state

The returned access token is stored with `localStorage.setItem("token", data.access_token)` in `LoginPage.jsx`. Several files read it with `localStorage.getItem("token")`.

Observed behavior:

- Login stores the token and navigates to `/world`.
- Registration creates the account, then logs in and stores the returned token.
- Logout removes the token in `WorldPage.jsx` and navigates to `/`.
- Character and admin HTTP calls send the token in an `Authorization` header.
- `WorldPage.jsx` sends the token in Socket.IO `auth`.
- `CharacterLayout` and `ActionPanel` decode the token payload to show admin UI.

Refresh token flow, automatic expiration handling, secure browser persistence, and token revocation are Not verified.

## Phaser integration

| Integration point | React side | Phaser side | Data passed | Status |
|---|---|---|---|---|
| Mount element | `WorldPage.jsx` renders `#game-container` | Phaser game uses `parent: "game-container"` | DOM container id | Implemented |
| Socket creation | `WorldPage.jsx` creates `io(import.meta.env.VITE_API_URL, { auth: { token } })` | `WorldScene` reads `this.game.socket` | Socket.IO client instance | Implemented |
| Game creation | `WorldPage.jsx` creates `new Phaser.Game(config)` | `PreloadScene` and `WorldScene` run in that game | Phaser config object | Implemented |
| Shared global reference | `WorldPage.jsx` assigns `window.game` | React components and Phaser helpers read `window.game.socket` or scene state | Game instance and socket access | Implemented |
| Character state | `WorldPage.jsx` waits for character state before initializing Phaser | `WorldScene` reads character store for spawn data and join payload | Character id, name, sex, position | Implemented |
| Equipment changes | `WorldPage.jsx` emits `equipment-changed` on game events | Scene-side handling of this event is Not verified | Equipment map | Not verified |
| Cleanup | `WorldPage.jsx` destroys the Phaser game on cleanup | `WorldScene.destroy()` removes several socket listeners | Game instance cleanup | Implemented / Not verified |

## Admin interface entry points

Admin UI visibility is based on a browser-decoded token role in `CharacterLayout` and `ActionPanel`. This is display logic only.

Observed admin entry points:

- `CharacterLayout` shows an Admin tab when decoded role equals `admin`.
- `AdminPanel` fetches overview and template data with a bearer token.
- `AdminPanel` and `ActionPanel` parse command text through `commandParser`.
- Command handlers are defined in `commandRegistry`.
- Socket-based admin actions use acknowledgement callbacks.
- A helper for HTTP template update exists in `admin.actions.ts`.

Client-side admin visibility is not authorization. Server-side permission checks must still apply.

## Error handling

Observed:

- `api/auth.js` centralizes response parsing for register and login.
- `LoginPage` shows a short-lived message on validation or backend errors.
- `CreateCharacterPage` parses error bodies and falls back to status text or alert.
- `WorldPage` logs current-character loading errors and redirects to character creation on 404.
- `WorldPage` handles delete errors with an alert.
- `AdminPanel` displays a generic admin loading error.
- Admin command calls can report socket disconnection or acknowledgement timeout.

Complete global network error handling, retry policy, offline handling, and consistent user-facing error UI are Not verified.

## Security boundaries

- The React client is untrusted.
- Browser storage is untrusted.
- A browser-decoded role is not authorization.
- Route redirects are not server protection.
- The inventory and equipment displayed in React are UI state and cache.
- The Phaser game mounted by React can display and send intentions, but cannot authorize gameplay effects.
- Admin panels are operator UI only; server-side checks remain required.
- No real secret, token, password, or hash is documented here.

Protection of all routes by the server is Not verified from client code alone.

## Performance considerations

The React app mounts the Phaser game inside the world page and keeps side panels active through `GameLayout`. `CoordinatesLayer` polls the Phaser scene every 100 ms. Movement synchronization is handled inside Phaser rather than React.

Bundle optimization, route splitting, render profiling, accessibility review, and production hardening are Not verified.

## Verified behavior

- Vite is configured with the React plugin.
- `main.jsx` mounts the React app into `#root`.
- `App.jsx` defines `/`, `/create-character`, and `/world`.
- `GameLayout` renders `CharacterLayout`, `ActionPanel`, and nested world content.
- Login and registration call the auth helper functions.
- The access token is stored in browser storage.
- Character creation, character load, equip, unequip, delete, and admin fetches use bearer token headers where observed.
- `WorldPage` creates a Socket.IO client with token auth data.
- `WorldPage` creates a Phaser game and attaches the socket to it.
- Admin UI visibility is driven by decoded browser token role.

## Known gaps

- Complete server-side route protection: Not verified by client code alone.
- Complete listener cleanup: Not verified.
- Complete network error handling: Not verified.
- Refresh token flow: Not verified.
- Resynchronization after reconnect: Not verified.
- UI tests: Not verified.
- Accessibility: Not verified.
- Bundle optimization: Not verified.
- Production hardening: Not verified.
- Explicit socket disconnect on world page cleanup: Not verified.

## Review checklist

- [ ] New pages are added to the router intentionally.
- [ ] Protected client routes still rely on server-side checks.
- [ ] Token reads and writes do not expose real token values in logs or docs.
- [ ] HTTP calls handle non-OK responses.
- [ ] World page cleanup is reviewed when socket or Phaser lifecycle changes.
- [ ] Admin UI remains display-only and not an authorization boundary.
- [ ] Zustand state is treated as local cache.
- [ ] Error states are visible and recoverable where needed.
- [ ] Client performance is reviewed before adding persistent intervals or listeners.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not detail backend implementation.
- This document does not describe full server event handling.
- This document does not define a complete gameplay model.
- This document does not document database internals.
- This document does not document real secret values.
- This document does not replace UI tests.

## Security notes

Never document real access tokens, credentials, passwords, hashes, copied environment values, or private user data.

Every sensitive action sent from React must be validated server-side. Client-side routing, hidden tabs, disabled inputs, local stores, and decoded token display must not be treated as permission checks.

## Performance notes

Watch for duplicated Phaser game instances, duplicated socket listeners, persistent intervals, and unnecessary React re-renders around frequently changing world state. Current high-load behavior is Not verified.

## Related files

- [Documentation Index](../README.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Realtime Socket.IO](../01_Architecture/realtime-socketio.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Authentication JWT](../02_Security/authentication-jwt.md)
- [Phaser World](phaser-world.md)
- [Zustand State](zustand-state.md)
- [NestJS API Gateway](../04_Server/nestjs-api-gateway.md)
- [Server WebSockets](../04_Server/websockets.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should the socket be explicitly disconnected during world page cleanup?
- Should client route protection be centralized instead of embedded in `WorldPage`?
- Should auth state move from direct browser storage reads into a dedicated store or hook?
- Should admin visibility be refreshed when token state changes?
- Should `StrictMode` be enabled in `main.jsx`?
- Should error handling be centralized beyond auth helpers?

## TODO

- [ ] Verify socket disconnect behavior on world unmount.
- [ ] Add or verify UI tests for login, character creation, and world page loading.
- [ ] Add or verify accessibility checks.
- [ ] Add or verify token expiration handling.
- [ ] Add or verify production build hardening.
- [ ] Review duplicate listener risk around Phaser lifecycle.
