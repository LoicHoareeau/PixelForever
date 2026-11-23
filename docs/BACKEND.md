# PixelForever · Back-end

État au 21 novembre 2026. Symfony et Doctrine gèrent l’inscription, l’authentification par session, les personnages et la sauvegarde de leur niveau/XP. Le combat jouable reste calculé dans le navigateur. La présence est stockée en base ; les combats partagés et la persistance du reste de la progression sont des travaux futurs.

## Modèle et parcours actuels

Les planches d’arc et de dagues et les poses du Démoniste sont des ressources front-end versionnées. Le Démoniste affiche Essence de cendres, Sceau des saules et Sceau de Saphyr comme focalisations d’ombre. L’ancien identifiant interne `Item::Grimoire` reste compatible avec les données existantes ; aucun grimoire n’est affiché. Les bonus, prix, sauvegardes et portées sont conservés, sans migration.

Le familier apprivoisé (`capturedPet`, espèce et fraction de PV) est encore sauvegardé localement par personnage. Le lot familiers ne persiste pas encore les captures en base. La validation locale d’un propriétaire d’engagement prépare ce cas, sans constituer une garantie multijoueur côté serveur.

`CharacterController` transmet les portées et les six caractéristiques définies par `CharacterClass`. Le drapeau `ranged` dépend explicitement de la classe (Mage, Démoniste, Chasseur), car une portée de mêlée de 2,5 cases dépasse désormais l’ancien seuil de 1,5. Le choix Rempart/Berserker et le reste du profil restent locaux au navigateur ; seuls le niveau et l’XP sont persistés en base pour ce lot.

`User` conserve pseudo et e-mail uniques, avec mot de passe haché. `PlayerCharacter` appartient à un `User` et contient nom, classe (`CharacterClass`), niveau, expérience et or. Les deux seules entités Doctrine actuelles sont dans `src/Entity/`.

`GET /` affiche l’accueil. Un visiteur peut s’inscrire ou se connecter ; un joueur déjà connecté peut rejoindre ses personnages directement. Après connexion, le joueur crée puis sélectionne son personnage. Symfony vérifie son propriétaire et conserve la sélection en session. Le bouton **Jouer** sélectionne le personnage et redirige vers `CharacterController::play()` qui fournit à Twig les statistiques et le catalogue de butin, puis `world.js` initialise Phaser. La présence en base utilise une route Symfony JSON. Le flux visuel utilise le relais WebSocket du même conteneur et des tickets signés émis par Symfony.

## Sauvegarde du niveau et de l’XP

`POST /personnages/{id}/progression` exige la session du propriétaire, un jeton CSRF et des valeurs entières bornées. Le niveau doit être compris entre 1 et 9 999 ; l’XP doit rester sous le seuil du niveau. Une mise à jour DQL conditionnelle atomique empêche une requête ancienne de faire régresser niveau/XP. L’entrée dans le jeu restaure ces valeurs depuis la base ; une progression locale plus avancée peut être envoyée ensuite.

La route ne valide pas encore chaque victoire : les valeurs restent proposées par le client. Sac, arme, coiffes, gants, allocations et quête restent dans `localStorage`, avec une clé propre au personnage. La base n’assure donc pas encore leur restauration sur un autre navigateur. Le champ or existe mais le marchand n’est pas intégré au jeu.

SQLite sert au développement local et aux tests ; PostgreSQL est utilisé pour la persistance Render. La migration `Version20261120090000` convertit l’XP proportionnellement et ajoute `world_presence` ; les niveaux restent inchangés. La configuration du moteur et les migrations existantes restent dans `config/` et `migrations/`.

## Règles métier et client

`src/Game/CharacterClass.php` fournit les cinq classes, leurs apparences, leurs ressources et leurs valeurs de départ. Les nouvelles classes utilisent la colonne texte existante de Doctrine. La hache équipée et les points de Dextérité et de Défense suivent la sauvegarde locale. `CharacterController` transmet la portée de base (`range`), la portée de sort (`specialRange`) et le multiplicateur de dégâts de baguette (`wandDamageMultiplier`). `progression.js` calcule l’auto-attaque selon l’arme et la progression. `combat.js` applique la portée des sorts du Mage indépendamment de l’arme équipée.

