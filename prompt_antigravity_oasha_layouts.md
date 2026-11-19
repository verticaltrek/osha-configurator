# Spec — Version OSHA du configurateur HOOKT : 12 configurations de pose

## Objectif
Faire évoluer l'application vers une **version OSHA** du configurateur de lignes de vie
horizontales. Les configurations de pose (layouts) actuellement disponibles dans l'app
doivent être **remplacées** par les **12 configurations** décrites ci-dessous (la 13e,
"Cross or Grid Systems with Slopes", n'est **pas** incluse dans cette version — elle
reste une évolution future non traitée ici).

Systèmes concernés (inchangés) : **LightPRO**, **NewPRO**, **Long/Super/Ultra Range**.

Le périmètre de cette évolution porte uniquement sur la **couche d'entrée / sélection
de configuration** (saisie des paramètres géométriques qui définissent la pose). Les
calculs, les sorties (Output) et le rapport (Report) ne sont pas repris ici — seuls les
inputs généraux jusqu'à (et non compris) "Critical Case" sont dans le périmètre.

## Paramètres d'entrée généraux (communs à toutes les configurations)

Ne pas reprendre les paramètres situés après "Arrest load" dans le document source
(Critical Case, WWS Elevation, HLL Elevation, Connection Device, Body Position) — ils
sont hors périmètre de cette itération.

| Paramètre | Type | Détail |
|---|---|---|
| Langue | Choix | Sélection de la langue de l'interface |
| Infos projet / installateur | Texte | Nom du projet, lieu, date, nom du concepteur, nom(s) de(s) HLL |
| Unités | Choix | Système métrique / impérial |
| Sélection du système | Choix | LightPRO / NewPRO / Long-Super-Ultra Range |
| Fall Arrest ou Restraint | Choix | Information pour le rapport uniquement, n'intervient pas dans le calcul |
| Nombre de portées (spans) | Variable | Dépend de la configuration choisie (voir ci-dessous) |
| Longueur de chaque portée | Variable | Une longueur propre à chaque span, pas de valeur partagée |
| Nombre de coudes, position et degré | Variable | Uniquement pour les configurations avec coude(s) |
| Entrée de pente | Variable | Uniquement pour les configurations avec pente |
| Entrée X-matrix | Variable | Si applicable |
| Potelets/supports et substrat | À définir | Non tranché dans le document source — à considérer comme point ouvert, ne pas bloquer le développement dessus |
| Longueur de buffer d'extrémité | Fixe | Valeur fixe, non modifiable par l'utilisateur |
| Nombre d'utilisateurs | Variable | Information pour le rapport uniquement, n'intervient pas dans le calcul |
| Arrest load | Variable | Saisie en valeur forfaitaire (lump sum) décidée par l'ingénieur selon le SRD et le nombre d'utilisateurs. Prévoir aussi la possibilité de choisir directement "TurboLite+" ou "Falcon+" comme raccourci (valeurs issues des essais) plutôt que de saisir une charge brute |

## Les 12 configurations à implémenter

Pour chaque configuration : description, inputs géométriques spécifiques requis en plus
des paramètres généraux ci-dessus.

### 1. Single Span
Une seule portée, longueur variable jusqu'au maximum admissible du système choisi.
- Inputs spécifiques : 1 longueur de portée.

### 2. Multi-span – Straight
Plusieurs portées alignées en ligne droite, chaque portée avec sa propre longueur.
- Inputs spécifiques : N (nombre de portées), longueur de chacune des N portées.

