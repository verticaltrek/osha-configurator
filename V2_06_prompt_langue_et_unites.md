# Spec V2 — 06 : Version anglaise et unités américaines

## Objectif
1. Proposer une **version anglaise** complète. Aujourd'hui seul le français fonctionne, et
   les fenêtres d'édition affichent du français.
2. Proposer les **unités américaines** : les longues portées s'expriment en **pieds**, pas
   en pouces.

## Contraintes
- Ne pas modifier les formules de calcul. Le calcul reste en **unités SI en interne**. La
  conversion se fait uniquement à la saisie et à l'affichage.
- Appliquer la langue et les unités **partout** : interface, fenêtres d'édition, vue 3D,
  cotes, étiquettes, tableaux, messages d'erreur, rapport PDF.

## 1. Internationalisation
- Tous les textes de l'interface sont sortis dans des **fichiers de traduction** (un par
  langue : `fr`, `en`), sans texte en dur dans le code.
- Choix de la langue dans l'en-tête, **mémorisé par utilisateur** et appliqué à la
  prochaine connexion. Langue par défaut : anglais pour un compte US.
- **Passage en anglais** : fenêtres d'édition, boîtes de dialogue, info-bulles, messages
  de validation, noms des configurations et des systèmes, rapport PDF.
- Un test automatique vérifie que **chaque clé** existe dans les deux langues. Une clé
  manquante est signalée en console, avec repli sur l'anglais.
- Les étiquettes techniques (A1, S1, X1) ne se traduisent pas.

## 2. Unités
Réglage « Unités » : Métrique ou US.

| Grandeur | Métrique | US |
|---|---|---|
| Longueur de portée, hauteur de toit, distance au bord, élévations, dégagement de chute | m | **ft** |
| Flèche | m ou mm | **ft** (1 décimale), ou ft-in en option |
| Petites dimensions (buffer, glissement de cône, affaissement) | mm | **in** |
| Effort, tension | kN | **lbf** (1 kN = 224,809 lbf) |
| Masse | kg | **lb** |
| Prétension du câble | 100 kg, 600 kg | 220 lb et 1 323 lb (kg × 2,20462), affichée avec son équivalent en lbf |
| Angle | ° | ° |

- **Règle clé** : toute longueur de portée ou dimension de bâtiment supérieure à 1 ft
  s'affiche en **pieds** (par exemple 20 ft, 30 ft). **Jamais** en pouces, même pour une
  longue portée.
- Format : pieds avec une décimale (`20,5 ft`). Option « pieds et pouces » (`20 ft 6 in`).
- Les champs de saisie acceptent l'unité du réglage, et convertissent vers le SI avant
  stockage.
- Changer d'unités après saisie **reconvertit toutes les valeurs affichées** sans altérer
  les valeurs stockées. Aucune dérive d'arrondi : on reconvertit à partir de la valeur SI.
- Arrondi à l'affichage uniquement.

## 3. Où cela s'applique
- Formulaires de saisie, tableaux d'édition (portées, coudes, pentes).
- Cotes et étiquettes de la vue 3D.
- Tableaux de résultats (efforts aux ancrages, flèches, dégagement de chute).
- Rapport PDF, y compris en-têtes et légendes de graphiques.
- Messages d'erreur contenant des valeurs (« portée maximale 120 ft »).

## Critères d'acceptation
1. Passer en anglais change **tous** les textes visibles, y compris les fenêtres d'édition.
   Aucun texte français ne reste.
2. En unités US, une portée de 18,29 m s'affiche **60,0 ft** partout, jamais en pouces.
3. Un effort de 10 kN s'affiche **2 248 lbf** en unités US.
4. Revenir en métrique redonne exactement 10,00 kN, sans dérive d'arrondi.
5. Le test automatique de clés signale toute traduction manquante.
6. Le rapport PDF est dans la langue et les unités choisies.
