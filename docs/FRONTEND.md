# PixelForever · Front-end

État au 20 novembre 2026. Twig affiche les écrans de compte/personnage et l’ATH ; Phaser 3.90.0 affiche le monde dans un canvas. `public/game/world.js` relie déplacements, caméra, sprites, commandes et dialogues ; `combat.js` applique les attaques et effets ; `progression.js` calcule les bonus, armes, talents et sauvegardes locales.

## Carte et ressources visuelles

La carte de 168 × 120 tuiles de 16 px couvre la clairière, le cimetière, les montagnes et les Terres dévastées. La caméra suit le personnage et reste bornée. Le canvas occupe `100vw × 100dvh` avec un zoom ×1 sur 1920 × 1080 et 2560 × 1440, augmenté si l’écran dépasse le monde. L’ATH flotte au-dessus du canvas. Les falaises de quatre cases et l’eau bloquent le déplacement.

`public/game/val-des-saules/` contient les atlas `environment-detailed.png` (saules, cabane, rochers, falaises), `ground-detailed.png` (herbe, chemin, terrain pierreux), les sprites PixelLab de sanglier et de squelette dans huit directions et six icônes d’objets. Les raccords des chemins de la clairière réutilisent les masques du terrain original.

`regional-ground.png` contient quatre matériaux de 256 × 256 px, échantillonnés en coordonnées de monde. `regional-art.js` fond les sols régionaux dans les textures voisines et érode les bords du pavage. `cemetery-scenery.png` contient le mausolée, les stèles, le saule et la grille. `wasteland-scenery.png` contient l’obsidienne, l’arbre calciné, l’arche et les éboulis. Les décors sont triés en profondeur au pied et leur collision se limite à l’emprise au sol. Le sol et les fissures sont composés au chargement. La brume et les braises respectent la préférence de mouvement réduit.

Le Guerrier utilise Lina et le Mage Noé. Leurs portraits suivent la règle PHP `CharacterClass::skin()` et leurs planches de marche sont conservées.

## Combat, équipement et animations

L’épée et le croc frappent à 1,5 case. Le Mage commence avec la Baguette de braise : projectile à cinq cases. Son Sceptre de Saphyr se comporte comme une baguette ; le Bâton des saules frappe au contact à 1,5 case. Sans arme, les deux classes frappent au poing à 1,5 case. L’auto-attaque est gratuite. Boule de feu garde sa portée de sort quand un bâton est équipé.

L’attaque mémorise sa portée et son type au départ : changer d’équipement ne transforme pas un projectile déjà lancé en coup de mêlée. L’ATH, les dégâts et la portée de la fiche reflètent l’auto-attaque équipée. Les talents de baguette ne renforcent que ses tirs.

Les quatre sorts de talents du Mage restent utilisables à distance avec un bâton ou sans arme. Tourbillon de feu et Nova de givre visent la cible à cinq cases et touchent les monstres à moins de 54 px de celle-ci, plutôt que ceux autour du mage. Mur de feu et Déflagration gardent leur portée étendue. Les sorts exigent une cible vivante à portée avant toute dépense. Taillade conserve sa zone autour du Guerrier.

Noé ne doit pas utiliser sa planche « Frappe à la lanterne » pour un tir ou une incantation : les poses orientées existantes servent au geste magique, et les effets dessinent le projectile. Le bâton peut utiliser la frappe de contact. Préparation et récupération permettent de lire le cycle à 30 FPS ; les sorts de talents déclenchent aussi un geste. Les directions nord utilisent des poses dérivées du sprite au lieu d’une frappe tournée dans le mauvais sens.

Les archives PixelLab actuelles proposent uniquement « Frappe à la lanterne » (Noé) et « Coup de marteau » (Lina) pour les frappes. Elles ne contiennent pas de planche d’incantation dédiée : ne pas présenter ces exports comme des animations magiques complètes.

## Monstres et PNJ

Les sangliers N.1–5 patrouillent dans la clairière, les squelettes N.5–10 au cimetière et les dragons N.10–20 dans les montagnes. Les trois secteurs des Terres dévastées accueillent des diablotins, des molosses et des gardes N.21–35.

Les six planches de `public/game/val-des-saules/monsters/` contiennent huit blocs de deux lignes, dans l’ordre est, sud-est, sud, sud-ouest, ouest, nord-ouest, nord et nord-est. Chaque bloc contient un repos, 24 images de marche et trois poses d’attaque. `monster-art.js` donne la taille de découpe, l’emprise visuelle et la distance d’un cycle par espèce. La distance parcourue règle le trot du sanglier, la marche saccadée du squelette, les appuis du dragon, les bonds du diablotin, le galop du molosse et la marche lourde du garde. Les images sont ancrées aux pieds pour que le tri en profondeur suive le sol.

