# Spec — Configuration 10 « Multiple-span Horizontal and Slope System » : rendu 3D avec escalier et plateformes

## Objectif
Pour la configuration 10 (portées horizontales et portées en pente dans un même système
continu), le rendu 3D doit afficher, en plus de la ligne de vie, **les structures qui
rendent la pose réaliste** :

- un **escalier** le long de chaque portée en pente, **sans garde-corps** ;
- une **plateforme surélevée** à l'arrivée de chaque pente, qui porte la ou les portées
  horizontales suivantes.

Cela doit fonctionner pour **n'importe quel paramétrage** de la configuration 10 (nombre
de portées, longueurs, angles, ordre horizontal/pente), pas seulement pour l'exemple
ci-dessous.

**Exemple de référence** : horizontale → pente → horizontale. La 1re ligne est posée sur
la dalle basse. La pente monte via un escalier jusqu'à une plateforme, sur laquelle est
posée la 2e ligne horizontale.

## Contraintes
- **Ne pas modifier** le code ni le rendu des autres configurations (1 à 9, 11, 12).
- Réutiliser le style visuel existant : dalle bleue, poteaux gris, câble fin avec points
  de passage, fond clair. Escalier gris moyen, plateforme bleu plus clair que la dalle.
- Le rendu est une aide visuelle de pose. Il **n'intervient dans aucun calcul**
  (tension, flèche, tirant d'air). Ne pas toucher au moteur de calcul.

## Modèle de données d'entrée
Liste ordonnée de portées. Chaque portée contient :

| Champ | Type | Détail |
|---|---|---|
| `type` | `"horizontal"` ou `"slope"` | Nature de la portée |
| `length` | nombre (m) | Longueur de la portée, bornée par le max du système choisi |
| `slope_deg` | nombre (°) | Uniquement si `type = "slope"` |
| `direction` | `"up"` ou `"down"` | Uniquement si `type = "slope"`, défaut `"up"` |

## Calcul de la géométrie (à partir des paramètres seulement)
Parcourir les portées dans l'ordre en cumulant l'altitude `z` et la position horizontale.

Pour une portée en pente de longueur `L` et d'angle `α` :
- dénivelé : `h = L × sin(α)` (signe selon `direction`)
- projection horizontale : `d = L × cos(α)`
- altitude à la fin de la portée : `z_fin = z_début ± h`

Pour une portée horizontale : `z` constant, projection horizontale = `L`.

## Règles de génération

### 1. Escalier (portées en pente uniquement)
- Un escalier par portée en pente, posé le long de la ligne, **décalé latéralement** pour
  ne pas masquer le câble, avec la même pente que la portée.
- Largeur : 1,0 m (constante configurable).
- Nombre de marches : `ceil(h / contremarche_max)` avec `contremarche_max = 0,18 m`
  (constante configurable). La hauteur réelle de chaque marche est `h / nombre_marches`.
- Giron : `d / nombre_marches`. Les marches sont régulières sur toute la volée.
- **Aucun garde-corps, aucune main courante.** Uniquement marches et limons.
- L'escalier va du niveau de départ de la portée jusqu'au bord de la plateforme d'arrivée
  (ou jusqu'au sol si la pente descend).
- Si `slope_deg > 45°`, afficher quand même l'escalier mais signaler « pente supérieure
  à 45° : escalier non réaliste » dans l'interface (avertissement non bloquant).

### 2. Plateforme (arrivée d'une pente)
- Une plateforme à l'altitude `z_fin` de chaque portée en pente.
- Elle couvre **toutes les portées horizontales consécutives** qui suivent la pente,
  avec une marge de 1,0 m autour des poteaux extrêmes (constante configurable).
- Les poteaux de ces portées sont **posés sur la plateforme**, pas sur la dalle basse.
- Le dessous de la plateforme descend jusqu'à la dalle basse (volume plein), comme sur
  l'image de référence.

### 3. Sols et niveaux
- La première portée est posée sur la dalle basse (niveau de référence `z = 0`).
- Les portées horizontales avant la première pente reposent sur la dalle basse.
- Si une pente descend vers un niveau inférieur à `z = 0`, afficher une dalle ou une
  plateforme à ce niveau selon la même règle que pour une montée.

### 4. Cas particuliers
- **Pentes consécutives** (pente → pente) : une seule volée d'escalier continue. Une
  rupture d'angle est autorisée au poteau intermédiaire. Pas de plateforme intermédiaire.
- **Plusieurs transitions** (H → S → H → S → H…) : une plateforme à chaque arrivée de
  pente, chacune à sa propre altitude cumulée.
- **Aucune pente** dans la liste : aucun escalier ni plateforme, rendu horizontal normal.
- **Pente seule en début ou en fin de système** : escalier généré, plateforme présente
  seulement s'il y a une portée horizontale à l'arrivée.
- **Angle ou longueur nuls ou invalides** : ne rien générer pour cette portée et afficher
  un message d'erreur de validation.

## Interface
- Aucun nouveau champ de saisie n'est requis. Tout se déduit de la liste des portées déjà
  saisie pour la configuration 10.
- Les constantes (largeur d'escalier, contremarche maximale, marge de plateforme) sont
  regroupées dans un seul objet de configuration en tête du module, modifiable sans
  toucher au reste du code.

## Critères d'acceptation
Vérifier visuellement ces trois paramétrages :

1. **H 10 m → pente 20 m à 30° → H 15 m** (exemple de référence) : un escalier de 10 m
   de dénivelé le long de la pente, une plateforme à 10 m de haut portant la 2e ligne.
2. **H 8 m → pente 12 m à 20° → H 10 m → pente 12 m à 20° → H 8 m** : deux escaliers,
   deux plateformes à 4,1 m puis 8,2 m environ.
3. **Pente seule 15 m à 25°** : un escalier, pas de plateforme.

Dans chaque cas : câble continu, poteaux posés sur le bon niveau, escalier sans
garde-corps, aucune modification des autres configurations.
