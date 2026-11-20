# PixelForever · Front-end

État au 20 novembre 2026. Twig affiche les écrans de compte/personnage et l’ATH ; Phaser 3.90.0 affiche le monde dans un canvas. `public/game/world.js` relie déplacements, caméra, sprites, commandes et dialogues ; `combat.js` applique les attaques et effets ; `progression.js` calcule les bonus, armes, talents et sauvegardes locales.

## Carte et ressources visuelles

La carte de 168 × 120 tuiles de 16 px couvre la clairière, le cimetière et les montagnes. La caméra suit le personnage et reste bornée. Le canvas occupe `100vw × 100dvh` ; zoom ×1 sur 1920 × 1080 et 2560 × 1440, augmenté seulement si l’écran dépasse le monde. L’ATH flotte au-dessus du canvas. Les falaises de quatre cases et l’eau bloquent le déplacement.

`public/game/val-des-saules/` contient les ressources : atlas détaillés `environment-detailed.png` (saules, cabane, rochers, falaises) et `ground-detailed.png` (herbe, chemin, cimetière, montagne), sprites PixelLab de sanglier/squelette dans huit directions et six icônes d’objets. Les raccords de chemin réutilisent les masques du terrain original. Le sol est composé une seule fois ; les ondulations et lumières sont actualisées séparément.

Le Guerrier utilise Lina et le Mage Noé ; les portraits suivent la même règle PHP `CharacterClass::skin()`. Les planches de marche existantes sont conservées. Les images du personnage ne doivent pas être redessinées lors des retouches de décor.

## Combat, équipement et animations

L’épée et le croc frappent à 1,5 case. Le Mage commence avec la Baguette de braise : projectile à cinq cases. Son Sceptre de Saphyr se comporte comme une baguette ; le Bâton des saules frappe au contact à 1,5 case. Sans arme, les deux classes frappent au poing à 1,5 case. L’auto-attaque est gratuite. Boule de feu garde sa portée de sort quand un bâton est équipé.

L’attaque mémorise sa portée et son type au départ : changer d’équipement ne transforme pas un projectile déjà lancé en coup de mêlée. L’ATH, les dégâts et la portée de la fiche reflètent l’auto-attaque équipée. Les talents de baguette ne renforcent que ses tirs.

Noé ne doit pas utiliser sa planche « Frappe à la lanterne » pour un tir ou une incantation : les poses orientées existantes servent au geste magique, et les effets dessinent le projectile. Le bâton peut utiliser la frappe de contact. Préparation et récupération permettent de lire le cycle à 30 FPS ; les sorts de talents déclenchent aussi un geste. Les directions nord utilisent des poses dérivées du sprite au lieu d’une frappe tournée dans le mauvais sens.

## Monstres et PNJ

Les sangliers N.1–2 commencent au plus près du départ ; d’autres patrouilles N.2–4 et N.4–5 sont plus loin. Squelettes N.5–10 au cimetière, dragons N.10–20 dans les montagnes. Les monstres engagent à proximité et leurs déplacements restent dans leur zone. Préparation, recharge, portée, obstacles, étourdissement et mort contrôlent leurs impacts ciblés. Ils n’utilisent plus de cercle de dégâts.

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
