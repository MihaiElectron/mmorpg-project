# ADR-0018 — Classes, sous-classes, statistiques, masteries et skills

## Metadata

- Status: Draft
- Decision status: Proposed
- Owner: Project
- Last updated: 2026-07-08
- Date proposed: 2026-07-08
- Date accepted: N/A
- Approved by: TBD
- Approval reference: TBD
- Depends on:
  - docs/01_Architecture/adr/ADR-0004-runtime-driven-architecture.md
  - docs/01_Architecture/adr/ADR-0012-gameplay-architecture.md
  - docs/01_Architecture/adr/ADR-0016-skills-rewards-runtime.md
  - docs/00_Project/domains.md
  - docs/00_Project/glossary.md
- Used by: Project owner, backend developers, gameplay designers, Studio developers,
  repository-aware coding agents
- Supersedes: None
- Superseded by: None
- Related documents:
  - docs/01_Architecture/adr/ADR-0017-admin-character-mirror-parity.md
  - docs/08_Gameplay/runtime/README.md
- Related code:
  - apps/api-gateway/src/characters/character-stats-calculator.ts
  - apps/api-gateway/src/player-runtime/player-runtime.types.ts
  - apps/api-gateway/src/player-runtime/runtime-source.ts
  - apps/api-gateway/src/skills/skills.service.ts
  - apps/api-gateway/src/skills/entities/skill-definition.entity.ts
  - apps/api-gateway/src/skills/entities/player-skill.entity.ts

> **Note de numérotation.** Cette décision était désignée oralement « ADR-0017 ».
> Le numéro 0017 est déjà occupé par une décision **Accepted** sans rapport
> (`ADR-0017-admin-character-mirror-parity.md`). La convention (`adr/README.md`)
> interdit de réutiliser un numéro : cette ADR prend donc le prochain numéro
> libre, **0018**.

---

## Context

Cette ADR structure les **classes**, **sous-classes**, **statistiques**,
**masteries** et **skills** du personnage joueur, ainsi que leur configuration
et inspection depuis le **MMORPG Studio**.

Elle s'appuie sur un audit du code existant (session d'analyse 2026-07-08) dont
les constats structurants sont :

- **Deux systèmes de stats parallèles et non unifiés.**
  1. `CharacterStatsCalculator` (`characters/character-stats-calculator.ts`) —
     le système **joueur réel**, exposé par `GET /characters/me` et branché au
     combat. 8 stats primaires (`strength, vitality, endurance, agility,
     dexterity, intelligence, wisdom, critical`) et 8 dérivées (`maxHealth,
     physicalAttack, defense, criticalChance, criticalDamage, dodgeChance,
     accuracy, initiative`).
  2. Pipeline Runtime `player-runtime` (ADR-0004) — `StatKey` / `RuntimeModifier`
     / `RuntimeSource` / `RuntimeTrace`, mais seulement **6 StatKey**
     (`maxHp, attackPower, defenseTotal, speed, gatheringRange, attackRange`),
     alimenté aujourd'hui par le seul `EquipmentSource`. Ce pipeline **ne connaît
     pas** les stats primaires et **n'est pas** la source utilisée pour le combat
     joueur.
- **`intelligence` et `wisdom` sont des stats mortes** : présentes mais ne
  produisent aucune dérivée. Aucune couche magique n'existe.
- **Absence confirmée (grep exhaustif)** de : mana/ressource, dégâts magiques,
  puissance de soin, résistances, blocage, parade, pénétration, vitesse
  d'attaque/incantation, réduction de cooldown, menace/aggro, ténacité,
  résistance aux contrôles, régénération, types d'armure, slot bouclier dédié.
- **Aucune notion de classe, sous-classe ou mastery** n'existe dans le code.
- **`SkillDefinition` / `PlayerSkill` existent** (catalogue + état par
  personnage, XP/niveaux par `SkillsService`, cf. ADR-0016). Le seed réel range
  encore les métiers en `category: 'crafting' | 'gathering'` — la migration vers
  `category: 'profession'` est **Planned** (ADR-0016), non implémentée.
