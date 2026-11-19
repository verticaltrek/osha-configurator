# Spec V2 — 20 : Rapport PDF du logiciel au style « Note de calcul HOOKT »

## Objectif
Refondre la **mise en page** du rapport PDF généré par le logiciel (jsPDF) pour qu'il ressemble à la **note de calcul HOOKT** de référence (« NOTE DE CALCUL – ligne de vie NewPro », réf. EE 51), au lieu du style actuel (bandeau marine, tableaux bleus, Helvetica).

Le **contenu** défini par `V2_05`, `V2_09`, `V2_10`, `V2_17` et `V2_18` est conservé. Cette spec ne change **ni les calculs, ni les données** : seulement la présentation, l'ordre des blocs et la taille du fichier.

## Contraintes
- Ne pas modifier le moteur de calcul. Le rapport lit les mêmes résultats qu'aujourd'hui.
- Langue et unités selon V2_06 (FR et EN, métrique ou US). Les exemples ci-dessous sont en français et en métrique.
- Format **A4 portrait**, 595,28 × 841,89 pt. Marges latérales **36 pt**.
- Les étiquettes A#, S# et les cotes sont identiques à la vue 3D (spec des étiquettes).

## 1. Charte graphique (mesurée sur la note HOOKT)

| Élément | Valeur |
|---|---|
| Noir HOOKT | `#1D1D1B` (bandeaux, en-têtes de tableaux, texte) |
| Blanc | `#FFFFFF` (texte sur bandeaux, fond de page) |
| Gris secondaire | `#6D6D6C` (libellés secondaires, filets) |
| Orange HOOKT | celui des étiquettes d'ancrage actives du logiciel. **Seul accent de couleur** : portée critique et avertissements |
| Police | **Roc Grotesk** : Light (texte courant), Medium (valeurs, titres), ExtraLight (détails) |

- Roc Grotesk est la police de la note HOOKT. Elle est sous licence : n'utiliser que les fichiers fournis par HOOKT (embarqués via `addFileToVFS` / `addFont`). **Repli** si les fichiers manquent : Hanken Grotesk ou Inter (libres), avec le même rendu léger / medium.
- Supprimer tout bleu, tout fond coloré et toute alternance de lignes grises.

### Bandeau haut (chaque page)
- Rectangle `#1D1D1B`, pleine largeur, **hauteur 111 pt**, depuis le haut de la page.
- **Logo HOOKT** (mot-symbole blanc) à gauche, environ 252 × 42 pt, x = 36 pt, centré verticalement. Fichier fourni : `logo_hookt_wordmark.png` (504 × 84 px, blanc sur fond transparent). Utiliser de préférence le **SVG vectoriel** de HOOKT s'il existe.
- À droite, alignés à droite sur la marge : titre en **Medium capitales** (par exemple « NOTE DE CALCUL »), puis sous-titre en **Light** (par exemple « ligne de vie NewPro »). Taille titre 16 pt, sous-titre 14 pt, blanc.

### Bandeau bas (chaque page)
- Rectangle `#1D1D1B`, pleine largeur, **hauteur 29 pt**, en bas de page.
- Texte blanc Light centré, 8 pt : `go-hookt.com - contact@go-hookt.com - 05 59 52 40 48`.
- Numéro de page « Page n / N » à droite dans ce bandeau.

## 2. Page 1 : la note de calcul

Calquée sur la note HOOKT :
1. **Bandeau haut** : titre « NOTE DE CALCUL », sous-titre « ligne de vie » suivi de la gamme (par exemple « ligne de vie NewPro »).
2. **Ligne de référence**, 9 pt : « REFERENCE : » en Light, puis le repère du projet en **Medium** (par exemple « HLL-01 – nom du projet »).
3. **Deux colonnes**, chacune avec un titre souligné d'un filet fin (gris) :
   - **Données d'entrée** (colonne gauche, x = 36 pt) : Type d'ancrage (gamme), Longueur de LDV, Portées max, Nb d'utilisateurs max, **Facteur de chute** (valeur saisie, 1 par défaut), configuration, élévation de la ligne, dispositif de connexion.
   - **Données de sortie** (colonne droite, x ≈ 315 pt) : Nombre d'ancrages, Flèche max (mm), Effort max (kN), charge d'arrêt.
   Chaque ligne : libellé en Light à gauche, valeur en **Medium** alignée sur une même colonne, interligne environ 27 pt.
4. **Bloc « Valeurs pour <gamme> portées <X m> »** (titre souligné) puis un tableau :
   - en-tête **noir `#1D1D1B`**, texte blanc Light, colonnes **Nb utilisateurs | Effort (kN) | Flèche (mm)** ;
   - une ligne par nombre d'utilisateurs de 1 à N (jusqu'à 5), texte centré, sans bordure ni alternance ;
   - valeurs avec 2 décimales pour l'effort, entiers en mm pour la flèche.
5. **Deux images 3D** sous le tableau : vue de dessus avec étiquettes de portée en pastilles noires (S1, S2…) et perspective, largeur maximale 523 pt, proportions conservées.

Une seule page 1, sans table des matières.

