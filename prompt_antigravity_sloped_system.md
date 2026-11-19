# Spec — Extension "Sloped Lifeline System (Cônes)" pour le configurateur HOOKT

## Objectif
Ajouter au configurateur une nouvelle extension de calcul dédiée aux systèmes de ligne
de vie sur pente à cônes coulissants (ex: VectorPRO, connecteur "Nio" sur rail
"X-Cone"). **Le code existant de gestion des pentes ("toit incliné") doit être conservé
tel quel et n'est pas modifié.** Cette extension est un module additionnel, séparé,
qui vient compléter le configurateur sans toucher au code de pente actuel — ni ses
fonctions, ni ses structures de données, ni son écran de calcul. Si un point d'intégration
avec le code de pente existant s'avère nécessaire (ex: réutiliser une fonction d'angle
déjà en place), il doit se faire par appel/extension, jamais par modification du code
en place.

## Paramètres à extraire (liste limitée — ne pas ajouter d'autres champs pour l'instant)

1. **LC1 / LC2** — tension du câble mesurée en haut et en bas du système (kN),
   capteurs de charge d'extrémité.
2. **Angle Initial** — angle de pente en degrés, consigne avant essai.
3. **Angle Final** — angle de pente en degrés, mesuré après l'essai (déplacement
   angulaire du système sous charge).
4. **Glissement du/des cône(s)** — distance de glissement (mm) de chaque cône
   intermédiaire impacté pendant l'essai.

## Modèle de données — un enregistrement de test

Le nombre de cônes n'est **pas fixé à 3** : l'essai de référence a été réalisé avec
3 X-Cone, mais un système réel peut en comporter un nombre différent. La structure de
données doit donc représenter les cônes comme une **liste de taille variable** (0 à N),
et non comme des champs fixes cone_1/cone_2/cone_3.

```json
{
  "test_id": "VP1.1",
  "scenario": "Sliding | Free Fall",
  "initial_angle_deg": 15,
  "final_angle_deg": 37.95,
  "load_cell_top_kn": 1.861,
  "load_cell_bottom_kn": 1.408,
  "cones": [
    { "index": 1, "impacted": true, "slip_mm": 1 }
  ],
  "repetition_of": null
}
```

Le tableau `cones` ne contient que les cônes réellement présents sur le système testé
(par exemple 1, 2, 5 ou davantage selon la configuration) ; les cônes non impactés
peuvent être omis ou inclus avec `"impacted": false, "slip_mm": null`, au choix de
l'implémentation, du moment que le nombre d'entrées reste dynamique et non plafonné.

## Fonctionnalités attendues du module

1. **Import** : parser le fichier Excel `TEST MATRIX - Sloped System` et en extraire,
   pour chaque ligne, uniquement les 4 paramètres ci-dessus (colonnes K = Initial
   Angle, AU = Final Angle, AV/AW = Load Cell Top/Bottom, AJ/AN/AR... = Cone Slip N —
   la source actuelle a 3 colonnes de glissement de cône, à lire toutes et à mapper
   dans la liste `cones` plutôt que dans des champs fixes).
2. **Regroupement des répétitions** : s'appuyer sur la colonne `Repetition` (YES/NO)
   de la source pour regrouper les essais d'une même configuration (angle + scénario),
   comme pour les autres feuilles du configurateur.
3. **Sortie note de calcul** : pour chaque configuration, afficher LC1, LC2, Angle
   Initial, Angle Final et le glissement de chaque cône présent, essai par essai,
   plus une valeur retenue (maximum) par paramètre pour le dimensionnement.
4. **Extensibilité du nombre de cônes** : l'écran/rapport doit s'adapter
   automatiquement si un système testé comporte plus ou moins de cônes que l'essai de
   référence (ne pas coder en dur "jusqu'à 3 cônes").

## Notes d'implémentation
- Les cellules `"N/A"` dans la source doivent être interprétées comme `null`.
- Ce module est indépendant du code de pente existant : pas de renommage, pas de
  refactor, pas de suppression de fonctions déjà en place pour le "toit incliné".


## Données d'essais réelles (42 lignes — source: TEST MATRIX - Sloped System)

Ces données sont directement utilisables pour développer et tester le module, sans
besoin d'importer le fichier Excel source.

