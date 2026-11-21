# PixelForever — refonte des classes, de la progression et du monde partagé

Cadrage du 20 novembre 2026, validé par l’utilisateur. Livrés sur la branche de refonte : caméra ×2, neutralité des monstres N.1–10 et notification de niveau. Les autres sections décrivent le travail restant. Le dépôt examiné est le checkout Expernet, `main`, commit `2ca4a10`. Les valeurs ci-dessous sont un point de départ de test, pas un équilibrage déjà démontré.

## Résultat attendu

État de reprise après intégration du lot `871d508` de `main` : portées d’auto-attaque 2,5/5/7, six caractéristiques, croissance priorisée, choix Rempart/Berserker au N.10, suppression des rangs de base avec remboursement et régénération par Esprit sont maintenant présents. Les identifiants internes sont `bulwark` (Rempart) et `berserker`. Les règles jouables figurent dans `GAME_DESIGN.md` ; les chiffres proposés ci-dessous ne remplacent pas ces règles.

Le lot suivant ajoute l’apprivoisement, l’héritage des statistiques des familiers, la barre W/X/C et la fiche P. La créature apprivoisée est sauvegardée localement ; sa persistance serveur reste liée au futur profil complet.

Le lot armes remplace les objets séparés des nouvelles classes. À la demande de révision visuelle, l’arc se porte verticalement au repos, les dagues sont raccourcies et le livre du Démoniste est supprimé. Sa magie est représentée par une aura sombre et violette, des volutes et une libération d’énergie. Les visages, cheveux et apparences sources sont conservés. Le départ de la flèche reste synchronisé à la poignée et à la décoche.

Restent notamment : calibration des monstres, des ressources et des familiers, validation du temps de progression vers N.60, persistance du profil complet et monde partagé Symfony.

Des armes tenues correctement dans les animations, un début de jeu où les ressources imposent de choisir ses compétences, cinq classes distinctes, une progression naturelle modérée et des combats exigeants contre des monstres jusqu’à deux ou trois niveaux supérieurs. Les personnages connectés doivent réellement partager la présence des joueurs, l’état des monstres et les récompenses de combat.

## 1. Sprites et caméra

Régénérer les planches de classes avec une prise en main cohérente de l’arc et des dagues dans chaque direction. Pour le Démoniste, représenter directement la magie noire autour du personnage, sans livre visible. Vérifier le mouvement et les effets en jeu. Préserver les identités visuelles des personnages déjà appréciés et la cohérence PixelLab des décors.

Proposition : zoom par défaut ×2, pixels nets et caméra toujours bornée au monde. Le réglage actuel est dans `public/game/exploration.js`, fonction `cameraZoom`, ligne 52 au commit examiné. `public/game/world.js:104` l’applique avec `cam.setZoom(...)`.

```js
export function cameraZoom(viewWidth, viewHeight) {
    return Math.max(
        2, // Zoom minimum : 1 éloigné, 2 proposé, 3 très proche.
        Math.ceil(viewWidth / (columns * tileSize)),
        Math.ceil(viewHeight / (rows * tileSize)),
    );
}
```

Le minimum livré vaut `2`, modifiable directement dans cette fonction. Après une modification du fichier, recharger la page. Un zoom entier évite les irrégularités de pixels lors du défilement.

## 2. Portée et ressources

- Proposer 2,5 cases pour les auto-attaques de mêlée : Guerrier, Voleur et bâton. Revoir la mesure avec la taille des cibles pour éviter de devoir entrer dans leur sprite, notamment contre les grands monstres.
- Mage et Démoniste : portée de référence de 5 cases ; Chasseur : 7 cases. Conserver les spécificités explicites des sorts à portée étendue. L’arme magique ne modifie que l’auto-attaque : baguette à distance, bâton au contact, sorts toujours à distance.
- Retirer complètement la maîtrise/rangs des sorts de base : interface, actions, bonus de dégâts et validations. Rendre les points anciennement dépensés sans supprimer talents, objets, niveau ou XP.
- Intelligence : puissance magique et réserve, sans régénération. Esprit : seule caractéristique de régénération. Supprimer aussi les gains automatiques de régénération venant directement du niveau, indépendamment de l’Esprit. Les talents explicitement dédiés peuvent améliorer la récupération ou les coûts.
- Toutes les classes utilisent une ressource limitée ; le Chasseur utilise bien le mana. Point de départ proposé : une compétence consomme environ 25–35 % de la réserve initiale. Deux à trois compétences doivent épuiser une réserve au début, sans empêcher les auto-attaques gratuites.
- Proposition de récupération initiale : environ 0,4 point/s de mana en combat et récupération plus rapide hors combat ; environ 0,8 point/s d’énergie en combat. La formule sera recalée avec les valeurs d’Esprit et les coûts réels. Le gain venant de l’intelligence doit rester strictement nul à tous les niveaux.

