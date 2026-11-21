# PixelForever · Front-end

État au 20 novembre 2026. Twig affiche les écrans de compte/personnage et l’ATH ; Phaser 3.90.0 affiche le monde dans un canvas. `public/game/world.js` relie déplacements, caméra, sprites, commandes et dialogues ; `combat.js` applique les attaques et effets ; `progression.js` calcule les bonus, armes, talents et sauvegardes locales.

## Accueil et choix du personnage

`#level-up-banner` annonce les montées de niveau avec `role="status"`, sans bloquer les commandes. `combat-ui.js` met les annonces en file et utilise l’horloge Phaser pour afficher chacune pendant trois secondes, avec une pause de 150 ms entre elles.

Twig rend l’accueil public du Val-des-Saules, la connexion, l’inscription et les écrans de personnage. `public/portal/val.css` adapte leur mise en page aux petits écrans. Le diorama 3D de l’accueil et de la connexion est une illustration JPEG. Les cartes des personnages mettent les sprites de jeu sur des socles éclairés et indiquent la classe, le niveau et les caractéristiques de base. **Actif** indique le personnage sélectionné en session.

## Carte et ressources visuelles

La carte de 256 × 252 tuiles de 16 px (4 096 × 4 032 px) forme une péninsule côtière élargie avec des couloirs tampons entre biomes, couvrant la clairière et son cap marin au sud-ouest, le cimetière agrandi et son belvédère sur la baie Émeraude, les montagnes face à la baie de Saphyr, les Terres dévastées, le Trône d’Obsidienne et la côte méridionale jusqu’au Belvédère des Brisants. La caméra suit le personnage et reste bornée. Le canvas occupe `100vw × 100dvh` avec un zoom ×2 sur 1920 × 1080 et 2560 × 1440 (minimum réglable dans la fonction cameraZoom de public/game/exploration.js), augmenté si l’écran dépasse le monde. L’ATH flotte au-dessus du canvas. La mer ouverte et la ceinture continue de falaises de trois cases bloquent le déplacement.

`public/game/val-des-saules/` contient les atlas `environment-detailed.png` (saules, cabane, rochers, falaises), `ground-detailed.png` (herbe, chemin, terrain pierreux, pelouse côtière), les sprites PixelLab de sanglier et de squelette dans huit directions et six icônes d’objets. `biome-gradient.js` calcule une pondération organique multi-échelle entre clairière, cimetière, montagnes et Terres dévastées sans coupure franche. `coast-art.js` dessine l’herbe rase côtière, les strates rocheuses des falaises, les hauts-fonds, l’écume animée et les îlots rocheux (avec transition vers la mer volcanique au sud-est et autour du Trône d’Obsidienne) sans jamais retourner ni pivoter verticalement les falaises. Les raccords des chemins de la clairière réutilisent les masques du terrain original. `camera-feel.js` applique un tremblement de caméra décroissant par trauma (`followOffset`) lors des chocs lourds, coups critiques et techniques du boss, désactivé si `prefers-reduced-motion` est actif.

`regional-ground.png` contient quatre matériaux de 256 × 256 px, échantillonnés en coordonnées de monde. `regional-art.js` applique la fusion unifiée des sols régionaux (cimetière, roche et sentier caillouteux des montagnes, et Terres dévastées), applique les trois teintes de la côte méridionale avec les mêmes poids de transition, érode les bords du pavage, et `clearing-art.js` éclaircit progressivement les arbres et touffes de bord de route dans les lisières. `cemetery-scenery.png` contient le mausolée, les stèles, le saule et la grille. `wasteland-scenery.png` contient l’obsidienne, l’arbre calciné, l’arche et les éboulis. Les décors sont triés en profondeur au pied et leur collision se limite à l’emprise au sol. Le sol et les fissures sont composés au chargement. La brume et les braises respectent la préférence de mouvement réduit.

Le Guerrier conserve l’identifiant de skin `lina` avec le nouvel atlas d’armure `warrior`. Le Mage utilise Noé. Les trois autres classes ont leurs propres portraits et atlas.

