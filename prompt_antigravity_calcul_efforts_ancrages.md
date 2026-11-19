# Spec — Module de calcul : nouvelle répartition des efforts aux ancrages (multi-portée, bend, cross, grid)

## Objectif
Modifier la **répartition des efforts aux points d'ancrage** pour les configurations
multi-portées, avec coudes, en croix et en grille. Les formules qui donnent l'effort
principal à l'ancrage de chute **ne changent pas**. Seule la manière de **distribuer**
cet effort sur les ancrages voisins change.

## Contraintes
- **Ne pas modifier** les formules existantes de calcul de l'effort à l'ancrage de chute
  (flèche, tension, arrest load) ni les configurations mono-portée (1 et 8).
- Écrire la distribution dans des fonctions dédiées (une par règle), appelées après le
  calcul existant. Pas de duplication de la logique de base.
- Tous les coefficients ci-dessous sont des **constantes nommées** regroupées dans un
  objet de configuration en tête du module, modifiables sans toucher au reste du code.
- Unités : efforts en kN, masses en kg, `g = 9,81 m/s²` (constante).
- Arrondir à 2 décimales à l'affichage uniquement, jamais dans les calculs intermédiaires.

## Constantes de configuration
| Constante | Valeur par défaut | Usage |
|---|---|---|
| `K_ATTENUATION_MIN` | 0,46 | Borne basse de l'atténuation des ancrages ajoutés (multi-portée) |
| `K_ATTENUATION_MAX` | 0,53 | Borne haute |
| `K_ATTENUATION_DEFAULT` | 0,495 | Valeur utilisée par défaut (milieu de la plage) |
| `BEND_THRESHOLD_DEG` | 40 | Seuil d'angle de coude |
| `BEND_FACTOR_AFTER` | 0,50 | Facteur appliqué après un coude supérieur au seuil |
| `CROSS_OTHER_FACTOR` | 0,25 | Part de l'effort de chute sur les 3 autres ancrages (cross) |
| `GRID_PRETENSION_KG` | 600 | Prétension du câble (config 12) |
| `GRID_USER_MASS_KG` | 141 | Masse de l'utilisateur utilisée pour la précharge (modifiable en saisie) |
| `GRID_LEVEL_FACTOR` | 0,25 | Facteur appliqué à chaque croix successive |
| `GRID_CUTOFF_RATIO` | 0,01 | En dessous de ce ratio par rapport à la croix de chute, l'effort est mis à 0 |

## Règle 1 — Multi-portée : passage de 4 à 6 points
**Configurations concernées** : toutes les configurations multi-portées horizontales ou
en pente (2, 3, 4, 5, 6, 7, 9, 10). Hors 11 et 12, qui ont leurs propres règles ci-dessous.

Aujourd'hui l'effort est donné sur **4 points d'ancrage** autour de la chute :
`A1, A2, A3, A4`, dans l'ordre le long de la ligne.

Nouvelle règle : **un ancrage supplémentaire de chaque côté**, dont l'effort est atténué
par rapport à l'ancrage précédent (le plus extérieur des 4) :

```
A0 = K_gauche × A1          (ancrage ajouté côté gauche)
A5 = K_droite × A4          (ancrage ajouté côté droit)
résultat : [A0, A1, A2, A3, A4, A5]   (6 points)
```

- `K_gauche` et `K_droite` sont dans `[0,46 ; 0,53]`.
- Par défaut : `K = K_ATTENUATION_DEFAULT` (0,495) des deux côtés.
- Option avancée « variation reproductible » : tirer `K_gauche` et `K_droite`
  indépendamment dans la plage, avec une graine fixe (même saisie = même résultat).
- Le tableau des efforts de l'interface et du rapport affiche maintenant **6 points**.

## Règle 2 — Multi-portée avec coude (bend)
**Configurations concernées** : 3, 4, 5, 6, 7 (et 10 pour ses éventuels coudes).