Les dégâts périodiques, la canalisation et les familiers sont résolus côté navigateur. Le familier actif et sa cible sont temporaires. Les talents qui débloquent les invocations sont conservés dans la sauvegarde locale avec les autres talents. [Règles des classes](GAME_DESIGN.md#classes-et-attaques) · [Logique des techniques](../public/game/class-combat.js)

`src/Game/Character.php`, `Blob.php`, `Item.php` et `TrailQuest.php` conservent un prototype métier PHP historique (Blob, vente, objets simples). Ce modèle n’est pas le moteur exécuté par Phaser : son `EmberStaff` et sa table de butin ne doivent pas être pris pour le catalogue actuel du navigateur. Ne pas modifier ses anciennes règles sans vérifier ses tests et ses utilisateurs.

## Contrôles disponibles

```sh
composer test:accounts
node --test tests/*.test.mjs
php bin/console lint:twig templates
```

Le parcours PHP utilise une base temporaire : inscription, connexion, création/sélection, refus des accès à un personnage tiers, apparence et classe, catalogue, CSRF, validation des valeurs, sauvegardes anciennes et restauration du niveau/XP dans une nouvelle session. Les tests Node couvrent les règles réellement exécutées par le jeu. L’erreur 404 attendue lors du refus d’accès à un personnage tiers ne signifie pas que la suite échoue.

## Évolutions prévues

Pour un monde partagé, le serveur devra valider déplacement, portée, recharge, mana et état vivant, puis attribuer XP/butin/quête une seule fois par défaite et participant. Une transaction et un identifiant de défaite stable devront prévenir les doublons. Le client affichera l’état confirmé par le serveur.

Le futur catalogue persistant pourra ajouter définitions d’objets, entrées d’inventaire, emplacements d’équipement, définitions de monstres et de quêtes. La vente devra vérifier propriété, quantité, état équipé et proximité du marchand avant retrait de l’objet et crédit d’or dans une même transaction. Ces tables et fonctions ne sont pas encore implémentées.

Voir aussi [Front-end](FRONTEND.md) · [Game design](GAME_DESIGN.md) · [VFX](VFX.md) · [Déploiement](DEPLOIEMENT.md)

## Présence multijoueur

`POST /personnages/{id}/monde` exige propriétaire et CSRF. Corps limité à 2 048 octets, coordonnées finies bornées, orientation et poses contrôlées. Les poses/positions sont déclaratives et ne déclenchent aucun combat. Le serveur fournit nom/classe/niveau depuis le personnage en base, sans compte, sac ou jeton dans les réponses. Bail exclusif par personnage pendant 12 s, requêtes trop rapprochées refusées (429), conflit de bail (409), expiration automatique et retrait à la fermeture. La transaction verrouille la ligne sur PostgreSQL. Les voisins à 800 px sont renvoyés avec une limite de 100. Cette première table devra être partitionnée avant plusieurs centaines de connexions.

La version XP 2 est obligatoire sur `/progression` ; l’ancien client reçoit 409 et doit être rechargé. Le combat restant calculé côté navigateur, ce lot ne garantit pas l’authenticité des victoires ni des récompenses. L’autorité serveur, le profil complet et le partage des monstres restent à implémenter. Tests : `php tests/account_flow.php` inclut deux comptes qui se voient, l’isolation des personnages, CSRF, poses invalides, bail concurrent, expiration et départ. `php tests/xp_migration.php` vérifie 21 conversions et leur retour.

La Trappe d’apprivoisement du Chasseur est une compétence de départ du moteur navigateur. Elle ne change ni les entités ni les API ; aucune migration supplémentaire. Comme les autres contrôles actuels, elle ne constitue pas une action validée par serveur.

## Tchat intégré

`POST /personnages/{id}/tchat` exige propriétaire et CSRF. Actions : `poll`, `send`, `invite`, `answer`, `leave`. Corps JSON limité à 4 096 octets ; texte UTF-8 d’une ligne, 1–500 caractères. Le serveur détermine l’expéditeur. Une seconde entre messages/invitations par compte, avec verrou de ligne PostgreSQL ; changer de personnage ne contourne pas ce délai. Les envois portent un nonce et sont idempotents par personnage.

Global : tous les personnages. Chuchotement : auteur et destinataire choisi parmi les personnages connectés ; un nom ambigu exige le `#numéro` proposé. Groupe : membres au moment de l’envoi ET adhésion actuelle au même groupe lors de la lecture. Proximité : destinataires à 192 px maximum, calculés à l’envoi depuis les présences de moins de 12 s. Les positions restent déclaratives dans le moteur actuel : ce canal ne constitue pas un contrôle anti-triche des déplacements.

La migration `Version20261121050000` ajoute `chat_party`, `chat_member`, `chat_invite`, `chat_sender`, `chat_message` et `chat_delivery`. Les audiences privées sont conservées côté serveur ; le client ne peut pas imposer une liste de destinataires. Groupes de cinq au maximum, invitations de 120 s acceptées/refusées par le destinataire avec identifiant attendu, chef seul autorisé à inviter. Le départ du chef dissout son groupe. Un nouveau membre ne récupère pas les messages antérieurs ; un membre sorti ne reçoit plus le canal. Messages retenus sept jours, purge hors transaction d’action. Poll initial : 50 derniers messages autorisés ; retard : lots de 50 avec curseur croissant. Réponses privées sans cache, sans coordonnées ni informations de compte.

`tests/account_flow.php` couvre trois personnages, les quatre audiences, anti-spam interpersonnages, nonce répété, CSRF/propriété, refus des textes invalides, invitation/refus/expiration, chef, groupe complet, départ/dissolution, curseurs et rétention. Le tchat est indépendant de l’autorité future des combats.

## Horodatage de présence et animations

La réponse de présence ajoute `serverTime` et chaque état public porte `updatedAt`, en millisecondes serveur. Le client peut fournir `actions`, liste bornée de six tuples `[id, ageMs, preparationMs, finMs, ranged, orientation]`. Les durées, types, orientations et identifiants sont validés ; l’identifiant ne peut pas être le bail. Le serveur reconstruit l’heure de début une fois par identifiant et conserve les annulations sur les mises à jour suivantes. Les anciens états sans cette liste restent acceptés. Le corps reste limité à 2 048 octets.

Ces informations ne déclenchent aucun dégât ni récompense : elles servent uniquement à rendre les acteurs distants. Aucun changement de schéma ni service temps réel supplémentaire. La cible de cette itération est 2 à 10 joueurs, sans certification de charge en production ; monstres et combats partagés restent distincts.

Après création, la session ajoute le personnage à `tutorial_pending`. Sa première entrée en jeu consomme cet identifiant et ouvre le guide. Aucun changement de schéma : le suivi `tutorialStep` (0 à 7, `null` pour les anciens personnages) et les préférences ATH sont conservés dans le navigateur, séparément par personnage.

Les réglages ATH utilisent une clé dérivée de la clé de progression, avec validation des bornes et de la permutation des cases ; une sauvegarde invalide revient aux valeurs sûres. Un changement de navigateur ou un effacement du stockage perd ces préférences. Le niveau et l’XP continuent leur synchronisation serveur existante.

Suppression : GET /personnages/{id}/suppression affiche la confirmation ; POST supprime uniquement un personnage du compte connecté avec un jeton CSRF propre à son identifiant. La sélection active est nettoyée. Les contraintes existantes retirent la présence, les invitations et les appartenances au groupe ; supprimer le chef dissout le groupe. Les anciens messages conservent leur texte et leur nom affiché, sans référence au personnage supprimé.

`GameAssets` prépare les URL versionnées du jeu à partir des empreintes SHA-256 des fichiers JavaScript et CSS. Le contrôleur fournit le point d’entrée, l’import map et les versions CSS à Twig. Aucune donnée de personnage, aucun secret et aucune préférence locale ne sont inclus dans ce manifeste public.

Chaque réponse de présence réussie (hors départ) inclut `onlineCount` : le nombre de lignes de `world_presence` dont le bail a été rafraîchi depuis moins de 12 s, personnage appelant compris. Ce total est indépendant du rayon de 800 px et de la limite de 100 voisins. Il compte les personnages actifs en jeu, pas les comptes restés au menu ; aucune donnée personnelle supplémentaire n’est transmise.

Depuis le 22 novembre 2026, `POST /personnages/{id}/temps-reel` vérifie propriétaire, CSRF et bail actif, puis émet un ticket HMAC de 45 s. `server/presence.mjs` relaie uniquement les états visuels validés, à 20 Hz et dans un rayon de 800 px. Le profil public provient du ticket signé. La présence HTTP est rafraîchie toutes les cinq secondes pour le tchat et les contrôles d’accès. [Contrat et limites](VISIBILITE-COMBATS.md).

## Ressources visuelles du Voleur

Le relais autorise la texture `rogue-vfx` dans les images de combat validées. Les effets restent cosmétiques et suivent les limites de taille et de fréquence existantes. Aucun nouveau champ de personnage ni migration. [Ressources et limites](VOLEUR_ART.md).
## Apparence du Mage dans le monde partagé

Le champ facultatif `staff` de présence est un booléen, validé par `WorldController` et `server/presence.mjs` ; son absence vaut `false` pour les clients précédents. Il indique uniquement quelle arme dessiner. Les images `mage-vfx` passent par la liste autorisée des visuels partagés. Ces champs ne changent ni les statistiques ni les récompenses et ne nécessitent aucune migration. Voir [les ressources du Mage](MAGE_ART.md).
