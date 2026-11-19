# Spec V2 — 18 : Calcul du dégagement de chute total requis (HLL)

Source : poster « Fall Clearance – Example Draft » du 18/07/25. Cette spec **remplace** le calcul du panneau « Dégagement de chute requis » et la structure de dégagement de `V2_05`. Le logiciel ne traite que la **ligne de vie horizontale (HLL)** : aucun cas « point d'ancrage ».

## Contraintes
- Ne pas modifier les formules d'efforts, de flèche ou de pente. Seul le **dégagement** change.
- Valeurs fixes en **constantes nommées**, modifiables sans toucher au code.
- Stockage en SI, affichage selon V2_06 (m ou ft). Les exemples sont en ft, comme le poster.
- Aucune valeur inventée : donnée manquante = « Donnée à renseigner », total « Incomplet ».

## 1. Constantes (poster)

| Constante | Valeur | Rôle |
|---|---|---|
| `STRETCH_OUT_FT` | 1 ft (0,305 m) | Étirement : harnais, retournement et glissement de l'anneau D, étirement du travailleur |
| `CLEARANCE_MARGIN_FT` | 2 ft (0,610 m) | Marge, identique pour tous les cas |
| `KNEELING_ADD_FT` | 3 ft (0,914 m) | Ajout à genoux |
| `D_RING_HEIGHT_DEFAULT` | 60 po (1,5 m) | Hauteur initiale de l'anneau D, debout, modifiable (V2_04) |

La MAD n'a pas de valeur par défaut : c'est une saisie (V2_09).

## 2. Paramètres d'entrée (déjà présents)

| Paramètre | Rôle |
|---|---|
| **Élévation de la ligne** | Donne la position de l'ancrage par rapport à l'anneau D : au-dessus (overhead), à l'anneau D, ou en dessous (genou) |
| **Position du corps** | Debout, à genoux, allongé. Sans effet pour la longe |
| **MAD** | Saisie (V2_09). Pour une longe : arrêt de l'absorbeur |
| **Longueur rétractée ou de longe** | Saisie (V2_10) |
| **Flèche** | `HLL_DEFLECTION`, sortie du calcul existant |
| **Distance ligne–rebord du toit** | `EDGE_DISTANCE`, facultative. **Se soustrait** du total (voir §3.3) |

## 3. Formules
Mesure depuis la surface de travail, sauf la longe (depuis la hauteur d'origine de la HLL). Notation : `MAD`, `RETRACTED`, `HLL_DEFLECTION`, `STRETCH_OUT`, `MARGIN`, `KNEEL` (3 ft à genoux, sinon 0), `D_RING` (hauteur initiale de l'anneau D).

### 3.1 SRL sur HLL
| Élévation de la ligne | Position | Total requis |
|---|---|---|
| **Overhead** | Debout | `HLL_DEFLECTION + MAD + STRETCH_OUT + MARGIN` |
| Overhead | À genoux | `HLL_DEFLECTION + MAD + STRETCH_OUT + KNEEL + MARGIN` |
| **À l'anneau D** | Debout | `RETRACTED + HLL_DEFLECTION + MAD + STRETCH_OUT + MARGIN` |
| À l'anneau D | À genoux | Utiliser le calcul « overhead, à genoux » si la longueur rétractée dépasse l'anneau D jusqu'à la HLL |
| **Sous l'anneau D** (genou) | Toutes | `HLL_DEFLECTION + MAD + STRETCH_OUT + D_RING + MARGIN`, sans effet de la position du corps. **Cas absent du poster : à confirmer** |

### 3.2 Longe à absorbeur d'énergie sur HLL
La position du corps n'a **aucun effet**, quelle que soit l'élévation.

`LANYARD_LENGTH + MAD_absorbeur + STRETCH_OUT + D_RING + MARGIN + HLL_DEFLECTION`, mesuré depuis la hauteur d'origine de la HLL.

