# MMORPG Roadmap

## Metadata

- Status: Living document
- Owner: Project
- Last updated: 2026-07-11
- Depends on: STATUS.md, docs/01_Architecture/adr/, docs/README.md
- Used by: Project owner, developers, conversational assistants

## Purpose

This document is the primary entry point for any new development session.

It describes what has been validated, what remains to be done, and the current active milestone.

It does not describe the current implementation state — see `STATUS.md` for that.

It does not describe architecture decisions in detail — see `docs/01_Architecture/adr/` for those.

It does not replace any existing document. It provides a single view of priority, validated decisions, and remaining work.

---

# Reading Order

Every new session — human or AI — must begin with this order:

1. **`docs/ROADMAP.md`** (ce document) — comprendre la priorité active, les décisions figées et le travail restant.
2. **`STATUS.md`** — vérifier l'état d'implémentation réel : ce qui fonctionne, la dette technique connue, les derniers changements.
3. **ADR concernés** (`docs/01_Architecture/adr/`) — lire les décisions d'architecture impactées par la tâche en cours avant d'agir.
4. **Documentation du domaine** (`docs/`) — consulter les documents du domaine concerné (monde, client, serveur, sécurité…) pour ne pas contredire l'architecture existante.
5. **Code** — lire le code ciblé uniquement après avoir compris le contexte ci-dessus.

Ne jamais commencer par le code. Ne jamais ignorer les ADR lors d'une implémentation qui touche aux coordonnées, au réseau, à la base de données ou à la sécurité.

---

## Legend

| Marker | Meaning |
|---|---|
| `[x]` | Validé |
| `[ ]` | À faire |
| `[>]` | En cours |
| `[!]` | Bloqué |

---

# Frozen Decisions

Ces décisions sont officiellement actées. Elles ne peuvent pas être remises en question sans créer un nouvel ADR qui supersède le précédent.

## Architecture

- [x] World → Map → Chunk → Tile (hiérarchie officielle — ADR-0001)
- [x] `CHUNK_SIZE = 64` tiles par côté — constante invariante du projet (ADR-0001)
- [x] Tile terrain = 128×64 px (isométrique, format actuel du pipeline)
- [x] Pipeline IA → GIMP → Tiled → Phaser

## Format des maps et tilesets

