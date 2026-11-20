# PixelForever · Game design

État du prototype au 20 novembre 2026. Ce document décrit les règles jouables ; les objectifs futurs figurent à la fin. Un changement de texte ne modifie pas le moteur JavaScript.

## Boucle de jeu

Les monstres de niveaux 1 à 10 restent neutres à proximité : ils ripostent après engagement. Au-dessus du niveau 10, ils conservent leur aggro de proximité. Chaque niveau gagné affiche « Vous avez prit un niveau » pendant trois secondes ; plusieurs niveaux gagnés produisent des notifications successives.

Créer un Guerrier, un Mage, un Démoniste, un Voleur ou un Chasseur → apparaître au Bastion de Braise → parler à Rakka → explorer la clairière, le cimetière, les montagnes et les Terres dévastées → combattre → gagner XP et butin → investir les points et équiper une arme adaptée.

## Bastion de Braise

Les cinq classes commencent sur la place du Bastion et s’y relèvent après une défaite. Les monstres restent dans leurs zones de patrouille et le combat est désactivé en ville. Les palissades aux bannières de cuir, la forge de roche sombre et les tentes du marché donnent au Bastion une identité de clan orc originale dans le Val-des-Saules. La porte est rejoint la route principale. La porte nord offre un raccourci vers le chemin de la clairière.

Rakka, l’intendante de la grande halle, confie la quête des sangliers. Granm à la forge, Vesha près de sa hutte et Drok au marché ont chacun un dialogue. Leurs ateliers pourront accueillir la forge, l’herboristerie et le commerce dans une version future.

## Caractéristiques et spécialisations

Les six caractéristiques sont disponibles pour toutes les classes. La Défense réduit les coups physiques. La croissance par niveau donne +1 à la priorité principale, +0,6 à la deuxième, +0,35 à la troisième et +0,15 aux autres. Les fractions sont conservées dans les calculs de bonus.

| Classe | Priorités |
| --- | --- |
| Guerrier | Force → Défense → Vitalité |
| Voleur | Dextérité → Force → Vitalité |
| Chasseur | Dextérité → Esprit → Intelligence |
| Mage et Démoniste | Intelligence → Esprit → Vitalité |

Dès le N.10, la fiche du Guerrier propose Rempart (+3 Défense, puis Défense → Vitalité → Force) ou Berserker (+3 Force, puis Force → Vitalité → Défense). Le choix est unique et sauvegardé localement. La croissance spécialisée commence au N.11, sans réécrire les niveaux précédents. La persistance de ce choix en base reste à réaliser avec le profil complet.

## Classes et attaques

| Classe / équipement | Attaque de base gratuite | Portée |
| --- | --- | --- |
| Guerrier · Épée de fer, Hache de fer, Lame des saules, Croc de Saphyr | Frappe en mêlée | 2,5 case |
| Mage · Baguette de braise, Sceptre de Saphyr | Trait de baguette, projectile | 5 cases avant bonus |
| Mage · Bâton des saules | Coup de bâton | 2,5 case |
| Démoniste · Grimoire | Trait d’ombre | 5 cases |
| Voleur · Dagues | Coup de dague | 2,5 case |
| Chasseur · Arc | Flèche rapide | 7 cases |
| Arme retirée | Coup de poing | 2,5 case |

Le Guerrier utilise un atlas d’armure dédié, la mêlée et l’énergie (`0,8/s` de base). Le Mage utilise Noé, les sorts à distance et le mana (`0,4/s` de base). Le Chasseur utilise aussi le mana. Seul l’Esprit ajoute de la régénération : `+0,12/s` par point gagné pour les classes à énergie, `+0,08/s` pour les classes à mana, plus les talents dédiés. La récupération est multipliée par 2,5 hors combat ; l’Intelligence ne donne aucune régénération. La baguette et le sceptre tirent en mouvement à 5 cases et infligent 50 % des dégâts d’auto-attaque avant Focalisation et Maîtrise des baguettes.

