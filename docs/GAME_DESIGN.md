# PixelForever · Game design

État du prototype au 20 novembre 2026. Ce document décrit les règles jouables ; les objectifs futurs figurent à la fin. Un changement de texte ne modifie pas le moteur JavaScript.

## Boucle de jeu

Créer un Guerrier ou un Mage → parler au PNJ → explorer la clairière, le cimetière, les montagnes et les Terres dévastées → combattre → gagner XP et butin → investir les points et équiper une arme adaptée.

## Classes et attaques

| Classe / équipement | Attaque de base gratuite | Portée |
| --- | --- | --- |
| Guerrier · Épée de fer, Lame des saules, Croc de Saphyr | Frappe en mêlée | 1,5 case |
| Mage · Baguette de braise, Sceptre de Saphyr | Trait de baguette, projectile | 5 cases avant bonus |
| Mage · Bâton des saules | Coup de bâton | 1,5 case |
| Arme retirée | Coup de poing | 1,5 case |

Le Guerrier utilise Lina, la mêlée et l’énergie. Le Mage utilise Noé et le mana. Le portrait et le personnage suivent la même classe. Les apparences et les planches de marche existantes sont conservées.

L’arme ne change que l’auto-attaque : un Mage au bâton peut toujours lancer Boule de feu à distance. L’attaque de base reste disponible sans mana ; Boule de feu et Attaque chargée coûtent initialement 10 points de ressource. Les talents peuvent réduire les coûts et délais. La cadence de base est de 500 ms, avec préparation et impact ; aucune seconde attaque de base ne part pendant l’attaque en cours.

Tous les sorts offensifs du Mage ciblent à distance, quelle que soit son arme. Tourbillon de feu et Nova de givre se déclenchent autour de la cible sélectionnée, dans un rayon de 54 px, à cinq cases de portée de lancement avant bonus. Mur de feu couvre 38 px autour de la cible et porte à six cases ; Déflagration porte à 6,5 cases. Nova ralentit pendant 2,5 secondes. Sans cible vivante ou hors de portée, le sort ne dépense ni mana ni recharge. Taillade reste une zone de mêlée du Guerrier, centrée sur lui.

La cible doit être vivante et à portée. Un coup de mêlée revérifie la portée à l’impact. Une cible morte ne reçoit pas un second crédit de défaite. Une défaite permet de se relever au camp en gardant la progression.

## Talents et progression

Aucun point au niveau 1. Chaque niveau suivant donne trois points de caractéristiques et un point de talent/sort, avec croissance naturelle de classe. Les rangs de sorts de base et les talents consomment le même budget. La réinitialisation des talents rend les points investis dans les talents. Les prérequis, rangs maximums et points de branche sont vérifiés.

- Guerrier : Armes, Fureur et Protection ; Taillade, Engagement, Berserk et Coup de bouclier sont des compétences actives.
- Mage : Pyromancie, Arcanes et Givre ; Mur de feu, Tourbillon de feu, Déflagration et Nova de givre sont des compétences actives.
- Maîtrise des baguettes : cinq rangs de +6 % sur le tir de baguette.
- Focalisation de la baguette : trois rangs de +2 dégâts avant maîtrise, avec maîtrise apprise et cinq points en Arcanes requis.

Les bonus de baguette ne renforcent ni les coups de bâton, ni les sorts, ni les attaques du Guerrier. Les compétences actives débloquées occupent les emplacements 3 à 6. Leur coût et leur recharge sont propres à chaque compétence.

## Animations de combat

L’auto-attaque à distance et les sorts du Mage utilisent une pose d’incantation orientée et des effets magiques. La planche Noé `attack.png`, issue de « Frappe à la lanterne », sert aux coups de contact et ne doit pas être utilisée pour représenter un tir de baguette. Les poses d’incantation dérivent du sprite existant, sans redessiner le personnage.