## 3. Pages suivantes (même bandeaux, même police, mêmes tableaux)
Sous-titre du bandeau haut : nom de la section.

| Page | Contenu (inchangé par rapport à V2_05) |
|---|---|
| 2 | Sommaire (tableau compact, en-tête noir). Plan de repérage, cotes de toiture, distance au bord, spécification du câble, prétension |
| 3 | Visualisation 3D, élévation, support, potelet, référentiel normatif |
| 4 | Tableau de **tous** les ancrages (A1 à An), tableau des portées avec la **portée critique** repérée en orange |
| 5 | Dispositif de connexion, MAD, longueur rétractée, force d'arrêt, efforts de coin, bilan de dégagement et schéma de chute |
| 6 | Formule détaillée du dégagement, tirant d'air disponible, nomenclature, avis d'homologation, avertissement légal |

- Tous les tableaux : en-tête `#1D1D1B` texte blanc, corps sans fond, filet gris très fin entre lignes. Cellules sans bordure verticale.
- Titres de section en Medium, soulignés d'un filet, comme « Données d'entrée ».
- Le schéma de chute reprend les noirs et gris de la charte, avec les cotes en orange.
- L'avis d'homologation et l'avertissement légal : cadre à filet noir, pas de fond.

## 4. Taille et qualité des images
- Le PDF actuel pèse **33 Mo** : deux images PNG de 2 275 × 1 812 px (11,8 Mo chacune) et leurs masques de transparence.
- Rendre les images 3D en **JPEG qualité 85**, à **150 dpi** de la taille imprimée (par exemple 523 pt de large, soit environ 1 090 px), sur **fond blanc** opaque, sans masque de transparence.
- Objectif : rapport complet **inférieur à 3 Mo**.

## 5. Textes
- Aucun libellé en anglais brut dans le PDF français. Exemple relevé : « MULTI BEND CIRCLE » doit s'afficher avec le nom courant de la configuration (« Multi-portée avec coudes »). Tout passe par les fichiers de traduction.
- Séparateur décimal selon la langue (virgule en français).

## 6. Anomalies relevées dans le rapport actuel, à corriger en même temps
Elles ne relèvent pas du style, mais elles sont visibles dans le PDF du 17/11/2026. Ne pas les reproduire dans le nouveau rapport.

1. **Efforts de coin faux** : pour T1 = T2 = 12 kN et un coude de 30°, le rapport donne `|R| = 16,97 kN`, ce qui correspond à un coude de 90°. Pour une déviation δ, `|R| = 2 × T × sin(δ / 2)`, soit **6,21 kN** ici. Vérifier la conversion angle intérieur / déviation (même point que V2_19).
2. **Nombre de coins incohérent** : 11 coins listés (C1 à C11) pour 12 ancrages. Une ligne ouverte à 12 ancrages a 10 coins ; une boucle fermée en a 12. Aligner avec `closed_loop = true` de la configuration 6.
3. **Marge de sécurité** : 1,00 m dans la fiche du dispositif, 0,61 m dans la formule et le schéma. Une seule valeur.
4. **Schéma et formule du dégagement** : le schéma affiche « Arrêt SRL (MAD) + Rétracté : 1,90 m », mais la formule (V2_18, HLL sous l'anneau D) n'inclut pas la longueur rétractée. Le total affiché doit être égal à la somme des termes visibles.
5. **Total 2,42 m** : la somme affichée dans la formule donne 2,41 m. Calculer à partir des valeurs non arrondies et n'arrondir qu'à l'affichage.
6. **Facteur de chute 2,00** dans la fiche et dans le titre de colonne « Résultat ajusté » : les valeurs sont doublées. Vérifier que ce 2,00 est bien saisi par l'ingénieur. Avec 1,00, il n'y a qu'une colonne de résultats (V2_09).
7. **« Utilisateurs max : 1 »** en synthèse, alors que le tableau des résultats va de 1 à 5 personnes. Afficher le nombre saisi et la plage cohérente.

## Critères d'acceptation
1. Page 1 : bandeau noir de 111 pt avec logo et titre à droite, deux colonnes Données d'entrée / Données de sortie, tableau à en-tête noir, deux images 3D. Elle ressemble visuellement à la note EE 51.
2. Chaque page a le bandeau haut noir, le bandeau bas noir de 29 pt avec contact et numéro de page.
3. Aucun bleu ni aucune couleur autre que noir, blanc, gris et orange dans le PDF.
4. Le texte est en Roc Grotesk, ou en police de repli si les fichiers manquent.
5. Le PDF de l'exemple HLL-01 pèse moins de 3 Mo.
6. Le contenu de V2_05 est présent : sommaire, plan, 3D, tous les ancrages, portée critique, SRL, efforts de coin, dégagement, avertissement.
7. Aucun libellé anglais brut dans la version française.
8. Pour T = 12 kN et δ = 30°, l'effort de coin affiché est 6,21 kN.
9. Les termes du dégagement affichés se somment exactement au total affiché.
10. Le moteur de calcul et les valeurs numériques du rapport (hors anomalies ci-dessus) sont inchangés.
