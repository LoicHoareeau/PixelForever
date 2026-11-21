# PixelForever · Back-end

État au 21 novembre 2026. Symfony et Doctrine gèrent l’inscription, l’authentification par session, les personnages et la sauvegarde de leur niveau/XP. Le combat jouable reste calculé dans le navigateur. La présence est stockée en base ; les combats partagés et la persistance du reste de la progression sont des travaux futurs.

## Modèle et parcours actuels

Les planches d’arc et de dagues et les poses du Démoniste sont des ressources front-end versionnées. Le Démoniste affiche Essence de cendres, Sceau des saules et Sceau de Saphyr comme focalisations d’ombre. L’ancien identifiant interne `Item::Grimoire` reste compatible avec les données existantes ; aucun grimoire n’est affiché. Les bonus, prix, sauvegardes et portées sont conservés, sans migration.

Le familier apprivoisé (`capturedPet`, espèce et fraction de PV) est encore sauvegardé localement par personnage. Le lot familiers ne persiste pas encore les captures en base. La validation locale d’un propriétaire d’engagement prépare ce cas, sans constituer une garantie multijoueur côté serveur.

`CharacterController` transmet les portées et les six caractéristiques définies par `CharacterClass`. Le drapeau `ranged` dépend explicitement de la classe (Mage, Démoniste, Chasseur), car une portée de mêlée de 2,5 cases dépasse désormais l’ancien seuil de 1,5. Le choix Rempart/Berserker et le reste du profil restent locaux au navigateur ; seuls le niveau et l’XP sont persistés en base pour ce lot.

`User` conserve pseudo et e-mail uniques, avec mot de passe haché. `PlayerCharacter` appartient à un `User` et contient nom, classe (`CharacterClass`), niveau, expérience et or. Les deux seules entités Doctrine actuelles sont dans `src/Entity/`.

`GET /` affiche l’accueil. Un visiteur peut s’inscrire ou se connecter ; un joueur déjà connecté peut rejoindre ses personnages directement. Après connexion, le joueur crée puis sélectionne son personnage. Symfony vérifie son propriétaire et conserve la sélection en session. Le bouton **Jouer** sélectionne le personnage et redirige vers `CharacterController::play()` qui fournit à Twig les statistiques et le catalogue de butin, puis `world.js` initialise Phaser. La présence utilise une route Symfony JSON, sans serveur WebSocket.

## Sauvegarde du niveau et de l’XP

`POST /personnages/{id}/progression` exige la session du propriétaire, un jeton CSRF et des valeurs entières bornées. Le niveau doit être compris entre 1 et 9 999 ; l’XP doit rester sous le seuil du niveau. Une mise à jour DQL conditionnelle atomique empêche une requête ancienne de faire régresser niveau/XP. L’entrée dans le jeu restaure ces valeurs depuis la base ; une progression locale plus avancée peut être envoyée ensuite.

La route ne valide pas encore chaque victoire : les valeurs restent proposées par le client. Sac, arme, coiffes, gants, allocations et quête restent dans `localStorage`, avec une clé propre au personnage. La base n’assure donc pas encore leur restauration sur un autre navigateur. Le champ or existe mais le marchand n’est pas intégré au jeu.

SQLite sert au développement local et aux tests ; PostgreSQL est utilisé pour la persistance Render. La migration `Version20261120090000` convertit l’XP proportionnellement et ajoute `world_presence` ; les niveaux restent inchangés. La configuration du moteur et les migrations existantes restent dans `config/` et `migrations/`.

## Règles métier et client

`src/Game/CharacterClass.php` fournit les cinq classes, leurs apparences, leurs ressources et leurs valeurs de départ. Les nouvelles classes utilisent la colonne texte existante de Doctrine. La hache équipée et les points de Dextérité et de Défense suivent la sauvegarde locale. `CharacterController` transmet la portée de base (`range`), la portée de sort (`specialRange`) et le multiplicateur de dégâts de baguette (`wandDamageMultiplier`). `progression.js` calcule l’auto-attaque selon l’arme et la progression. `combat.js` applique la portée des sorts du Mage indépendamment de l’arme équipée.

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

## Présence multijoueur

`POST /personnages/{id}/monde` exige propriétaire et CSRF. Corps limité à 2 048 octets, coordonnées finies bornées, orientation et poses contrôlées. Les poses/positions sont déclaratives et ne déclenchent aucun combat. Le serveur fournit nom/classe/niveau depuis le personnage en base, sans compte, sac ou jeton dans les réponses. Bail exclusif par personnage pendant 12 s, requêtes trop rapprochées refusées (429), conflit de bail (409), expiration automatique et retrait à la fermeture. La transaction verrouille la ligne sur PostgreSQL. Les voisins à 800 px sont renvoyés avec une limite de 100. Cette première table devra être partitionnée avant plusieurs centaines de connexions.

La version XP 2 est obligatoire sur `/progression` ; l’ancien client reçoit 409 et doit être rechargé. Le combat restant calculé côté navigateur, ce lot ne garantit pas l’authenticité des victoires ni des récompenses. L’autorité serveur, le profil complet et le partage des monstres restent à implémenter. Tests : `php tests/account_flow.php` inclut deux comptes qui se voient, l’isolation des personnages, CSRF, poses invalides, bail concurrent, expiration et départ. `php tests/xp_migration.php` vérifie 21 conversions et leur retour.

La Trappe d’apprivoisement du Chasseur est une compétence de départ du moteur navigateur. Elle ne change ni les entités ni les API ; aucune migration supplémentaire. Comme les autres contrôles actuels, elle ne constitue pas une action validée par serveur.