Le Démoniste incante Corruption en 0,75 s. Corruption et Agonie coexistent. Immolation s’incante en 1 s, Trait du chaos en 1,5 s et Drain de vie pulse toutes les 500 ms pendant 2 s, en rendant des PV selon les dégâts infligés. Se déplacer interrompt l’incantation ou la canalisation. Une pulsation déjà jouée engage le coût et la recharge du drain.

Le Démoniste garde une invocation à la fois. Le diablotin, disponible au niveau 1, attaque à distance. La succube ralentit et le marcheur du Vide est plus robuste mais frappe moins fort. Les invocations assistent les attaques du maître et peuvent recevoir les coups des monstres ordinaires qu’elles engagent. Malakor continue de viser le joueur.

Le Chasseur apprivoise une créature du monde, sauf les squelettes : niveau inférieur ou égal au sien, au plus 30 % des PV et portée de 7 cases. Il canalise quatre secondes sans se déplacer ni subir de dégâts. Une cible morte, hors de portée ou engagée par un autre propriétaire annule la tentative. La capture retire la créature du monde et programme sa réapparition, sans donner XP, butin ou crédit de quête. Une nouvelle capture remplace le familier précédent.

Les familiers héritent de 30 % des dégâts de base, de 50 % des PV et de 35 % de la Défense du maître ; les bonus d’équipement aux dégâts/PV et une part de sa réduction de dégâts sont pris en compte. Le Marcheur du Vide gagne 30 % de PV supplémentaires et inflige 20 % de dégâts en moins, avec une cadence plus lente. Un boss apprivoisé réutilise son apparence à taille réduite, sans ses statistiques ou attaques spéciales sauvages. Ces pourcentages sont une première calibration à éprouver avec le futur équilibrage des combats.

Trois petites cases au-dessus de la barre, à droite, utilisent **W/X/C sur AZERTY** et **Z/X/C sur QWERTY** (positions physiques KeyZ/KeyX/KeyC). Démoniste : Diablotin / Succube / Marcheur du Vide, selon les talents appris. Chasseur : Apprivoiser / Appeler ou rappeler près de soi / Révoquer. Un familier rappelé reste passif jusqu’à une nouvelle commande X. Révoquer conserve la créature et ses PV pour l’appel suivant. Appeler ou apprivoiser coûte au moins 10 mana ou 28 % du mana maximum ; les invocations démoniaques coûtent au moins 28 % du maximum avant réduction de coût. Un familier vaincu impose 30 secondes avant rappel dans la session. La fiche utilise **P**.

Un Mage au bâton garde la portée de Boule de feu. Tir perforant requiert un arc équipé. L’attaque de base est gratuite. Attaque chargée coûte 7 d’énergie et Boule de feu coûte 14 de mana avec 1 s d’incantation. La cadence de base est de 500 ms et une attaque en cours bloque le lancement d’une autre auto-attaque. Les talents peuvent réduire les coûts et les délais.

Boule de feu, Tourbillon de feu et Nova de givre portent à 15 cases avant bonus, quelle que soit l’arme équipée. Tourbillon de feu (28 mana, incantation de 1 s) et Nova de givre (20 mana) touchent dans un rayon de 54 px autour de la cible. Mur de feu (22 mana, incantation de 1 s) porte à 16 cases et couvre 38 px autour de la cible. Déflagration (15 mana) porte à 16,5 cases avant bonus. Se déplacer pendant une incantation l’annule et rembourse le mana. Nova ralentit pendant 2,5 secondes (`0,625 s` sur Malakor). Sans cible vivante ou hors de portée, le sort ne dépense ni mana ni recharge. Taillade reste centrée sur le Guerrier.

La cible doit être vivante et à portée. Un coup de mêlée revérifie la portée à l’impact. Une cible morte ne reçoit pas un second crédit de défaite. Après une défaite, le personnage se relève au Bastion et garde sa progression.

## Talents et progression

