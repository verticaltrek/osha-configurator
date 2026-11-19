# Spec — Configurations 11 (Cross-spans) et 12 (Grid systems) avec pièces X-matrix

## Objectif
Implémenter deux configurations de pose dans la version OSHA du configurateur, avec le
rendu 3D de la **pièce X-matrix placée exactement à chaque intersection de câbles** :

| Configuration | Système autorisé | Pose |
|---|---|---|
| **11. Cross-spans** | **NewPRO uniquement** | Posée sur le toit (dalle), 4 branches depuis un point central |
| **12. Grid systems** | **Long / Super / Ultra Range uniquement** | **Overhead uniquement** (lignes au-dessus de l'utilisateur) |

**Règles de disponibilité** :
- La configuration 11 n'est proposée que si le système sélectionné est **NewPRO**. Elle
  est masquée ou désactivée pour LightPRO et Long/Super/Ultra Range.
- La configuration 12 n'est proposée que si le système sélectionné est **Long / Super /
  Ultra Range**. Elle est masquée ou désactivée pour LightPRO et NewPRO.
- Ces deux règles s'ajoutent à celles des autres configurations et ne les modifient pas.

## Contraintes
- **Ne pas modifier** le code ni le rendu des autres configurations.
- Le rendu est une aide visuelle de pose. Il **n'intervient dans aucun calcul** (tension,
  flèche, tirant d'air). Ne pas toucher au moteur de calcul.
- Réutiliser les composants 3D existants pour les poteaux, le câble et les points de
  passage. Seule la pièce X-matrix est un nouveau composant.

## La pièce X-matrix (nouveau composant 3D)
Plaque métallique à **quatre branches** (forme de croix), qui relie quatre câbles en un
point. Chaque branche se termine par un œillet où vient se fixer un câble.

- Matière : inox poli, gris clair. Un petit disque central.
- Orientation : les quatre branches sont **alignées avec les directions des câbles qui
  arrivent à la pièce**. Plaque dans le plan horizontal, à la hauteur du câble.
- Taille indicative : branches d'environ 0,25 m, largeur 0,08 m, constantes
  configurables.
- **Placement : le centre de la pièce coïncide exactement avec le point de croisement
  des câbles** (coordonnées x, y, et z = hauteur du câble). Aucune tolérance visuelle.
- Chaque câble se termine sur l'œillet de la branche qui lui correspond. Aucun câble ne
  traverse la pièce sans s'y fixer.
- **Aucun poteau n'est placé sous une pièce X-matrix**, ni à l'intersection. La pièce
  tient par la tension des câbles.

## Configuration 11 — Cross-spans (NewPRO uniquement, posée sur toit)

### Description
Quatre portées partent d'un point central où se trouve une pièce X-matrix. Chaque
branche est terminée par un poteau d'extrémité et a sa propre longueur.

### Données d'entrée
| Champ | Type | Détail |
|---|---|---|
| `branches[i].length` | nombre (m) | Longueur de la branche i (i = 1 à 4), indépendante des autres |
| `branches[i].angle_deg` | nombre (°) | Direction de la branche. Défaut : 0°, 90°, 180°, 270° (croix à angles droits). Modifiable en saisie avancée |

### Règles de génération
- Point central à l'origine. Une pièce X-matrix **au point central**, à la hauteur du
  câble.
- 4 câbles rectilignes allant de la pièce X-matrix à chaque poteau d'extrémité.
- 4 poteaux d'extrémité posés sur le toit, hauteur de poteau du système NewPRO.
- Étiquettes des branches : Span 1 à Span 4 (ou Nord, Est, Sud, Ouest).
- Pas de poteau au point central.

### Validation
- Chaque `length` entre 0 et le maximum admissible de la NewPRO (réutiliser la limite du
  moteur de calcul existant).
- Les angles de deux branches ne peuvent pas être identiques.

## Configuration 12 — Grid systems (Long/Super/Ultra Range uniquement, overhead)

### Description
Système en grille : plusieurs lignes dans une direction croisent plusieurs lignes dans
l'autre. Les lignes sont **au-dessus de l'utilisateur** (overhead), tenues par des
poteaux hauts à leurs extrémités. **Une pièce X-matrix à chaque intersection.**

### Données d'entrée
| Champ | Type | Détail |
|---|---|---|
| `x_lines` | liste de nombres (m) | Positions des lignes verticales (direction Y), du bord gauche vers le bord droit. Ou saisie par **écarts** successifs, convertie en positions |
| `y_lines` | liste de nombres (m) | Positions des lignes horizontales (direction X), même principe |
| `end_margin` | nombre (m) | Prolongement de chaque ligne au-delà de son dernier croisement jusqu'au poteau d'extrémité. Défaut : 2,0 m, modifiable par côté |
| `cable_height` | nombre (m) | Hauteur du câble overhead au-dessus du sol. Défaut : 3,5 m, modifiable |

Espacements **irréguliers autorisés** : chaque écart est saisi séparément. Saisie en
**tableau 2D** (une ligne par ligne de la grille), pas en formulaire linéaire. Nombre de
lignes dans chaque direction : minimum 2, extensible.

### Règles de génération
1. **Intersections** : pour chaque couple (`x_lines[i]`, `y_lines[j]`), le point
   `(x_i, y_j)` est une intersection. Il y a donc `nx × ny` intersections.
2. **Une pièce X-matrix par intersection**, centrée sur `(x_i, y_j, cable_height)`,
   avec ses quatre branches alignées sur les deux lignes qui se croisent. Aucune
   intersection ne doit rester sans pièce, aucune pièce ne doit être placée ailleurs.
3. **Poteaux d'extrémité** : un poteau à chaque extrémité de chaque ligne, soit
   `2 × (nx + ny)` poteaux. Hauteur du poteau = `cable_height`. Pas de poteau aux
   intersections.
4. **Câbles** : chaque ligne est découpée en segments entre deux points consécutifs
   (poteau d'extrémité, puis pièces X-matrix, puis poteau d'extrémité). Chaque segment
   est un câble rectiligne fixé sur les œillets des pièces ou sur les poteaux.
   Nombre de segments : `ny × (nx + 1) + nx × (ny + 1)`.
5. Points de passage (trolleys fixes) à 1/3 et 2/3 de chaque segment, comme dans les
   rendus existants.
6. Étiquettes : lignes A, B, C... pour une direction, 1, 2, 3... pour l'autre.
7. Un utilisateur symbolique peut être affiché sous une ligne pour montrer l'échelle
   (option d'affichage, désactivable).

### Validation
- Chaque segment (distance entre deux points consécutifs d'une ligne) doit être inférieur
  ou égal au maximum admissible du système Long/Super/Ultra Range sélectionné
  (réutiliser les limites du moteur de calcul existant). Afficher l'erreur avec
  l'identifiant du segment en cause.
- Positions de lignes strictement croissantes, sans doublon.
- `cable_height` strictement positive.

## Interface
- Configuration 11 : 4 champs de longueur. Un bloc « Angles » replié par défaut.
- Configuration 12 : tableau 2D pour les lignes X et Y, boutons d'ajout et de
  suppression de ligne, champs `end_margin` et `cable_height`.
- Compteurs affichés en direct : nombre de pièces X-matrix, de poteaux, de segments.

## Critères d'acceptation
Vérifier visuellement et par comptage :

1. **Config 11, NewPRO, branches de 10, 8, 12 et 6 m** : 1 pièce X-matrix au centre,
   4 câbles, 4 poteaux, aucun poteau au centre.
2. **Config 12, Ultra Range, grille 3 × 3** (lignes en X à 5, 13, 21 m et en Y à 5, 12,
   21 m) : **9 pièces X-matrix**, chacune exactement au croisement de deux câbles,
   **12 poteaux** d'extrémité, **24 segments**, aucun poteau aux intersections.
3. **Config 12, grille 2 × 4 à espacements irréguliers** : 8 pièces X-matrix,
   12 poteaux, 2 × 5 + 4 × 3 = 22 segments.
4. **Sélection du système** : en passant de NewPRO à Long/Super/Ultra Range, la
   configuration 11 disparaît et la 12 apparaît ; sur LightPRO aucune des deux n'est
   proposée.
5. Un segment dépassant la portée maximale du système déclenche l'erreur de validation.

Dans chaque cas : aucune modification des autres configurations.
