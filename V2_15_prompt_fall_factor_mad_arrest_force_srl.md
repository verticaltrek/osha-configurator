# Spec V2 — 09 : Fall Factor, MAD et arrest force en saisie libre, renommage des SRL

Ce prompt regroupe les retours de PIP (Jude, Brian). Il **remplace** les points suivants des specs précédentes :
- `V2_07` : le « Coefficient de l'ingénieur » devient **Fall Factor**. La règle « ne jamais afficher le facteur de chute » ne vaut plus pour ce champ.
- `V2_04` et `V2_08` : la MAD et la force d'arrêt ne viennent plus de la fiche SRL, ce sont des saisies libres.
- `V2_04` : le catalogue SRL change (section 4).

## Contraintes
- Ne pas modifier les formules de calcul existantes (efforts aux ancrages, règle des 6 ancrages, tension du câble, pentes OSHA).
- Stockage en SI, affichage selon les unités de la spec V2_06, sauf pour les champs de cette spec qui ont leur propre sélecteur d'unité.
- Textes d'interface et de rapport via les fichiers de traduction (FR et EN).

## 1. « Coefficient de l'ingénieur » devient « Fall Factor »
- Renommer partout : libellé, info-bulle, messages, colonnes de tableau, rapport PDF, fichiers de traduction, noms visibles. Libellé EN : **Fall Factor**. Libellé FR : **Facteur de chute**.
- **Valeur par défaut : 1,00.** En **OSHA, la valeur reste à 1,00** : le calcul de Jude n'applique aucun facteur de chute. Les résultats affichés sont ceux des essais.
- Le champ reste modifiable (plage 0,10 à 5,00), stocké dans le projet. Quand la valeur est différente de 1,00, le rapport affiche deux colonnes : « Résultat d'essai » et « Résultat ajusté (Fall Factor X,XX) ». À 1,00, une seule colonne.
- Il multiplie les **efforts** uniquement (efforts aux ancrages, tension, efforts de coin, charge intermédiaire). La flèche et le dégagement ne sont pas multipliés. À confirmer avec l'ingénierie.
- Le logiciel ne propose aucune valeur autre que 1,00 et ne déduit rien de l'élévation (genou, anneau D, overhead). Les positions d'élévation gardent leur rôle de géométrie, de dégagement et de règles SRL (V2_07).
- **Point à confirmer :** je laisse le champ éditable en OSHA, avec 1,00 par défaut. Si PIP veut qu'il soit verrouillé à 1,00 en OSHA, passer le champ en lecture seule dans ce mode.

