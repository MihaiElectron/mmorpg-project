# Zustand State

## Metadata

- Status: Draft
- Owner: Project
- Last updated: 2026-06-18
- Depends on: docs/README.md, docs/03_Client/react-vite.md, docs/01_Architecture/client-server-boundaries.md
- Used by: Project owner, developers, conversational assistants, repository-aware coding agents

## Scope

This document describes Zustand state observed in the React client under `apps/client/src/store`.

It covers store inventory, state ownership, server synchronization, authentication-related state, character state, inventory and item display state, admin state, Phaser interaction, browser persistence, error handling, and trust boundaries.

It does not define server behavior or treat browser state as authoritative.

## Verification labels

- `Implemented`: observed in code.
- `Configured`: configured in code or project configuration.
- `Not verified`: not proven by the inspected code.
- `TBD`: intentionally undecided or future work.

## Purpose

Zustand stores hold local UI and cached gameplay display state for React and Phaser coordination.

The stores help the client render panels, selected targets, character data, inventory display, equipment display, admin console state, and item display state. They do not authorize actions and do not prove server truth.

## Zustand overview

Observed stores:

- `character.store.js`
- `actionPanel.store.ts`
- `admin.store.ts`
- `items.store.ts`

`character.store.js`, `actionPanel.store.ts`, and `admin.store.ts` use browser-window singleton keys so React components and Phaser code can access the same store instance. `items.store.ts` uses a direct Zustand `create` call and is not observed in the active imports searched for this batch.

## Store inventory

| Store | File | Main state held | Server source or sync path | Status |
|---|---|---|---|---|
| `useCharacterStore` / `getCharacterStore` | `store/character.store.js` | Current character, panel open flag, inventory display list, equipment map | Fetches current character; equip and unequip reload character data; socket loot and damage events update local cache | Implemented |
| `useActionPanelStore` / `getActionPanelStore` | `store/actionPanel.store.ts` | Panel open flag, selected target, available actions, overlapping targets | Updated by Phaser world click handling and animal health events | Implemented |
| `useAdminStore` / `getAdminStore` | `store/admin.store.ts` | Admin console focus flag, last clicked position, command history, history index | Updated by React admin inputs and Phaser world clicks | Implemented |
| `useItemsStore` | `store/items.store.ts` | Local inventory list and equipment map | No server fetch observed in this store | Implemented / Not verified |

## State ownership

| State category | Stored in Zustand? | Authoritative source | Client may mutate locally? | Status |
|---|---|---|---|---|
| Access token | Not in Zustand; browser storage is used | Server-issued token; browser storage only holds a copy | Yes, browser user can alter local storage | Implemented / Not verified |
| Current character | Yes, in character store | Server response | Yes, local cache can be mutated | Implemented |
| Character health display | Yes, inside current character | Server events and HTTP reloads | Yes, local display can be mutated | Implemented |
| Inventory display | Yes, in character store and item store | Server responses and server events | Yes, local cache can be mutated | Implemented / Not verified |
| Equipment display | Yes, in character store and item store | Server responses | Yes, local cache can be mutated | Implemented / Not verified |
| Action panel target | Yes, in action panel store | Client selection from rendered world state | Yes | Implemented |
| Admin console focus | Yes, in admin store | Client UI state | Yes | Implemented |
| Admin command history | Yes, in admin store | Client UI state | Yes | Implemented |
| Last clicked admin position | Yes, in admin store | Client world click position | Yes | Implemented |
| Player position | Not directly stored as primary Zustand state in inspected store; character position may be present in loaded character object | Server accepted state should be authoritative | Yes, local display can move independently | Implemented / Not verified |

## Server synchronization

