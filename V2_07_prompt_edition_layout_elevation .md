# Spec V2 — 02 : Édition d'une configuration, géométrie, élévation de la ligne

## Objectif
Permettre de **modifier une configuration existante sans la reconstruire**, d'ajouter des
coudes et des portées n'importe où, de combiner coudes à angle variable et pentes, et de
régler la hauteur de la ligne de vie.

## Contraintes
- Conserver le modèle de données commun des configurations : liste ordonnée de portées
  avec `length`, `bend_after_deg`, `slope_deg`, `closed_loop`.
- Réutiliser les pièces 3D existantes (poteaux, câbles, X-matrix). Ne pas créer de nouvelle
  géométrie de poteau.
- Les étiquettes d'ancrage et de portée suivent la spec des étiquettes et sont régénérées
  après chaque modification.

## 1. Édition d'une configuration existante
- Toute configuration créée reste **modifiable** : longueurs, angles, pentes, nombre de
  portées, sans repartir de zéro.
- **Ne plus redemander le système** (LightPRO, NewPRO, Long/Super/Ultra Range) après
  chaque modification. Le système choisi reste en mémoire pour tout le projet.
- Les autres entrées (arrest load, SRL, élévations, utilisateur) sont conservées à chaque
  édition.

## 2. Insérer, ajouter, supprimer
Opérations disponibles sur **toutes les configurations**, pentes comprises :

| Opération | Détail |
|---|---|
| Insérer une portée **avant** ou **après** une portée choisie | Au tout début et à la toute fin de la ligne aussi |
| Insérer un coude | Entre deux portées, avec son angle, y compris au début de la ligne |
| Scinder une portée en deux | Avec position du point de coupe |
| Supprimer une portée ou un coude | Les portées voisines se rejoignent |
| Modifier longueur, angle ou pente | Depuis un tableau ou en sélectionnant l'élément dans la vue 3D |

- Chaque portée et chaque ancrage a un **identifiant interne stable**, distinct de
  l'étiquette affichée. La portée de chute choisie, les résultats et les cotes restent
  rattachés à la **même portée physique** après insertion ou suppression, même si les
  numéros d'étiquette changent.
- Après chaque opération : renumérotation des étiquettes, revalidation, nouveau rendu 3D.

## 3. Annuler et rétablir
- Pile d'annulation d'au moins **50 actions** : annuler (Ctrl+Z) et rétablir (Ctrl+Y ou
  Ctrl+Maj+Z), avec deux boutons visibles.
- Chaque action d'édition (valeur, insertion, suppression) est une entrée de la pile.
- L'annulation restaure aussi l'étiquetage, la sélection de portée de chute et le rendu.

## 4. Coudes à angle variable combinés avec des pentes
- Une même configuration peut contenir des **coudes à angle variable ET des pentes**.
  Chaque portée porte `bend_after_deg` et `slope_deg`.
- **Pente maximale : 75°**, la valeur testée en essais. Constante `SLOPE_MAX_DEG = 75`.
  Refuser toute valeur supérieure avec un message clair.
- Le rendu 3D doit montrer correctement le coude dans le plan horizontal et la pente
  dans le plan vertical, sur la même ligne.
- Les règles de calcul des coudes (supérieurs à 40° : deux ancrages au coude et
  réduction de moitié après) restent valables.

## 5. Élévation de la ligne de vie réglable
Aujourd'hui la ligne est à environ **hauteur de genou**. Nouveau champ « Élévation de la
ligne » :

| Préréglage | Valeur |
|---|---|
| Hauteur de genou | Valeur actuelle, conservée comme défaut pour ne rien changer |
| Anneau D | 1,5 m (60 po), modifiable |
| Personnalisée | N'importe quelle valeur, y compris au-dessus de la tête |
| Overhead | Ligne au-dessus de l'anneau D, hauteur modifiable |

- La hauteur de poteau dans la vue 3D suit l'élévation. Si la pièce poteau existante ne
  couvre pas la hauteur demandée, utiliser la ou les pièces d'extension existantes. Si
  aucune ne convient, afficher un avertissement sans bloquer.
- Cette valeur alimente le champ **HLL Elevation** de la spec de calcul (V2_04). Une seule
  saisie, aucun doublon.
- Le préréglage détermine aussi le **facteur de chute** (0, 1 ou 2) et donc le jeu de
  résultats utilisé. Voir `V2_07_prompt_elevation_facteur_chute.md`.

## Critères d'acceptation
1. Une configuration à 4 portées se modifie (longueur, angle, ajout, suppression) sans
   ressaisir le système ni les autres entrées.
2. Insérer une portée en tout début de ligne renumérote les ancrages, et la portée de
   chute choisie reste la même portée physique.
3. Annuler (Ctrl+Z) 10 fois de suite puis rétablir restitue chaque état exact.
4. Une configuration avec 2 coudes à angle variable et 2 pentes se rend correctement en 3D.
5. Une pente de 76° est refusée, une pente de 75° est acceptée.
6. Passer l'élévation de « genou » à « anneau D » (1,5 m) puis « overhead » modifie la
   hauteur des poteaux dans la vue 3D sans changer la géométrie en plan.
