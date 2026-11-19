# Correction — Configuration 11 (Cross-spans) : le rendu actuel est faux

## Ce que le code génère aujourd'hui (capture d'écran fournie)
Le rendu de la configuration 11 affiche :
- les 4 branches en croix depuis le centre (correct) ;
- **en plus, 3 câbles parasites** qui relient les extrémités des branches entre elles :
  haut → droite, droite → bas, bas → gauche (le côté gauche → haut est absent). Cela
  forme un losange ouvert autour de la croix ;
- **aucune pièce X-matrix visible** au point central (seul un petit point sombre) ;
- **aucun poteau visible** aux extrémités des branches ;
- aucune étiquette de branche.

## Ce qui est attendu
Une croix de **4 câbles indépendants** partant tous du même point central. Chaque câble
va du centre à l'extrémité de sa branche, et **rien d'autre**.

## Cause probable à vérifier
La configuration 11 semble passer par le chemin de rendu des portées chaînées (liste de
portées consécutives, comme les configurations 3 à 7), qui relie chaque point au suivant
et ferme parfois la boucle. Ici les 4 branches sont traitées comme une suite de points
reliés l'un après l'autre, d'où les câbles entre extrémités.

**Avant de corriger, indique-moi la cause exacte trouvée dans le code.**

## Correction demandée
1. **Ne pas utiliser le chemin « portées chaînées / boucle fermée »** pour la
   configuration 11. Créer un rendu dédié qui parcourt les 4 branches une par une.
2. Pour chaque branche `i` (longueur `length_i`, angle `angle_i`, défaut 0°, 90°, 180°,
   270°) :
   - point d'extrémité : `(length_i × cos(angle_i), length_i × sin(angle_i))` ;
   - **un seul câble** : segment `[centre, extrémité_i]` ;
   - **un poteau** posé sur le toit à l'extrémité, hauteur de poteau NewPRO.
3. **Aucun câble entre deux extrémités.** Aucune boucle fermée. Aucun segment qui ne
   touche pas le centre.
4. **Pièce X-matrix au centre** : plaque à 4 branches, plan horizontal, à la hauteur du
   câble, centre exactement sur le point de croisement, branches alignées sur les 4
   câbles. Chaque câble se fixe sur l'œillet de sa branche. Pas de poteau au centre.
5. Étiquettes Span 1 à Span 4 (ou Nord, Est, Sud, Ouest) près de chaque câble.
6. Poteaux et X-matrix doivent rester **visibles en vue de dessus** : dimensions
   minimales à l'écran de quelques pixels, avec une ombre ou un contour si besoin.
7. Ne pas toucher au rendu des autres configurations.

## Contrôles à ajouter (assertions)
Après génération de la scène, vérifier dans le code :
- nombre de segments de câble = **4** ;
- chaque segment a **le centre comme l'une de ses deux extrémités** ;
- nombre de poteaux = **4** ;
- nombre de pièces X-matrix = **1**, positionnée au centre.

Si une assertion échoue, afficher un message d'erreur dans la console plutôt que
dessiner une scène fausse.

## Critère d'acceptation
Avec 4 branches de 10, 8, 12 et 6 m : la scène montre **une croix de 4 câbles**,
**4 poteaux** aux extrémités et **une pièce X-matrix** au centre. Aucun câble ne relie
deux extrémités entre elles.