## 2. MAD en saisie libre, en pouces ou en mètres
- La MAD (distance d'arrêt maximale) n'est **plus lue dans la fiche du SRL**. C'est un champ de saisie libre, **obligatoire**, placé dans la section dispositif de connexion.
- Sélecteur d'unité **propre au champ** : **in** ou **m**. L'équivalent dans l'autre unité s'affiche à côté, en lecture seule.
- Validation : strictement supérieure à 0. Avertissement non bloquant au-dessus de `MAD_WARN_M = 2,0 m`. Pas de valeur par défaut cachée. Un texte d'aide peut indiquer la valeur de référence 42 in (1,07 m) citée par le Z359.6 pour l'analyse statique, **en simple suggestion non appliquée**.
- Stockage en m. Le choix d'unité du champ est mémorisé avec le projet.
- La saisie met à jour en direct le dégagement de chute total (V2_05). Le rapport indique la MAD utilisée, avec les deux unités.
- Même champ pour la longe.

## 3. Arrest force en saisie libre, pour tout SRL ou longe
- Nouveau champ **Arrest force** (force d'arrêt d'**un** utilisateur), **obligatoire**, pour **tout dispositif** : SRL du catalogue, SRL personnalisé ou longe. Les clients utilisent de nombreux appareils, et même la famille TurboLite varie.
- Unité propre au champ : **lbf** ou **kN**, avec l'équivalent à côté. Stockage en kN.
- Validation : strictement supérieure à 0 et au plus 5 000 lbf. Au-dessus, erreur.
- Le catalogue peut **préremplir** ce champ (preset d'essai de l'appareil), toujours modifiable. Un appareil personnalisé démarre vide.
- La charge d'arrêt globale reste `arrest_load = M × F` (V2_04), avec **F = l'Arrest force saisie**. M dépend du nombre d'utilisateurs : 1,00 / 1,75 / 2,25 / 2,75 / 3,25 pour 1 à 5 (3,25 provisoire). La saisie directe de l'arrest load reste possible et remplace le produit, comme en V2_04.
- **Appareils personnalisés** : choix « SRL personnalisé » ou « Longe personnalisée », avec nom libre, classe (voir section 4) et longueur rétractée ou longueur de longe. Le nom saisi apparaît dans le rapport.
- Pour la longe, l'Arrest force est une **entrée de calcul**. Elle n'est **pas** affichée comme effort de longe dans les sorties ni dans le rapport (règle de V2_04 inchangée).

## 4. Catalogue SRL : renommage et classe
- **« Turbo Light 9 ft » devient « TurboLite+ Class 2 ».** Ce nom remplace l'ancien partout : catalogue, sélecteur, rapport, nomenclature, traductions, fichiers d'export.
- **« Turbo Lite » s'écrit « TurboLite »** (un seul mot, L et L majuscules) partout où le nom apparaît. Rechercher aussi les variantes « Turbo Lite », « Turbo-Lite », « Turbolite » dans le code et les données.
- **La classe 1 n'est pas déclarée** pour la famille TurboLite tant qu'elle n'a pas été testée. La fiche **TurboLite+ Class 2** ne propose que la classe 2 : pas de choix classe 1.
- Pour un SRL personnalisé, la classe est une saisie de l'utilisateur. La règle de V2_04 reste : classe 1 seulement si la ligne est à l'anneau D ou au-dessus, sinon erreur.
- **Identifiant interne stable** : l'`id` du SRL ne change pas, seul le libellé change. Les projets enregistrés affichent le nouveau nom sans migration de données.
- La fiche du SRL ne contient plus `MAD` ni `arrest_load_preset` imposés. Elle peut garder un preset de force d'arrêt qui préremplit la saisie (section 3).
- Le Falcon leading-edge n'est pas modifié par cette spec.

## Critères d'acceptation
1. Le texte « Coefficient de l'ingénieur » n'apparaît plus nulle part. Le champ s'appelle Fall Factor (EN) ou Facteur de chute (FR).
2. Un projet OSHA neuf a un Fall Factor à 1,00 et un seul jeu de résultats dans le rapport.
3. Avec un Fall Factor de 1,30, les efforts sont multipliés par 1,30, la flèche reste identique, et le rapport montre deux colonnes.
4. La MAD ne se remplit plus à partir du SRL. Saisir 42 in affiche 1,07 m, saisir 1,10 m affiche 43,3 in, et le dégagement total change immédiatement.
5. Valider un système sans MAD ou sans Arrest force est impossible. Un message indique le champ manquant.
6. Une Arrest force de 1 350 lbf devient 6,00 kN. Une valeur de 6 000 lbf est refusée.
7. Avec 3 utilisateurs et une Arrest force de 1 350 lbf, la charge d'arrêt globale est de 3 037,5 lbf.
8. Une recherche de « Turbo Light » et « Turbo Lite » dans l'interface, le rapport, la nomenclature et les traductions ne donne aucun résultat. « TurboLite+ Class 2 » apparaît à la place.
9. TurboLite+ Class 2 n'offre pas la classe 1. Un projet enregistré avec l'ancien nom s'ouvre avec le nouveau.
10. Un SRL ou une longe personnalisés avec nom, classe, MAD et Arrest force libres produisent un calcul et un rapport complets.