Les 24 images de marche de chaque espèce sont générées en alpha binaire strict (`tools/build_monster_spritesheets.php`, via `php -d extension=gd tools/build_monster_spritesheets.php`) à partir des poses de repos en articulant les chaînes de membres à deux os, la flexion spinale, la tête, la queue et les ailes selon la mécanique propre à chaque race tout en conservant intacts le repos et les trois attaques :
- **Sanglier (`boar`, 64 × 64 px, foulée 23)** : trot diagonal à deux temps avec double rebond sec, inertie de hure et battement de queue.
- **Squelette (`skeleton`, 60 × 60 px, foulée 27)** : marche bipède saccadée à genoux vers l’avant, balancement opposé des bras (avec dague et membres arrière ombrés en profil) et retard du crâne.
- **Dragon (`dragon`, 96 × 96 px, foulée 49)** : marche lourde à quatre temps latéraux, transfert d’épaules et de bassin, ondulation en S de la queue et suivi secondaire des ailes.
- **Diablotin (`imp`, 56 × 56 px, foulée 32)** : foulée bondissante digitigrade avec appel fléchi, phase aérienne genoux regroupés et fouet caudal.
- **Molosse (`hound`, 68 × 68 px, foulée 41)** : galop rotatif de prédateur avec flexion/extension réelle de l’échine, tête stabilisée et queue de contrepoids.
- **Garde / Fiend (`fiend`, 72 × 72 px, foulée 43)** : marche martiale cuirassée avec transfert latéral de poids sur la jambe d’appui, balancement lourd des bras et tassement de tête cornu à l’impact.

Le dragon annonce une ligne de tir pendant sa préparation. Le rendu du souffle suit la position réelle du projectile, qui avance par petits pas de collision pour détecter le joueur et le décor même lors d’une image lente.

`quest_early.png` représente l’habitante du hameau. Le clic, `E` ou le bouton de quête à proximité ouvre un dialogue au clavier. La quête demande trois sangliers après acceptation et récompense deux potions de vie au retour, une seule fois. Le marqueur est `!` doré, puis `?` gris, puis `?` doré, puis caché ; le texte donne aussi l’état. La quête reste locale au personnage.

## Interface et commandes par défaut

La fiche joueur est en haut à gauche, la cible en haut au centre, les accès rapides en haut à droite. La barre d’XP et les actions restent en bas. Les fenêtres Fiche, Talents et Inventaire utilisent des dialogues HTML. L’inventaire montre les quantités, les icônes réelles et les boutons d’équipement ; les matériaux n’ont pas de bouton d’équipement.

| Action | Touches physiques / commande |
| --- | --- |
| Déplacement | Flèches, ZQSD (AZERTY), WASD (QWERTY), commandes tactiles |
| Sélection d’un monstre | Clic |
| Attaque de base / compétence principale | `1` / `2` |
| Sorts de talents débloqués | `3` à `6` |
| Potions de vie / ressource | `R` / `F` |
| Fiche / talents / inventaire | `C` / `T` / `I` |
| Parler au PNJ à proximité | `E` ou clic |

Les positions physiques utilisent `KeyboardEvent.code` : sur AZERTY, les touches `&`, `é`, `"`, `'`, `(`, `-` activent respectivement les actions 1–6 sans Maj. Les raccourcis sont suspendus pendant la saisie et lorsque les dialogues l’exigent. Le menu de réaffectation des touches n’est pas encore implémenté.

## Progression et sauvegardes

Aucun point au N.1 ; chaque montée suivante donne +3 caractéristiques et +1 talent/sort. Les sauvegardes anciennes sont normalisées sans supprimer niveau, XP ou objets valides. Les prérequis et budgets restent contrôlés après chargement. Les anciennes sauvegardes de sac sans écaille/cœur reçoivent ces compteurs à zéro.

Les victoires donnent l’XP du monstre et un tirage : vie 47 %, ressource 30 %, arme rare 15 %, arme épique 5 %, écaille 2 %, cœur 1 %. L’équipement rare/épique dépend de la classe ; ses bonus sont +7/+11 dégâts de base. La base restaure niveau/XP ; le navigateur conserve sac, arme, allocations et quête. `progress-sync.js` envoie les nouvelles valeurs avec CSRF, ne confirme pas une réponse trop ancienne et retente après erreur. L’ATH indique l’état réseau.

## Vérifications

`node --test tests/*.test.mjs` couvre chemins, obstacles, caméra, monstres, difficulté, quête, sauvegardes, armes et animation. `combat-animation.test.mjs` exécute notamment le vrai rendu de `world.js` avec des objets d’affichage de test et vérifie l’absence de frappe de contact pour un tir magique. Le test PHP `composer test:accounts` couvre les comptes, classes, icônes et niveau/XP.

Vérifier en navigateur : baguette à distance, bâton au contact, Boule de feu au bâton, mana à zéro, recharge, cible hors de portée, équipement, talents, déplacement/caméra, quête et reconnexion. Le monde partagé, le marchand et la sauvegarde serveur du sac restent à développer.

Voir le [game design](GAME_DESIGN.md) et le [back-end](BACKEND.md).
