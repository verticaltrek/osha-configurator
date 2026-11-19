# Spec — Configuration 6 « Multi-span – Variable-degree bends (circle) » : rendu 3D sur réservoir d'eau

## Objectif
Pour la configuration 6 (parcours fermé de multiples portées à angle variable), le rendu
3D doit montrer la ligne de vie **en boucle fermée sur le toit d'un réservoir d'eau
cylindrique**, comme dans la réalité : poteaux répartis près du bord du toit, câble
reliant chaque poteau au suivant, dernier poteau relié au premier.

Le rendu doit fonctionner pour **n'importe quel paramétrage** (nombre de portées,
longueurs, angles), pas seulement pour l'exemple ci-dessous.

**Exemple de référence** : réservoir cylindrique à toit plat, 16 poteaux répartis
régulièrement sur un cercle proche du bord du toit, câble avec points de passage,
échelle d'accès sur la paroi, trappe d'accès au centre du toit, style visuel existant
(poteaux gris, câble fin, fond clair).

## Contraintes
- **Ne pas modifier** le code ni le rendu des autres configurations (1 à 5, 7 à 12).
- Le rendu est une aide visuelle de pose. Il **n'intervient dans aucun calcul** (tension,
  flèche, tirant d'air). Ne pas toucher au moteur de calcul.
- Réutiliser les composants 3D existants pour les poteaux et le câble.

## Modèle de données d'entrée
Liste ordonnée de portées formant une boucle fermée (`closed_loop = true`, imposé pour
cette configuration).

| Champ | Type | Détail |
|---|---|---|
| `spans[i].length` | nombre (m) | Longueur de la portée i, bornée par le max du système choisi |
| `spans[i].bend_after_deg` | nombre (°) | Angle du coude entre la portée i et la portée i+1 |

Deux modes de saisie, au choix de l'utilisateur :

1. **Mode réservoir (polygone régulier)** : l'utilisateur saisit le **diamètre du
   réservoir** (m) et le **nombre de poteaux N**. Les longueurs et angles se déduisent :
   - rayon du cercle de pose : `R = (diamètre / 2) − retrait_bord` (retrait par défaut 0,5 m)
   - longueur de chaque portée : `L = 2 × R × sin(π / N)`
   - angle de chaque coude : `180° − 360° / N` (angle intérieur du polygone)
2. **Mode manuel (tableau)** : l'utilisateur saisit lui-même chaque longueur et chaque
   angle dans un tableau (ajout et suppression de lignes, jusqu'à 20 portées ou plus).
   Le diamètre du réservoir affiché est alors déduit du polygone saisi.

## Règles de génération

### 1. Fermeture de la boucle
- Le polygone doit se refermer. Vérifier que la somme des angles extérieurs vaut 360°
  (tolérance 0,5°) et que le dernier point rejoint le premier (tolérance 1 cm).
- Si la boucle ne se ferme pas en mode manuel : message d'erreur de validation, rendu
  non généré. Proposer un bouton « Ajuster la dernière portée » qui recalcule la
  longueur et l'angle de fermeture.

### 2. Réservoir
- Cylindre à toit plat dont le **diamètre** est celui saisi (mode réservoir) ou celui
  du cercle circonscrit au polygone augmenté du retrait de bord (mode manuel).
- Hauteur du réservoir : paramètre d'affichage par défaut 8 m, modifiable. N'influence
  aucun calcul.
- Le toit est à `z = 0` pour la ligne de vie. Poteaux posés sur le toit.
- Détails d'ambiance : nervures verticales, joints horizontaux, trappe d'accès au centre
  du toit, échelle sur la paroi. Purement décoratifs.

### 3. Poteaux et câble
- Un poteau à chaque sommet du polygone. Hauteur de poteau : valeur du système choisi.
- Câble continu d'un poteau à l'autre, fermé. Points de passage (intermédiaires) à 1/3 et
  2/3 de chaque portée, comme dans les rendus existants.
- Gérer l'ordre d'affichage (profondeur) : poteaux et câble du fond derrière ceux de
  l'avant, y compris quand la vue tourne.

### 4. Variantes de structure (même logique, autre habillage)
La même configuration doit pouvoir s'afficher sur d'autres structures circulaires,
sélectionnables dans une liste « Type de structure » (défaut : réservoir) :
- **Château d'eau** : réservoir surélevé sur pieds, ligne sur la galerie du toit.
- **Phare** : tour conique, ligne sur la galerie autour de la lanterne.
- **Clarificateur / silo** : cylindre bas de grand diamètre.

Seul l'habillage 3D change. Le modèle de données et la boucle de poteaux restent
identiques. Si le temps manque, livrer d'abord le réservoir, puis les autres variantes.

## Interface
- Sélecteur de mode (réservoir ou manuel).
- Mode réservoir : champs diamètre (m) et nombre de poteaux N (minimum 3).
- Mode manuel : tableau éditable (longueur, angle), bouton d'ajout, bouton de
  suppression, indicateur d'état de fermeture (vert si fermé, rouge sinon).
- Liste « Type de structure » (défaut : réservoir).

## Validation
- `N ≥ 3`.
- Chaque `length` doit être comprise entre 0 et le maximum admissible du système choisi
  (réutiliser les limites déjà définies dans le moteur de calcul existant).
- En mode réservoir, si `L` dépasse le maximum du système, afficher une erreur et
  suggérer d'augmenter N.
- Angles compris entre 0° et 180° exclus.

## Critères d'acceptation
Vérifier visuellement ces trois paramétrages :

1. **Mode réservoir, diamètre 30 m, N = 16** : polygone régulier de 16 côtés, chaque
   portée d'environ 5,6 m, angle de coude de 157,5°, boucle fermée.
2. **Mode réservoir, diamètre 12 m, N = 8** : portées d'environ 4,2 m, angle de 135°.
3. **Mode manuel, 6 portées de longueurs et d'angles différents sommant 360°** :
   la boucle se ferme. Avec un angle modifié, l'erreur de fermeture s'affiche.

Dans chaque cas : câble continu et fermé, poteaux posés sur le toit, aucune modification
des autres configurations.
