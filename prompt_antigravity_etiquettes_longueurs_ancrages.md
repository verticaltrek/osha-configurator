# Spec — Étiquettes d'ancrage et longueurs de portée sur toutes les configurations

## Objectif
Pour **toutes les configurations (1 à 12)**, afficher dans la vue 3D :
1. la **longueur de chaque portée** ;
2. une **étiquette sur chaque point d'ancrage** (A1, A2, etc.).

Les mêmes étiquettes doivent apparaître **dans la note de calcul** (tableau des efforts),
pour retrouver sans ambiguïté sur le plan quel ancrage correspond à quelle valeur.

## Contraintes
- **Ne pas modifier** les calculs ni les formules d'effort. Seul l'affichage et la
  production des étiquettes changent.
- **Source unique des étiquettes** : une seule fonction génère les identifiants à partir du
  modèle de données de la configuration. La vue 3D, le tableau de la note de calcul et le
  plan de repérage du rapport utilisent **exactement cette fonction**. Interdit de
  recalculer les noms ailleurs.
- Ne pas modifier le rendu géométrique des configurations (poteaux, câbles, X-matrix).

## Règles de nommage

| Élément | Préfixe | Exemple |
|---|---|---|
| Point d'ancrage | `A` | A1, A2, A3… |
| Portée | `S` | S1, S2, S3… |
| Pièce X-matrix | `X` | X1, ou X-A1 en grille |

### Configurations en ligne (1 à 4, 6 à 10)
- Ancrages numérotés **dans l'ordre le long du parcours**, du début vers la fin :
  `A1, A2, …, A(N+1)` pour N portées.
- Portée `Si` : entre `Ai` et `A(i+1)`.
- Pour les pentes (8, 9, 10) : numérotation **de bas en haut**.

### Boucles fermées (5 et 6 quand la boucle est fermée)
- `A1…AN` pour N portées. La dernière portée `SN` relie `AN` à `A1`.

### Coude supérieur à 40° (deux ancrages au coude)
- Les deux ancrages du coude gardent le numéro du sommet, avec les suffixes `a` et `b` :
  `A3a` (côté arrivée) et `A3b` (côté départ). Les ancrages suivants continuent la
  numérotation normale (`A4`, `A5`…).
- Il n'y a **pas de portée étiquetée** entre `A3a` et `A3b`.
- Coude inférieur ou égal à 40° : un seul ancrage, étiquette simple.

### Configuration 11 (cross)
- Ancrages des 4 branches : `A1` à `A4`, dans l'ordre des branches saisies.
- Pièce centrale : `X1`.
- Portées : `S1` à `S4`, une par branche, de la X-matrix vers le poteau.

### Configuration 12 (grille)
- Lignes nommées `A, B, C…` (une direction) et `1, 2, 3…` (l'autre), comme dans
  l'interface.
- Pièces X-matrix : `X-A1`, `X-A2`, `X-B1`… (croisement de la ligne et de la colonne).
- Ancrages d'extrémité : `A1, A2, …` dans l'ordre horaire à partir du coin haut gauche.
- Portées : `S` + nom de la ligne + numéro de segment sur cette ligne, par exemple
  `SA-1`, `SA-2`, `S2-1`.

### Règles de stabilité
- Étiquettes **déterministes** : mêmes entrées, mêmes noms.
- Si l'utilisateur ajoute ou supprime une portée, renuméroter toute la ligne.
- Les ancrages ajoutés par la règle des 6 points sont de **vrais ancrages de la ligne** :
  ils ont leur étiquette comme les autres, même si leur effort est à 0.

## Affichage 3D

### Étiquettes d'ancrage
- Étiquette fixée au point d'ancrage, **toujours tournée vers la caméra**, lisible quelle
  que soit la vue (vue de dessus comprise).
- Fond clair semi-opaque et contour, pour rester lisible sur la dalle bleue.
- **L'ancrage de chute est surligné** (couleur distincte) quand une position de chute est
  définie.
- Pièces X-matrix étiquetées de la même façon, avec un style différent.

### Longueur des portées
- Longueur affichée **au milieu de chaque câble**, dans l'unité choisie (mètres ou
  impérial), avec 2 décimales en mètres.
- Pour les pentes : longueur **le long de la pente**.
- Format : `S2 : 12,00 m`. Pour les pentes, ajouter l'angle : `S2 : 12,00 m, 35°`.

### Lisibilité
- Évitement de chevauchement : décaler automatiquement les étiquettes qui se touchent.
- Configurations denses (6 avec 20 portées ou plus, 12 avec grille large) : réduire la
  taille et n'afficher que les numéros, avec la longueur au survol de la portée.
- Deux cases à cocher : « Afficher les étiquettes d'ancrage » et « Afficher les
  longueurs », **cochées par défaut**.

## Note de calcul

### Plan de repérage
- Une vue de dessus de la configuration, avec toutes les étiquettes d'ancrage et de
  portée, intégrée au rapport.

### Tableau des ancrages
Une ligne par ancrage :

| Colonne | Contenu |
|---|---|
| Étiquette | A1, A2, A3a… |
| Type | Extrémité, intermédiaire, coude, poteau d'extrémité de grille |
| Portées adjacentes | S1, S2… |
| Effort | Valeur en kN (0,00 si aucun effort) |
| Remarque | « Ancrage de chute » pour l'ancrage surligné |

### Tableau des portées
Une ligne par portée : étiquette, ancrages d'extrémité, longueur, angle de pente si
applicable.

### Cohérence
- Le tableau liste **tous** les ancrages, y compris ceux dont l'effort est nul.
- Les étiquettes du tableau, du plan et de la vue 3D doivent être identiques.

## Critères d'acceptation

1. **Config 2, 3 portées** : ancrages `A1` à `A4`, portées `S1` à `S3`, chacune avec sa
   longueur affichée au milieu du câble.
2. **Config 5, rectangle fermé de 4 portées** : ancrages `A1` à `A4`, portée `S4` entre
   `A4` et `A1`.
3. **Config 4, 4 portées avec un coude de 55° après `S2`** : ancrages
   `A1, A2, A3a, A3b, A4, A5`, aucune portée étiquetée entre `A3a` et `A3b`.
4. **Config 9, 3 portées** : `A1` à `A4` de bas en haut, longueurs affichées le long de la
   pente avec l'angle.
5. **Config 11** : `A1` à `A4`, `X1`, `S1` à `S4`.
6. **Config 12, grille 3 × 3** : 9 étiquettes `X-A1` à `X-C3`, 12 ancrages `A1` à `A12`,
   24 portées étiquetées.
7. La note de calcul reproduit les mêmes noms que la vue 3D. Une modification de portée
   met à jour les deux en même temps.
8. Aucun résultat de calcul n'a changé.