Pour chaque coude de la ligne, selon son angle `θ` :

- **`θ ≤ 40°`** : appliquer la **règle 1** (6 points) sans autre modification.
- **`θ > 40°`** :
  1. **Ajouter deux ancrages au coude** dans la chaîne d'ancrages, dans l'ordre le long
     du parcours.
  2. Calculer la distribution à 6 points de la règle 1, en affectant les 6 valeurs aux
     6 ancrages les plus proches de la chute, en ordre le long du parcours (3 de chaque
     côté de la portée de chute), les deux ancrages de coude comptant comme des ancrages.
  3. **Multiplier par `BEND_FACTOR_AFTER` (0,50)** l'effort de chaque ancrage situé
     **après le coude**, c'est-à-dire du côté opposé à la chute, après la paire
     d'ancrages du coude.
  4. Les ancrages situés avant le coude (côté chute) et les deux ancrages du coude
     gardent la valeur issue de la règle 1.
- **Plusieurs coudes supérieurs à 40°** : le facteur 0,50 se **cumule** à chaque coude
  franchi (0,50 après le premier, 0,25 après le deuxième, etc.).
- Le sens de parcours se calcule à partir de la position de la chute, des deux côtés
  indépendamment.

## Règle 3 — Cross (config 11, NewPRO)
4 ancrages, un au bout de chaque branche. La pièce X-matrix centrale n'est pas un ancrage.

```
F_chute  = effort à l'ancrage de la branche où a lieu la chute (calcul existant)
autres 3 ancrages = CROSS_OTHER_FACTOR × F_chute   (25 %)
```

## Règle 4 — Grid (config 12, Long/Super/Ultra Range, overhead uniquement)

### Précharge à chaque croix
Chaque croix (pièce X-matrix) a **4 points** : un par branche de câble.

```
P0 = GRID_PRETENSION_KG × g / 1000          (prétension, en kN)
W  = masse_utilisateur × g / 1000           (poids utilisateur, en kN)

point de la branche de chute :   précharge = P0 + W
3 autres points de la croix  :   précharge = P0 + W / 3
```

### Effort de chute
En cas de chute, l'effort dynamique est **ajouté** à la précharge, point par point,
sur la croix de chute :

```
total_point = précharge_point + effort_dynamique_point
```

L'effort dynamique est celui du calcul existant (arrest load) pour la portée de chute :
`F_chute` au point de la branche de chute, et `CROSS_OTHER_FACTOR × F_chute` aux 3 autres
points de cette croix (même règle que la règle 3).

### Propagation de croix en croix
1. **Croix de niveau 0** : la croix X-matrix la plus proche de la position de chute
   (la chute est repérée par le segment concerné et son abscisse). En cas d'égalité,
   prendre la plus proche du début de la ligne.
2. **Niveau n** : nombre de croix franchies, le long des lignes de la grille, pour
   aller de la croix de niveau 0 à la croix considérée (plus court chemin).
3. Les 4 valeurs de la croix de niveau `n` valent
   `GRID_LEVEL_FACTOR × (valeurs de la croix de niveau n−1)`, point par point :
   25 % de la croix précédente, puis 25 % de celle-là, etc.
4. **Coupure** : si la valeur d'un point est inférieure à `GRID_CUTOFF_RATIO` × (le plus
   grand total de la croix de niveau 0), la mettre à **0**. Les croix très éloignées de
   la chute ont donc 0 aux ancrages.
5. **Poteaux d'extrémité** : l'effort d'un poteau d'extrémité est celui de la branche de
   la dernière croix de sa ligne qui pointe vers lui.

### Sortie
Pour chaque point d'ancrage de la grille, afficher : identifiant (croix, branche),
niveau, précharge, effort dynamique, total.

## Entrées à ajouter
- `user_mass_kg` (défaut `GRID_USER_MASS_KG`) : uniquement pour la config 12.
- `grid_pretension_kg` (défaut `GRID_PRETENSION_KG`) : uniquement pour la config 12,
  affichée en lecture seule par défaut.