`starter-town.js` place `bastion-de-braise.png` entre la clairière et la route du cimetière. Cette maquette peinte en pixel art est composée dans un calque de 608 × 405 px dont les bords se fondent dans le terrain. Les bâtiments, le tambour et les palissades ont des collisions au sol. Les quatre habitants utilisent l’atlas `bastion-habitants.png` et sont triés en profondeur au pied comme les personnages jouables.

## Éclairage

`world-lighting.js` transforme les poids de `biome-gradient.js` en couleurs ambiantes. Une carte de référence échantillonnée à raison d’un pixel par tuile est interpolée autour de la caméra. La couche `MULTIPLY` assombrit terrain et sprites et s’éclaircit sous les sources. Une seconde couche `ADD`, limitée à 36 % d’opacité globale, colore les halos. Les textures de travail sont dimensionnées à la zone visible avec marge et actualisées à environ 30 Hz. Le rendu utilise les modes de fusion de Phaser sur WebGL. En Canvas, la fusion multiplicative est vérifiée sur le contexte 2D à l’initialisation. Un masque translucide conserve le terrain visible si cette fusion est indisponible.

Au Bastion, les braseros et le foyer de la forge émettent de la lumière chaude, des flammes et des braises. La cheminée laisse monter une fumée légère. Les charmes de Vesha éclairent sa hutte en turquoise. En mouvement réduit, les sources et les particules gardent une pose fixe.

Les lanternes, la cabane et les fissures fournissent les sources fixes. Le personnage actif, les incantations, leurs impacts et la Rage de Malakor fournissent les sources mobiles. Les télégraphies, jauges et textes de combat sont dessinés au-dessus des deux couches. La préférence de mouvement réduit fixe le scintillement et l’intensité des halos de sorts pendant leur présence.

`zone-ambience.js` place les cycles de pollen doré, brume basse, rafales neigeuses, braises montantes, spores du Marais, cendres de Basalte et étincelles du Gouffre à partir des poids de biome. Les sources sont ancrées dans le monde et seuls les effets proches de la caméra sont dessinés. Leur position et leur pose restent fixes avec la préférence de mouvement réduit.

## Combat, équipement et animations

Pour `hunter` et `rogue`, `idle-equipped.png`, `walk-equipped.png` et `attack-equipped.png` intègrent l’arme au personnage. Les fichiers de `warlock` contiennent désormais le corps sans livre. Cellules de 64 × 64 px : repos 512 × 64, marche 512 × 512, attaque 576 × 512. Les pieds sont alignés à y=54 et l’origine Phaser vaut 56/64 ; passer du repos à la marche ou au tir ne fait pas sauter le personnage. À mains nues, les planches originales sont utilisées et aucun ancien sprite d’arme séparé n’est dessiné pour ces trois classes.

Le style du Démoniste est `shadow`. `warlock-vfx.js` calcule l’enveloppe de son aura depuis `attackVisual`, y compris sa dissipation après résolution lorsque `pending` est vide. `combat-renderer.js` maintient ce rendu pendant la queue visuelle sans toucher au calcul des dégâts ou de la ressource. Le mouvement réduit fixe la pose des textures et supprime les fragments. `php tests/warlock_art.php` vérifie que les huit poses au repos correspondent pixel par pixel au corps d’origine sans objet ajouté.

`tools/build_equipped_sprites.php` compose les neuf planches à partir des corps existants, sans réécrire ces sources. Après régénération des corps via `tools/build_class_sprites.php`, lancer `php tools/build_equipped_sprites.php`. `php tools/build_equipped_sprites.php --check` vérifie leur reproductibilité pixel par pixel, la préservation du visage et des cheveux et l’absence d’arme coupée sur les bords. `equipped-art.js` donne la prise de l’arc au combat et aux VFX pour éviter un décalage entre la corde et le projectile.

L’épée, le croc, la hache, les dagues, le Bâton des saules et les poings frappent à 2,5 case. La Baguette de braise et le Sceptre de Saphyr tirent en mouvement à 5 cases avant bonus, sans mana et à pleine puissance avant les talents propres à la baguette. Boule de feu, Mur de feu et Tourbillon de feu demandent une seconde d’incantation. La barre `#cast-bar` affiche le temps restant. Un déplacement annule l’incantation et rembourse le mana.