- [x] TMJ comme format officiel des cartes (natif Tiled JSON)
- [x] TSX comme format officiel des tilesets d'édition (artefact d'authoring uniquement)
- [x] Runtime basé sur TMJ + PNG (aucune référence TSX externe à l'exécution)

## ADR

- [x] ADR-0001 — World Coordinate System (`mapId`, `worldX`, `worldY` WU, `CHUNK_SIZE=64`) — **Accepted** (2026-06-22)
- [x] ADR-0002 — Entity Positioning (convention de nommage, classification statique/dynamique, contrat WebSocket) — **Draft / Proposed** (en attente de validation humaine)

---

# 1. Architecture

## World coordinate system

- [x] ADR-0001 — World Coordinate System
- [x] ADR-0002 — Entity Positioning

À venir :

- [ ] Chunk Streaming
- [ ] Interest Management
- [ ] Collision Architecture
- [ ] Persistence Strategy (résoudre la question ouverte du type de stockage — ADR-0001)

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
- [x] Aggro creature (détection, poursuite, fuite, auto-attaque, riposte)
- [ ] Creatures (système complet)
- [ ] Combat (système complet)
- [x] Masteries V1-D — effets contextuels serveur (auto-attaque + skills weapon-based) — **ADR-0020 Accepted** (2026-07-11)
- [x] Mastery Effects V2 — modificateurs génériques `effects.modifiers[]` (percent/flat, 10 stats via pipeline de stats + `physicalAttack` contextuel arme), maîtrises niveau 0 (`bonus = level × coefficient`), source serveur `GET /admin/mastery-effect-targets` — **ADR-0020 amendé** (2026-07-11)
- [x] Stats secondaires V3 — Studio de création/édition des `DerivedStatDefinition` + connexion Mastery Effect Targets construits depuis ces définitions (2026-07-11)
- [x] Maintenance sûre des stats secondaires — stat système non supprimable, stat custom supprimable sans référence, rapport de références, retrait de modifier de maîtrise, duplication avec nouvelle key (2026-07-11)
- [x] `armorPenetrationPercent` V4-B0 — stat dérivée système offensive, ciblable en Mastery Effect permanent, ignore un % de l'armure de la cible (`effectiveArmor = round(armor × (1 − pct/100))`) sur auto-attaque + skills damage physiques ; `DamageType` physical/raw dans le calculateur pur (raw ignore armure + pénétration) ; ancienne `defensePenetration` plate dégradée en compatibilité, non exposée comme target (2026-07-12)
- [x] `SkillDefinition.damageType` V4-C — type de dégâts configurable par skill (`physical` défaut / `raw`), branché dans le cast (`raw` ignore armure + `armorPenetrationPercent`), migration backfill + CHECK, Studio Skill Editor (2026-07-12)
- [x] Contrat de résolution des dégâts combat posé (doc V4-D0) — phases attaque/défense séparées, `armorPenetrationPercent` appliqué en dernier, points d'insertion critique/curses/résistances fixés (`docs/08_Gameplay/combat-resolution.md`) (2026-07-12)
- [ ] Types de dégâts futurs — magical, elemental, poison (aucun aujourd'hui : seuls `physical`/`raw`)
- [ ] Critique combat — `criticalChancePercent` / `criticalDamagePercent` dans le bloc attaque (contrat V4-D0)
- [ ] Curses / `armorReduction` (flat/percent) — debuff cible dans le bloc défense, avant pénétration (contrat V4-D0)
- [ ] Effets de maîtrise futurs — critique, dodge/parry/block, accuracy, vitesses, résistances, stun/knockback, curses / `armorReductionPercent` (debuff cible), succès/qualité craft — ajout aux `mastery-effect-targets` au rythme des hooks serveur combat/craft (ADR-0020)

---

# 5. MMORPG Studio / DevTools

- [ ] World editor (Builder — Automation)
- [ ] Spawn editor (Builder — Automation)
- [ ] Resource editor (Builder — Automation)
- [ ] NPC editor (Builder — Automation)
- [ ] Overlays debug : chunks, collisions, aggro, pathfinding (DevTools)
- [ ] LiveOps : audit log, rate limiting, auth WebSocket indépendante
- [ ] Validation monde (Validation)
- [x] Skill Editor — `skill.weaponType` éditable (select, « Aucun » = null) (2026-07-11)
- [x] Module « Maîtrises / Effets » — création de maîtrise + édition des `effects` en tableau stat/mode/value, catalogue chargé depuis `GET /admin/mastery-effect-targets` (2026-07-11)
- [x] Module « Stats secondaires » — création/édition des `DerivedStatDefinition` (label, category, enabled, baseValue, min/max, coefficients, `masteryEligible`, `allowedModifierModes`, `runtimeStatus`, description ; key immuable) + maintenance sûre (suppression, rapport de références, retrait de référence de maîtrise, duplication de key) + panneau joueur alimenté par `GET /characters/stat-definitions` (2026-07-11)
- [ ] Visualisation des sources de modificateurs par stat dérivée (au-delà du rapport de références actuel)

Voir `docs/07_Admin/mmorpg-studio.md` pour la vision complète.

---

# 6. Network

- [ ] World synchronization (migration payloads vers `{ mapId, worldX, worldY }`)
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
- [ ] Creatures
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

# Current Milestone

➡️ **Le joueur se déplace sur une carte isométrique.**

**Objectif** : implémenter le déplacement du joueur dans le système de coordonnées défini par ADR-0001, avec une projection isométrique correcte côté client et une synchronisation serveur en tile units.

**Critères de validation** :

- [ ] Coordonnées joueur exprimées en `worldX`, `worldY` WU côté protocole (ADR-0001 Accepted, implémentation serveur Phase 1 complète)
- [ ] Projection isométrique appliquée : sprite aligné sur les tiles sans offset résiduel
- [ ] Caméra qui suit le sprite correctement dans l'espace isométrique
- [ ] `player_move` émis en tile units, reçu et validé par le serveur
- [ ] Aucune dette technique supplémentaire introduite

**Checklist avant clôture** :

- [ ] Build frontend sans erreur
- [ ] Test manuel en navigateur : déplacement, camera, alignement
- [ ] STATUS.md mis à jour
- [ ] ROADMAP.md : item `[>]` déplacé en `[x]`, nouveau milestone défini

---

# Parking Lot

Idées retenues mais non prioritaires. Elles n'ont pas de date ni de rang dans la roadmap actuelle.

- Météo dynamique
- Saisons
- Montures
- Housing (construction de maisons)
- Settlement / Economy (documentation Draft et ADR candidats Proposed, non implémenté)
- Guildes
- Quêtes dynamiques
- Artisanat avancé

Cette section ne représente pas les priorités du projet. Ces sujets ne seront traités qu'après stabilisation des fondations (coordonnées, chunks, gameplay de base).

---

# Update Rules

Ce document est mis à jour uniquement dans les cas suivants :

- Un item change de statut (`[ ]` → `[x]`, `[ ]` → `[>]`, `[>]` → `[x]`, etc.).
- Un nouveau domaine majeur est identifié et doit être tracé.
- Le milestone actuel est atteint et un nouveau milestone est défini.
- Une décision est officiellement validée et doit être ajoutée à **Frozen Decisions**.

Règles strictes :

- Ne jamais utiliser ROADMAP.md comme journal de développement.
- Ne jamais dupliquer STATUS.md (pas de détails d'implémentation, pas de liste de commits).
- Conserver un seul bloc **Current Milestone** à la fois.
- Déplacer les tâches terminées vers `[x]` dans leur section respective.
- N'ajouter un ADR dans **Frozen Decisions** qu'après validation humaine explicite (Decision status: Accepted).
- Mettre à jour `Last updated` dans les métadonnées à chaque modification.
