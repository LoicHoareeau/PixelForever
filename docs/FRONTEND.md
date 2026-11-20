# PixelForever · Front-end

État au 20 novembre 2026. Twig affiche les écrans de compte/personnage et l’ATH ; Phaser 3.90.0 affiche le monde dans un canvas. `public/game/world.js` relie déplacements, caméra, sprites, commandes et dialogues ; `combat.js` applique les attaques et effets ; `progression.js` calcule les bonus, armes, talents et sauvegardes locales.

## Carte et ressources visuelles

La carte de 256 × 252 tuiles de 16 px (4 096 × 4 032 px) forme une péninsule côtière élargie avec des couloirs tampons entre biomes, couvrant la clairière et son cap marin au sud-ouest, le cimetière agrandi et son belvédère sur la baie Émeraude, les montagnes face à la baie de Saphyr, les Terres dévastées, le Trône d’Obsidienne et la côte méridionale jusqu’au Belvédère des Brisants. La caméra suit le personnage et reste bornée. Le canvas occupe `100vw × 100dvh` avec un zoom ×1 sur 1920 × 1080 et 2560 × 1440, augmenté si l’écran dépasse le monde. L’ATH flotte au-dessus du canvas. La mer ouverte et la ceinture continue de falaises de trois cases bloquent le déplacement.

`public/game/val-des-saules/` contient les atlas `environment-detailed.png` (saules, cabane, rochers, falaises), `ground-detailed.png` (herbe, chemin, terrain pierreux, pelouse côtière), les sprites PixelLab de sanglier et de squelette dans huit directions et six icônes d’objets. `biome-gradient.js` calcule une pondération organique multi-échelle entre clairière, cimetière, montagnes et Terres dévastées sans coupure franche. `coast-art.js` dessine l’herbe rase côtière, les strates rocheuses des falaises, les hauts-fonds, l’écume animée et les îlots rocheux (avec transition vers la mer volcanique au sud-est et autour du Trône d’Obsidienne) sans jamais retourner ni pivoter verticalement les falaises. Les raccords des chemins de la clairière réutilisent les masques du terrain original. `camera-feel.js` applique un tremblement de caméra décroissant par trauma (`followOffset`) lors des chocs lourds, coups critiques et techniques du boss, désactivé si `prefers-reduced-motion` est actif.

`regional-ground.png` contient quatre matériaux de 256 × 256 px, échantillonnés en coordonnées de monde. `regional-art.js` applique la fusion unifiée des sols régionaux (cimetière, roche et sentier caillouteux des montagnes, et Terres dévastées), applique les trois teintes de la côte méridionale avec les mêmes poids de transition, érode les bords du pavage, et `clearing-art.js` éclaircit progressivement les arbres et touffes de bord de route dans les lisières. `cemetery-scenery.png` contient le mausolée, les stèles, le saule et la grille. `wasteland-scenery.png` contient l’obsidienne, l’arbre calciné, l’arche et les éboulis. Les décors sont triés en profondeur au pied et leur collision se limite à l’emprise au sol. Le sol et les fissures sont composés au chargement. La brume et les braises respectent la préférence de mouvement réduit.

Le Guerrier utilise Lina et le Mage Noé. Leurs portraits suivent la règle PHP `CharacterClass::skin()` et leurs planches de marche sont conservées.

## Combat, équipement et animations

L’épée et le croc frappent à 1,5 case. Le Mage commence avec la Baguette de braise : projectile à 7,5 cases (extensible à 8 avec Déflagration) pour compenser une régénération de base réduite (`1,0/s`) et des coûts en mana relevés (`15` à `28` selon les sorts ; Boule de feu `18`). Boule de feu, Mur de feu et Tourbillon de feu demandent `1,0 s` d’incantation (barre de sort dédiée `#cast-bar` annulée avec remboursement si le mage se déplace). Son Sceptre de Saphyr se comporte comme une baguette ; le Bâton des saules frappe au contact à 1,5 case. Sans arme, les deux classes frappent au poing à 1,5 case. L’auto-attaque est gratuite. Boule de feu garde sa portée de sort quand un bâton est équipé.