Aucun point au niveau 1. Chaque niveau suivant donne trois points de caractéristiques et un point de talent/sort, avec croissance naturelle de classe. Les rangs des sorts de base sont supprimés ; leurs anciens points sont rendus automatiquement à la reprise de la sauvegarde. Seuls les talents consomment ce budget. La réinitialisation des talents rend les points investis dans les talents. Les prérequis, rangs maximums et points de branche sont vérifiés.

- **Guerrier** · Armes, Fureur et Protection. La Défense réduit les coups physiques. Protection donne accès à Coup de bouclier, Provocation et Rempart.
- **Mage** · Pyromancie, Arcanes et Givre. Mur de feu, Tourbillon de feu, Déflagration et Nova de givre sont des compétences actives.
- **Démoniste** · Affliction, Démonologie et Destruction. Les talents donnent accès à Drain de vie, aux invocations avancées et aux sorts de feu et de chaos.
- **Voleur** · Assassinat, Combat et Subterfuge. La Dextérité renforce les dagues. Les branches proposent Rupture, Rafale de lames et des techniques d’ombre.
- **Chasseur** · Précision, Survie et Dompteur. La Dextérité renforce l’arc. Les branches proposent Volée, Piège à pointes, Soin du familier et Marque de proie. L’ancien talent Appel du faucon devient Soin du familier en conservant les points investis.
- Maîtrise des baguettes : cinq rangs de +6 % sur le tir de baguette.
- Focalisation de la baguette : trois rangs de +2 dégâts avant maîtrise, avec maîtrise apprise et cinq points en Arcanes requis.

Les bonus de baguette s’appliquent aux tirs de baguette. Les techniques actives occupent les touches 3 à 6, jusqu’à 8 pour le Guerrier. Les invocations sont retirées des emplacements numérotés et utilisent leur barre dédiée. Leur coût et leur recharge sont propres à chaque compétence.

## Animations de combat

L’auto-attaque à distance et les sorts du Mage utilisent une pose d’incantation orientée et des effets magiques. La planche Noé `attack.png`, issue de « Frappe à la lanterne », sert aux coups de contact et ne doit pas être utilisée pour représenter un tir de baguette. Les poses d’incantation dérivent du sprite existant, sans redessiner le personnage.

Le Guerrier en armure utilise une planche d’attaque dédiée. L’épée, la hache et le bouclier suivent la main dans les poses de combat. La Hache de fer s’équipe dans l’inventaire et déclenche sa propre animation de frappe. La préparation, le projectile et le retour du geste rendent le déroulement des attaques lisible. [Catalogue des VFX](VFX.md)

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

Les monstres de niveau supérieur à 10 engagent à proximité ; ceux de niveaux 1 à 10 attendent une attaque. Une fois engagés, ils préparent leur attaque et respectent leur recharge. Sangliers, squelettes et démons frappent au contact. Le dragon fixe sa direction au début de sa préparation de 450 ms et la signale au sol. Malakor ouvre le combat par le Clivage d’obsidienne et une Onde sismique en deux temps. À 65 % PV, il ajoute la Faille de magma et déclenche quatre vagues verticales sur le Trône. À 25 %, la transformation en Rage déclenche une déferlante de braises et de lumière sur la carte. Durant les 3,8 premières secondes, Malakor interrompt ses attaques et le joueur peut se déplacer et attaquer. La préparation du premier balayage commence ensuite et matérialise les bandes au sol après 350 ms. La série en Rage compte cinq vagues qui alternent les deux axes. Chaque vague laisse des bandes sûres et donne 1,32 s d’avertissement. Des rayons de feu continus parcourent les bandes dangereuses pendant 600 ms. À la fin, leurs fragments lumineux deviennent des braises qui s’éteignent en trois secondes. Ces particules sont purement visuelles. Le joueur se déplace pendant les vagues et reprend l’attaque à l’ouverture suivante. En Rage, les attaques principales infligent 85 % de dégâts supplémentaires. Malakor réduit les dégâts subis de 20 % et les contrôles contre lui durent un quart de leur durée. Un diablotin N.22 a 1 914 PV, inflige 82 dégâts et donne 676 XP ; le garde N.35 atteint 5 554 PV, 230 dégâts et 1 638 XP ; **Malakor N.40 possède 36 000 PV et octroie 6 500 XP** (`réapparition 30 s`). Les variantes côtières passent de 7 200 à 14 648 PV et de 252 à 416 dégâts de mêlée entre les N.41 et N.60. Le rayon d’aggro monte de 98 à 138 px et l’intervalle d’attaque descend de 1 300 à 977 ms. Le tracé des attaques spéciales reste fixe après le début de la préparation. Les sprites des impacts majeurs peuvent dépasser visuellement ce tracé pour montrer la hauteur des flammes ou des débris. Le tracé au sol indique la zone à esquiver. Les valeurs exécutées sont dans `monsters.js`.

