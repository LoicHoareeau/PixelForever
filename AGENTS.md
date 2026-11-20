# Règles de contribution à PixelForever

Ces règles s’appliquent à toute modification du projet, y compris le code, les ressources de jeu et la documentation.

## 1. Créer une branche avant de modifier le projet

Vérifie la branche active et les changements locaux avec `git status --short --branch`. Pour chaque tâche, crée une branche dédiée à partir de `main` à jour. Si le travail dépend d’une autre branche, pars de cette branche et indique la dépendance. Garde les modifications locales déjà présentes et limite le futur commit aux fichiers de la tâche.

Choisis un nom qui indique la partie du projet et le changement prévu. Utilise des mots courts en minuscules, séparés par des tirets.

| Partie du projet | Exemple de branche |
| --- | --- |
| Combat | `combat/coup-de-bouclier` |
| Authentification | `back/connexion-compte` |
| Interface | `front/barre-experience` |
| Règles de jeu | `game-design/butin-squelettes` |
| Documentation | `docs/regles-contribution` |

## 2. Vérifier le travail avant le commit

Relis le diff et lance les vérifications pertinentes pour la tâche. Exécute la suite de tests existante liée au changement lorsqu’elle est disponible. Vérifie le parcours normal et les cas d’erreur qui pourraient casser un comportement existant.

- **Combat** · Vérifier une attaque réussie, une cible hors de portée, le temps de recharge et le mana insuffisant. Si la modification touche la défaite d’un monstre, vérifier qu’une nouvelle tentative ne crédite pas le butin ou l’XP une seconde fois.
- **Compte et personnages** · Vérifier la connexion, la création d’un personnage et le refus d’accès au personnage d’un autre compte.
- **Inventaire et commerce** · Vérifier l’équipement, la vente et le solde d’or après l’opération. Tester une vente invalide et vérifier que l’état reste correct.
- **Interface et temps réel** · Vérifier le parcours dans le navigateur. Si le changement touche une interaction du monde partagé, tester avec deux sessions. Pour les commandes, vérifier les touches AZERTY et QWERTY concernées.
- **Documentation** · Relire le texte, contrôler les liens et vérifier que les actions décrites correspondent au projet.

Corrige tout échec lié au changement et relance la vérification avant de publier. Si une vérification est bloquée, précise laquelle, pourquoi et ce qui a pu être vérifié.

## 3. Créer un commit et pousser la branche

1. Ajoute les fichiers de la tâche avec `git add -- <fichiers>`.
2. Contrôle le contenu indexé avec `git diff --cached --check` et `git diff --cached`.
3. Crée un commit dont le message indique ce qui change, par exemple `feat(combat): ajouter le coup de bouclier`.
4. Pousse la branche de travail avec `git push -u origin <branche>`. Pour les pushes suivants sur la même branche, utilise `git push`.
5. Vérifie que le push a réussi. Dans le compte rendu, indique la branche, le commit et les tests effectués.

Les changements passent par une branche dédiée. Ouvre une pull request vers `main` quand le travail doit être intégré.

## 4. Tenir les règles et la documentation cohérentes

Après un changement de comportement, actualise les documents concernés (`README.md`, `docs/GAME_DESIGN.md`, `docs/FRONTEND.md`, `docs/BACKEND.md` et `docs/DEPLOIEMENT.md`). Distingue l’état jouable des objectifs futurs. Ne prends pas les anciennes règles PHP du Blob pour le moteur Phaser actuel.

Pour le combat, vérifier la matrice d’équipement : baguette/Sceptre à distance, bâton au contact, sorts du Mage toujours à leur portée propre. Préserver les apparences et la marche des personnages. Un tir magique ne doit pas sélectionner une planche de frappe de mêlée. Inclure `tests/combat-animation.test.mjs` et `tests/weapons.test.mjs` dans les vérifications, avec les autres tests Node.

Inclure `tests/mage-spells.test.mjs` : tous les sorts offensifs du Mage, y compris Tourbillon de feu et Nova de givre, doivent viser à distance indépendamment de l’arme. Les zones du Mage sont centrées sur sa cible ; Taillade reste centrée sur le Guerrier. Sans cible vivante à portée, conserver mana et recharge.