- **Progression V1** : colonnes `base{Strength…Critical}` + `unspentStatPoints`
  sur `Character`, `ProgressionService` accorde des points au level-up
  (`STAT_POINTS_PER_LEVEL`). Le combat lit les dérivées serveur.

Cette ADR pose les **règles structurelles** de classe/sous-classe/mastery/skill
et leur intégration au Runtime. Elle **ne fige aucun équilibrage chiffré** et
**n'autorise aucune implémentation** (voir Non-goals).

---

## Problem

Sans décision explicite, l'introduction des classes, masteries et skills
risque de :

- créer un **troisième** système de stats parallèle au lieu de réconcilier les
  deux existants ;
- appliquer des gains de classe/mastery **hors pipeline Runtime**, donc
  invisibles pour la `RuntimeTrace` et le Studio (violation ADR-0004) ;
- verrouiller des correspondances figées (classe ↔ métier, classe ↔ armure) qui
  contredisent le design souhaité (synergie émergente) ;
- coder des règles globales (points de stats, formule d'XP, coefficients de
  dérivées) en dur, non configurables depuis le Studio ;
- déplacer de la logique métier vers le client ou le Studio.

---

## Decision drivers

- Le serveur reste l'**unique autorité** sur les stats, dégâts, masteries
  effectives, effets de skills, coefficients et règles globales (ADR-0004,
  golden-rules §5, implementation-rules §3).
- Toute contribution de stat doit être **traçable** via le pipeline Runtime
  (ADR-0004 : `RuntimeSource → RuntimeModifier[] → DerivedStats + RuntimeTrace`).
- Réutiliser l'existant avant de créer : `SkillDefinition`/`PlayerSkill`,
  `ProgressionService`, `CharacterStatsCalculator`.
- Le Studio **observe et configure**, ne calcule jamais (ADR-0004,
  domaines.md, CLAUDE.md « Frontière Runtime / Admin »).
- Synergie **émergente** par recouvrement de stats, jamais par table figée.
- Toutes les constantes de balance restent des **paramètres configurables**,
  non figés dans l'ADR.

---

## Considered options

### Option A — Intégration Runtime + réutilisation des skills (retenue)

Classes, sous-classes et masteries sont des **RuntimeSource** produisant des
`RuntimeModifier` sur des `StatKey`. Les masteries de métier réutilisent et
étendent le modèle `SkillDefinition`/`PlayerSkill`. La synergie classe ↔ métier
émerge du recouvrement des stats. Les règles globales et coefficients sont
exposés en configuration Studio.

**Forces :** cohérent avec ADR-0004/0012/0016, traçable, observable Studio, pas
de système parallèle, extensible à de nombreuses classes.
**Faiblesses :** nécessite d'abord de réconcilier les deux systèmes de stats
existants (dette identifiée) ; coût d'intégration non nul.

### Option B — Sous-système classes/masteries autonome

Chaque mécanique (classe, mastery, skill) gère ses propres calculs et son propre
stockage, hors pipeline Runtime.

**Faiblesses :** duplication, invisibilité Studio, fragmentation de la source de
vérité, dette croissante. **Rejeté** (contraire à ADR-0004).

### Option C — Correspondances figées classe ↔ métier / classe ↔ armure

Tables statiques de liaison.

**Faiblesses :** rigidité, empêche la synergie émergente et le design « Guerrier
polyvalent ». **Rejeté** (contraire aux décisions de design).

---

## Decision

**Option A est retenue.** Les règles ci-dessous définissent la structure. Aucune
valeur d'équilibrage n'est figée : les nombres cités (points de stats, caps de
mastery, exemples de formule) sont des **valeurs de départ configurables**.

### 1. Progression du personnage

- **Niveau maximum final : 120.**
- **Cap de lancement : 60.** Les niveaux **61–120** sont réservés à une
  progression très lente et/ou à des déblocages futurs (non détaillés ici).
