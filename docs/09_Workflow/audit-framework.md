# Framework d'audit régulier

## 1. Objectif

Ce framework transforme les audits database, TypeORM et sécurité en un registre
d'alertes maintenable. Il sert à relancer les audits sans réécrire toute la
documentation et à vérifier que chaque risque critique devient une correction
testable.

Livrables liés :

- `docs/09_Workflow/audit-alerts.md` : registre des alertes ouvertes et fermées.
- Audits sources dans `docs/06_Database/*` et `docs/02_Security/*`.

## 2. Sources à lire

Toujours lire :

- `docs/06_Database/database-architecture-audit.md`
- `docs/06_Database/database-performance-audit.md`
- `docs/06_Database/database-evolution-roadmap.md`
- `docs/06_Database/typeorm-audit.md`
- `docs/06_Database/typeorm-roadmap.md`
- `docs/02_Security/backend-websocket-security-audit.md`
- `docs/02_Security/security-hardening-roadmap.md`
- `docs/09_Workflow/audit-alerts.md`

Relire le code seulement pour vérifier une alerte ou préparer sa fermeture :

- `apps/api-gateway/src/**/*.entity.ts`
- `apps/api-gateway/src/**/*.service.ts`
- `apps/api-gateway/src/**/*.controller.ts`
- `apps/api-gateway/src/**/*.gateway.ts`
- `apps/api-gateway/src/**/*.dto.ts`
- `apps/api-gateway/src/migrations/*`
- `apps/api-gateway/src/app.module.ts`
- `apps/client/src/**/*socket*`
- `apps/client/src/**/*admin*`

## 3. Cadence recommandée

- Après chaque feature qui touche inventaire, loot, combat, craft, économie,
  admin, auth, WebSocket ou migrations.
- Avant toute phase économie : monnaie, auction house, banques, guild banks,
  escrow, taxes ou trading joueur.
- Avant génération de gros volumes monde : ressources, créatures, stations,
  spawns, events runtime.
- Avant release de test multi-joueur persistante.
- Mensuellement pendant développement actif, même sans feature majeure.

## 4. Classification des alertes

- `BLOCKER` : corruption, faille critique, duplication, autorité client
  dangereuse, schéma non contrôlé ou effacement de richesse joueur.
- `HIGH` : risque important avant inventaire, économie, Studio réel ou
  multi-joueur persistant.
- `MEDIUM` : dette significative qui peut devenir coûteuse ou fragile avec le
  volume.
- `LOW` : optimisation, observabilité, hygiène ou long terme.

Une alerte doit rester au niveau le plus haut tant que son impact concret reste
possible dans le runtime ou le modèle de données.

## 5. Format d'une alerte

Chaque alerte doit contenir :

- ID stable : `DOMAINE-SEVERITY-NN`, par exemple `SEC-BLOCKER-01`.
- Source audit.
- Constat court.
- Impact concret.
- Correction attendue.
- Fichiers probables.
- Tests/builds attendus.
- Statut : `Open` ou fermé dans la section dédiée.

Domaines recommandés :

- `DB` : PostgreSQL, schéma, index, migrations, contraintes.
- `ORM` : usage TypeORM, relations, transactions, repositories.
- `SEC` : auth, autorisation, WebSocket, anti-triche, admin.
- `WF` : workflow, CI, protocole d'audit.

## 6. Workflow de correction

1. Choisir l'alerte la plus haute dans `audit-alerts.md`.
2. Lire l'audit source indiqué et les fichiers probables.
3. Écrire ou ajuster les tests attendus avant ou pendant la correction.
4. Corriger le code, migration ou documentation nécessaire dans une branche ou
   mission dédiée.
5. Exécuter les tests/builds attendus et noter les commandes utilisées.
6. Vérifier qu'aucune autre alerte n'est aggravée par la correction.
7. Mettre à jour `audit-alerts.md` seulement si la correction est complète.

## 7. Workflow de fermeture

Une alerte peut être fermée uniquement si :

- la correction est implémentée ;
- les tests/builds attendus passent ou une exception est explicitement
  documentée ;
- les fichiers probables ont été relus ;
- l'impact concret décrit n'est plus reproductible ;
- le commit de correction est identifié.

Procédure :

1. Déplacer l'alerte de sa section `Open` vers `Alertes fermées`, ou ajouter une
   entrée résumée si le détail reste dans l'historique Git.
2. Indiquer date, commit, preuve de test et décision.
3. Ne pas réutiliser l'ID.
4. Si seule une partie est corrigée, garder l'alerte ouverte et ajouter une note
   courte dans son corps.

## 8. Commandes de vérification

Commandes minimales pour une mission documentaire :

```bash
git status --short
git diff --cached
```

Commandes utiles lors d'une correction backend :

```bash
npm test
npm run build
```

Commandes utiles lors d'une correction migration ou index :

```bash
npm run migration:run
npm run migration:revert
```

Si les scripts exacts n'existent pas encore, l'alerte `DB-BLOCKER-01` reste
ouverte et la mission doit documenter la commande réellement disponible.

## 9. Non-goals

- Ne pas réécrire les audits thématiques à chaque passage.
- Ne pas créer de roadmap vague sans alerte testable.
- Ne pas déclarer une alerte fermée sur intention ou correction partielle.
- Ne pas mélanger corrections Runtime et consolidation documentaire.
- Ne pas stage de fichiers Runtime lors d'une mission audit documentaire.
- Ne pas créer de migration depuis ce framework.
