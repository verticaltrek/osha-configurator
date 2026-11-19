# Spec V2 — 08 : Simplification des configurations, X-matrix, X-cones, escaliers, MAD éditable

## Objectif
1. Retirer les configurations **3, 4, 5, 7, 9 et 10**, qui se font toutes avec la **configuration 2** (multi-portée).
2. Donner à la configuration 2 trois capacités : **X-matrix** facultative, **X-cones** sur les portées en pente, **escaliers** le long des pentes.
3. Rendre la **MAD modifiable** dans les entrées.

## Contraintes
- Ne pas modifier les formules de calcul existantes (efforts, 6 ancrages, tension du câble, pentes OSHA).
- Réutiliser les pièces 3D existantes : poteau, câble, X-matrix, X-cone. Aucune nouvelle géométrie.
- Les étiquettes, longueurs de portées et règles de calcul suivent les specs déjà livrées.

## 1. Catalogue des configurations

| Config | Décision |
|---|---|
| 1 Portée unique | Conservée |
| **2 Multi-portée** | Conservée et **étendue** (voir section 2). C'est la configuration générale |
| 3 Multi-portée, coude à 90° | **Supprimée** : config 2 avec un coude à 90° |
| 4 Multi-portée, coude à angle variable | **Supprimée** : config 2 avec un coude à angle variable |
| 5 Multi-portée, plusieurs coudes à 90° | **Supprimée** : config 2 |
| 6 Coudes à angle variable | Conservée telle quelle, car non citée. À confirmer, elle est aussi couverte par la config 2 |
| 7 Plusieurs coudes à angle variable | **Supprimée** : config 2 |
| 8 Portée unique en pente | Conservée telle quelle, car non citée |
| 9 Multi-portée en pente | **Supprimée** : config 2 avec des pentes |
| 10 Horizontal et pente | **Supprimée** : config 2 avec pentes et portées horizontales |
| 11 Croix | Conservée telle quelle |
| 12 Grille | Conservée telle quelle |

- Retirer les configurations supprimées du **menu de choix**, des écrans de calcul, des fichiers de traduction et du rapport.
- **Projets existants** : ouvrir un projet enregistré dans une configuration supprimée le **convertit en config 2**, avec la même liste de portées, coudes et pentes. Aucune donnée perdue, un message d'information le dit une fois.
- Le modèle de données commun reste : portées avec `length`, `bend_after_deg`, `slope_deg`, `closed_loop`.

## 2. Configuration 2 étendue

### 2.1 Portées, coudes, pentes
- Nombre de portées libre. Chaque portée a sa longueur, son coude après la portée (0° à l'angle voulu) et sa pente (0° à 75°, constante `SLOPE_MAX_DEG`).
- Une même ligne peut mélanger portées horizontales, coudes et pentes, comme les anciennes configs 9 et 10.
- **Pentes : OSHA uniquement**, comme aujourd'hui. En mode EN, la pente est désactivée avec un message clair.
- Les résultats sur pente suivent la spec calcul pentes OSHA (résultats sur la ligne horizontale et sur la pente).

### 2.2 Escaliers le long des pentes
- Tout tronçon en pente reçoit automatiquement un **escalier** et une **plateforme d'arrivée**, selon la spec `prompt_antigravity_config10_escalier_plateforme.md` : marches régulières, pas de garde-corps, poteaux posés sur la plateforme, pentes consécutives en une seule volée.
- Bascule « Afficher les escaliers » (activée par défaut). Elle ne change ni le calcul ni la liste des portées.
- Si `slope_deg` dépasse 45°, afficher l'escalier avec l'avertissement non bloquant de la spec.

### 2.3 X-cones sur les portées en pente
- **Autorisés uniquement sur une portée en pente.** Sur une portée horizontale, refuser avec un message.
- Par portée en pente : nombre de X-cones de **0 à N**, sans plafond fixe. Position de chacun le long de la portée en pourcentage de sa longueur. Par défaut : répartis régulièrement.
- Rendu 3D avec la pièce X-cone existante, numérotés (C1, C2…), étiquettes régénérées à chaque modification.
- Les X-cones alimentent la liste `cones` du module Sloped System (`prompt_antigravity_sloped_system.md`), sans modifier le code de pente existant : glissement par cône dans la note de calcul.

### 2.4 X-matrix facultative
- Bouton « Ajouter une X-matrix » sur un **ancrage intermédiaire** de la ligne. La pièce X-matrix existante est placée exactement à ce point, à la hauteur du câble, **sans poteau dessous** (comme en config 11).
- Sur une X-matrix, on peut ajouter de **0 à 3 branches** (portées secondaires), avec angle (90° par défaut) et longueur. Sans branche, la pièce est posée sur la ligne sans autre effet.
- Avec des branches, la règle de croix existante s'applique à ce point : 25 % de l'effort à l'ancrage de chute pour les trois autres points.
- Mêmes restrictions de système qu'en configs 11 et 12 : X-matrix sur la gamme **NewPRO**, et en **overhead** pour les gammes Range. Hors de ces cas, afficher un message et ne pas placer la pièce.
- Une X-matrix et ses branches sont comptées dans les étiquettes (X1, X2…) et dans la nomenclature.

**Hypothèse à confirmer** : je comprends la X-matrix en config 2 comme un point de jonction posé sur la ligne, avec 0 à 3 branches facultatives. Si tu veux seulement une ligne qui en croise une autre, c'est le même mécanisme avec une branche.

## 3. MAD modifiable
Dans la section SRL et dispositif de connexion (V2_04) :
- Le champ **MAD** (distance d'arrêt maximale) est un **champ de saisie**, prérempli par la valeur de la fiche SRL choisie.
- L'ingénieur peut le modifier. Quand la valeur diffère de la fiche, afficher « modifiée » à côté, avec un bouton **Rétablir la valeur de la fiche**.
- Validation : strictement supérieure à 0. Avertissement non bloquant au-dessus de `MAD_WARN_M = 2,0 m`.
- Unités selon la spec langue et unités (m en métrique, ft ou in en US), stockage en SI.
- La modification **met à jour en direct** le dégagement de chute total (V2_05).
- Le **rapport PDF** indique la MAD utilisée et précise « valeur modifiée par l'utilisateur » quand c'est le cas.
- Même comportement pour la MAD de la longe.

## Critères d'acceptation
1. Le menu ne propose plus les configs 3, 4, 5, 7, 9 et 10. Les configs 1, 2, 6, 8, 11 et 12 restent.
2. Ouvrir un ancien projet en config 9 ou 10 donne un projet en config 2 identique (mêmes portées, pentes, coudes).
3. Config 2 avec « H 10 m, pente 20 m à 30°, H 15 m » : l'escalier de 10 m de dénivelé, la plateforme et les poteaux sont rendus comme dans l'ancienne config 10.
4. Ajouter 3 X-cones sur une portée en pente les montre en 3D (C1 à C3) et alimente la note de calcul. En ajouter sur une portée horizontale est refusé.
5. Ajouter une X-matrix sur un ancrage intermédiaire de la ligne la place exactement sur ce point, sans poteau dessous, et incrémente la nomenclature.
6. Modifier la MAD de 1,80 m à 1,10 m change le dégagement total immédiatement, affiche « modifiée » et l'indique dans le PDF.
7. En mode EN, la pente est désactivée avec un message.