- **Points de stats configurables globalement :**
  - nombre de points au **niveau 1** — règle globale ;
  - nombre de points gagnés **par niveau** — règle globale ;
  - **valeurs de départ décidées : 3 points libres au niveau 1 et 3 points
    libres par niveau** (paramètres, non figés).
- **Aucun cap par stat primaire** : allocation entièrement libre (« full
  custom »).
- **Réaffectation sur changement de règle globale :** si la règle globale change
  (points au niveau 1 ou par niveau), les points déjà attribués sont **retirés
  et redeviennent disponibles à la réaffectation**. Le personnage conserve son
  total de points cohérent avec la nouvelle règle ; le joueur ré-alloue.
- **Recalcul serveur autoritatif :** le serveur recalcule **tous** les
  personnages existants et futurs selon les règles globales en vigueur.
- **Aperçu Studio obligatoire :** le Studio doit **afficher l'impact avant
  confirmation** d'un changement de règle globale (nombre de personnages
  affectés, points retirés/réattribués), avant tout recalcul serveur.

### 2. XP du personnage

- Le **coefficient d'XP** requis pour le level-up est une **règle globale
  configurable**.
- La **formule d'XP** est configurable depuis le Studio.
- **Aucune valeur définitive n'est figée** dans cette ADR.
- Formule **conceptuelle** (illustrative, non normative) :

  ```
  xpRequired(level) = baseXp × level ^ xpExponent × xpCoefficient
  ```

  `baseXp`, `xpExponent`, `xpCoefficient` sont tous **modifiables depuis le
  Studio**. Le serveur reste seul à appliquer la formule.

### 3. Statistiques primaires V1

Les **dix** stats primaires décidées :

1. Force
2. Vitalité
3. Endurance
4. Agilité
5. Dextérité
6. Intelligence
7. Sagesse
8. Esprit
9. Volonté
10. Charisme

Décisions associées :

- **Pas de stat Chance.**
- **Charisme ne booste pas les dégâts bruts.** Charisme influence : buffs,
  auras, **menace / aggro PvE**, leadership, social, et compagnons/invocations
  futurs.
- Les **coefficients de calcul des stats dérivées** (contribution de chaque
  primaire à chaque dérivée) sont **configurables depuis le Studio**. Le serveur
  reste la seule autorité de calcul.

> Cette liste remplace, à terme, les 8 primaires actuelles de
> `CharacterStatsCalculator`. La réconciliation avec le pipeline Runtime
> (déclaration des `StatKey` correspondantes) est un **prérequis technique**
> traité hors de cette ADR structurelle (voir Open questions et Migration).

### 4. Masteries

- **Mastery = maîtrise passive / spécialisée progressive** (distincte du niveau
  de personnage et des skills actifs).
- **Cap naturel : 1000.** **Cap overcap : 2000.**
- L'**overcap** (1001–2000) ne provient jamais de la progression naturelle : il
  vient de **buffs, équipements, skills temporaires ou effets serveur**.
- Les masteries peuvent **influencer des stats primaires, des stats dérivées ou
  des skills**.
- Les **skills peuvent temporairement amplifier une mastery** (effet borné dans
  le temps, appliqué serveur) :

  > Exemple : skill **Mur défensif** → pendant 8 secondes, **Heavy Armor
  > Mastery** est amplifiée de **+20 %**. Si l'armure effective est 500, elle
  > devient 600 pendant l'effet.

  Cette amplification est un **effet runtime temporaire**, **pas** un bonus d'XP
  de mastery : elle ne fait pas progresser la mastery.
- Intégration Runtime : une mastery contribue via une `RuntimeSource` dédiée
  produisant des `RuntimeModifier` traçables ; l'amplification temporaire par un
  skill est un modifier borné (source de type effet), visible dans la
  `RuntimeTrace`.

### 5. Catégories de masteries

Le Studio affiche les masteries dans des **panneaux déroulants par catégorie** :