### 3.3 Distance de la ligne au rebord du toit
- Quand `EDGE_DISTANCE` est renseignée, on **ajoute `−EDGE_DISTANCE`** au total de **tous** les cas ci-dessus :
  `Total = (somme du cas) − EDGE_DISTANCE`. Sans valeur, rien n'est retranché.
- Le total ne peut pas être négatif : plancher à 0, avec un avertissement non bloquant si le résultat est inférieur à `STRETCH_OUT + MARGIN` (valeur suspecte).
- Le panneau l'affiche sur une ligne séparée, en négatif : « Distance ligne – rebord : −X ».
- Elle déclenche aussi les règles de bord de V2_04 : longe interdite, position à genoux non applicable.

### 3.4 Position allongé
Règle de V2_04 conservée (hauteur d'anneau D ajoutée). Pas de schéma dans le poster : **à valider**.

## 4. Exemple du poster (test de non-régression)
**SRL sur HLL overhead, debout** : flèche 2 ft, MAD 3 ft 6 po, étirement 1 ft, marge 2 ft. Total = 2 + 3,5 + 1 + 2 = **8 ft 6 po** (2,59 m).

## 5. Panneau et rapport
- Le panneau affiche **uniquement les termes du cas actif**, dans l'ordre de la formule. « Corps / anneau D » n'apparaît que pour la longe et pour le niveau sous l'anneau D.
- Une ligne nomme le cas (par exemple « SRL – HLL overhead – debout »).
- Mise à jour en direct à chaque saisie.
- Le rapport PDF reprend ces lignes et le schéma du cas correspondant du poster (V2_05).
- MAD, longueur rétractée ou de longe manquante : « Donnée à renseigner » et total « Incomplet ».

## 6. Points à confirmer
1. **HLL sous l'anneau D** : formule proposée au §3.1, sans schéma dans le poster.
2. **Distance au rebord** : soustraite du total, d'après ta consigne. Le poster ne contient aucun terme de ce type (son seul terme de bord est un balancement qui **s'ajoute**, 1 ft 4 po dans son exemple). Le signe et le principe sont à **confirmer** avec l'ingénierie, car une distance horizontale ne se retranche pas d'ordinaire d'un dégagement vertical.
3. **Marge de 2 ft sur HLL** : identique au cas rigide dans le poster. Le Z359.6 demande davantage sur ligne flexible (§7.7.2). Le poster prévaut tant que l'ingénierie ne dit rien d'autre.
4. **Mou avant la chute** : le poster ne compte que la flèche. Le Z359.6 ajoute la différence entre affaissement initial et cusp sag (§7.2.4). Non codé.
5. **À genoux, 3 ft** : le Z359.6 note 30 in, le poster 36 po.
6. **Allongé** : aucune valeur dans le poster.

## Critères d'acceptation
1. L'exemple du §4 donne 8,5 ft (2,59 m).
2. Avec flèche 0,744 m, MAD 1,80 m, étirement 0,305 m et marge 0,610 m, un SRL sur HLL overhead debout donne 3,46 m, et non 4,64 m.
3. « Corps / anneau D » disparaît pour un SRL debout, et apparaît pour la longe et pour la HLL sous l'anneau D.
4. Passer de debout à à genoux ajoute 3 ft (0,914 m) pour un SRL en overhead, et ne change rien pour une longe.
5. Passer d'une HLL overhead à une HLL à l'anneau D ajoute la longueur rétractée.
6. Une HLL à l'anneau D à genoux applique le calcul overhead à genoux.
7. Modifier la MAD, la longueur rétractée ou la flèche met à jour le total en direct.
8. Avec une distance ligne–rebord de 0,41 m, le total diminue de 0,41 m. Sans distance, le total est inchangé. Le total ne descend jamais sous 0.
9. Une distance ligne–rebord renseignée interdit toujours la longe et désactive la position à genoux.
