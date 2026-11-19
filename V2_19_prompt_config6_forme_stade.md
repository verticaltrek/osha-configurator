# Spec V2 — 19 : Ajout de la forme « stade » à la configuration « Multi-portée avec coudes »

Cette spec **complète** la configuration « Multi-portée avec coudes » (boucle fermée de portées à angle variable, `prompt_antigravity_config6_reservoir.md`). Le mode circulaire existant ne change pas. Ne renommer aucune configuration : les noms sont déjà à jour dans le code.

## Objectif
Ajouter à la configuration 6 une **forme de stade** (piste d'athlétisme, ou « obround ») : deux **côtés droits parallèles** reliés par deux **demi-cercles**. Le parcours est une boucle fermée de poteaux, câble continu, dernier poteau relié au premier.

## Contraintes
- Ne pas modifier le calcul : le rendu est une aide de pose et de saisie, le modèle de données reste la liste de portées `length` et `bend_after_deg`, `closed_loop = true`.
- Ne pas modifier les autres configurations ni le mode circulaire existant.
- Réutiliser les poteaux, le câble et les étiquettes existants (A1…, S1…).

## 1. Nouveau mode de saisie : « Stade »
À côté des modes « Réservoir » et « Manuel », ajouter **« Stade »**.

| Champ | Détail |
|---|---|
| `L_tot` | Longueur totale du stade, grand axe (m) |
| `W` | Largeur du stade, petit axe (m). Rayon des demi-cercles `R = W / 2` |
| `retrait_bord` | Retrait par rapport au bord de la structure, 0,5 m par défaut. Le tracé des poteaux est ce stade réduit de ce retrait sur chaque côté |
| `n` | Nombre de portées par demi-cercle (≥ 2). Automatique par défaut, modifiable |
| `m` | Nombre de portées par côté droit (≥ 1). Automatique par défaut, modifiable |

Valeurs déduites :
- Longueur de chaque côté droit : `S = L_tot − W`. Si `S ≤ 0`, refuser avec un message (la forme est un cercle : utiliser le mode « Réservoir »).
- Portées d'un côté droit : `S / m` chacune.
- Portées d'un demi-cercle : `n` cordes égales de longueur `c = 2 × R × sin(π / (2n))`.

### Nombre automatique
- `m = ceil(S / L_max)`, où `L_max` est la portée maximale du système choisi (limites du moteur existant).
- `n` : le plus petit entier ≥ 5 tel que `c ≤ L_max`. **Au moins 5** pour garder des coudes de 40° ou moins (voir §3). L'utilisateur peut descendre jusqu'à 2 avec un avertissement.
- Les poteaux sont exactement aux sommets : le nombre de poteaux est égal au nombre total de portées, `2m + 2n`.

## 2. Angles
Pour chaque sommet, l'angle de **déviation** `δ` (de combien le câble change de direction) vaut :

| Sommet | Déviation δ |
|---|---|
| Sommet intérieur d'un demi-cercle | `180° / n` |
| Sommet de jonction côté droit / demi-cercle (4 au total) | `90° / n` |
| Sommet intérieur d'un côté droit (si `m ≥ 2`) | 0° (alignement, pas de coude) |

Contrôle : par demi-cercle, `(n − 1) × 180/n + 2 × 90/n = 180°`, donc la boucle totalise **360°**.

`bend_after_deg` : respecter la convention déjà utilisée par la configuration 6. Dans la spec existante, c'est l'**angle intérieur** (`180° − δ`). Le calcul des coudes (`40°`) s'applique à la **déviation δ** : vérifier que le code existant fait bien cette conversion. **À confirmer.**

## 3. Conséquence sur le calcul des coudes (V2_17)
Un coude de déviation supérieure à 40° reçoit un **ancrage double** (A#a / A#b). Avec la forme stade :

| `n` | δ intérieur arc | δ jonction | Ancrage double |
|---|---|---|---|
| 2 | 90° | 45° | Oui, aux 2 types de sommets |
| 3 | 60° | 30° | Oui, aux sommets intérieurs |
| 4 | 45° | 22,5° | Oui, aux sommets intérieurs |
| ≥ 5 | 36° ou moins | 18° ou moins | Non |

Avertir l'utilisateur quand `n < 5` : « ancrages doubles ajoutés aux coudes de plus de 40° ». Aucune autre règle de calcul ne change.

## 4. Fermeture et validation
- Contrôles identiques au mode existant : somme des déviations égale à 360° (tolérance 0,5°), dernier point égal au premier (tolérance 1 cm).
- Chaque portée comprise entre 0 et `L_max` du système. Si une portée dépasse, proposer d'augmenter `n` ou `m`.
- `W > 0`, `L_tot > W`, `n ≥ 2`, `m ≥ 1`.
- Passer du mode « Stade » au mode « Manuel » **conserve** les portées et angles générés, pour les éditer à la main (V2_02).

## 5. Rendu 3D
- Nouveau type de structure « **Stade** » dans la liste « Type de structure » : anneau de toit de tribune ovale, avec la pelouse ou l'arène au centre. L'habillage est décoratif et n'entre pas dans le calcul.
- La liste existante (réservoir, château d'eau, phare, silo) reste disponible : le tracé « stade » peut aussi se poser sur un autre habillage, par exemple un toit plat rectangulaire arrondi.
- Poteaux à chaque sommet, câble continu fermé, ordre d'affichage correct (profondeur) en rotation.
- Étiquettes : A# aux poteaux, S# aux portées, avec la longueur de chaque portée (spec des étiquettes). Les portées des côtés droits et des arcs sont numérotées dans l'ordre de parcours.

## Exemple de référence
Stade `L_tot = 60 m`, `W = 30 m`, `L_max = 15 m`, `n = 5`, `m = 2` :
- `R = 15 m`, `S = 30 m`.
- Côtés droits : 2 côtés × 2 portées de 15 m.
- Demi-cercles : 2 × 5 cordes de `c = 30 × sin(18°) = 9,27 m`.
- 14 portées, 14 poteaux, périmètre ≈ 60 + 92,7 = 152,7 m.
- Déviations : 36° aux sommets d'arcs, 18° aux 4 jonctions, 0° au milieu de chaque côté droit. Somme : 360°.

## Critères d'acceptation
1. L'exemple ci-dessus donne 14 portées et 14 poteaux, avec les longueurs et angles indiqués.
2. Les déviations de la boucle se somment à 360° et la boucle se ferme (tolérance 1 cm).
3. Avec `n = 3`, les sommets intérieurs d'arc ont une déviation de 60° et reçoivent un ancrage double, avec avertissement.
4. `L_tot ≤ W` est refusé, avec renvoi vers le mode « Réservoir ».
5. Une portée de plus de `L_max` bloque la génération et propose d'augmenter `n` ou `m`.
6. Passer en mode « Manuel » conserve les 14 portées et leurs angles.
7. Le mode « Réservoir » et les autres configurations se comportent comme avant.
