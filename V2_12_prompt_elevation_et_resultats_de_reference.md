# Spec V2 — 07 : Élévation de la ligne et résultats de référence

Remplace `V2_07_prompt_elevation_facteur_chute.md` (supprimé).

## Objectif
Pour les normes **OSHA et EN**, tous les résultats du logiciel sont ceux **obtenus aux essais, réalisés à la configuration de chute la plus sévère (position genou)**. Ce sont les seules données d'essai disponibles : le logiciel ne les modifie pas selon l'élévation choisie.
Les positions **genou, anneau D et overhead** restent proposées, mais comme choix de **géométrie, de dégagement et de règles SRL**, sans changer le jeu de résultats.

## Règles
1. **Un seul jeu de résultats** (efforts aux ancrages, tension, flèche), celui des essais. Ne rien recalculer par position.
2. **Ne jamais afficher la notion de « facteur de chute »** : ni dans l'interface, ni dans les info-bulles, ni dans les messages, ni dans le rapport PDF, ni dans les noms de champs visibles. Aucun badge, aucune étiquette 0 / 1 / 2.
3. Le préréglage d'élévation (V2_02) continue de :
   - régler la hauteur des poteaux dans la vue 3D ;
   - alimenter **HLL Elevation** (V2_04) et le dégagement de chute (V2_05) ;
   - appliquer les règles de classe SRL de V2_04 (classe 1 seulement à l'anneau D ou au-dessus).
4. Aucun message ne doit dire que les résultats sont « valables pour » ou « convertis vers » une autre configuration de chute.

## Coefficient de l'ingénieur
Pour obtenir des résultats dans une autre configuration que celle des essais, **l'ingénieur applique lui-même son coefficient**.
- Champ facultatif **« Coefficient de l'ingénieur »**, valeur par défaut **1,00**, plage 0,10 à 5,00, modifiable à tout moment.
- Il multiplie les **efforts** (efforts aux ancrages, tension de ligne, efforts de coin, charge intermédiaire). Constante `ENGINEER_COEF_APPLIES_TO = ["forces"]`, modifiable.
- La flèche et le dégagement ne sont **pas** multipliés par défaut. À confirmer avec l'ingénierie.
- Rapport et tableaux : quand le coefficient est différent de 1,00, afficher **deux colonnes** : « Résultat d'essai » et « Résultat ajusté (coefficient X,XX) ». Quand il vaut 1,00, une seule colonne.
- Le coefficient est stocké dans le projet et se modifie sans tout ressaisir.
- Aucune valeur de coefficient n'est proposée par le logiciel.

## Critères d'acceptation
1. Passer de genou à anneau D à overhead ne change pas les résultats de calcul. Seules la géométrie 3D, le dégagement et les règles SRL changent.
2. La recherche du texte « facteur de chute » et « fall factor » dans l'interface, les fichiers de traduction visibles et le PDF ne donne aucun résultat.
3. Avec un coefficient de 1,00, le rapport a une seule colonne de résultats.
4. Avec un coefficient de 1,30, les efforts sont multipliés par 1,30 et la flèche reste identique, sauf changement de la constante.
5. Les résultats sont identiques en OSHA et en EN pour une même géométrie, tant que les entrées de la norme ne changent rien d'autre.
