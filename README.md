# PixelForever

PixelForever est un projet de **MMORPG en pixel art** conçu pour être joué dans un navigateur. Inspiré par l’exploration et les quêtes de *World of Warcraft*, il vise à créer un monde partagé où les joueurs peuvent se croiser, explorer et combattre ensemble en temps réel. Symfony et Doctrine gèrent déjà les comptes, les personnages et la sauvegarde du niveau/XP. Le monde partagé reste à développer.

Le prototype jouable utilise Phaser 3.90.0, Twig et JavaScript. Les règles PHP historiques de `src/Game/` ne remplacent pas le moteur de combat actuel du navigateur.

## Lancer PixelForever avec PostgreSQL

```sh
docker compose -p pixelforever-postgres up -d --build
```

Ouvre [PixelForever](http://127.0.0.1:8080). PostgreSQL conserve les comptes et les personnages dans le volume Docker `pixelforever-postgres_accounts`, y compris quand les conteneurs sont recréés. Les identifiants de Compose sont réservés à cette installation locale.

Le [guide de déploiement](docs/DEPLOIEMENT.md) décrit la configuration de Render et les vérifications après mise en ligne.

## Lancer le parcours de compte en local avec SQLite

Le parcours local requiert PHP 8.2 ou ultérieur, Composer et l’extension PHP `pdo_sqlite`. Sous Windows, active `extension=pdo_sqlite` dans le fichier indiqué par `php --ini`.

```sh
composer install
php bin/console doctrine:migrations:migrate --no-interaction
php -S 127.0.0.1:8000 -t public
```

Ouvre [PixelForever](http://127.0.0.1:8000), crée un compte puis connecte-toi pour jouer un Guerrier ou un Mage dans Val-des-Saules. Les comptes et les personnages sont sauvegardés dans `var/pixelforever.sqlite`.

## Vérifications locales

```sh
composer test:accounts
node --test tests/*.test.mjs
php bin/console lint:twig templates
```

Le test des comptes utilise une base SQLite temporaire et requiert `pdo_sqlite` et `dom`. Les tests Node couvrent progression, sauvegarde réseau, quête, exploration, armes et animations de combat.

## Version jouable actuelle

- Deux classes : Guerrier (Lina) et Mage (Noé). Leurs apparences et animations de marche sont conservées.
- Carte plein écran de 256 × 252 tuiles de 16 px, caméra suiveuse et zoom ×1 sur les écrans usuels. Les falaises délimitent le littoral.
- Sangliers N.1–5, squelettes N.5–10 et dragons N.10–20. À l’est des montagnes, le chemin traverse les Terres dévastées (N.21–35) et rejoint Malakor (N.40). Au sud du Trône d’Obsidienne, une route côtière relie le Marais des Scories, les Remparts de Basalte et le Cap du Gouffre (N.41–60).
- Le cimetière mêle pavés usés, mausolées sculptés, stèles moussues et saules à lichen. Les Terres dévastées alternent cendre striée, basalte, arbres calcinés et arches incandescentes. Les textures se fondent dans le terrain voisin.
- La lumière change progressivement entre la clairière diurne, le cimetière froid et les côtes volcaniques. Lanternes, fissures, sorts et Rage de Malakor éclairent leur voisinage. Pollens, brumes, flocons et braises animent les biomes.
- Les sorts et les techniques de Malakor jouent des cycles pixel art pour la charge, le projectile ou l’impact.
- Les monstres ont huit orientations et des animations propres à leur famille. Le souffle du dragon et les techniques des gardiens côtiers signalent au sol les zones à esquiver.
- Quête du PNJ : accepter, vaincre trois sangliers, puis revenir recevoir deux potions de vie. `!` doré disponible, `?` gris en cours, `?` doré à rendre.

### Combat et équipement

Malakor a 36 000 PV et trois phases. À 65 % et 25 %, la Brèche balaie le Trône par vagues. Traverse les bandes sûres avant de reprendre l’attaque. À 25 %, Malakor adopte la forme Rage et les balayages alternent entre les deux axes.

| Classe / arme | Attaque de base | Portée de base |
| --- | --- | --- |
| Guerrier · épée ou croc | Coup en mêlée | 1,5 case |
| Mage · Baguette de braise ou Sceptre de Saphyr | Projectile magique | 5 cases, plus bonus de talent éventuel |
| Mage · Bâton des saules | Coup de bâton | 1,5 case |
| Mains nues | Coup de poing | 1,5 case |

L’attaque de base ne consomme pas de ressource. Le bâton ne transforme pas les sorts du mage en coups de mêlée : Boule de feu garde sa portée de 5 cases. Maîtrise des baguettes (+6 % par rang, 5 rangs) et Focalisation de la baguette (+2 dégâts par rang, 3 rangs) renforcent uniquement les auto-attaques à la baguette. La seconde exige la maîtrise et cinq points dans Arcanes.

Les sorts de zone du Mage se lancent également à distance : Tourbillon de feu et Nova de givre sont centrés sur la cible sélectionnée, pas sur le mage. L’arme équipée ne réduit la portée d’aucun sort.

Le Guerrier commence avec 60 PV / 20 énergie, le Mage avec 40 PV / 40 mana. L’arme de départ ajoute 4 dégâts de base ; les armes rares et épiques ajoutent 7 et 11. Le niveau, les caractéristiques, les rangs et les talents modifient ensuite les statistiques.

### Progression et butin

Le niveau 1 ne donne aucun point. Chaque montée suivante donne trois points de caractéristiques et un point de talent/sort. Le niveau 2 demande 100 XP ; le seuil augmente ensuite de 50 XP par niveau. Les monstres de niveau supérieur accordent davantage d’XP. Dans les Terres dévastées, un diablotin N.22 rapporte 676 XP et un garde N.35 en rapporte 1 638.

Chaque défaite donne un objet : potion de vie 47 %, potion de ressource 30 %, arme rare 15 %, arme épique 5 %, Écaille de Saphyr 2 %, Cœur de flamme bleue 1 %. Les armes sont adaptées à la classe : Lame des saules / Croc de Saphyr pour le Guerrier, Bâton des saules / Sceptre de Saphyr pour le Mage. Écailles et cœurs sont des matériaux, non équipables. Les potions rendent 20 PV ou 15 points de ressource. La Citadelle, Malakor, les Remparts et le Cap donnent aussi des coiffes et des gants adaptés à la classe.

Les comptes, personnages et niveau/XP sont en base. Le sac, les pièces équipées, les allocations et la quête restent enregistrés par personnage dans le navigateur. Effacer ce stockage peut donc effacer ces éléments locaux.

## Commandes

Déplacements : flèches, ZQSD ou WASD. `1` attaque de base, `2` compétence principale, `3`–`6` sorts de talents débloqués, `R` potion de vie, `F` potion de ressource, `C` fiche, `T` talents, `I` inventaire, `E` dialogue du PNJ à proximité. Les touches d’action utilisent les positions physiques de la rangée supérieure, sans Maj sur AZERTY. Le clic sélectionne un monstre.

## Périmètre restant

Le monde partagé/WebSocket, le combat validé par serveur, le marchand, la vente, l’équipement secondaire et la sauvegarde serveur du sac/talents/quêtes ne sont pas encore intégrés. Le modèle PHP `Character`/`Blob` conserve des règles de prototype historiques testées séparément.

Les règles détaillées figurent dans le [game design](docs/GAME_DESIGN.md), l’affichage et les contrôles dans le [front-end](docs/FRONTEND.md), la persistance dans le [back-end](docs/BACKEND.md). Le [guide Render](docs/DEPLOIEMENT.md) distingue fusion Git et déploiement.
