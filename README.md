# PixelForever

PixelForever est un projet de **MMORPG en pixel art** conçu pour être joué dans un navigateur. Inspiré par l’exploration et les quêtes de *World of Warcraft*, il vise à créer un monde partagé où les joueurs peuvent se croiser, explorer et combattre ensemble en temps réel. Le serveur est prévu en **PHP avec Symfony**.

Les premières règles métier sont implémentées en PHP dans `src/Game/`. Ce README présente aussi le périmètre prévu pour la première version jouable.

## Lancer le parcours de compte en local

Le parcours local requiert PHP 8.2 ou ultérieur, Composer et l’extension PHP `pdo_sqlite`. Sous Windows, active `extension=pdo_sqlite` dans le fichier indiqué par `php --ini`.

```sh
composer install
php bin/console doctrine:migrations:migrate --no-interaction
php -S 127.0.0.1:8000 -t public
```

Ouvre [PixelForever](http://127.0.0.1:8000), crée un compte puis connecte-toi pour créer et sélectionner un Guerrier ou un Mage. Les comptes et les personnages sont sauvegardés dans `var/pixelforever.sqlite`. Le monde partagé et le combat dans le navigateur restent à intégrer.

En production, définis la variable d’environnement `APP_SECRET` avec une valeur aléatoire propre au déploiement.

## Tester le parcours de compte

Avec les extensions PHP `dom` et `pdo_sqlite` activées, lance `php tests/account_flow.php`. Le test applique les migrations sur une base SQLite temporaire et vérifie l’inscription, la connexion et la gestion des personnages pour deux comptes.

## Règles métier du prototype

| Classe | PV max. | Mana max. | Attaque de base | Compétence | Portée |
| --- | --- | --- | --- | --- | --- |
| Guerrier | 60 | 20 | 10 dégâts | 18 dégâts | 1,5 tuile |
| Mage | 40 | 40 | 8 dégâts | 22 dégâts | 5 tuiles |

Les attaques du joueur sont espacées d’au moins 500 ms et chaque compétence coûte 10 points de mana. Le Blob a 36 PV et inflige 8 dégâts à une tuile de distance. Une arme équipée ajoute 4 dégâts à l’attaque de base.

Chaque personnage commence avec 0 or. Un coup réussi contre un Blob donne droit à un tirage au moment de sa défaite. Le tirage donne une potion de vie (45 %), une potion de mana (30 %) ou l’arme de la classe du personnage (25 %). Le prototype crédite directement le butin dans l’inventaire. Les potions restaurent 20 PV ou 15 points de mana, dans la limite du maximum du personnage.

Chaque arme se revend 10 pièces d’or après avoir été déséquipée. Une copie supplémentaire peut être vendue pendant que le personnage garde son arme équipée. Le jeu compte les Blobs vaincus à partir de l’acceptation de la quête, et sa récompense est attribuée une seule fois.

## Première version jouable

Le joueur crée un personnage et choisit entre deux classes. Il arrive dans un hameau relié à une forêt et à des ruines. Les combats se déroulent sur cette même carte, au fil de l’exploration.

| Classe | Style de combat | Compétence | Arme à trouver |
| --- | --- | --- | --- |
| Guerrier | Corps à corps, avec davantage de points de vie | Frappe lourde | Épée de fer |
| Mage | Attaques à distance avec des projectiles | Boule de feu | Bâton de braise |

Le **Blob** est le premier type de monstre. Il poursuit les joueurs à proximité, marque une courte pause avant d’attaquer et réapparaît après sa défaite. Plusieurs joueurs peuvent participer au même combat.

### Butin, inventaire et or

- Chaque joueur qui participe à la défaite d’un Blob reçoit son propre tirage de butin. Il peut obtenir une potion de vie, une potion de mana ou une arme de sa classe.
- Les potions sont utilisables par les deux classes. Un personnage peut équiper une seule arme à la fois.
- Un marchand du hameau rachète les équipements obtenus sur les monstres. Chaque équipement a un prix de revente fixe. La vente retire l’objet de l’inventaire et ajoute sa valeur au solde d’or du personnage.
- L’équipement, l’inventaire et le solde d’or sont sauvegardés pour chaque personnage.

### Quêtes

La garde du hameau propose **Sécuriser le sentier**. Après avoir accepté la quête, le joueur doit participer à la défaite de trois Blobs. Son journal affiche la progression, puis lui indique de retourner voir la garde. Une fois la quête rendue, il reçoit une potion de vie et une potion de mana. Les joueurs qui combattent ensemble progressent chacun dans leur propre journal s’ils ont accepté la quête.

## Commandes

Les déplacements utilisent **ZQSD en AZERTY** ou **WASD en QWERTY**. Les touches `1` à `6` de la rangée supérieure servent à l’attaque de base, aux sorts et aux potions. Le joueur peut modifier ses raccourcis dans les options du jeu, y compris choisir les flèches pour se déplacer. L’attaque de base ne consomme ni mana ni énergie.

Le [document front-end](docs/FRONTEND.md#commandes-par-défaut) détaille les raccourcis. Le [game design](docs/GAME_DESIGN.md#animations-à-produire) décrit les animations d’attaque et de sort prévues.

## Architecture prévue

| Composant | Rôle |
| --- | --- |
| Symfony et PHP | Gérer les comptes, les personnages, le journal de quêtes, l’inventaire et les ventes. |
| Serveur de jeu PHP et WebSocket | Synchroniser les joueurs et les monstres, valider les déplacements et les attaques, puis attribuer le butin et la progression des quêtes. |
| JavaScript et Canvas 2D | Afficher la carte et les sprites, animer le monde et transmettre les commandes du joueur. |
| Base de données relationnelle | Conserver les comptes, les personnages, leurs objets, leur or et leur progression. |

## Objectif de démonstration

Deux joueurs se connectent avec un Mage et un Guerrier, se retrouvent dans le hameau et acceptent la quête. Ils explorent la carte et battent trois Blobs ensemble. Chacun peut consulter sa progression et récupérer son propre butin. Dès qu’une arme tombe, son propriétaire peut l’équiper ou la revendre au marchand. Une reconnexion permet de vérifier la sauvegarde de l’inventaire, de l’or et du journal de quêtes.