L’attaque mémorise sa portée et son type au départ : changer d’équipement ne transforme pas un projectile déjà lancé en coup de mêlée. L’ATH, les dégâts et la portée de la fiche reflètent l’auto-attaque équipée. Les talents de baguette ne renforcent que ses tirs.

Boule de feu, Tourbillon de feu et Nova de givre portent à 15 cases avant bonus avec chaque arme et à mains nues. Tourbillon et Nova touchent dans un rayon de 54 px autour de la cible. Mur de feu porte à 16 cases et Déflagration à 16,5 cases avant bonus. Les sorts exigent une cible vivante à portée avant toute dépense. Taillade conserve sa zone autour du Guerrier.

Le Mage utilise des poses orientées pour le tir et l’incantation. Le bâton peut jouer la « Frappe à la lanterne » de Noé au contact. Les directions nord utilisent des poses dérivées du sprite. La préparation et la récupération sont lisibles à 30 FPS.

Les deux atlas de VFX partagent un pool de sprites. Les effets au sol suivent les coordonnées du combat, tandis que les animations des personnages suivent la direction et l’équipement. [Catalogue, génération et vérifications des VFX](VFX.md)

## Monstres et PNJ

`pet-rules.js` valide les créatures apprivoisables et calcule les statistiques héritées ; `pet-controls.js` gère la canalisation, la sauvegarde locale de la créature et les trois commandes ; `class-combat.js` gère les sprites, déplacements et attaques du familier. `getUnlockedPetSpells` sépare les invocations des techniques de la barre principale. La barre `data-pet-action` utilise les touches physiques KeyZ/KeyX/KeyC ; la fiche est déplacée sur KeyP. La créature et sa fraction de PV sont normalisées à la reprise du profil local du Chasseur.

Les 59 créatures peuplant la carte se répartissent sur des secteurs élargis : 7 sangliers N.1–5 dans la clairière, 6 squelettes N.5–10 au cimetière, 5 dragons N.10–20 dans les montagnes, 16 démons (6 diablotins, 5 molosses et 5 gardes N.21–35) dans les trois secteurs des Terres dévastées, le Boss de palier niveau 40 **Malakor, Seigneur de la Brèche** au Trône d’Obsidienne (`128 × 128 px`, trois phases télégraphiées et jauge avec seuils de phase) et huit créatures dans chacun des trois secteurs N.41–60. Les variantes teintent les atlases du molosse et du garde et emploient les mêmes télégraphies circulaires et linéaires que Malakor. Chaque espèce standard dispose d’au moins 10 points de patrouille.

Les sept atlas d’origine de `public/game/val-des-saules/monsters/` contiennent huit blocs de deux lignes, dans l’ordre est, sud-est, sud, sud-ouest, ouest, nord-ouest, nord et nord-est. Chaque bloc contient un repos, 36 images de marche et trois poses d’attaque. `monster-art.js` donne la taille de découpe, l’emprise visuelle et la distance d’un cycle par espèce (`tools/build_boss_spritesheet.php` assemble celle de Malakor en `128 × 128`). La distance parcourue règle le trot du sanglier, la marche saccadée du squelette, les appuis du dragon, les bonds du diablotin, le galop du molosse, la marche lourde du garde et la foulée colossale du boss. Les images sont ancrées aux pieds pour que le tri en profondeur suive le sol. Malakor conserve ses poses d’origine. Les atlas d’effets ont des cellules de 192 × 192 px pour laisser de la place aux flammes et aux traînées. Chaque technique et la transformation rythment ces effets sur 12 images par direction. En Rage, la lumière suit le bord des ailes, l’armure, la lame et le halo. Phaser dessine autour de Malakor un cercle runique, des fissures et des braises. Avec la préférence de mouvement réduit, le cercle et les fissures restent fixes et les braises sont masquées. Le générateur GD se lance avec `php -d memory_limit=384M tools/build_malakor_animations.php`.

`php tools/build_class_sprites.php` génère les planches du Guerrier, du Démoniste, du Voleur et du Chasseur. Les planches ont huit directions, huit cellules de marche de 48 px et neuf cellules d’attaque de 64 px par direction. `world.js` ancre l’arme équipée à la main et adapte son mouvement à la pose. Le nouvel atlas de combat du Guerrier remplace celui de Lina. L’atlas des familiers contient six poses de 32 px par invocation.

