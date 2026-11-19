# Spec V2 — 01 : Contrôle d'accès à l'outil

## Objectif
Seuls les utilisateurs **approuvés par PIP** peuvent utiliser l'outil. Les administrateurs
PIP ajoutent ou retirent les accès. Les installateurs reçoivent un accès après un
engagement commercial. L'outil est co-développé : il ne doit pas être accessible aux
distributeurs ni aux utilisateurs finaux qui concevraient leurs propres systèmes.

## Proposition d'architecture (à valider lors de l'appel de milieu de semaine)

**Principe : inscription sur invitation uniquement. Pas de création de compte ouverte.**

1. **Liste d'accès (allow-list)** tenue par les administrateurs PIP : une adresse e-mail
   par utilisateur, avec rôle, statut et date d'expiration optionnelle.
2. **Invitation** : l'administrateur ajoute une adresse e-mail. L'utilisateur reçoit un
   lien d'activation à usage unique, valable 7 jours, pour choisir son mot de passe.
3. **Connexion** : e-mail et mot de passe, avec vérification de l'e-mail à l'activation.
   Option recommandée : second facteur (code par e-mail ou application
   d'authentification). Un SSO d'entreprise pourra être ajouté plus tard.
4. **Retrait** : l'administrateur suspend ou supprime un utilisateur. L'accès est coupé
   immédiatement, y compris pour les sessions ouvertes.

## Rôles
| Rôle | Droits |
|---|---|
| `admin` (PIP) | Gérer la liste d'accès, voir le journal d'audit, utiliser l'outil |
| `installer` | Utiliser l'outil, voir uniquement ses propres projets |
| `suspended` | Aucun accès |

## Données utilisateur
`id`, `email`, `nom`, `société`, `rôle`, `statut` (invité, actif, suspendu),
`date_invitation`, `date_dernière_connexion`, `expiration_accès` (optionnelle),
`invité_par`.

## Exigences
- **Contrôle côté serveur** pour chaque appel : écrans, moteur de calcul, génération PDF,
  projets sauvegardés. Masquer des boutons dans l'interface ne suffit pas.
- Le moteur de calcul et la logique de conception ne sont **pas exposés** dans le code
  envoyé au navigateur quand c'est possible (calcul côté serveur).
- **Page d'administration** (rôle `admin`) : inviter, voir la liste, suspendre,
  supprimer, définir une expiration, renvoyer une invitation.
- **Journal d'audit** : connexion, échec de connexion, ajout, retrait, génération de
  rapport (qui, quand).
- **Rapport PDF** : y inscrire le nom de l'utilisateur et la date de génération.
- Sécurité de base : mots de passe hachés, limitation du nombre d'essais de connexion,
  expiration des sessions après inactivité, HTTPS uniquement.
- Les projets d'un installateur ne sont visibles ni des autres installateurs, ni du
  public. Les administrateurs peuvent les consulter.
- Page de connexion sans lien « créer un compte ». Message générique pour un compte
  inconnu (« Accès réservé aux utilisateurs approuvés »), sans indiquer si l'e-mail existe.

## Critères d'acceptation
1. Une adresse e-mail absente de la liste ne peut ni créer de compte ni se connecter.
2. Un utilisateur invité active son compte via le lien. Le lien ne marche qu'une fois et
   expire après 7 jours.
3. Un utilisateur suspendu par un administrateur perd l'accès immédiatement, même avec
   une session ouverte.
4. Un appel direct au moteur de calcul ou au PDF sans session valide est refusé.
5. Le journal d'audit enregistre chaque ajout, retrait et génération de rapport.
6. Un installateur ne voit pas les projets d'un autre installateur.
