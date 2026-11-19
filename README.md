# PixelForever

PixelForever est un projet de **MMORPG en pixel art** conçu pour être joué dans un navigateur. Inspiré par l’exploration et les quêtes de *World of Warcraft*, il vise à créer un monde partagé où les joueurs peuvent se croiser, explorer et combattre ensemble en temps réel. Le serveur est prévu en **PHP avec Symfony**.

Le projet est au stade de la conception. Ce README présente le périmètre prévu pour la première version jouable.

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

Les **flèches directionnelles** (`↑`, `↓`, `←`, `→`) déplacent le personnage. La barre d’actions utilise les six premières touches de la rangée supérieure. L’interface peut les afficher sous les noms `1` à `6`, et les mêmes positions fonctionnent sur un clavier AZERTY ou QWERTY.

| QWERTY | AZERTY français | Action |
| --- | --- | --- |
| `1` | `&` | Attaque de base |
| `2` | `é` | Compétence de classe |
| `3` | `"` | Potion de vie |
| `4` | `'` | Potion de mana |
| `5` | `(` | Emplacement libre dans le prototype |
| `6` | `-` | Emplacement libre dans le prototype |

Le client repère ces touches par leur position physique (`Digit1` à `Digit6`) afin que les raccourcis fonctionnent sans appuyer sur Maj sur un clavier AZERTY.

## Architecture prévue

| Composant | Rôle |
| --- | --- |
| Symfony et PHP | Gérer les comptes, les personnages, le journal de quêtes, l’inventaire et les ventes. |
| Serveur de jeu PHP et WebSocket | Synchroniser les joueurs et les monstres, valider les déplacements et les attaques, puis attribuer le butin et la progression des quêtes. |
| JavaScript et Canvas 2D | Afficher la carte et les sprites, animer le monde et transmettre les commandes du joueur. |
| Base de données relationnelle | Conserver les comptes, les personnages, leurs objets, leur or et leur progression. |

## Objectif de démonstration

Deux joueurs se connectent avec un Mage et un Guerrier, se retrouvent dans le hameau et acceptent la quête. Ils explorent la carte et battent trois Blobs ensemble. Chacun peut consulter sa progression et récupérer son propre butin. Dès qu’une arme tombe, son propriétaire peut l’équiper ou la revendre au marchand. Une reconnexion permet de vérifier la sauvegarde de l’inventaire, de l’or et du journal de quêtes.