- **Combat Masteries**
- **Weapon Masteries**
- **Armor Masteries**
- **Profession / Crafting Masteries**
- **Gathering Masteries**
- **Social / Leadership Masteries**

Exemples (contenu indicatif, extensible) :

| Catégorie | Exemples |
|---|---|
| Weapon | One-Handed, Two-Handed, Shield, Bow, Crossbow, Dagger, Polearm, Staff, (Dual Wield si retenu) |
| Armor | Cloth Armor, Leather Armor, Light Armor, Heavy Armor, Shield |
| Profession / Crafting | Smithing, Woodworking, (Alchemy plus tard) |
| Gathering | Mining, Woodcutting, Fishing, Herbalism |

> Les masteries de **Profession / Gathering** réutilisent et étendent le modèle
> `SkillDefinition` (`category: 'profession'`, aligné ADR-0016). Les masteries
> **Combat / Weapon / Armor** sont un nouvel axe de progression à définir en
> implémentation, sous le même contrat générique. `Shield Mastery` apparaît à la
> fois en Weapon et en Armor (référence unique, double rattachement d'affichage).

### 6. Guerrier V1 (premier chantier de classe)

Le **Guerrier de base** est la première classe implémentée. Décisions de
design :

- Le Guerrier a le **plus grand choix d'armes**.
- Le Guerrier peut combattre en **tissu, cuir, armure légère ou armure lourde**.
- **Pas de verrouillage brutal** à une seule armure ni à une seule arme.
- Les différences de build viennent des **masteries, équipements et skills**, pas
  d'une restriction de classe.
- Un Guerrier en **tissu** est possible, mais **moins optimisé défensivement**
  qu'un Guerrier entraîné en **Heavy Armor Mastery**.
- Un Guerrier à l'**arc** est possible si **Bow Mastery** progresse, mais il ne
  doit **pas remplacer automatiquement** un Archer spécialisé.
- **Les masteries créent l'identité réelle du build.**

Masteries minimum à prévoir pour le Guerrier :

- One-Handed Mastery
- Two-Handed Mastery
- Shield Mastery
- Heavy Armor Mastery
- Leather Armor Mastery
- Light Armor Mastery
- Cloth Armor Mastery
- Bow Mastery (optionnelle)
- Crossbow Mastery (optionnelle)

### 7. Skills

- **Skill = action active utilisable.**
- **Mastery = maîtrise passive / progressive.**
- **Talent = hors scope V1.** Talent n'est **pas** une catégorie centrale de
  cette ADR (voir Non-goals).
- Chaque skill expose des **variables configurables depuis le Studio** :
  - cooldown
  - coût mana / énergie
  - portée
  - durée
  - coefficient de dégâts
  - coefficient de soin
  - coefficient de réduction de dégâts
  - scaling par stat (primaire)
  - scaling par mastery
  - effet temporaire (ex. amplification de mastery, cf. § 4)
  - prérequis : classe / sous-classe / mastery / équipement

Le serveur reste seul à résoudre l'effet d'un skill ; le client envoie une
intention (quel skill, quelle cible) et reçoit le résultat (cohérent ADR-0012
§ Effect Engine).

### 8. MMORPG Studio

Le Studio devra **configurer et inspecter** (jamais calculer) :

- règles globales de progression (niveaux, points de stats, caps de niveau) ;
- coefficients d'XP (formule et paramètres, § 2) ;
- coefficients de calcul des stats dérivées (§ 3) ;
- classe et sous-classe d'un personnage ;
- stats primaires et points disponibles ;
- masteries, par **catégories déroulantes** (§ 5) ;
- skills et **variables de skills** (§ 7) ;
- déclenchement du **recalcul serveur détaillé** avec aperçu d'impact (§ 1) ;
- affichage de la **décomposition complète** :

  ```
  base + stats primaires + équipement + mastery + skill temporaire
       + buff/debuff = total final
  ```

  chaque contribution étant lue depuis la `RuntimeTrace` serveur, sans recalcul
  côté Studio.

**Règle stricte :** le Studio **configure et inspecte**. Le **serveur calcule**.
Le Studio **ne contient aucune logique métier** (domaines.md, ADR-0004 § « Pas
de logique métier dans le Studio »).

### 9. Sécurité

- Toute modification issue du Studio est **validée côté serveur** avant effet.
- Le **client ne décide jamais** : classe, sous-classe, stats finales, mastery
  effective, effet de skill, coefficients, ni règles globales.
- Les actions admin sensibles (changement de classe, édition de règles globales,
  recalcul) sont **authentifiées et autorisées** (JWT + rôle admin, guards HTTP /
  handlers `admin:*` role-gated), sur le modèle établi par ADR-0017.
- Les **recalculs** (stats, dérivées, masteries effectives, réaffectation de
  points) sont exécutés **côté serveur**, jamais côté client.

---

## Rationale

- Brancher classes/masteries/skills sur le pipeline Runtime (ADR-0004) garantit
  la traçabilité et l'inspection Studio sans outillage additionnel, et évite un
  troisième système de stats.
- Réutiliser `SkillDefinition`/`PlayerSkill` pour les masteries de métier évite
  de dupliquer la progression déjà fonctionnelle (ADR-0016).
- La synergie émergente (recouvrement de stats) permet « beaucoup de classes »
  sans table de liaison rigide, et rend le Guerrier polyvalent sans le
  verrouiller.
- Exposer toutes les constantes en configuration Studio respecte la contrainte
  projet « pas d'équilibrage chiffré figé » tout en gardant le serveur
  autoritatif sur le calcul.
- Le cap de lancement à 60 (sur 120) borne le contenu réellement jouable au
  départ tout en réservant l'espace de progression futur.

---

## Consequences

### Positive

- Un seul modèle de contribution de stat, traçable et inspectable (Runtime).
- Extensible à de nombreuses classes/sous-classes sans schéma rigide.
- Identité de build portée par les masteries : profondeur sans verrouillage.
- Balance entièrement pilotable depuis le Studio, sans redéploiement.
- Guerrier V1 fournit un premier chantier concret et borné.

### Negative

- Nécessite d'abord de **réconcilier les deux systèmes de stats** existants
  (`CharacterStatsCalculator` ↔ pipeline Runtime) — prérequis non trivial.
- Nouvel axe de progression (masteries combat/weapon/armor) à concevoir et
  persister : nouvelles entités et écritures.
- La réaffectation forcée des points sur changement de règle globale impose un
  recalcul de masse et une UX de ré-allocation.

### Risks

- **Système parallèle** : si masteries/classes appliquent des bonus hors
  pipeline, la trace devient incohérente (mitigation : `RuntimeSource`
  obligatoire).
- **StatKey non déclarée** : une stat ciblée hors `StatKey` est ignorée
  silencieusement (ADR-0004) — déclarer les clés avant tout ciblage.
- **Volume d'écriture** progression/masteries à grande échelle (accumuler en
  mémoire, flusher aux checkpoints — cf. ADR-0012).
