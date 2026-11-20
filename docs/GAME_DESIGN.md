# PixelForever · Game design

État du prototype au 20 novembre 2026. Ce document décrit les règles jouables ; les objectifs futurs figurent à la fin. Un changement de texte ne modifie pas le moteur JavaScript.

## Boucle de jeu

Créer un Guerrier ou un Mage → parler au PNJ → explorer la clairière, le cimetière, les montagnes et les Terres dévastées → combattre → gagner XP et butin → investir les points et équiper une arme adaptée.

## Classes et attaques

| Classe / équipement | Attaque de base gratuite | Portée |
| --- | --- | --- |
| Guerrier · Épée de fer, Lame des saules, Croc de Saphyr | Frappe en mêlée | 1,5 case |
| Mage · Baguette de braise, Sceptre de Saphyr | Trait de baguette, projectile | 7,5 cases avant bonus |
| Mage · Bâton des saules | Coup de bâton | 1,5 case |
| Arme retirée | Coup de poing | 1,5 case |

Le Guerrier utilise Lina, la mêlée et l’énergie (`2,0/s` de base). Le Mage utilise Noé, la distance (`7,5` cases) et le mana (`1,0/s` de base, régénération par Esprit réduite à `+0,14/s` par point afin d’imposer une vraie gestion du mana). Le portrait et le personnage suivent la même classe. Les apparences et les planches de marche existantes sont conservées.

L’arme ne change que l’auto-attaque : un Mage au bâton peut toujours lancer Boule de feu à distance. L’attaque de base reste disponible sans mana ; Attaque chargée coûte 10 d’énergie, tandis que Boule de feu coûte 18 de mana avec une incantation de 1,0 s. Les talents peuvent réduire les coûts et délais. La cadence de base est de 500 ms, avec préparation, effets visuels enrichis, secousses de caméra mesurées et impact ; aucune seconde attaque de base ne part pendant l’attaque en cours.

Tous les sorts offensifs du Mage ciblent à distance (`7,5` cases avant bonus), quelle que soit son arme. Tourbillon de feu (28 mana, cast 1,0 s) et Nova de givre (20 mana) se déclenchent autour de la cible sélectionnée dans un rayon de 54 px. Mur de feu (22 mana, cast 1,0 s) couvre 38 px autour de la cible à `7,5` cases + 16 px ; Déflagration (15 mana) porte à `9` cases avant bonus. Interrompre une incantation d’une seconde en se déplaçant rembourse le mana. Nova ralentit pendant 2,5 secondes (`0,625 s` sur Malakor). Sans cible vivante ou hors de portée, le sort ne dépense ni mana ni recharge. Taillade reste une zone de mêlée du Guerrier, centrée sur lui.

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
| Trône d’Obsidienne (chaussée sud-ouest) | Malakor, Seigneur de la Brèche · Boss N.40 |
| Marais des Scories | Molosses des scories N.41–47 · Remous de scories circulaire |
| Remparts de Basalte | Sentinelles de basalte N.48–54 · Fracture de basalte linéaire |
| Cap du Gouffre | Gardiens du Gouffre N.55–60 · Secousse circulaire et Faille abyssale linéaire |

Le monde mesure 4 096 × 4 032 px (256 × 252 tuiles de 16 px). Il dessine une péninsule bordée par la mer ouverte et une ceinture continue de falaises côtières de trois cases, avec cinq belvédères panoramiques (Cap des Saules, Baie Émeraude, Baie de Saphyr, Cap d’Obsidienne et Belvédère des Brisants), l’île du Trône d’Obsidienne accessible depuis la Citadelle et des couloirs de transition en dégradé organique entre chaque biome. La chaussée sud du Trône mène aux trois secteurs côtiers avec huit monstres chacun, sur un total de 59 créatures. L’accès repose sur le parcours de la carte et la difficulté des rencontres. La caméra suit le joueur (avec tremblement visuel décroissant sur les impacts lourds) ; l’ATH reste fixe en plein écran. La touche `Tab` reprend le monstre vivant le plus proche à chaque pression. `Maj+Tab` parcourt les cibles proches en sens inverse. Le focus reste dans le jeu. Les chemins entre zones, belvédères et boss restent accessibles.

