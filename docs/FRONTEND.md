# PixelForever · Front-end

PixelForever se joue dans un navigateur. Le premier parcours va de l’inscription à l’exploration d’une carte pixel art. Les écrans de compte et de personnage utilisent Twig. Phaser affiche la carte et les sprites dans un canvas, avec une interface HTML pour les formulaires, les panneaux et les commandes.

Dans **Mes personnages**, le bouton **Jouer** envoie la sélection à Symfony. Symfony vérifie que le personnage appartient au compte connecté, puis ouvre la clairière de Braise. Cette première scène permet d’explorer le hameau et ses sentiers en solo, avec les flèches, ZQSD, WASD ou les boutons de direction. Phaser 3.90.0 et sa licence sont servis depuis `public/game/`.

## Écrans

| Écran | Actions principales |
| --- | --- |
| Inscription | Renseigner un pseudo, un e-mail et un mot de passe. Afficher les erreurs près du champ concerné. |
| Connexion | Se connecter avec son e-mail et son mot de passe. |
| Personnages | Voir les personnages du compte et leur niveau, sélectionner celui à jouer ou en créer un. |
| Création | Choisir Guerrier ou Mage, voir leur style de combat et saisir le nom du personnage. |
| Monde | Explorer, sélectionner une cible, lancer des sorts, consulter l’inventaire et les quêtes, parler aux PNJ et vendre de l’équipement. |

## Interface de jeu

- **En haut à gauche**, afficher le nom du personnage, son niveau et ses barres de vie et de mana. Afficher la cible et ses PV quand elle est sélectionnée.
- **En bas**, afficher la barre d’XP et six emplacements d’action. Chaque emplacement indique son raccourci, son temps de recharge et la raison d’une indisponibilité, par exemple « Requiert un bouclier ».
- **Dans l’inventaire**, afficher les équipements portés, les objets possédés et le solde d’or. La fiche d’un objet montre son nom, sa rareté en toutes lettres, sa classe requise et son prix de revente, le cas échéant.
- **Chez le marchand**, indiquer l’objet et le montant de la vente. Actualiser l’inventaire et l’or après confirmation du serveur.
- **Dans le journal**, afficher l’objectif, la progression et le PNJ à retrouver quand la quête peut être rendue.

Le monde donne le ton visuel. Le hameau se reconnaît à ses lumières chaudes, la forêt à ses verts et les ruines à leurs pierres froides. Les panneaux utilisent un fond sombre et des libellés lisibles. La couleur des raretés accompagne un libellé. Les éléments interactifs gardent un focus clavier visible et les effets d’interface respectent la préférence de réduction des animations.

## Commandes par défaut

| Action | AZERTY français | QWERTY |
| --- | --- | --- |
| Monter, aller à gauche, descendre, aller à droite | `Z` `Q` `S` `D` | `W` `A` `S` `D` |
| Sélectionner une cible ou interagir avec un PNJ à portée | Clic principal | Clic principal |
| Attaque de base, sans coût en mana ni en énergie | `&` | `1` |
| Premier sort du profil d’arme | `é` | `2` |
| Deuxième sort | `"` | `3` |
| Troisième sort | `'` | `4` |
| Potion de vie | `(` | `5` |
| Potion de mana | `-` | `6` |

Dans **Options → Commandes**, le joueur peut réaffecter chaque direction et chaque touche d’action. Il peut aussi choisir les flèches pour se déplacer. Le menu affiche la touche affectée, signale les conflits entre actions et permet de restaurer les valeurs par défaut. La barre d’actions affiche les nouveaux raccourcis dès leur modification. Le navigateur conserve les réglages entre deux visites.

Le client associe des actions nommées aux positions physiques des touches via `KeyboardEvent.code`. Les déplacements utilisent les touches maintenues. Une pression sur une touche d’action déclenche une demande, sans répétition automatique du clavier. Les raccourcis de jeu sont suspendus pendant la saisie ou la modification d’une touche. Les sorts de zone peuvent demander un clic sur le sol après activation.

## Animations de combat

- Animer le personnage dans sa direction de combat pour chaque attaque de base et chaque sort. Utiliser le geste propre à l’arme équipée. Les différentes animations à produire figurent dans le [game design](GAME_DESIGN.md#animations-à-produire).
- Donner un retour visible à chaque étape utile au joueur, comme la préparation d’un coup chargé, le départ d’un projectile, l’impact d’une attaque ou la durée restante d’un effet au sol.
- Afficher les animations des autres joueurs à partir des événements de combat du serveur. Le serveur confirme les impacts et les dégâts. Les sprites et les effets les représentent à l’écran.

## État du client et connexion

Le client charge la carte et les sprites, envoie les commandes et interpole les déplacements entre deux mises à jour du serveur. Le HUD affiche les valeurs confirmées par le serveur pour l’XP, l’or et l’inventaire. Si la connexion est interrompue, l’interface indique la reconnexion en cours, suspend les actions et recharge l’état confirmé après reconnexion.

La première démonstration doit permettre à deux joueurs de se voir dans le hameau, de se déplacer sur la même carte, de combattre le même monstre et de voir chacun son butin et sa progression.

Voir aussi le [back-end](BACKEND.md) et le [game design](GAME_DESIGN.md).
