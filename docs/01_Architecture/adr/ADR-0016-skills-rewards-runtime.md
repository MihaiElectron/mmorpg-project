# ADR-0016 — Séparation XP personnage / XP compétence

**Statut :** Accepted  
**Date :** 2026-07-01  
**Contexte :** Skills & Rewards Phase 1.5

---

## Contexte

Le projet introduit deux canaux d'XP distincts : l'XP globale du personnage (niveau général) et l'XP des compétences (progression par domaine). Ces deux canaux obéissent à des règles de source radicalement différentes et ne doivent pas être confondus.

---

## Décision

### Canal 1 — XP globale du personnage

- Accordée par **récompense de domaine** configurée statiquement sur les entités de template.
- Exemple : `CreatureTemplate.killCharacterXpReward` — montant d'XP accordé au personnage à chaque kill confirmé serveur.
- Traitée par `ProgressionService.applyCharacterXpInTx(characterId, amount, source, manager)` dans une transaction dédiée.
- Notifiée au client via l'événement socket `character_xp_update` : `{ level, experience, nextLevelXp, leveledUp }`.
- `GET /characters/me` expose `nextLevelXp` calculé depuis `GameConfig` (singleton configurable).
- Formule : `nextLevelXp(level) = Math.round(characterBaseXpPerLevel × level ^ characterXpCurveExponent)`.

### Canal 2 — XP des compétences

- Accordée **uniquement par action runtime réelle** : coup porté, récolte effectuée, craft terminé, etc.
- **Jamais déterminée par un template de créature ou de ressource.**
- Implémentée dans une phase ultérieure via `SkillRuntime` award, découplée des templates de domaine.

---

## Règle critique

> **Aucun `CreatureTemplate` ne décide de l'XP skill.**

`CreatureTemplate` ne porte que `killCharacterXpReward` (XP globale personnage).  
Il n'y a pas de `killSkillXpReward`, pas de `killSkillDefinitionId`, pas de résolution du skill actif au kill.

La compétence récompensée lors d'un combat sera déterminée à la Phase suivante par l'action elle-même (arme utilisée, distance, type d'attaque), pas par la créature ciblée.

---

## Conséquences

- `ProgressionService` et `GameConfigService` sont des modules transversaux réutilisables par tous les domaines (récolte, craft, quêtes, événements).
- `SkillsService.addXp` n'est plus appelé dans `CreaturesService`. Il reste disponible pour les DevTools (`give_xp`, `set_skill`) et la future Phase Skills Runtime.
- Tout nouveau domaine accordant de l'XP personnage doit passer par `ProgressionService.applyCharacterXpInTx` dans sa propre transaction.
- Tout nouveau domaine accordant de l'XP skill doit passer par l'action runtime réelle, jamais par un champ de template.