`python tools/monster_walk.py <dossier-des-atlas> <dossier-de-sortie> --preview <dossier-d-apercu>` reconstruit les foulées depuis les poses de repos avec Pillow et NumPy. Le script découpe cuisse, tibia et pied, puis calcule la flexion du genou entre l’appui, le décollage et la retombée. Il conserve les images de repos et d’attaque de l’atlas source. Le dossier d’aperçu est facultatif.

Le dragon annonce une ligne de tir pendant sa préparation. Le rendu du souffle suit la position réelle du projectile, qui avance par petits pas de collision pour détecter le joueur et le décor même lors d’une image lente.

`E`, le bouton de l’ATH ou le clic permettent de parler à un habitant à portée. Rakka ouvre le dialogue de quête. Les autres habitants répondent dans le statut de jeu. La quête demande trois sangliers après acceptation et donne deux potions de vie au retour une seule fois. Le marqueur passe de `!` doré à `?` gris, puis `?` doré, et disparaît après la remise. La quête reste locale au personnage.

## Interface et commandes par défaut

La fiche joueur est en haut à gauche, la cible en haut au centre, les accès rapides en haut à droite. La barre d’XP et les actions restent en bas. Les fenêtres Fiche, Talents et Inventaire utilisent des dialogues HTML. L’inventaire montre les quantités, les icônes réelles et les boutons d’équipement ; les matériaux n’ont pas de bouton d’équipement.

| Action | Touches physiques / commande |
| --- | --- |
| Déplacement | Flèches, ZQSD (AZERTY), WASD (QWERTY), commandes tactiles |
| Sélection d’un monstre | Clic sur le monstre |
| Cibler le monstre vivant le plus proche | `Tab` |
| Parcourir les cibles en sens inverse | `Maj+Tab` |
| Attaque de base / compétence principale | `1` / `2` |
| Techniques disponibles | `3` à `6`, jusqu’à `8` pour le Guerrier et `9` pour le Démoniste |
| Potions de vie / ressource | `R` / `F` |
| Fiche / talents / inventaire | `P` / `T` / `I` |
| Familier (Chasseur/Démoniste) | `W` / `X` / `C` AZERTY ; `Z` / `X` / `C` QWERTY |
| Parler au PNJ à proximité | `E` ou clic |

Les commandes utilisent `KeyboardEvent.code`. Sur AZERTY, les touches physiques de la rangée des chiffres activent les actions sans Maj. Les raccourcis sont suspendus pendant la saisie et lorsque les dialogues l’exigent.

## Progression et sauvegardes

Aucun point au N.1 ; chaque montée suivante donne +3 caractéristiques et +1 talent/sort. Les sauvegardes anciennes sont normalisées sans supprimer niveau, XP ou objets valides. Les prérequis et budgets restent contrôlés après chargement. Les anciennes sauvegardes de sac sans écaille/cœur reçoivent ces compteurs à zéro.

Les victoires donnent l’XP du monstre et un tirage : vie 47 %, ressource 30 %, arme rare 15 %, arme épique 5 %, écaille 2 %, cœur 1 %. L’équipement rare/épique dépend de la classe ; ses bonus sont +7/+11 dégâts de base. La base restaure niveau/XP. Le navigateur conserve le sac, l’arme, les coiffes, les gants, les allocations et la quête. `armor.js` définit le catalogue, les bonus et les tables de tirage d’armure. Les anciennes sauvegardes chargent les nouveaux emplacements vides. `progress-sync.js` envoie les nouvelles valeurs avec CSRF, ne confirme pas une réponse trop ancienne et retente après erreur. L’ATH indique l’état réseau.

## Vérifications

`node --test tests/*.test.mjs` couvre chemins, obstacles, caméra, monstres, difficulté, quête, sauvegardes, armes et animation. `combat-animation.test.mjs` exécute notamment le vrai rendu de `world.js` avec des objets d’affichage de test et vérifie l’absence de frappe de contact pour un tir magique. Le test PHP `composer test:accounts` couvre les comptes, classes, icônes et niveau/XP.