- **Guerrier « couteau suisse »** : sans diminishing returns cross-mastery, un
  Guerrier pourrait égaler tous les spécialistes (à cadrer en balance
  configurable, hors ADR).

---

## Security impact

Le calcul de toute valeur (stats finales, dérivées, mastery effective, effet de
skill) reste serveur. Le client et le Studio reçoivent des résultats en lecture
seule issus de la `RuntimeTrace`. Aucune modification Studio n'a d'effet sans
validation serveur authentifiée/autorisée. Voir ADR-0004 § Security impact et
ADR-0017 pour le modèle de mutation admin.

## Performance impact

- Le snapshot Runtime n'est pas recalculé par tick ; il l'est sur événement
  (allocation, équipement, changement de règle, buff) — cohérent ADR-0004.
- Un changement de **règle globale** déclenche un recalcul de masse : à
  exécuter de façon bornée/asynchrone, avec aperçu d'impact préalable (§ 1).
- Les `getModifiers()` des nouvelles sources (classe, mastery) ne doivent faire
  aucune I/O (contrat ADR-0004).

## Migration and compatibility

Cette ADR est **structurelle et additive** : elle ne prescrit aucune migration
ni modification de schéma. Les points suivants sont signalés comme travaux
**Planned** dépendants, à valider séparément :

