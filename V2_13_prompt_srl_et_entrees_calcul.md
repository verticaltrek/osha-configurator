# Spec V2 — 04 : Sélection SRL obligatoire et entrées de calcul

## Objectif
1. Ajouter une **section SRL obligatoire** dans le panneau de droite.
2. Compléter les **entrées de calcul** qui manquaient par rapport au document « HLL System
   Layout Examples » : critical case, élévations, dispositif de connexion, position du
   corps, plage de l'arrest load.

Le choix OSHA ou EN est déjà géré par le logiciel : ne pas y toucher.

## Contraintes
- Ne pas modifier les formules existantes d'effort aux ancrages.
- Stocker toutes les entrées dans le modèle de projet pour qu'elles soient modifiables sans
  tout ressaisir.
- Unités : valeurs stockées en SI, affichées selon la spec langue et unités.

## 1. Section SRL (panneau de droite)
- Section **obligatoire** : le client **ne peut pas valider un système sans avoir choisi un
  SRL**. Le bouton de calcul ou de validation reste désactivé tant que le choix manque.
- Le **rapport affiche le SRL choisi** (nom, classe, caractéristiques).
- Catalogue de SRL, une fiche par modèle :

| Champ | Détail |
|---|---|
| `id`, `nom` | Par exemple Turbo Light 9 ft, Falcon leading-edge |
| `classe` | 1 ou 2 |
| `longueur_rétractée` | Nécessaire au dégagement quand la ligne est à l'anneau D ou en dessous |
| `distance_arrêt_max` (MAD) | Distance d'arrêt maximale |
| `arrest_load_preset` | Valeur d'essai : TurboLite+ ou Falcon+ |
| `modèle_3d` | Coque extérieure uniquement, sans mécanisme |
| `image` | Pour l'interface et le rapport |

- Deux SRL à intégrer pour l'instant : **Turbo Light 9 ft** et **un Falcon leading-edge**.
  Les fichiers CAD et images (coque extérieure) sont **fournis par Isaac** et ne sont pas
  encore reçus : utiliser un **volume provisoire** (boîte aux dimensions approximatives)
  et prévoir le remplacement du fichier sans toucher au code.
- Règles de la classe, issues du document : **classe 1 seulement si la ligne est à la
  hauteur de l'anneau D ou au-dessus** ; classe 2 acceptée à la hauteur de l'anneau D ou
  au-dessus, et obligatoire en dessous (jusqu'au niveau des pieds). Si le choix viole la
  règle, afficher une erreur et empêcher la validation.
- Choisir un SRL préremplit l'**arrest load** avec le preset TurboLite+ ou Falcon+,
  modifiable par l'ingénieur.

## 2. Méthode de charge : masse globale (lump mass)
- **Une seule arrest load** (masse globale), calculée par la formule
  `arrest_load = M × F`, où `F` est la force d'arrêt d'un utilisateur (préremplie par le
  preset du SRL choisi, modifiable) et `M` le facteur de masse globale selon le nombre
  d'utilisateurs :

| Utilisateurs | M |
|---|---|
| 1 | 1,00 |
| 2 | 1,75 |
| 3 | 2,25 |
| 4 | 2,75 |
| 5 | **3,25 (provisoire)** |

  Constantes nommées `LUMP_FACTOR_BY_USERS`. Le coefficient du **5e utilisateur** vaut 3,25 :
  c'est une extrapolation de ma part (+0,50, comme entre 3 et 4 utilisateurs), pas une
  valeur de la norme, dont la table s'arrête à 4. **À faire confirmer par l'ingénierie**,
  et afficher « valeur provisoire » à côté tant que ce n'est pas fait.
- Le résultat est **modifiable** par l'ingénieur (saisie directe de l'arrest load).
  Plage **1 lbf à 5 000 lbf**, convertie en kN en interne. Valeur hors plage : erreur de
  validation. Si `M × F` dépasse 5 000 lbf, avertir sans bloquer.