Les exports `pixel` vérifiés contiennent « Frappe à la lanterne » pour Noé et « Coup de marteau » pour Lina. Aucun cycle d’incantation dédié n’y est présent. Une future animation magique complète devra utiliser un export dédié, en conservant l’apparence du personnage ; le geste orienté actuel est une adaptation des poses existantes.

La préparation et la fin du geste sont cadencées pour rester lisibles à 30 FPS. Le projectile suit sa propre trajectoire vers la cible. Les compétences de talents déclenchent aussi un geste. Les directions nord utilisent des poses orientées ; les frappes existantes restent disponibles pour le Guerrier et le bâton. Les fichiers Markdown n’interviennent pas dans ce choix à l’exécution : `combat.js` et `world.js` l’appliquent.

## Monde et monstres

| Zone | Espèces et niveaux |
| --- | --- |
| Clairière proche du départ | Sangliers N.1–5 ; premières patrouilles N.1–2, puis N.2–4 et N.4–5 plus loin |
| Cimetière, indiqué par des pancartes en bois | Squelettes N.5–10 |
| Montagnes, à l’écart du départ | Dragons N.10–20 |
| Terres dévastées · Brèche des cendres | Diablotins N.21–25 |
| Terres dévastées · Plaine calcinée | Molosses infernaux N.25–30 |
| Terres dévastées · Citadelle de la Brèche | Gardes de la Brèche N.30–35 |

Le monde mesure 2 688 × 1 920 px. La caméra suit le joueur ; l’ATH reste fixe en plein écran. Les falaises de quatre cases bloquent les quatre bords. Les chemins entre zones restent accessibles.

Les monstres engagent à proximité, préparent leur attaque et respectent leur recharge. Sangliers, squelettes et démons frappent au contact. Le dragon fixe sa direction au début de sa préparation de 450 ms et la signale au sol. Son souffle parcourt ensuite la ligne à 142 px/s et blesse une seule fois au contact. Un pas de côté pendant le vol ou un obstacle entre le projectile et le joueur évite l’impact. Étourdir ou tuer le dragon éteint son souffle. Patrouilles, poursuites et réapparitions restent dans le secteur de l’espèce.

Les niveaux 1–2 restent abordables. Un diablotin N.22 a 1 914 PV, inflige 82 dégâts et donne 676 XP. Un molosse N.27 a 2 954 PV, inflige 124 dégâts et donne 966 XP. Le garde N.35 atteint 5 554 PV, 230 dégâts et 1 638 XP. Les valeurs exécutées sont dans `monsters.js`.

## Quête et butin

L’habitante du hameau propose **Sécuriser le sentier** : accepter, vaincre trois sangliers, puis revenir pour recevoir deux potions de vie une seule fois. `!` doré : disponible ; `?` gris : en cours ; `?` doré : à rendre ; aucun marqueur après remise. Le dialogue donne aussi l’état en texte.

Chaque défaite crédite de l’XP selon l’espèce/niveau et un tirage personnel : vie 47 %, ressource 30 %, arme rare 15 %, arme épique 5 %, écaille 2 %, cœur 1 %. Le catalogue comprend les six objets PixelLab : Lame des saules, Bâton des saules, Croc de Saphyr, Sceptre de Saphyr, Écaille de Saphyr et Cœur de flamme bleue. Les deux derniers sont des matériaux sans usage d’équipement actuel. Le choix des armes dépend de la classe ; la table actuelle est commune aux espèces, sans restriction du matériau au dragon.

## Persistance et objectifs futurs

Le compte, les personnages, le niveau et l’XP sont en base. Sac, équipement, allocations et quête sont locaux au navigateur. Le niveau 2 demande 100 XP puis les seuils augmentent de 50 par niveau. Le bestiaire actuel monte au N.35 et le client accepte des personnages jusqu’au N.9 999.

Le monde partagé, la validation serveur des combats, la persistance complète, les marchands, haches, boucliers, livres et armures restent des objectifs. Ils ne doivent pas être présentés comme disponibles dans l’interface actuelle.

Voir le [front-end](FRONTEND.md) et le [back-end](BACKEND.md).