La lumière ambiante évolue avec le biome. La clairière reste diurne, le cimetière prend une lumière bleu-gris, les montagnes une lumière froide et les Terres dévastées une lumière ambrée. La côte méridionale passe du vert-de-gris au gris-violet, puis au pourpre du Cap du Gouffre. Les sources locales rendent leur voisinage plus lisible. La clairière laisse flotter du pollen doré. Au cimetière, les nappes froides suivent le sol. En montagne, les flocons traversent des rafales diagonales. Les Terres dévastées soulèvent des braises, le Marais des Scories diffuse des spores vertes, les Remparts de Basalte brassent des cendres mauves et le Cap du Gouffre projette des étincelles violettes. Le contraste des zones d’esquive reste indépendant de l’éclairage et des effets de sort.

## Quête et butin

Rakka propose **Sécuriser le sentier** au Bastion. Une fois la quête acceptée, vaincre trois sangliers puis revenir la voir pour recevoir deux potions de vie une seule fois. Le marqueur affiche `!` doré, `?` gris en cours et `?` doré au retour. Le dialogue indique aussi l’état de la quête.

Chaque défaite crédite de l’XP selon l’espèce/niveau et un tirage personnel : vie 47 %, ressource 30 %, arme rare 15 %, arme épique 5 %, écaille 2 %, cœur 1 %. Le catalogue comprend les six objets PixelLab : Lame des saules, Bâton des saules, Croc de Saphyr, Sceptre de Saphyr, Écaille de Saphyr et Cœur de flamme bleue. Les deux derniers sont des matériaux sans usage d’équipement actuel. Le choix des armes dépend de la classe. Le tirage de base est commun aux espèces. Le tirage d’armure s’y ajoute selon le monstre vaincu.

| Source | Pièce équipable au niveau | Chance d’armure |
| --- | --- | --- |
| Gardes de la Citadelle | 32 | 20 % |
| Malakor | 40 | 100 % |
| Sentinelles de basalte | 48 | 26 % |
| Gardiens du Gouffre N.56+ | 56 | 32 % |

Chaque tirage accorde une coiffe ou des gants de la classe jouée. Malakor donne en priorité une pièce encore absente du sac. Les coiffes ajoutent des PV et un bonus de protection ou de ressource selon la classe. Les gants renforcent les dégâts de base et des compétences. [Catalogue des armures](../public/game/armor.js)

## Persistance et objectifs futurs

Le compte, les personnages, le niveau et l’XP sont en base. Sac, équipement, allocations et quête sont locaux au navigateur. Le niveau 2 demande 100 XP puis les seuils augmentent de 50 par niveau. Le bestiaire actuel monte aux gardiens N.60 et le client accepte des personnages jusqu’au N.9 999.

Le monde partagé, la validation serveur des combats, la persistance complète, les marchands, haches, boucliers, livres et armures restent des objectifs. Ils ne doivent pas être présentés comme disponibles dans l’interface actuelle.

Voir le [front-end](FRONTEND.md) et le [back-end](BACKEND.md).
