# Spec V2 — 07 : Élévation de la ligne et facteur de chute

## Objectif
Relier le préréglage d'**élévation de la ligne** (spec V2_02) au **facteur de chute**, et
utiliser les **résultats que le logiciel connaît déjà** pour chaque facteur de chute (0, 1
et 2). Aucune nouvelle formule d'effort ou de flèche : seulement la sélection du bon jeu
de résultats.

## Contraintes
- **Ne pas recalculer** les résultats par facteur de chute. Les appeler tels qu'ils
  existent dans le code.
- Une seule saisie d'élévation (celle de V2_02). Le facteur de chute se **déduit**, il
  ne se saisit pas à la main.
- Constantes nommées en tête du module.

## Correspondance élévation → facteur de chute

| Préréglage de V2_02 | Position de la ligne | Facteur de chute |
|---|---|---|
| **Overhead** | Au-dessus de l'anneau D | **0** |
| **Anneau D** (1,5 m / 60 po) | À la hauteur de l'anneau D | **1** |
| **Genou** | Sous l'anneau D, près des pieds | **2** |

**À valider avant mise en production.** La demande initiale citait genou = 0, anneau D = 1
et overhead = 2. J'ai codé la correspondance inverse pour le genou et l'overhead, parce
que le facteur de chute vaut 0 quand l'ancrage est **au-dessus** du point d'attache
(aucune chute libre) et 2 quand l'ancrage est **aux pieds** (chute libre de 2 × la
longueur de longe). Les illustrations déjà validées suivent cette logique. Si l'inverse
est voulu, il suffit de modifier la table `ELEVATION_TO_FALL_FACTOR` ci-dessous, sans
toucher au reste.

```
ELEVATION_TO_FALL_FACTOR = {
  "overhead": 0,
  "d_ring":   1,
  "knee":     2
}
```

## Élévation personnalisée
Pour une hauteur saisie librement, on compare l'élévation `h` de la ligne à la hauteur de
l'anneau D `H_D` (position du corps, spec V2_04), avec une tolérance `TOL` :

| Condition | Facteur de chute |
|---|---|
| `h > H_D + TOL` | 0 |
| `H_D − TOL ≤ h ≤ H_D + TOL` | 1 |
| `h < H_D − TOL` | 2 (cas le plus défavorable) |

- `TOL` par défaut : **0,15 m (6 po)**, constante modifiable.
- Pour toute hauteur sous l'anneau D, prendre le **facteur 2** : c'est le cas
  conservateur.
- Le facteur déduit est recalculé à chaque changement d'élévation ou de position du corps.

## Utilisation des résultats
- Le facteur de chute sélectionne **le jeu de résultats existant** : les valeurs du modèle
  `M` à 4 points qui alimentent la répartition des efforts aux ancrages, la flèche et le
  dégagement de chute.
- La répartition sur 6 ancrages, la tension du câble hors fenêtre et le plancher `P0`
  restent appliqués **après** la sélection, sans changement.
- Les trois facteurs doivent donner des résultats **différents** pour une même géométrie.

## Règles liées au SRL
- **Facteur 0 ou 1** (ligne à l'anneau D ou au-dessus) : SRL classe 1 ou classe 2 autorisé.
- **Facteur 2** (ligne sous l'anneau D) : **classe 2 obligatoire**. Une classe 1 est refusée
  avec un message clair. Cette règle est celle de V2_04, appliquée ici automatiquement.
- Longe : refusée pour une chute par-dessus un bord, comme dans V2_04.

## Interface et rapport
- À côté du préréglage d'élévation, afficher un **badge** « Facteur de chute 0 / 1 / 2 »,
  mis à jour en direct.
- Le rapport PDF indique : l'élévation de la ligne, le facteur de chute retenu, et la
  classe du SRL.
- Le schéma de chute du rapport (V2_05) correspond au facteur retenu : ligne au-dessus,
  à l'anneau D, ou aux pieds.
- Le **mode Critical case** et le mode **portée choisie** (V2_04) fonctionnent pour les
  trois facteurs.

## Critères d'acceptation
1. Overhead donne le facteur 0, anneau D donne le facteur 1, genou donne le facteur 2.
2. Une élévation personnalisée de 2,4 m avec un anneau D à 1,5 m donne le facteur 0 ;
   1,5 m donne 1 ; 0,5 m donne 2.
3. Pour la même géométrie et la même arrest load, les trois facteurs produisent trois
   jeux de résultats différents, identiques à ceux que le logiciel donne déjà.
4. Une classe 1 avec le facteur 2 est refusée.
5. Le badge de facteur se met à jour dès qu'on change l'élévation ou la position du corps.
6. Le rapport affiche élévation, facteur et classe SRL.
7. Inverser la table `ELEVATION_TO_FALL_FACTOR` change la correspondance sans autre
   modification de code.