- réconciliation des deux systèmes de stats (déclaration des `StatKey` pour les
  10 primaires et les nouvelles dérivées) ;
- passage de la liste primaire de 8 à 10 (activation `intelligence`/`wisdom`,
  ajout Esprit/Volonté/Charisme, retrait de `critical` comme primaire) ;
- migration `SkillDefinition.category` vers `profession` (ADR-0016) ;
- introduction des entités de mastery et de la persistance classe/sous-classe.

Aucune valeur d'équilibrage n'est engagée par cette ADR.

## Validation

- [ ] Implémentation existante analysée (audit stats 2026-07-08).
- [ ] ADR-0004, ADR-0012, ADR-0016, ADR-0017 relues — pas de contradiction non
      signalée.
- [ ] Impact sécurité examiné.
- [ ] Impact performance examiné.
- [ ] Validation humaine enregistrée.
- [ ] Documents liés mis à jour (glossary, domaines, STATUS si implémentation).

## Open questions

- La réconciliation des deux systèmes de stats est-elle un prérequis **in-ADR**
  ou une ADR dédiée (potentiellement supersédant une partie d'ADR-0004 côté
  joueur) ?
- Un personnage a-t-il **une seule classe active + une sous-classe**, ou du
  multi-classe ?
- Ressource magique : **mana unique** universel ou ressources par archétype
  (mana / énergie / rage) ? (Impacte `StatKey` et l'entité.)
- `critical` reste-t-il une dérivée (retiré des primaires) ? Changement de
  contrat `/characters/me`.
- Où vit la carte « mastery → stats/dérivées influencées » : donnée configurable
  Studio consommée par une `MasterySource` ?
- Les caps de mastery (1000 / 2000) et les coefficients sont-ils stockés via
  `GameConfig` ou une table de configuration dédiée éditable Studio ?

## Non-goals

- **Pas d'implémentation** (code backend/frontend/Studio).
- **Pas de migration** de base de données.
- **Pas de talents V1** ; Talent n'est pas une catégorie centrale ici.
- **Pas d'équilibrage final chiffré** ; toutes les valeurs restent configurables.
- **Pas de table figée classe ↔ métier** ; la synergie est émergente.
- **Pas de verrouillage strict** du Guerrier à une armure ou une arme unique.
- **Pas de refonte du système de combat** dans cette ADR.

## Related files

- [ADR-0004 — Runtime-Driven Architecture](ADR-0004-runtime-driven-architecture.md)
- [ADR-0012 — Gameplay Architecture V1](ADR-0012-gameplay-architecture.md)
- [ADR-0016 — Skills & Rewards Runtime](ADR-0016-skills-rewards-runtime.md)
- [ADR-0017 — Parité panneau personnage joueur ↔ miroir admin](ADR-0017-admin-character-mirror-parity.md)
- [ADR Process](README.md)
- [Domaines du projet](../../00_Project/domains.md)
- [Glossary](../../00_Project/glossary.md)
- [STATUS.md](../../../STATUS.md)

## TODO

- [ ] Soumettre à revue humaine pour passage à `Accepted`.
- [ ] Trancher les Open questions (réconciliation stats, multi-classe, ressource
      magique) avant toute implémentation.
- [ ] Mettre à jour `glossary.md` (Classe, Sous-classe, Mastery, Volonté, Esprit)
      et `domaines.md` (Gameplay) à l'acceptation.
- [ ] Ajouter l'ADR dans `docs/01_Architecture/decisions.md` à l'acceptation.