| Test ID | Scénario | Répétition | Masse | Angle Init (°) | Angle Final (°) | LC1 Top (kN) | LC2 Bottom (kN) | Cône 1 Slip (mm) | Cône 2 Slip (mm) | Cône 3 Slip (mm) |
|---|---|---|---|---|---|---|---|---|---|---|
| VP1.1 | Sliding | NO | 50kg | 15 | 37.95 | 1.861 | 1.408 | 1 | N/A | N/A |
| VP1.2 | Sliding | YES | 50kg | 15 | 31.4 | 1.883 | 1.102 | 1 | N/A | N/A |
| VP1.3 | Sliding | NO | 141kg | 15 | 53.25 | 4.859 | 2.553 | 7.32 | N/A | N/A |
| VP1.4 | Sliding | YES | 141kg | 15 | 52.4 | 5.324 | 2.237 | 1 | N/A | N/A |
| VP1.5 | Free Fall | NO | 50kg | 15 | 38.25 | 2.418 | 1.599 | 1 | N/A | N/A |
| VP1.6 | Free Fall | YES | 50kg | 15 | 38.85 | 2.162 | 1.825 | 1 | N/A | N/A |
| VP1.7 | Free Fall | NO | 141kg | 15 | 62.35 | 3.886 | 1.955 | 1 | N/A | N/A |
| VP1.8 | Free Fall | YES | 141kg | 15 | 59.9 | 4.433 | 2.529 | 1 | N/A | N/A |
| VP2.1 | Sliding | NO | 50kg | 30 | 42.7 | 4.038 | 2.424 | 1 | N/A | N/A |
| VP2.2 | Sliding | YES | 50kg | 30 | 41.75 | 4.201 | 2.19 | 1 | N/A | N/A |
| VP2.3 | Sliding | NO | 141kg | 30 | 54.15 | N/A | 3.206 | 1 | N/A | N/A |
| VP2.4 | Sliding | YES | 141kg | 30 | 62.1 | 5.63 | 1.751 | 1 | N/A | N/A |
| VP2.5 | Free Fall | NO | 50kg | 30 | 42.6 | 3.298 | 2.812 | 1 | N/A | N/A |
| VP2.6 | Free Fall | YES | 50kg | 30 | 42.2 | 3.976 | 3.034 | 1 | N/A | N/A |
| VP2.7 | Free Fall | NO | 141kg | 30 | 53.3 | 7.074 | 2.641 | 1 | N/A | N/A |
| VP2.8 | Free Fall | YES | 141kg | 30 | 54.16 | 6.307 | 3.76 | 1 | N/A | N/A |
| VP3.1 | Sliding | NO | 50kg | 45 | 54.3 | 3.704 | 1.591 | 1 | N/A | N/A |
| VP3.2 | Sliding | YES | 50kg | 45 | 55.1 | 3.646 | 1.523 | 2 | N/A | N/A |
| VP3.3 | Sliding | NO | 141kg | 45 | 60.95 | 9.931 | 4.451 | 2 | N/A | N/A |
| VP3.4 | Sliding | YES | 141kg | 45 | 66.95 | 9.232 | 6.856 | 1 | N/A | N/A |
| VP3.5 | Free Fall | NO | 50kg | 45 | 57.8 | 4.133 | 3.147 | 1 | N/A | N/A |
| VP3.6 | Free Fall | YES | 50kg | 45 | 56.9 | 3.411 | 2.599 | 1 | N/A | N/A |
| VP3.7 | Free Fall | NO | 141kg | 45 | 57.95 | 12.323 | 5.084 | 1.67 | N/A | N/A |
| VP3.8 | Free Fall | YES | 141kg | 45 | 58.95 | 11.265 | 5.431 | 3.48 | N/A | N/A |
| VP4.1 | Sliding | NO | 50kg | 60 | 69.8 | 6.039 | 3.135 | 1 | N/A | N/A |
| VP4.2 | Sliding | YES | 50kg | 60 | 72.7 | 5.874 | 2.893 | 1 | N/A | N/A |
| VP4.3 | Sliding | NO | 141kg | 60 | 78.05 | 10.54 | 3.013 | 2.62 | N/A | N/A |
| VP4.4 | Sliding | YES | 141kg | 60 | 79.8 | 9.48 | 3.114 | 3.99 | N/A | N/A |
| VP4.5 | Free Fall | NO | 50kg | 60 | 80.15 | 4.573 | - | 39.67 | - | - |
| VP5.5 | Free Fall | NO | 50kg | 75 | 81.6 | 5.896 | 1.508 | 30.05 | N/A | N/A |
| VP5.6 | Free Fall | YES | 50kg | 75 | 81.4 | 6.519 | 1.687 | 13.78 | N/A | N/A |
| VP5.7 | Free Fall | NO | 141kg | 75 | 84.2 | 10.195 | 2.226 | 140.6 | N/A | N/A |
| VP5.8 | Free Fall | YES | 141kg | 75 | 82.4 | 13.269 | 1.265 | 19.85 | N/A | N/A |
| VP5.1 | Sliding | NO | 50kg | 75 | 82.3 | 9.687 | 4.218 | 1 | N/A | N/A |
| VP5.2 | Sliding | YES | 50kg | 75 | 86.2 | 8.91 | 3.344 | 1 | N/A | N/A |
| VP5.3 | Sliding | NO | 141kg | 75 | 88.25 | 12.016 | 3.386 | 51.12 | N/A | N/A |
| VP5.4 | Sliding | YES | 141kg | 75 | 84.55 | 14.571 | 3.763 | 35.19 | N/A | N/A |
| Extra | Free Fall | YES | 141kg | 75 | 82.7 | 7.289 | 2.168 | 1 | N/A | N/A |
| VP4.6 | Free Fall | YES | 50kg | 60 | 73.9 | 7.211 | 3.171 | 1 | N/A | N/A |
| VP4.7 | Free Fall | NO | 141kg | 60 | 78.95 | 11.752 | 3.088 | 28.95 | N/A | N/A |
| VP4.8 | Free Fall | YES | 141kg | 60 | 82.05 | 14.108 | 3.677 | 37.1 | N/A | N/A |
| Extra | Free Fall | YES | 50kg | 60 | 61.6 | 7.39 | 3.1 | 1 | N/A | N/A |
