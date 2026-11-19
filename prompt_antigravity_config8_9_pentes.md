# Spec — Configurations 8 et 9 : ligne de vie en pente (rendu 3D)

## Objectif
Implémenter le rendu 3D de deux configurations de pose en pente dans la version OSHA du
configurateur :

- **Configuration 8 — Single-span Slope System** : une seule portée en pente.
- **Configuration 9 — Multiple-span Slope System** : plusieurs portées en pente, chacune
  avec sa propre longueur et son propre angle.

La configuration 10 (horizontale + pente) est **hors périmètre**. Elle fait l'objet d'une
spec séparée.

Systèmes concernés : LightPRO, NewPRO et Long/Super/Ultra Range, sauf restriction
définie dans une autre spec.

## Contraintes
- **Ne pas créer de géométrie de poteau.** Les poteaux existent déjà comme pièces dans
  l'application. Il faut **réutiliser la pièce existante** et seulement la **placer et
  l'orienter**.
- **Ne pas modifier** le code ni le rendu des autres configurations, ni le code existant
  du toit incliné.
- Le rendu est une aide visuelle de pose. Il **n'intervient dans aucun calcul** (tension,
  flèche, tirant d'air, efforts aux ancrages).
- **Ne pas utiliser le chemin de rendu des portées chaînées avec boucle fermée**
  (utilisé par les configurations 3 à 7). Il a déjà produit des câbles parasites sur la
  configuration 11. Faire un rendu dédié, décrit ci-dessous.

## Modèle de données d'entrée
Liste ordonnée de portées, parcourue de bas en haut de la pente.

| Champ | Type | Détail |
|---|---|---|
| `spans[i].length` | nombre (m) | Longueur de la portée mesurée le long de la pente |
| `spans[i].slope_deg` | nombre (°) | Angle de la portée par rapport à l'horizontale |

- **Config 8** : exactement 1 portée.
- **Config 9** : N portées, N ≥ 2, nombre dynamique (pas de champs codés en dur).
- Les angles peuvent être **différents d'une portée à l'autre**.

## Calcul de la géométrie
Placer le point de départ à l'origine `(0, 0)` (plan vertical : `x` horizontal, `z`
vertical). Pour chaque portée `i`, avec `α = slope_deg` en radians :

```
dx_i = length_i × cos(α)
dz_i = length_i × sin(α)
sommet[i+1] = sommet[i] + (dx_i, dz_i)
```

On obtient `N + 1` sommets : un au bas de la ligne, un à chaque changement de pente, un
en haut. Afficher dans l'interface : **dénivelé total** (somme des `dz_i`) et
**projection horizontale totale** (somme des `dx_i`).

## Règles de génération

### 1. Surface de toiture
- Une surface en pente qui suit la polyligne des sommets, avec une largeur (profondeur)
  d'environ 6 m et une épaisseur d'environ 0,3 m. Constantes configurables.
- Habillage optionnel et décoratif : corps de bâtiment sous la toiture, jusqu'au sol,
  avec quelques fenêtres. Désactivable.
- La surface doit avoir un **angle visible à chaque changement de pente** en config 9.

### 2. Poteaux (pièce existante)
- **Un poteau à chaque sommet** : `N + 1` poteaux au total (2 en config 8).
- Base du poteau posée sur la surface au sommet.
- Orientation : l'axe du poteau est **perpendiculaire à la surface**. Au sommet
  intermédiaire entre deux pentes différentes, utiliser la **bissectrice** des deux
  normales. Si la pièce existante impose une autre convention d'orientation, la
  respecter et le signaler.
- Utiliser le **point d'attache du câble de la pièce** (son ancre), pas une hauteur
  inventée.

### 3. Câble
- **Un câble par portée** : segment entre le point d'attache du poteau `i` et celui du
  poteau `i + 1`. Donc `N` segments, jamais plus.
- Aucune boucle fermée. Aucun segment qui ne relie pas deux poteaux consécutifs.
- Points de passage à 1/3 et 2/3 de chaque segment, comme dans les rendus existants.

### 4. Étiquettes et cotes
- Étiquette « Portée i : L m, α° » près de chaque portée.
- Pour la config 9, arc d'angle au changement de pente (affichage optionnel).

### 5. Utilisateur symbolique (optionnel, désactivable)
Silhouette d'utilisateur debout sur la surface, avec une longe vers une navette sur le
câble, pour donner l'échelle. Position réglable le long de la ligne. N'influence aucun
calcul.

## Interface
- **Config 8** : deux champs, longueur (m) et angle (°).
- **Config 9** : tableau éditable (longueur, angle), bouton d'ajout et de suppression de
  portée, minimum 2 portées.
- Affichage en direct : dénivelé total, projection horizontale, nombre de poteaux, nombre
  de segments.

## Validation
- Chaque `length` entre 0 et le maximum admissible du système sélectionné (réutiliser les
  limites déjà définies dans le moteur de calcul).
- Chaque `slope_deg` dans une plage configurable, par défaut **15° à 75°**. Constantes
  `SLOPE_MIN_DEG` et `SLOPE_MAX_DEG` en tête du module, pas de valeur codée en dur.
- Message d'erreur clair et rendu non généré si une valeur est hors plage.

## Contrôles à ajouter (assertions)
Après génération de la scène, vérifier dans le code :
- nombre de poteaux = `N + 1` ;
- nombre de segments de câble = `N` ;
- chaque segment relie les points d'attache de deux poteaux consécutifs ;
- aucun segment ne relie deux poteaux non consécutifs.

Si une assertion échoue, afficher une erreur en console au lieu de dessiner une scène
fausse.

## Critères d'acceptation

1. **Config 8, 20 m à 30°** : dénivelé **10,00 m**, projection horizontale **17,32 m**,
   **2 poteaux**, **1 segment**.
2. **Config 9, portées (10 m, 20°), (12 m, 35°), (8 m, 25°)** :
   - dénivelé total : 3,42 + 6,88 + 3,38 = **13,68 m** ;
   - projection horizontale : 9,40 + 9,83 + 7,25 = **26,48 m** ;
   - **4 poteaux**, **3 segments** ;
   - un angle visible de la surface à chacun des 2 sommets intermédiaires.
3. **Config 9 avec 6 portées** : 7 poteaux, 6 segments, aucun câble parasite.
4. **Angle 80° saisi** : erreur de validation, rendu non généré.
5. Les autres configurations et le code du toit incliné sont inchangés.