Vérifier en navigateur la portée des attaques avec l’arme équipée, le coût et la recharge des techniques, les déplacements, la quête et la reconnexion. [Scénarios VFX](VFX.md#vérifications) · [Parcours après déploiement](DEPLOIEMENT.md#vérifications-après-déploiement)

Voir le [game design](GAME_DESIGN.md) et le [back-end](BACKEND.md).

## XP et présence

`balance.js` centralise seuils, récompenses, écarts de niveau et coûts. `progression.js` convertit une fois les sauvegardes non versionnées vers `xpVersion: 2` en conservant le niveau et la fraction d’XP. `progress-sync.js` envoie cette version ; une page ancienne doit être rechargée. Les potions ont une recharge commune de 15 s affichée dans les deux cases et restaurent 30 % du maximum avec un plancher fixe.

`world-presence.js` envoie position/orientation/pose et reçoit les personnages voisins. Les textures des cinq classes sont préchargées. Les déplacements sont interpolés, avec position directe en mouvement réduit. La présence continue quand le rendu Phaser est suspendu en arrière-plan ; les requêtes en échec sont espacées et les acteurs distants retirés. Un autre onglet du même personnage affiche un conflit de présence et réessaie après expiration du bail. Cela ne valide pas les combats locaux. Le rendu à deux fenêtres reste à vérifier : le serveur local était inaccessible depuis Edge pendant ce contrôle.

### Trappe du Chasseur

`starterTalents.hunter` expose `taming_trap` dès le N.1. `pet-rules.js` réutilise les conditions de capture ; `class-combat.js` neutralise la cible pour 6 s sans dégâts et rappelle le familier. `trappedUntil` bloque l’IA de déplacement et le compteur d’attaque, puis est retiré aux dégâts, à la réapparition ou au masquage. L’atlas existant `trap` fournit un indicateur fixe aux pieds de la cible tant que le contrôle dure, y compris en mouvement réduit. Cinq cases de technique sont prévues pour conserver la trappe et les quatre talents actifs du Chasseur. Raccourcis : `3` trappe, puis W/Z physique pour apprivoiser.

## Lisibilité des sorts et tchat

`spell-state.js` calcule coût effectif, recharge et indisponibilité à partir des règles du combat. Les auto-attaques n’exigent pas de ressource. Les cases affichent la durée restante, une mention de mana/énergie insuffisant(e), un gris sur l’illustration et un nom accessible décrivant l’état. Le masque radial utilise directement le pourcentage CSS ; les invocations W/X/C partagent le compteur de la barre dédiée. Les illustrations sont des ressources locales, sans modification des personnages.

`game/_chat.html.twig` fournit le panneau repliable ; `chat.js` envoie les commandes à l’API Symfony et sonde toutes les 1,5 s sans requêtes concurrentes. Les erreurs conservent le texte et le nonce pour réessayer ; le DOM et l’anti-doublon sont bornés. Les messages sont insérés par nœuds texte, jamais par HTML. Le journal indique heure, canal et personnages. Suggestions de noms avec identifiant, liste des membres et acceptation/refus des invitations sont intégrées.

Entrée depuis le canevas ouvre la saisie, Échap remet le focus sur la carte. Entrer dans le panneau relâche les déplacements ; ses événements ne déclenchent pas les raccourcis du combat. Tab reste natif dans le panneau. Le journal conserve le défilement de lecture ; l’utilisateur peut replier le tchat et voir le nombre de messages reçus. Le panneau est limité en hauteur sur petits écrans. Les tests Node couvrent les états de ressource, compteurs, couverture d’icônes et insertion sûre des textes. Le contrôle réel à deux fenêtres reste à réaliser : accès HTTP local toujours indisponible pendant le développement.

Les nouvelles illustrations de sorts sont regroupées dans `public/game/spell-icons-atlas.png` (8 colonnes × 6 lignes). `spell-icons.js` associe les 42 visuels utilisés aux cellules, sans découpe des fichiers ni changement des sprites. La grille conserve six cases utilitaires non utilisées par cette interface. Le propriétaire a demandé de remplacer uniquement les illustrations des sorts et a validé la nouvelle direction. Les anciens pictogrammes vectoriels d’essai ont été retirés. L’actualisation des compteurs est limitée à environ 12 fois/s, avec mise à jour immédiate lors d’un changement de ressource ou de PV.
