# PixelForever · Front-end

PixelForever se joue dans un navigateur. Le premier parcours va de l’inscription à l’exploration d’une carte pixel art. Les écrans de compte et de personnage utilisent Twig. Phaser affiche la carte et les sprites dans un canvas, avec une interface HTML pour les formulaires, les panneaux et les commandes.

Dans **Mes personnages**, le bouton **Jouer** envoie la sélection à Symfony. Symfony vérifie que le personnage appartient au compte connecté, puis ouvre **Val-des-Saules**. Le joueur se déplace avec les flèches, ZQSD, WASD ou les boutons de direction. L’eau et les bords de la carte bloquent le déplacement.

Phaser 3.90.0 charge les tuiles et les sprites des exports PixelLab depuis `public/game/val-des-saules/`. La carte de 84 × 60 tuiles conserve la clairière originale et prolonge son chemin jusqu’au cimetière, puis aux montagnes. La caméra suit le personnage et reste dans les limites du monde. Le zoom entier vaut normalement ×2 sur ordinateur et ×1 sur un petit écran ; il augmente seulement si nécessaire pour couvrir un très grand écran. L’ATH reste fixe. La cabane, les saules, les tombes et les rochers sont dessinés sur la même grille de pixels que le terrain. Les planches `lina/walk.png` et `noe/walk.png` reprennent les cycles `Marche` des exports PixelLab, avec huit images par direction. La distance parcourue cadence les images.

Des falaises rocheuses irrégulières de deux à trois cases bordent le monde. Elles bloquent les déplacements ; les chemins entre les trois zones restent ouverts.

Les sangliers de niveau 1–2 patrouillent au plus près du départ. Leurs congénères de niveau 2–4 puis 4–5 ont des patrouilles plus éloignées. Les squelettes de niveau 5–10 occupent le cimetière et Saphyr de niveau 10–20 reste dans les montagnes. Patrouilles, poursuites et réapparitions sont limitées à la zone de chaque espèce. Quitter la zone met fin à la poursuite.

Les monstres proches engagent le joueur et répètent une auto-attaque ciblée à leur propre cadence : coup au contact pour sangliers et squelettes, projectile pour le dragon. Une courte préparation précède l’impact. Portée, obstacles, étourdissement, mort et sortie de zone empêchent un impact invalide. Les attaques des monstres ne dessinent plus de cercle de dégâts.

La difficulté augmente avec les PV, les dégâts et la cadence. Pour les sangliers, les niveaux 1 et 2 donnent respectivement 52 PV / 6 dégâts et 74 PV / 8 dégâts ; le niveau 5 atteint 236 PV / 26 dégâts. Les squelettes passent de 260 PV / 26 dégâts au niveau 5 à 610 PV / 56 dégâts au niveau 10. Les dragons passent de 800 PV / 60 dégâts au niveau 10 à 2 500 PV / 160 dégâts au niveau 20. La réduction de dégâts du personnage continue de s’appliquer.

Les tests `node --test tests/exploration.test.mjs tests/progression.test.mjs` vérifient les chemins entre zones avec leurs obstacles, les falaises infranchissables, le zoom, les patrouilles/réapparitions/poursuites, la cadence des auto-attaques, leurs interruptions et la progression de difficulté, ainsi que la progression du personnage et les talents.

L’ATH affiche la vie, l’XP et l’énergie du Guerrier ou le mana du Mage, avec leur régénération automatique par seconde. Le Guerrier frappe en mêlée jusqu’à 1,5 case. Les attaques du Mage portent jusqu’à 5 cases. La barre du bas donne accès aux attaques (`1` et `2`), aux potions (`3` et `4`), à la fiche de personnage et de caractéristiques (`C`) et au sac (`I`).

Une victoire donne 50 XP et un objet tiré au sort. Les chances sont de 50 % pour une potion de vie, 30 % pour une potion de ressource, 15 % pour l’arme rare et 5 % pour l’arme épique. Le niveau 2 demande 100 XP, puis chaque niveau suivant demande 50 XP de plus. À chaque montée de niveau, les caractéristiques (Force, Intelligence, Vitalité, Esprit) augmentent naturellement selon la classe, et le joueur reçoit `+3` points de caractéristiques ainsi que `+1` point de sort à répartir dans sa fiche (`C`) pour renforcer ses attaques, ses PV, son mana/énergie et sa régénération automatique. Le niveau, les caractéristiques, les rangs de sorts et le sac sont sauvegardés par personnage dans le navigateur.

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
