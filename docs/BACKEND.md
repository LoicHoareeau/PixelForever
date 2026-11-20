# PixelForever · Back-end

État au 20 novembre 2026. Symfony et Doctrine gèrent l’inscription, l’authentification par session, les personnages et la sauvegarde de leur niveau/XP. Le combat jouable reste calculé dans le navigateur. Le serveur temps réel et la persistance du reste de la progression sont des travaux futurs.

## Modèle et parcours actuels

`User` conserve pseudo et e-mail uniques, avec mot de passe haché. `PlayerCharacter` appartient à un `User` et contient nom, classe (`CharacterClass`), niveau, expérience et or. Les deux seules entités Doctrine actuelles sont dans `src/Entity/`.

Après connexion, le joueur crée puis sélectionne son personnage. Symfony vérifie son propriétaire et conserve la sélection en session. Le bouton Jouer ouvre `CharacterController::play()` qui fournit à Twig les statistiques et le catalogue de butin, puis `world.js` initialise Phaser. Il n’y a pas encore de jeton WebSocket ni de serveur de monde partagé.

## Sauvegarde du niveau et de l’XP

`POST /personnages/{id}/progression` exige la session du propriétaire, un jeton CSRF et des valeurs entières bornées. Le niveau doit être compris entre 1 et 9 999 ; l’XP doit rester sous le seuil du niveau. Une mise à jour DQL conditionnelle atomique empêche une requête ancienne de faire régresser niveau/XP. L’entrée dans le jeu restaure ces valeurs depuis la base ; une progression locale plus avancée peut être envoyée ensuite.

La route ne valide pas encore chaque victoire : les valeurs restent proposées par le client. Sac, arme, coiffes, gants, allocations et quête restent dans `localStorage`, avec une clé propre au personnage. La base n’assure donc pas encore leur restauration sur un autre navigateur. Le champ or existe mais le marchand n’est pas intégré au jeu.

SQLite sert au développement local et aux tests ; PostgreSQL est utilisé pour la persistance Render. Les colonnes niveau/expérience existent déjà et leur sauvegarde ne demande pas de nouvelle migration. La configuration du moteur et les migrations existantes restent dans `config/` et `migrations/`.

## Règles métier et client

`src/Game/CharacterClass.php` fournit les cinq classes, leurs apparences, leurs ressources, les statistiques de départ et la portée. Les nouvelles classes utilisent la colonne texte existante de Doctrine. La hache équipée et les points de Dextérité et de Défense suivent la sauvegarde locale. `CharacterController` transmet les règles au client ; `progression.js` calcule l’auto-attaque selon l’arme. La baguette tire à distance, le bâton frappe au contact ; les sorts du Mage gardent leur portée. Les constantes de départ ne sont pas les valeurs finales d’un personnage ayant progressé.

Les dégâts périodiques, la canalisation et les familiers sont résolus côté navigateur. Le familier actif et sa cible sont temporaires. Les talents qui débloquent les invocations sont conservés dans la sauvegarde locale avec les autres talents. [Règles des classes](GAME_DESIGN.md#classes-et-attaques) · [Logique des techniques](../public/game/class-combat.js)

`src/Game/Character.php`, `Blob.php`, `Item.php` et `TrailQuest.php` conservent un prototype métier PHP historique (Blob, vente, objets simples). Ce modèle n’est pas le moteur exécuté par Phaser : son `EmberStaff` et sa table de butin ne doivent pas être pris pour le catalogue actuel du navigateur. Ne pas modifier ses anciennes règles sans vérifier ses tests et ses utilisateurs.

## Contrôles disponibles

```sh
composer test:accounts
node --test tests/*.test.mjs
php bin/console lint:twig templates
```

Le parcours PHP utilise une base temporaire : inscription, connexion, création/sélection, refus des accès à un personnage tiers, apparence et classe, catalogue, CSRF, validation des valeurs, sauvegardes anciennes et restauration du niveau/XP dans une nouvelle session. Les tests Node couvrent les règles réellement exécutées par le jeu. L’erreur 404 attendue lors du refus d’accès à un personnage tiers ne signifie pas que la suite échoue.

## Évolutions prévues

Pour un monde partagé, le serveur devra valider déplacement, portée, recharge, mana et état vivant, puis attribuer XP/butin/quête une seule fois par défaite et participant. Une transaction et un identifiant de défaite stable devront prévenir les doublons. Le client affichera l’état confirmé par le serveur.

Le futur catalogue persistant pourra ajouter définitions d’objets, entrées d’inventaire, emplacements d’équipement, définitions de monstres et de quêtes. La vente devra vérifier propriété, quantité, état équipé et proximité du marchand avant retrait de l’objet et crédit d’or dans une même transaction. Ces tables et fonctions ne sont pas encore implémentées.

Voir aussi [Front-end](FRONTEND.md) · [Game design](GAME_DESIGN.md) · [VFX](VFX.md) · [Déploiement](DEPLOIEMENT.md)