L’attaque mémorise sa portée et son type au départ : changer d’équipement ne transforme pas un projectile déjà lancé en coup de mêlée. L’ATH, les dégâts et la portée de la fiche reflètent l’auto-attaque équipée. Les talents de baguette ne renforcent que ses tirs.

Les quatre sorts de talents du Mage restent utilisables à distance avec un bâton ou sans arme. Tourbillon de feu et Nova de givre visent la cible à cinq cases et touchent les monstres à moins de 54 px de celle-ci, plutôt que ceux autour du mage. Mur de feu et Déflagration gardent leur portée étendue. Les sorts exigent une cible vivante à portée avant toute dépense. Taillade conserve sa zone autour du Guerrier.

Noé ne doit pas utiliser sa planche « Frappe à la lanterne » pour un tir ou une incantation : les poses orientées existantes servent au geste magique, et les effets dessinent le projectile. Le bâton peut utiliser la frappe de contact. Préparation et récupération permettent de lire le cycle à 30 FPS ; les sorts de talents déclenchent aussi un geste. Les directions nord utilisent des poses dérivées du sprite au lieu d’une frappe tournée dans le mauvais sens.

Les archives PixelLab actuelles proposent uniquement « Frappe à la lanterne » (Noé) et « Coup de marteau » (Lina) pour les frappes. Elles ne contiennent pas de planche d’incantation dédiée : ne pas présenter ces exports comme des animations magiques complètes.

## Monstres et PNJ

Les 59 créatures peuplant la carte se répartissent sur des secteurs élargis : 7 sangliers N.1–5 dans la clairière, 6 squelettes N.5–10 au cimetière, 5 dragons N.10–20 dans les montagnes, 16 démons (6 diablotins, 5 molosses et 5 gardes N.21–35) dans les trois secteurs des Terres dévastées, le Boss de palier niveau 40 **Malakor, Seigneur de la Brèche** au Trône d’Obsidienne (`128 × 128 px`, trois phases télégraphiées et jauge avec seuils de phase) et huit créatures dans chacun des trois secteurs N.41–60. Les variantes teintent les atlases du molosse et du garde et emploient les mêmes télégraphies circulaires et linéaires que Malakor. Chaque espèce standard dispose d’au moins 10 points de patrouille.

Les sept atlas d’origine de `public/game/val-des-saules/monsters/` contiennent huit blocs de deux lignes, dans l’ordre est, sud-est, sud, sud-ouest, ouest, nord-ouest, nord et nord-est. Chaque bloc contient un repos, 36 images de marche et trois poses d’attaque. `monster-art.js` donne la taille de découpe, l’emprise visuelle et la distance d’un cycle par espèce (`tools/build_boss_spritesheet.php` assemble celle de Malakor en `128 × 128`). La distance parcourue règle le trot du sanglier, la marche saccadée du squelette, les appuis du dragon, les bonds du diablotin, le galop du molosse, la marche lourde du garde et la foulée colossale du boss. Les images sont ancrées aux pieds pour que le tri en profondeur suive le sol. Malakor conserve ses poses d’origine. Les atlas d’effets ont des cellules de 192 × 192 px pour laisser de la place aux flammes et aux traînées. Chaque technique et la transformation rythment ces effets sur 12 images par direction. En Rage, la lumière suit le bord des ailes, l’armure, la lame et le halo. Phaser dessine autour de Malakor un cercle runique, des fissures et des braises. Avec la préférence de mouvement réduit, le cercle et les fissures restent fixes et les braises sont masquées. Le générateur GD se lance avec `php -d memory_limit=384M tools/build_malakor_animations.php`.

`python tools/monster_walk.py <dossier-des-atlas> <dossier-de-sortie> --preview <dossier-d-apercu>` reconstruit les foulées depuis les poses de repos avec Pillow et NumPy. Le script découpe cuisse, tibia et pied, puis calcule la flexion du genou entre l’appui, le décollage et la retombée. Il conserve les images de repos et d’attaque de l’atlas source. Le dossier d’aperçu est facultatif.

