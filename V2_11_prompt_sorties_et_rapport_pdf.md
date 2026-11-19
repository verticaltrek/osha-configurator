# Spec V2 — 05 : Sorties de calcul et rapport PDF

## Objectif
Compléter les **sorties** du logiciel et améliorer le **rapport PDF**, d'après le document
« HLL System Layout Examples » et la revue de la V1.

## Contraintes
- **Ne pas modifier** les formules existantes d'effort à l'ancrage de chute.
- **Ne pas inventer de formule** quand elle n'est pas fournie : la structure est à coder,
  les constantes et formules manquantes sont listées plus bas.
- Les étiquettes (ancrages A…, portées S…) sont celles de la spec des étiquettes, et sont
  **identiques** dans la vue 3D, les tableaux et le PDF.
- **Aucune mention du « facteur de chute »** dans les sorties ni dans le PDF. Les résultats
  sont ceux des essais, avec une colonne « résultat ajusté » si l'ingénieur a saisi un
  coefficient (voir `V2_07_prompt_elevation_et_resultats_de_reference.md`).
- **Aucun effort de longe** dans les sorties ni dans le PDF.

## 1. Sorties de calcul

| Sortie | Détail |
|---|---|
| Système conçu en arrêt de chute ou en retenue | Information reprise des entrées |
| Nombre d'utilisateurs | Information |
| **Prétension du système** | Tension du câble `P0` (100 kg LightPRO et NewPRO, 600 kg gammes Range) |
| **Affaissement initial** | Flèche statique de chaque portée avant chute. Formule à fournir |
| **Efforts aux ancrages** | Pour **tous** les ancrages (pas seulement 6), selon les specs de calcul de chute |
| **Tension maximale** | En cas de chute à mi-portée : tension maximale **et efforts des portées adjacentes**, pas seulement aux extrémités |
| **Charge intermédiaire maximale** | Chute directe sur un ancrage intermédiaire, d'après l'arrest load. Comparée à la tension de ligne |
| **Efforts de coin** | Pour chaque coude : effort dans chaque direction de câble, puis effort **résultant** (valeur et direction) |
| **Flèche de ligne** | Par portée. Selon le mode : maximum et portée critique, ou toutes les portées |
| **Dégagement de chute total requis** | Voir plus bas |
| **Recul du buffer** | Distance de recul ou d'extraction au bloc |
| **Facteur de sécurité** | Résistance du composant limitant divisée par l'effort réel dans le système |
| **Nomenclature (BOM)** | Référence, quantité, image |

### Efforts de coin
Pour un coude, les deux câbles tirent le long de directions `u₁` et `u₂` (vecteurs unitaires
partant de l'ancrage de coin), avec des tensions `T₁` et `T₂`. L'effort résultant est la
**somme vectorielle** `R = T₁·u₁ + T₂·u₂`. Afficher `|R|` et l'angle de `R` par rapport à la
bissectrice du coude. Pour un coude à deux ancrages (supérieur à 40°), répartir `R` sur les
deux ancrages selon leurs positions.

### Dégagement de chute total requis
Structure de calcul à coder. Composantes :
- flèche de la ligne sous charge ;
- distance d'arrêt du dispositif (MAD ou longueur rétractée selon la hauteur de ligne) ;
- hauteur de l'anneau D et variation selon la position du corps (debout, à genoux
  +36 po, allongé + hauteur d'anneau D) ;
- élévation de la ligne (HLL) et de la surface (WWS) ;
- pour une chute par-dessus un bord : distance ligne/bord et hauteur du toit.
La **formule exacte et les marges sont à fournir** par l'équipe d'ingénierie. Prioriser
deux scénarios : (1) ligne à l'anneau D ou au-dessus avec SRD classe 1, (2) ligne au
niveau du sol avec chute par-dessus un bord et SRD classe 2.

### Données à fournir
- Résistance de chaque composant (pour le facteur de sécurité).
- Base de pièces (référence, image) pour la nomenclature.
- Formules d'affaissement initial et de recul du buffer.

## 2. Rapport PDF amélioré

### Contenu
- Marque PIP / Miller selon la charte fournie, **numéro de version du logiciel**.
- **Table des matières**. Toutes les entrées et toutes les sorties, bien organisées.
- Plan de la configuration avec étiquettes et longueurs.
- **Rendu 3D**.
- **Illustration de chute** montrant le dégagement de chute, la flèche, la distance
  d'arrêt du dispositif et le facteur de sécurité. Un schéma pour une ligne à l'anneau D,
  un schéma pour une ligne au sol avec chute par-dessus un bord.
- Avertissement légal du logiciel.
- Nom de l'utilisateur et date de génération.
- SRL choisi, avec image.

### Identification des portées
- **Chaque portée est identifiée** par un nom ou un numéro (S1, S2…), repris en 3D.
- La **portée la plus défavorable est signalée clairement** (en général la plus longue),
  avec le motif : tension maximale ou flèche maximale.

### Efforts
- **Efforts les plus défavorables** : tension maximale en chute à mi-portée et efforts des
  portées adjacentes, pas seulement les efforts d'extrémité.
- **Charges aux ancrages** : tableau de **tous** les ancrages (la V1 n'en montre que 2, la
  demande de revue va jusqu'à 6 ; en afficher davantage si la ligne en compte plus).
  Chaque ligne contient étiquette, type, portées adjacentes, effort, rôle.
- Efforts de coin résolus (valeur et direction) pour chaque coude.

### Mise en forme
- Langue et unités selon les réglages de l'utilisateur (spec langue et unités).
- Toutes les étiquettes et cotes identiques à celles de la vue 3D.

## Critères d'acceptation
1. Le PDF contient table des matières, plan, rendu 3D, illustration de chute, SRL choisi,
   version du logiciel et avertissement.
2. Chaque portée du PDF porte un identifiant, et la portée critique est signalée.
3. Le tableau des ancrages liste tous les ancrages, y compris ceux à la tension du câble.
4. Chaque coude affiche les deux efforts de câble et l'effort résultant (valeur, direction).
5. Les valeurs sans formule fournie affichent « Donnée à renseigner » au lieu d'un nombre
   inventé.
6. Un changement d'entrée met à jour la vue 3D, les tableaux et le PDF de façon cohérente.