| Store or state | Fetch/update mechanism | Trigger | Server validation implication | Status |
|---|---|---|---|---|
| Character load | `GET /characters/me` in `loadCharacter` | `WorldPage` initial effect when token exists and no character is loaded | Server must validate token and ownership | Implemented |
| Character creation result | `setCharacter` after `POST /characters` response | Successful character creation page submit | Server must validate creation request | Implemented |
| Equipment update | `POST /characters/:id/equip`, then `loadCharacter` | Inventory double click through character store action | Server must validate ownership and item rules | Implemented / Not verified |
| Unequip update | `POST /characters/:id/unequip`, then `loadCharacter` | Equipment double click through character store action | Server must validate ownership and slot rules | Implemented |
| Inventory cache update | `updateInventoryItem` | Socket loot or inventory update listener in world scene | Display update only; server remains authority | Implemented |
| Health update | `setHealth` | Character damage or respawn listener in world scene | Display update only; server remains authority | Implemented |
| Action target | `openPanel`, `closePanel`, `updateTargetHealth` | Phaser click handling and animal update listener | Display update only | Implemented |
| Admin focus | `setConsoleActive` | Admin console focus and blur | Affects client keyboard capture only | Implemented |
| Admin last clicked position | `setLastClickedPos` | Phaser pointer click on world background | Client coordinate suggestion only | Implemented |
| Item store inventory | Local store actions only | Direct callers not observed in active search | No server validation observed in this store | Not verified |

## Authentication-related state

The access token is stored in browser storage rather than in a Zustand store. Stores and components read the token directly when needed.

Observed token reads:

- `character.store.js` reads the token for character load, equip, and unequip calls.
- `WorldPage.jsx` reads the token for route redirect, socket creation, and character delete.
- `CreateCharacterPage.jsx` reads the token for character creation.
- `AdminPanel.tsx` reads the token for admin fetches.
- `CharacterLayout.jsx` and `ActionPanel.tsx` decode token role for display.

Secure browser persistence, token refresh, automatic expiration handling, and token revocation are Not verified.

## Character state

`character.store.js` holds:

- `character`
- `isOpen`
- `inventory`
- `equipment`

Observed actions:

- `setCharacter`
- `setHealth`
- `clearCharacter`
- `toggleOpen`
- `closePanel`
- `updateInventoryItem`
- `loadCharacter`
- `equipItem`
- `unequipItem`

The store builds an equipment map from loaded character equipment and filters equipped entries out of the displayed inventory list. This is client display logic only.

## Inventory and item state

The active inventory UI imports `useCharacterStore` and displays `inventory` from the character store. Double clicking an inventory entry calls `equipItem`, which sends an HTTP request and reloads the character on success.

`items.store.ts` also defines local inventory and equipment actions. Active runtime use of `useItemsStore` was not observed in the searched components.

Inventory stored in Zustand is only a display cache. It is modifiable by the user and must not be treated as proof of item ownership or equipment state.

## Admin state

`admin.store.ts` holds local admin console UI state:

- whether the admin console is focused;
- the last clicked world position;
- command history;
- current history index.

`ActionPanel` and `AdminPanel` use this store to coordinate command input and keyboard focus. Phaser uses the focus flag to avoid moving the player while the admin console is active.

The admin store does not prove admin permission. Browser-decoded role display and local command history are not authorization.

## Phaser interaction

Phaser code imports `getCharacterStore`, `getActionPanelStore`, and `getAdminStore`.

Observed interactions:

- `WorldScene` reads character state to create the local player and emit world join data.
- `WorldScene` updates inventory display after loot-related events.
- `WorldScene` updates health display after damage or respawn events.
- `WorldScene` opens and closes the action panel after pointer selection.
- `WorldScene` stores the last clicked world position for admin commands.
- `PlayerController` reads admin console focus to disable movement input while typing.

These interactions coordinate display and input. They do not make Zustand state authoritative.

## Persistence in browser

No Zustand persistence middleware was observed.

Browser persistence observed in the client is direct `localStorage` usage for the access token. Store data appears in memory only, except for global store instances attached to the browser window during runtime.

Secure persistence in browser storage is Not verified.

## Security boundaries

- Zustand is local client state and can be modified by the client.
- Zustand is never authoritative for sensitive gameplay.
- Inventory in Zustand is display/cache only.
- Equipment in Zustand is display/cache only.
- Admin role shown by client logic is not proof of permission.
- Client position display is not authority.
- Action panel target selection is not authority.
- Every sensitive action must be validated server-side.
- No real secret, token, password, or hash is documented here.

## Error handling