- Position de la chute (segment et abscisse) pour la config 12. Pour les autres
  configurations, réutiliser la saisie de position de chute existante.

## Exemples de vérification

### Multi-portée (règle 1)
Entrée : `[A1, A2, A3, A4] = [10 ; 20 ; 18 ; 9]` kN, `K = 0,50`.
Sortie : `[5,00 ; 10,00 ; 20,00 ; 18,00 ; 9,00 ; 4,50]`.
Avec `K = 0,495` : `[4,95 ; 10,00 ; 20,00 ; 18,00 ; 9,00 ; 4,46]` (4,455 arrondi).

### Coude supérieur à 40° (règle 2)
Les 6 valeurs de la règle 1 sont `[5,00 ; 10,00 ; 20,00 ; 18,00 ; 9,00 ; 4,50]`. Si les
deux derniers ancrages sont situés après un coude de 55°, sortie :
`[5,00 ; 10,00 ; 20,00 ; 18,00 ; 4,50 ; 2,25]`. Avec un coude de 35° à la même
place : `[5,00 ; 10,00 ; 20,00 ; 18,00 ; 9,00 ; 4,50]` (inchangé).

### Cross (règle 3)
`F_chute = 12,00` kN : sortie `[12,00 ; 3,00 ; 3,00 ; 3,00]`.

### Grid (règle 4)
`P0 = 600 × 9,81 / 1000 = 5,886` kN. Masse 141 kg : `W = 1,383` kN.
Précharge point de chute : `7,269` kN. Précharge des 3 autres : `5,886 + 0,461 = 6,347` kN.
Avec `F_chute = 10,00` kN : dynamique `[10,00 ; 2,50 ; 2,50 ; 2,50]`.
Croix de niveau 0 : totaux `[17,27 ; 8,85 ; 8,85 ; 8,85]` kN.
Niveau 1 : `[4,32 ; 2,21 ; 2,21 ; 2,21]`. Niveau 2 : `[1,08 ; 0,55 ; 0,55 ; 0,55]`.
Niveau 3 : `[0,27 ; 0,14 ; 0,14 ; 0,14]`. Niveau 4 : ratio inférieur à 1 % : **0** partout.

## Points à confirmer par l'ingénieur avant mise en production
Ces choix reposent sur mon interprétation de la consigne. Les coder tels quels, mais les
rendre faciles à changer :
1. Valeur de `K` par défaut = milieu de la plage (0,495), au lieu d'un tirage aléatoire.
2. Pour un coude > 40° : les deux ancrages de coude gardent la valeur de la règle 1 et
   seuls les ancrages situés après la paire sont réduits de moitié.
3. Config 12 : l'effort dynamique de la croix de chute suit la règle du cross (25 % sur
   les 3 autres points), et les valeurs affichées sont **précharge + dynamique**.
4. Config 12 : la masse de l'utilisateur par défaut est de 141 kg et la prétension de
   600 kg-force est convertie en 5,886 kN.
5. Config 12 : la coupure à 0 se fait sous 1 % de la croix de chute (donc à partir du
   niveau 4 avec un facteur de 25 %).

## Critères d'acceptation
1. Les 4 exemples chiffrés ci-dessus sont reproduits au centième près.
2. Un multi-portée sans coude affiche 6 points, et les valeurs 1 et 6 valent bien
   `K × valeur voisine`.
3. Un coude de 40° exactement suit la règle sans coude. Un coude de 41° applique la
   réduction de moitié après le coude.
4. La config 11 affiche 4 points dont 3 à 25 % de l'effort de chute.
5. La config 12 affiche précharge, dynamique et total pour chaque ancrage, avec des
   zéros aux croix lointaines.
6. Aucun résultat des configurations 1 et 8, ni l'effort principal à l'ancrage de chute,
   n'a changé.
