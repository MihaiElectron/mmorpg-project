# MMORPG Roadmap

## Metadata

- Status: Living document
- Owner: Project
- Last updated: 2026-06-21
- Depends on: STATUS.md, docs/01_Architecture/adr/, docs/README.md
- Used by: Project owner, developers, conversational assistants

## Purpose

This document describes what has been validated and what remains to be done.

It does not describe the current implementation state — see `STATUS.md` for that.

It does not describe architecture decisions in detail — see `docs/01_Architecture/adr/` for those.

It does not replace any existing document. It adds a single view of remaining work and current priority.

## Legend

| Marker | Meaning |
|---|---|
| `[x]` | Validé |
| `[ ]` | À faire |
| `[>]` | En cours |
| `[!]` | Bloqué |

---

# 1. Architecture

## World coordinate system

- [x] ADR-0001 — World Coordinate System (`mapId`, `worldTileX`, `worldTileY`, `CHUNK_SIZE=64`)
- [x] ADR-0002 — Entity Positioning (column naming, static/dynamic classification, WebSocket contract)

À venir :

- [ ] Chunk Streaming
- [ ] Interest Management
- [ ] Collision Architecture
- [ ] Persistence Strategy (résoudre la question ouverte du type de stockage ADR-0001)

---

# 2. Graphics

## Pipeline

- [x] IA (Claude Code)
- [x] GIMP (templates isométriques)
- [x] Tiled (TMJ natif, tilesets inlinés)
- [x] Phaser (tilemap isométrique 128×64 rendue)

## Terrain

- [ ] Terrain final (variété de tuiles)
- [ ] Biomes
- [ ] Transitions (herbe/terre, bord de map…)
- [ ] Water
- [ ] Cliffs
- [ ] Buildings

---

# 3. World

- [ ] Chunk generation
- [ ] Chunk loading
- [ ] Chunk unloading
- [ ] Streaming

---

# 4. Gameplay

- [>] Déplacement isométrique (en cours — base ADR-0001)
- [ ] Camera (follow isométrique)
- [ ] Collision
- [ ] Resources
- [ ] NPC
- [ ] Animals
- [ ] Combat

---

# 5. Admin Tool

- [ ] World editor
- [ ] Spawn editor
- [ ] Resource editor
- [ ] NPC editor

---

# 6. Network

- [ ] World synchronization (migration payloads `worldTileX/worldTileY`)
- [ ] Chunk synchronization
- [ ] Interest management
- [ ] Prediction
- [ ] Reconciliation

---

# 7. Database

- [ ] Migration coordonnées (ADR-0001 / ADR-0002)
- [ ] World persistence
- [ ] Resources
- [ ] NPC
- [ ] Animals
- [ ] Buildings

---

# 8. Art Direction

- [x] Asset pipeline (workspace `assets/source/`, guides, art-direction)
- [ ] Terrain
- [ ] Vegetation
- [ ] Buildings
- [ ] Characters
- [ ] Effects

---

# Current Focus

➡️ Déplacement isométrique du joueur basé sur ADR-0001.

---

# Next Milestone

**Le joueur peut marcher sur une carte isométrique.**

Critères :

- [ ] Coordonnées joueur cohérentes avec ADR-0001 (`worldTileX`, `worldTileY`)
- [ ] Projection isométrique appliquée : sprite aligné sur les tiles
- [ ] Caméra correcte (suit le sprite sans décalage)
- [ ] Synchronisation serveur (`player_move` en tile units)
- [ ] Aucun offset visuel résiduel entre sprite et tilemap
- [ ] Aucune dette technique supplémentaire introduite

---

## Règle de mise à jour

Ce document est mis à jour uniquement quand :

- un item change de statut (`[ ]` → `[x]`, `[ ]` → `[>]`, etc.) ;
- un nouveau domaine majeur est identifié ;
- le focus ou le milestone change.

Ne jamais y ajouter de journal, de détail d'implémentation ou de duplication de STATUS.md.
