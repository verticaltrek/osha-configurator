# Spec V2 — 10 : Équipement SRL, longueur rétractée en saisie, MAD

Cette spec modifie la section « ÉQUIPEMENT SRL (OBLIGATOIRE) ». Elle complète `V2_09` et remplace, pour l'affichage des cartes SRL, les champs de `V2_04`.

## Contraintes
- Ne pas modifier les formules de calcul existantes.
- Stockage en SI, affichage selon V2_06. Les champs de cette spec gardent leur sélecteur d'unité propre (m, ft ou in).
- Libellés via les fichiers de traduction (FR et EN).

## 1. Cartes SRL : une seule information affichée
Chaque carte du catalogue (TurboLite+, Falcon+) affiche **uniquement** :
- le nom du modèle ;
- la **longueur rétractée**, en m avec l'équivalent en ft, comme aujourd'hui.

**Retirer de la carte** : le badge de classe, la ligne « Preset Force », la ligne « Classe » et la ligne « Usage ». La force d'arrêt n'est plus un preset affiché : c'est une saisie (V2_09).

La classe reste enregistrée en interne pour chaque modèle du catalogue, afin que la règle de V2_04 continue de s'appliquer (classe 1 seulement à l'anneau D ou au-dessus). Elle n'est simplement plus affichée sur la carte.

### Valeurs de longueur rétractée
- Les valeurs actuelles de la capture (0,60 m pour TurboLite+, 0,80 m pour Falcon+) sont des **valeurs provisoires**, pas des mesures.
- Remplacer par les **vraies longueurs rétractées** fournies par PIP. Champ de catalogue `retracted_length_m`, modifiable sans toucher au code.
- Tant qu'une valeur réelle manque pour un modèle, la carte affiche **« Donnée à renseigner »** à la place d'un nombre, et la saisie de l'utilisateur (section 2) devient obligatoire.
- La longueur de ligne du catalogue Bullivants (1,8 m, 2,0 m, 6 à 20 m) **n'est pas** la longueur rétractée : ne pas l'utiliser ici.

## 2. Saisies de l'utilisateur dans la section dispositif
L'utilisateur renseigne, dans cet ordre :
1. **Type de connexion** : SRL ou longe (liste de choix). Choisir une carte SRL sélectionne « SRL ».
2. **Longueur rétractée** : champ de saisie obligatoire, **préremplie par la valeur de la carte** choisie, modifiable. Pour une longe, le champ devient **Longueur de la longe**.
3. **MAD** : champ de saisie obligatoire, sélecteur d'unité **in** ou **m** avec équivalent affiché (V2_09, section 2).
4. **Arrest force** : champ de saisie obligatoire (V2_09, section 3), inchangé.

Règles communes :
- Unité propre à chaque champ : longueur rétractée en m, ft ou in. Stockage en m.
- Validation : strictement supérieure à 0. Avertissement non bloquant au-dessus de `RETRACTED_WARN_M = 3,0 m`.
- Quand la valeur saisie diffère de celle de la carte, afficher « modifiée » avec un bouton **Rétablir**.
- Un SRL ou une longe **personnalisés** (V2_09) démarrent avec les champs vides.
- La validation du système est impossible tant que longueur rétractée, MAD ou Arrest force manque. Le message nomme le champ.

## 3. Effets sur le calcul et le rapport
- La longueur rétractée saisie alimente le dégagement de chute total à la place de la valeur de fiche (V2_05). Mise à jour en direct.
- Le rapport indique : type de connexion, longueur rétractée, MAD et Arrest force utilisées, avec « valeur modifiée par l'utilisateur » quand la valeur diffère du catalogue.
- Le rapport n'affiche **pas** de ligne « Preset Force » ni de « Usage ».
- Aucun effort de longe affiché (V2_04, inchangé).

## 4. Noms des modèles et classe
- **« TurboLite+ Class 2 » devient « TurboLite+ »** et **« Falcon Leading-Edge » devient « Falcon+ »**, partout : cartes, sélecteur, rapport, nomenclature, traductions, exports. Chercher aussi les anciennes variantes (« Turbo Light 9 ft », « Turbo Lite », « Falcon Leading-Edge », « Class 2 » collé au nom).
- **La classe 2 reste spécifiée pour les deux modèles**, comme classe enregistrée dans la fiche. La classe 1 n'est proposée pour aucun des deux.
- Le nom n'affiche plus la classe. La classe n'apparaît ni dans le nom ni sur la carte (section 1). Si PIP veut la voir dans le rapport, l'ajouter à la ligne du SRL : à confirmer.
- Les identifiants internes ne changent pas : seul le libellé change, et les projets enregistrés affichent les nouveaux noms.
- Ces noms remplacent ceux de `V2_09` (section 4) et de `V2_04`.

## Critères d'acceptation
1. Les cartes TurboLite+ et Falcon+ n'affichent que le nom et la longueur rétractée.
2. Sans valeur réelle dans le catalogue, la carte affiche « Donnée à renseigner » et l'utilisateur doit saisir la longueur.
3. Choisir une carte préremplit la longueur rétractée. La modifier affiche « modifiée » et un bouton Rétablir.
4. Saisir 2,0 ft puis passer l'unité en m affiche 0,61 m, sans dérive d'arrondi au retour en ft.
5. Valider sans longueur rétractée, MAD ou Arrest force est impossible, avec un message précis.
6. Modifier la longueur rétractée change le dégagement total immédiatement.
7. Le rapport reprend les trois valeurs et signale celles qui ont été modifiées.
8. Une classe 1 avec une ligne sous l'anneau D reste refusée, même si la classe n'est plus affichée sur la carte.
9. Les cartes s'appellent « TurboLite+ » et « Falcon+ ». Une recherche de « Class 2 » dans les noms, de « Turbo Lite » et de « Falcon Leading-Edge » ne donne aucun résultat dans l'interface et le rapport.
10. Les deux modèles ont la classe 2 enregistrée, et aucun n'offre la classe 1.