Observed:

- `loadCharacter` logs and rethrows errors.
- `equipItem` and `unequipItem` catch and log errors.
- `WorldPage` handles character load errors and redirects on 404.
- Admin commands keep local command results outside the stores.
- No global store error model is observed.

Robust retry, global error handling, stale-state protection, and automatic cache invalidation are Not verified.

## Performance considerations

The singleton stores avoid separate store instances across React and Phaser access paths. Character store updates can affect UI panels and Phaser display code.

Potential performance risks include frequent health, inventory, target, and command-history updates. Profiling under high update frequency is Not verified.

## Verified behavior

- Zustand is installed in the client package.
- `character.store.js` defines a browser-window singleton store.
- `actionPanel.store.ts` defines a browser-window singleton store.
- `admin.store.ts` defines a browser-window singleton store.
- `items.store.ts` defines a local Zustand store.
- Character load fetches `/characters/me` with a bearer token.
- Equip and unequip actions send HTTP requests and reload character data on success.
- Socket events in `WorldScene` update character health and inventory display.
- Phaser reads store state for character, action panel, and admin console behavior.

## Known gaps

- Complete resynchronization after reconnect: Not verified.
- Automatic cache invalidation: Not verified.
- Protection against stale state: Not verified.
- Robust retry: Not verified.
- Global error handling: Not verified.
- Store tests: Not verified.
- Secure browser persistence: Not verified.
- Strict separation between cache and source of truth: Not verified.
- Active use of `items.store.ts`: Not verified.
- Store update performance under heavy event load: Not verified.

## Review checklist

- [ ] New store state is classified as local cache or UI state.
- [ ] New sensitive actions call server-side validation paths.
- [ ] Token values are not logged or documented.
- [ ] Inventory and equipment state remain display-only.
- [ ] Admin role display is not treated as authorization.
- [ ] Phaser reads from stores only for local display or input coordination.
- [ ] Reconnect and stale-state behavior are reviewed when sync changes.
- [ ] Store errors are surfaced intentionally.
- [ ] Store tests are added or explicitly deferred.
- [ ] This document is validated before moving to `Review`.

## Non-goals

- This document does not describe backend internals.
- This document does not document detailed server events.
- This document does not document complete Phaser rendering.
- This document does not define a new state management architecture.
- This document does not document real secret values.
- This document does not replace store tests.

## Security notes

Never document real access tokens, credentials, passwords, hashes, copied environment values, or private user data.

Treat all Zustand values as user-controlled. They can help render the official client, but they must not authorize movement, combat, inventory, equipment, loot, or admin effects.

## Performance notes

Review high-frequency updates before adding new store writes from animation loops or socket listeners. Store changes that fan out into React renders or Phaser reads should be measured before assuming they scale.

## Related files

- [Documentation Index](../README.md)
- [React Vite Client](react-vite.md)
- [Phaser World](phaser-world.md)
- [Client Server Boundaries](../01_Architecture/client-server-boundaries.md)
- [Client Server Trust](../02_Security/client-server-trust.md)
- [Authentication JWT](../02_Security/authentication-jwt.md)
- [Admin Permissions](../02_Security/admin-permissions.md)
- [NestJS API Gateway](../04_Server/nestjs-api-gateway.md)
- [Server WebSockets](../04_Server/websockets.md)
- [Review Checklist](../09_Workflow/review-checklist.md)
- [Golden Rules](../10_AI/golden-rules.md)
- [STATUS.md](../../STATUS.md)

## Open questions

- Should token state move into an explicit auth store?
- Should `items.store.ts` be kept, wired, or removed later?
- Should stores expose explicit stale/loading/error fields?
- Should socket-driven store updates trigger a full character reload after important events?
- Should store tests cover singleton behavior on the browser window?
- Should a cache invalidation strategy be documented separately?

## TODO

- [ ] Add or verify tests for character store actions.
- [ ] Add or verify tests for action panel and admin store behavior.
- [ ] Review stale-state handling after reconnect.
- [ ] Review whether token access should be centralized.
- [ ] Review active need for `items.store.ts`.
- [ ] Add or verify a global client error-state pattern.