Le dragon annonce une ligne de tir pendant sa préparation. Le rendu du souffle suit la position réelle du projectile, qui avance par petits pas de collision pour détecter le joueur et le décor même lors d’une image lente.

`quest_early.png` représente l’habitante du hameau. Le clic, `E` ou le bouton de quête à proximité ouvre un dialogue au clavier. La quête demande trois sangliers après acceptation et récompense deux potions de vie au retour, une seule fois. Le marqueur est `!` doré, puis `?` gris, puis `?` doré, puis caché ; le texte donne aussi l’état. La quête reste locale au personnage.

## Interface et commandes par défaut

La fiche joueur est en haut à gauche, la cible en haut au centre, les accès rapides en haut à droite. La barre d’XP et les actions restent en bas. Les fenêtres Fiche, Talents et Inventaire utilisent des dialogues HTML. L’inventaire montre les quantités, les icônes réelles et les boutons d’équipement ; les matériaux n’ont pas de bouton d’équipement.

| Action | Touches physiques / commande |
| --- | --- |
| Déplacement | Flèches, ZQSD (AZERTY), WASD (QWERTY), commandes tactiles |
| Sélection d’un monstre | Clic sur le monstre |
| Changer de cible | `Tab` / `Maj+Tab` (réservé au jeu, focus fenêtre bloqué) |
| Attaque de base / compétence principale | `1` / `2` |
| Sorts de talents débloqués | `3` à `6` |
| Potions de vie / ressource | `R` / `F` |
| Fiche / talents / inventaire | `C` / `T` / `I` |
| Parler au PNJ à proximité | `E` ou clic |

Les positions physiques utilisent `KeyboardEvent.code` : sur AZERTY, les touches `&`, `é`, `"`, `'`, `(`, `-` activent respectivement les actions 1–6 sans Maj. Les raccourcis sont suspendus pendant la saisie et lorsque les dialogues l’exigent. Le menu de réaffectation des touches n’est pas encore implémenté.

## Progression et sauvegardes

Aucun point au N.1 ; chaque montée suivante donne +3 caractéristiques et +1 talent/sort. Les sauvegardes anciennes sont normalisées sans supprimer niveau, XP ou objets valides. Les prérequis et budgets restent contrôlés après chargement. Les anciennes sauvegardes de sac sans écaille/cœur reçoivent ces compteurs à zéro.

Les victoires donnent l’XP du monstre et un tirage : vie 47 %, ressource 30 %, arme rare 15 %, arme épique 5 %, écaille 2 %, cœur 1 %. L’équipement rare/épique dépend de la classe ; ses bonus sont +7/+11 dégâts de base. La base restaure niveau/XP. Le navigateur conserve le sac, l’arme, les coiffes, les gants, les allocations et la quête. `armor.js` définit le catalogue, les bonus et les tables de tirage d’armure. Les anciennes sauvegardes chargent les nouveaux emplacements vides. `progress-sync.js` envoie les nouvelles valeurs avec CSRF, ne confirme pas une réponse trop ancienne et retente après erreur. L’ATH indique l’état réseau.

## Vérifications

`node --test tests/*.test.mjs` couvre chemins, obstacles, caméra, monstres, difficulté, quête, sauvegardes, armes et animation. `combat-animation.test.mjs` exécute notamment le vrai rendu de `world.js` avec des objets d’affichage de test et vérifie l’absence de frappe de contact pour un tir magique. Le test PHP `composer test:accounts` couvre les comptes, classes, icônes et niveau/XP.

Vérifier en navigateur : baguette à distance, bâton au contact, Boule de feu au bâton, mana à zéro, recharge, cible hors de portée, équipement, talents, déplacement/caméra, quête et reconnexion. Le monde partagé, le marchand et la sauvegarde serveur du sac restent à développer.

Voir le [game design](GAME_DESIGN.md) et le [back-end](BACKEND.md).