- Le **nombre d'utilisateurs entre donc dans le calcul** par `M` (1 à 5). Il est aussi repris
  dans le rapport.
- **Plus tard** : méthode séquentielle, avec masse et charge séparées par utilisateur,
  certains sur SRL et d'autres sur longe. À ne **pas** développer maintenant, mais
  structurer le modèle de données pour l'accueillir :
  `users: [{ mass, load, device: "SRL" | "lanyard" }]`.

## 3. Mode de chute : critical case ou portée choisie
Nouveau choix « Cas de chute » :

| Mode | Comportement |
|---|---|
| **Critical case** | Le logiciel simule une chute au milieu de **chaque portée** et sort les maximums : tension maximale, flèche maximale, et **dans quelle portée** ils se produisent |
| **Portée choisie** | L'utilisateur choisit la portée (liste S1…SN). Le logiciel calcule ce cas et donne les résultats pour **toutes les portées** |

Chaque simulation utilise la règle des 6 ancrages et la tension du câble hors fenêtre déjà
spécifiées (`V2` calcul chute toute portée). La chute **sur un ancrage intermédiaire** est
un cas distinct, à sortir comme « charge intermédiaire maximale » (voir V2_05).

## 4. Élévations
| Champ | Détail |
|---|---|
| **WWS Elevation** | Altitude de la surface de travail au-dessus de l'obstacle le plus proche |
| **HLL Elevation** | Altitude de la ligne au-dessus de la surface de travail. C'est la même valeur que l'« Élévation de la ligne » de V2_02, **une seule saisie** |

## 5. Dispositif de connexion
Choix entre SRD (SRL) et longe :
- **SRD** : classe 1 ou 2 (selon la section SRL), longueur rétractée, distance d'arrêt
  maximale (MAD). Ces valeurs viennent de la fiche SRL, modifiables. Le champ **MAD** est
  une saisie éditable avec bouton de rétablissement : voir
  `V2_08_prompt_simplification_configs_et_mad.md`.
- **Longe** : longueur et MAD. **Aucune classe 1 ou 2 pour la longe.** La longe ne peut
  **pas** être utilisée en cas de chute par-dessus un bord : bloquer ce cas avec un
  message.
- **Ne plus afficher l'effort dans la longe**, ni dans le logiciel (tableaux, vue 3D,
  info-bulles) ni dans le rapport PDF. Le choix de longe, sa longueur et sa MAD restent
  des entrées du dégagement de chute.
- Ces valeurs servent au calcul du dégagement de chute total (V2_05).

## 6. Position du corps
| Position | Effet sur le dégagement requis |
|---|---|
| Debout | Hauteur d'anneau D : 60 po (1,5 m) par défaut, modifiable |
| À genoux | Ajoute **36 po** (non applicable aux chutes par-dessus un bord) |
| Allongé | Ajoute la **hauteur de l'anneau D** saisie (non applicable aux chutes par-dessus un bord) |

## 7. Points ouverts, à ne pas bloquer
- **Supports / potelets et substrat** : le document source ne tranche pas. Prévoir un
  champ de texte libre facultatif, sans effet sur le calcul.
- **Longueur du buffer d'extrémité** : valeur fixe, à fournir. En attendant, une constante
  `END_BUFFER_LENGTH` modifiable.
- Exceptions de retrait de la ligne par rapport au bord : en discussion. Ne pas coder.

## Critères d'acceptation
1. Sans SRL choisi, la validation du système est impossible. Le SRL choisi apparaît dans le
   rapport.
2. Une classe 1 avec une ligne sous l'anneau D est refusée.
3. Une arrest load de 6 000 lbf est refusée. 1 lbf et 5 000 lbf sont acceptées.
4. En critical case, la sortie donne la tension maximale, la flèche maximale et la portée où
   ils surviennent.
5. En portée choisie, les résultats sont donnés pour toutes les portées.
6. Avec une longe, un cas de chute par-dessus un bord est bloqué.
7. Le SRL fonctionne avec un volume provisoire, remplaçable par le CAD sans changer le code.
