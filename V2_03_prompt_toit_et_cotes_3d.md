# Spec V2 — 03 : Toiture en entrée principale et cotes dans la vue 3D

## Objectif
Faire de la **toiture** une entrée principale : ses dimensions forment la surface sur
laquelle la configuration est posée. Afficher des **cotes visibles dans la vue 3D**, qui se
mettent à jour à chaque modification, comme dans SolidWorks.

## Contraintes
- **Réutiliser le code existant du toit incliné** (toit à une pente). Ne pas le réécrire.
  Ajouter le toit à deux pentes en prolongement.
- Ne pas modifier le moteur de calcul. Les nouvelles valeurs sont des entrées qui seront
  utilisées par la spec de calcul (V2_04 et V2_05).

## Entrées de toiture
| Champ | Type | Détail |
|---|---|---|
| `roof_type` | Choix | Plat, une pente, deux pentes |
| `roof_length` | nombre | Longueur du toit |
| `roof_width` | nombre | Largeur du toit |
| `roof_slope_deg` | nombre | Angle de la pente (une pente) |
| `roof_slope_deg_2` | nombre | Angle de la deuxième pente (deux pentes) |
| `ridge_position` | nombre | Position du faîtage, pour deux pentes (défaut : au milieu) |
| `line_to_edge` | nombre | **Distance entre la ligne de vie et le bord de toit** |
| `roof_height_above_ground` | nombre | **Hauteur du toit au-dessus du sol** |

Toutes les valeurs s'expriment dans l'unité choisie (pieds en US, mètres sinon).

## Règles
- La toiture est la **surface de pose** : elle détermine l'emprise de la scène 3D. La
  configuration se place sur cette surface, à la distance `line_to_edge` du bord.
- **Toit à deux pentes** : deux plans avec deux angles, qui se rejoignent au faîtage.
  La ligne de vie peut se poser sur l'un des deux plans, ou passer de l'un à l'autre.
- `line_to_edge` et `roof_height_above_ground` sont stockés comme entrées de calcul. Ils
  alimenteront la flèche totale et le dégagement de chute par-dessus le bord.
  **Ne pas calculer** ces résultats dans ce prompt.
- Validation : `line_to_edge` > 0, `roof_height_above_ground` > 0, angles de pente de
  0° à 75°.
- Si la ligne sort de la surface de toit, afficher un avertissement non bloquant.

## Cotes dans la vue 3D
- Cotes affichées **en permanence** dans la vue 3D, avec lignes d'attache, flèches et
  valeur : longueur de chaque portée, dimensions du toit (par exemple 20 ft et 30 ft),
  distance au bord, hauteur au-dessus du sol, angle de pente.
- Les cotes se **mettent à jour en direct** quand on modifie une portée, un angle ou une
  dimension de toit. Les cotes restent lisibles quand on tourne la vue (orientées vers la
  caméra ou posées sur la surface, au choix, mais lisibles dans les deux cas).
- Évitement de chevauchement avec les étiquettes d'ancrage et de portée.
- Case à cocher « Afficher les cotes », cochée par défaut.
- Mêmes unités que le reste de l'interface, avec le formatage de la spec langue et unités.

## Critères d'acceptation
1. Saisir un toit de 30 ft × 20 ft à une pente de 15° : la surface 3D correspond, les
   cotes 30 ft et 20 ft sont visibles.
2. Passer à deux pentes (15° et 25°) : deux plans se rejoignent au faîtage, avec les deux
   angles cotés.
3. Modifier la longueur d'une portée met à jour sa cote sans recharger.
4. `line_to_edge` et `roof_height_above_ground` sont visibles en cotes et conservés dans
   le projet.
5. Le code du toit à une pente existant n'a pas été réécrit.