## 3. Caractéristiques et spécialisations

Les six caractéristiques sont Force, Dextérité, Intelligence, Esprit, Vitalité et Défense. Défense existe partiellement dans le code actuel : la compléter et la rendre lisible plutôt que créer une deuxième caractéristique « Tank ». Dans les priorités suivantes, « Tank » est interprété comme Défense.

| Profil | Priorité 1 | Priorité 2 | Priorité 3 |
| --- | --- | --- | --- |
| Guerrier | Force | Défense | Vitalité |
| Guerrier Rempart, à partir du N.10 | Défense | Vitalité | Force |
| Guerrier Berserker, à partir du N.10 | Force | Vitalité | Défense |
| Voleur | Dextérité | Force | Vitalité |
| Chasseur | Dextérité | Esprit | Intelligence |
| Démoniste | Intelligence | Esprit | Vitalité |
| Mage | Intelligence | Esprit | Vitalité |

Croissance naturelle proposée par niveau : +1,00 sur la priorité 1, +0,60 sur la priorité 2, +0,35 sur la priorité 3 et +0,15 sur les autres caractéristiques. Les valeurs finales de PV/dégâts sont arrondies ; les fractions naturelles ne sont pas perdues. Les points manuels déjà gagnés restent disponibles selon les règles actuelles.

Au N.10, le Guerrier peut choisir une spécialisation persistante. Proposition de bonus initial : +3 Défense au Rempart, +3 Force au Berserker. La nouvelle priorité s’applique aux niveaux de spécialisation, sans réécrire arbitrairement la croissance des neuf premiers niveaux. Un Guerrier existant au-dessus du N.10 peut faire son choix sans perdre de progression.

La Défense réduit les dégâts avec rendements décroissants. Le Rempart doit mieux encaisser et combattre plus lentement que le Berserker ; il ne doit pas devenir invulnérable en accumulant une réduction linéaire.

## 4. Apprivoisement et invocations

Le Chasseur doit apprivoiser une créature du monde au lieu de recevoir automatiquement un faucon. La demande exclut les squelettes ; les autres espèces doivent être prises en charge. Leurs statistiques sauvages et les mécaniques de boss ne sont pas copiées telles quelles dans le familier.

Conditions initiales proposées : cible vivante de niveau au plus égal au Chasseur, affaiblie à 30 % de PV ou moins, canalisation de quatre secondes interrompue par un coup reçu, sans récompense de victoire pour une capture. Un monstre déjà combattu par un autre joueur ne peut pas lui être retiré par apprivoisement. La créature apprivoisée et sa sélection sont sauvegardées côté serveur.

Un seul compagnon actif par maître. Point de départ proposé : 30 % de la puissance offensive pertinente, 50 % des PV et 35 % de la Défense du maître, équipement compris. La cadence et les coefficients sont calibrés pour représenter environ 15–25 % des dégâts totaux du duo sur une cible normale ; ce résultat doit être mesuré, pas supposé à partir d’un pourcentage brut. Le démon protecteur reçoit davantage de survie en échange de dégâts inférieurs.

Une petite barre de trois cases est placée au-dessus de la partie droite de la barre principale :

- Chasseur : Apprivoiser, Appeler/rappeler, Renvoyer.
- Démoniste : Diablotin, Succube, Marcheur du Vide ; une nouvelle invocation remplace l’ancienne.

Raccourcis proposés : W/X/C en AZERTY, soit les mêmes positions physiques Z/X/C en QWERTY. La fiche passe de C à P pour libérer C ; les déplacements QWERTY WASD restent disponibles. Les invocations sortent des six emplacements de combat principaux. Les touches affichées suivent cette règle clairement.

## 5. Monstres, XP et notifications

Les monstres ordinaires N.1–10 n’engagent pas à proximité : ils ripostent uniquement après une attaque du joueur ou de son compagnon. La sécurité du départ est la même pour tous les joueurs, sans dépendre d’un réglage local du navigateur.

Étalons de combat proposés pour un personnage normalement équipé et une rotation raisonnable :

- Même niveau : combat d’environ 20–30 secondes.
- Deux niveaux au-dessus : environ 40–60 secondes, ressources réellement consommées.
- Trois niveaux au-dessus : combat possible mais long et risqué, environ 60–90 secondes, nécessitant une bonne gestion et éventuellement une potion.