Les monstres engagent à proximité, préparent leur attaque et respectent leur recharge. Sangliers, squelettes et démons frappent au contact. Le dragon fixe sa direction au début de sa préparation de 450 ms et la signale au sol. Malakor ouvre le combat par le Clivage d’obsidienne et une Onde sismique en deux temps. À 65 % PV, il ajoute la Faille de magma et déclenche quatre vagues verticales sur le Trône. À 25 %, il se transforme et déclenche cinq vagues alternant les deux axes. Chaque vague laisse des bandes sûres et donne 1,32 s d’avertissement. Le joueur se déplace pendant les vagues et reprend l’attaque à l’ouverture suivante. En Rage, les attaques principales infligent 85 % de dégâts supplémentaires. Malakor réduit les dégâts subis de 20 % et les contrôles contre lui durent un quart de leur durée. Un diablotin N.22 a 1 914 PV, inflige 82 dégâts et donne 676 XP ; le garde N.35 atteint 5 554 PV, 230 dégâts et 1 638 XP ; **Malakor N.40 possède 36 000 PV et octroie 6 500 XP** (`réapparition 30 s`). Les variantes côtières passent de 7 200 à 14 648 PV et de 252 à 416 dégâts de mêlée entre les N.41 et N.60. Le rayon d’aggro monte de 98 à 138 px et l’intervalle d’attaque descend de 1 300 à 977 ms. Le tracé des attaques spéciales reste fixe après le début de la préparation. Les sprites des impacts majeurs peuvent dépasser visuellement ce tracé pour montrer la hauteur des flammes ou des débris. Le tracé au sol indique la zone à esquiver. Les valeurs exécutées sont dans `monsters.js`.

La lumière ambiante évolue avec le biome. La clairière reste diurne, le cimetière prend une lumière bleu-gris, les montagnes une lumière froide et les Terres dévastées une lumière ambrée. La côte méridionale passe du vert-de-gris au gris-violet, puis au pourpre du Cap du Gouffre. Les sources locales rendent leur voisinage plus lisible. Le pollen de la clairière, la brume du cimetière, les flocons en montagne, les lueurs du marais et les cendres de la côte accompagnent ces teintes. Le contraste des zones d’esquive reste indépendant de l’éclairage et des effets de sort.

## Quête et butin

L’habitante du hameau propose **Sécuriser le sentier** : accepter, vaincre trois sangliers, puis revenir pour recevoir deux potions de vie une seule fois. `!` doré : disponible ; `?` gris : en cours ; `?` doré : à rendre ; aucun marqueur après remise. Le dialogue donne aussi l’état en texte.

Chaque défaite crédite de l’XP selon l’espèce/niveau et un tirage personnel : vie 47 %, ressource 30 %, arme rare 15 %, arme épique 5 %, écaille 2 %, cœur 1 %. Le catalogue comprend les six objets PixelLab : Lame des saules, Bâton des saules, Croc de Saphyr, Sceptre de Saphyr, Écaille de Saphyr et Cœur de flamme bleue. Les deux derniers sont des matériaux sans usage d’équipement actuel. Le choix des armes dépend de la classe. Le tirage de base est commun aux espèces. Le tirage d’armure s’y ajoute selon le monstre vaincu.

| Source | Pièce équipable au niveau | Chance d’armure |
| --- | --- | --- |
| Gardes de la Citadelle | 32 | 20 % |
| Malakor | 40 | 100 % |
| Sentinelles de basalte | 48 | 26 % |
| Gardiens du Gouffre N.56+ | 56 | 32 % |

Chaque tirage accorde une coiffe ou des gants de la classe jouée. Malakor donne en priorité une pièce encore absente du sac. Les coiffes ajoutent des PV et de la protection au Guerrier ou du mana au Mage. Les gants renforcent les dégâts de base et des compétences.

## Persistance et objectifs futurs

Le compte, les personnages, le niveau et l’XP sont en base. Sac, équipement, allocations et quête sont locaux au navigateur. Le niveau 2 demande 100 XP puis les seuils augmentent de 50 par niveau. Le bestiaire actuel monte aux gardiens N.60 et le client accepte des personnages jusqu’au N.9 999.

Le monde partagé, la validation serveur des combats, la persistance complète, les marchands, haches, boucliers, livres et armures restent des objectifs. Ils ne doivent pas être présentés comme disponibles dans l’interface actuelle.

Voir le [front-end](FRONTEND.md) et le [back-end](BACKEND.md).