### 3. Multi-span – 90-Degree bend
Plusieurs portées avec un ou plusieurs coudes fixes à 90°.
- Inputs spécifiques : N portées, longueur de chacune, position du/des coude(s)
  (après quelle portée), angle fixé à 90° (pas de saisie d'angle, implicite).

### 4. Multi-span – Variable-Degree bend
Comme la précédente, mais l'angle du coude est saisi librement par l'utilisateur.
- Inputs spécifiques : N portées, longueur de chacune, position du/des coude(s),
  angle variable (en degrés) pour chaque coude.

### 5. Multi-span – Multiple 90-degree bends
Cas typique de pourtour de toiture : plusieurs coudes à 90° successifs, pouvant
former une boucle fermée (rectangle) ou un parcours ouvert.
- Inputs spécifiques : N portées, longueur de chacune, position de chaque coude à
  90° (répétable), option "boucle fermée" (le dernier point rejoint le premier).

### 6. Multi-span – Variable-degree bends (circle)
Parcours fermé avec de multiples coudes à angle variable, formant un cercle ou
polygone (réservoirs, tours, clarificateurs). Peut nécessiter 20 portées ou plus.
- Inputs spécifiques : N portées (jusqu'à un nombre élevé, prévoir une saisie en
  liste/tableau plutôt qu'un formulaire champ par champ), longueur de chacune, angle
  de chaque coude, fermeture automatique du parcours en boucle.

### 7. Multi-span – Multiple Variable bends
Parcours ouvert avec plusieurs coudes à angle variable (sans fermeture en boucle).
- Inputs spécifiques : N portées, longueur de chacune, position et angle variable de
  chaque coude, parcours non fermé.

### 8. Single-span – Slope System
Une seule portée posée en pente, sur toute la plage d'angle admissible (15° à 75°
dans l'exemple du document, à vérifier/paramétrer comme plage configurable plutôt que
codée en dur).
- Inputs spécifiques : 1 longueur de portée, 1 angle de pente.

### 9. Multiple-span – Slope System
Plusieurs portées en pente, chaque portée pouvant avoir sa propre longueur et son
propre angle.
- Inputs spécifiques : N portées, longueur de chacune, angle de pente de chacune
  (indépendant d'une portée à l'autre).

### 10. Multiple-span – Horizontal and Slope System
Combinaison de portées horizontales et de portées en pente dans un même système
continu.
- Inputs spécifiques : N portées, longueur de chacune, pour chaque portée un
  indicateur "horizontale" ou "en pente" + angle si en pente, position du changement
  horizontale/pente dans le parcours.

### 11. Cross-spans
Quatre portées rayonnant depuis un point central (croix), chaque branche avec sa
propre longueur.
- Inputs spécifiques : longueur indépendante pour chacune des 4 branches (Nord, Sud,
  Est, Ouest, ou équivalent Span 1 à 4).

### 12. Grid Systems
Système en grille, intersections de plusieurs lignes horizontales et verticales.
- Inputs spécifiques : nombre de lignes dans chaque direction, espacement/longueur
  entre les points d'intersection (peut être irrégulier), prévoir une saisie en
  tableau 2D plutôt qu'un formulaire linéaire.

## Exigences d'implémentation

1. **Remplacement, pas addition** : les configurations de pose actuellement proposées
   dans l'app doivent être retirées et remplacées par ces 12-là. Aucune ancienne
   configuration ne doit rester sélectionnable après cette évolution.
2. **Modèle de données commun** : toutes les configurations doivent pouvoir être
   représentées par une même structure sous-jacente — une liste ordonnée de portées,
   chacune avec `length`, `bend_after_deg` (optionnel), `slope_deg` (optionnel),
   `closed_loop` (booléen, pour les parcours fermés) — pour simplifier le passage au
   moteur de calcul existant sans dupliquer la logique par configuration.
3. **Formulaire dynamique** : l'UI doit s'adapter au nombre de portées déclaré par
   l'utilisateur (pas de nombre de champs codé en dur), avec un mode tableau/liste
   pour les configurations à grand nombre de portées (ex: configuration 6, jusqu'à 20+
   portées).
4. **Validation** : chaque longueur de portée doit être bornée par le maximum
   admissible du système sélectionné (LightPRO / NewPRO / Long-Super-Ultra Range) —
   réutiliser les limites déjà définies dans le moteur de calcul existant.
5. **Hors périmètre de cette itération** : la logique de calcul (tension, flèche,
   tirant d'air), la génération du rapport PDF, et les paramètres situés après "Arrest
   load" dans le document source ne sont pas à modifier ici — seule la couche de
   sélection/saisie de la configuration de pose est concernée.
