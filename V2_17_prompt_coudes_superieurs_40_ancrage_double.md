# Spec V2 — 17 : Coudes supérieurs à 40°, ancrage double A#a / A#b

Cette spec **remplace** la règle des coudes de `prompt_antigravity_calcul_efforts_ancrages.md` et de `prompt_antigravity_calcul_chute_toute_portee.md` pour les coudes de plus de 40°. Le reste du calcul ne change pas.

## Contraintes
- Ne pas modifier les formules existantes : atténuation K (0,46 à 0,53, défaut 0,495), fenêtre de 6 ancrages, tension de pose P0 au-delà de la fenêtre (100 kg LightPRO et NewPRO, 600 kg gammes Range), plancher `max(valeur, P0)`.
- Réutiliser les étiquettes de la spec des étiquettes (A3a, A3b).

## 1. Coude de 40° ou moins
Aucun changement : un seul ancrage au coude, règle multi-portée normale.

## 2. Coude supérieur à 40° : ancrage double
Au coude, deux ancrages sont posés, **A3a et A3b** (le numéro dépend de la position du coude). Ils forment un **ancrage double**.

1. **Même valeur d'effort.** A3a et A3b reçoivent **exactement la même valeur**. Le tableau les affiche sur deux lignes avec la même valeur, marquées « ancrage double ».
2. **Ils comptent pour un seul.** Dans la fenêtre de 6 ancrages, l'ancrage double occupe **une seule position**. Le décompte « 1 position = 1 atténuation K » avance d'un cran pour la paire, pas de deux.
3. **Aucune chute entre A3a et A3b.** Le court tronçon qui les relie n'est **pas une portée de chute** : 
   - il n'a pas d'étiquette S# et ne figure pas dans la liste de choix de la portée de chute ;
   - le mode critical case ne simule **aucune chute** à cet endroit ;
   - il n'est pas compté dans le nombre de portées ni dans la liste des longueurs de portée.
   Une chute directe sur l'ancrage double suit le cas « charge intermédiaire maximale » de V2_05, traité comme un seul ancrage.
4. **Après le coude : × 0,5.** Les ancrages situés **après** l'ancrage double reçoivent la valeur de la règle des 6 ancrages multipliée par 0,5. Le plancher P0 s'applique ensuite.
5. **Coudes cumulés.** Chaque coude supérieur à 40° multiplie encore par 0,5 : × 0,5 après le premier, × 0,25 après le deuxième, et ainsi de suite, toujours avec le plancher P0.
6. L'ancrage double et sa valeur sont les mêmes que la chute se produise avant ou après le coude. Seule la fenêtre de 6 ancrages se déplace.

### Valeur de l'ancrage double
L'ancrage double prend la valeur que la règle des 6 ancrages donne à sa position, **avant** la réduction de moitié. La réduction ne s'applique qu'aux ancrages qui le suivent. **À confirmer.**

## 3. Exemple chiffré (illustratif)
Ligne à 5 portées, ancrages A1 à A6, chute sur S3, K = 0,5. Valeurs de base de la fenêtre : A1 = 5, A2 = 10, A3 = 20, A4 = 18, A5 = 9, A6 = 4,5 (kN). Coude de 60° à l'ancrage A2, donc ancrage double A2a / A2b.

| Ancrage | Valeur de base | Règle | Résultat |
|---|---|---|---|
| A1 | 5 | avant le coude | 5 |
| A2a | 10 | ancrage double, un seul compté | 10 |
| A2b | 10 | même valeur que A2a | 10 |
| A3 | 20 | après le coude, × 0,5 | 10 |
| A4 | 18 | après le coude, × 0,5 | 9 |
| A5 | 9 | après le coude, × 0,5 | 4,5 |
| A6 | 4,5 | après le coude, × 0,5, puis plancher P0 | 2,25 |

Pour NewPRO, P0 = 0,98 kN : aucun de ces résultats n'est sous le plancher. Ces nombres servent à tester la logique, ce ne sont pas des résultats d'essai.

## 4. Étiquetage et rendu
- A#a et A#b sont deux ancrages réels en 3D, avec leur étiquette, comptés **deux fois** dans la nomenclature.
- Les ancrages suivants gardent une numérotation continue (A4, A5…), l'ancrage double portant un seul numéro.
- Le plan et le tableau de la note de calcul affichent les deux lignes de l'ancrage double côte à côte.

## 5. Interaction avec les efforts de coin (V2_05)
- Les efforts de coin résolus (efforts dans chaque câble, résultante et direction) restent calculés à part, pour le coude.
- La résultante est répartie sur A#a et A#b selon leurs positions, comme en V2_05. **Cette répartition ne change pas** la valeur d'effort d'ancrage de la fenêtre, qui reste identique pour les deux ancrages.
- **Point à confirmer :** si la valeur unique de l'ancrage double doit aussi remplacer cette répartition dans le tableau de charges.

## Critères d'acceptation
1. Un coude de 40° ou moins n'ajoute aucun ancrage. Un coude de 41° ajoute A#a et A#b.
2. A#a et A#b ont toujours la même valeur d'effort dans les tableaux, le PDF et la note de calcul.
3. L'exemple du §3 donne A1 = 5, A2a = A2b = 10, A3 = 10, A4 = 9, A5 = 4,5, A6 = 2,25.
4. La liste de choix de la portée de chute n'offre pas le tronçon A#a–A#b. Le critical case ne simule aucune chute à cet endroit.
5. Le nombre de portées et la liste des longueurs n'incluent pas le tronçon A#a–A#b.
6. Deux coudes de plus de 40° donnent × 0,25 après le deuxième. Aucune valeur ne descend sous P0.
7. Les ancrages A#a et A#b figurent deux fois dans la nomenclature.
8. Le résultat reste inchangé quand on modifie l'angle entre 41° et 90°, tant qu'il reste supérieur à 40°.