Ces étalons concernent les monstres ordinaires, pas les boss conçus pour plusieurs joueurs. Vérifier les cinq classes et les deux spécialisations aux N.1, 10, 30 et 60. Réajuster conjointement PV, dégâts, mitigation, coûts, récupération et récompenses ; changer seulement l’XP ne suffit pas.

Cible de progression : environ 150 minutes de jeu actif jusqu’au N.60, avec une plage de référence de deux à trois heures incluant déplacements et récupération. Construire une simulation reproductible du parcours, puis confirmer par des sessions jouées. Préserver les niveaux existants et convertir proportionnellement l’avancement dans le niveau si les seuils changent. Le temps d’un joueur individuel ou d’un joueur inactif ne peut pas être garanti.

À chaque montée de niveau, afficher exactement : « Vous avez prit un niveau ». Le message doit apparaître indépendamment du journal de dégâts, sans être remplacé immédiatement par une attaque.

## 6. Monde partagé : approche proposée

Choix technique proposé : réutiliser Symfony/PostgreSQL et des échanges JSON fréquents, avec interpolation visuelle des déplacements. Cela évite un service supplémentaire pour cette première version partagée. Une architecture WebSocket constitue l’alternative pour augmenter ensuite la fréquence et le nombre de joueurs ; elle demande un serveur temps réel et une exploitation supplémentaires.

Les autres personnages sont visibles dans la même zone avec leur apparence, leur orientation et leurs animations. Le serveur conserve présence, états des monstres, ciblage, PV, captures et récompenses. Une connexion expirée disparaît automatiquement. Deux onglets ne doivent pas dupliquer artificiellement un même personnage ou ses récompenses.

Les combats partagent réellement les mêmes monstres : une mort, une réapparition et une attribution contrôlée par participant. Les attaques sont validées côté serveur (propriétaire, cible, portée, cadence, ressource). Les changements de schéma sont livrés avec migrations ; la base Render n’est pas modifiée manuellement pendant le développement.

La population dépend des joueurs actifs proches de chaque zone, pas du nombre total de comptes connectés. Première courbe proposée : population de base × (1 + 0,5 × joueurs supplémentaires), délai de réapparition divisé par la racine du nombre de joueurs, avec minimum et plafond pour éviter une apparition incontrôlée. Simuler aussi l’XP en groupe pour ne pas rendre le N.60 dix fois plus rapide grâce au cumul des récompenses et des apparitions.

L’XP partagée doit récompenser les participants utiles (dont le tank), avec un budget de groupe et un bonus modéré, plutôt que multiplier intégralement l’XP d’un monstre par le nombre de joueurs. Les règles précises sont à calibrer avec le même simulateur que le jeu solo.

## 7. Livraison et vérifications

Conserver une branche dédiée et livrer des commits cohérents : rendu/caméra, règles et migration des personnages, familiers et commandes, monde partagé, puis calibration globale et documentation. Garder l’ensemble du périmètre demandé dans le suivi, y compris le multijoueur.

Vérifications attendues : tests de migration, portée et ressources ; zéro régénération issue de l’intelligence ; spécialisation N.10 ; capture/refus d’un squelette ; coefficients de familiers avec équipement ; suppression/remboursement des anciens rangs ; comportement neutre des monstres N.1–10 ; notification ; simulation N.1–60 ; inspection visuelle des planches et de leurs mains ; deux sessions réelles contre un même monstre, déconnexion et récompense sans doublon.

Actualiser les documents du dépôt selon le résultat effectivement livré. Le déploiement Render reste manuel comme demandé précédemment.

## Avancement du 21 novembre 2026

Livré dans le code : barème XP version 2, migration proportionnelle locale/SQL, simulation reproductible des cinq classes (151–178 min de référence), coûts à 28 % minimum, potions à 30 % avec recharge commune 15 s, baguette à pleine puissance, présence Symfony avec interpolation des personnages et bail par personnage.

Non livré : autorité serveur des combats, monstres/PV/morts/captures partagés, attribution atomique des récompenses, XP de groupe, population et réapparition selon les joueurs actifs, profil complet en base. La présence visuelle seule ne constitue pas le monde partagé décrit à la section 6. Contrôle visuel à deux fenêtres restant : serveur local inaccessible depuis Edge.

Ajout ciblé : Trappe d’apprivoisement de départ du Chasseur, touche 3, neutralisation 6 s puis W pour capturer, recharge 20 s. Réutilise les conditions existantes et reste locale au navigateur.
