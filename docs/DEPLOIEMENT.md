# Déployer PixelForever sur Render

Le projet utilise un conteneur PHP 8.2 / Apache. Le `Dockerfile` installe les dépendances verrouillées par Composer, active PostgreSQL, exécute les migrations au démarrage et sert Symfony sur le port `8080`. Le service public est [PixelForever](https://pixelforever.onrender.com).

## Branche Git et déploiement

La révision de magie noire ajoute `warlock-vfx.js` et `items/shadow-focus.png`, avec les nouvelles planches des trois classes et les libellés du contrôleur. Déployer cet ensemble avec `equipped-art.js`, `combat.js` et `combat-renderer.js`. Aucun changement de schéma de données n’est requis.

Le lot armes ajoute neuf PNG équipés dans les dossiers `hunter`, `rogue` et `warlock`, ainsi que le module `equipped-art.js`. Publier ces fichiers avec les modifications de `world.js`, `combat.js` et `combat-renderer.js`. Les planches sont déjà générées et versionnées : aucun générateur GD ni migration n’est requis sur Render pour les servir.

Le lot familiers ajoute `pet-controls.js` et `pet-rules.js` avec des imports relatifs depuis le moteur. Déployer les ressources JavaScript et Twig ensemble. Aucune migration dans ce lot ; la créature apprivoisée reste dans la sauvegarde locale du navigateur. Le monde partagé et la persistance complète du profil sont des étapes distinctes.

Le lot caméra ×2, neutralité N.1–10 et notification de niveau modifie les ressources front-end et Twig, sans migration de données. Le déploiement Render reste manuel à la demande du propriétaire.

Les modifications passent par une branche dédiée et une pull request vers `main`. Pour livrer les classes et les VFX, vérifier que le SHA choisi inclut à la fois le code client et ses atlas PNG.

Le paramétrage Render précédemment constaté suivait `codex/deployer-pixelforever`. Vérifier le champ Branch du service avant de déployer : fusionner dans `main` ne met pas à jour une autre branche automatiquement. Si le service suit encore cette branche, la synchroniser par avance rapide avec `main` après vérification de ses changements propres, ou choisir `main` dans Render. Ne pas forcer un push pour masquer une divergence.

Après mise à jour de la branche suivie, utiliser **Deploy latest commit** si le déploiement est manuel. Cette commande déploie le dernier commit de la branche configurée, pas nécessairement celui de `main`. Contrôler le SHA dans Render et attendre l’état actif. Les mises à jour des `.md` ne changent pas un service déjà déployé.

## Configuration et données

Conserver `PORT=8080`, une valeur stable de `APP_SECRET` et `DATABASE_URL` avec l’URL interne PostgreSQL dédiée au service. Garder ces valeurs dans les variables Render, sans publier les identifiants dans Git ou dans les rapports. Le conteneur peut générer un secret de secours au démarrage ; un secret stable évite les changements de session/CSRF lors des redémarrages.

PostgreSQL conserve comptes, personnages et niveau/XP. Le lot XP/présence ajoute la migration `Version20261120090000` : conversion proportionnelle de l’XP et création de `world_presence`. Le démarrage Docker exécute les migrations. Sac, arme, coiffes, gants, allocations et quête restent locaux au navigateur : le stockage Render ne les rend pas persistants en base à lui seul. Vérifier dans Render la durée de validité et les sauvegardes de l’instance PostgreSQL utilisée.

## Vérifications après déploiement

1. Comparer le SHA déployé avec celui de la branche suivie ; consulter les journaux de construction et de migration en cas d’échec.
2. Ouvrir l’accueil et vérifier que le diorama se charge. Suivre **Se connecter**, jouer avec un personnage existant et vérifier son niveau et son XP après reconnexion.
3. Vérifier le plein écran, le défilement de caméra, les décors et le chargement des sprites sans erreur.
4. Vérifier que la Baguette de braise et le Sceptre tirent en mouvement à 5 cases avant bonus et pleine puissance, et que le Bâton des saules frappe au contact. Lancer Boule de feu à 15 cases avec le bâton, puis vérifier la recharge, le mana et le remboursement si le Mage se déplace pendant l’incantation.
5. Vérifier l’ATH de sauvegarde après une victoire. Si les anciens scripts semblent encore actifs, recharger les ressources puis comparer les fichiers servis au commit déployé.
6. Suivre le chemin à l’est des montagnes jusqu’aux Terres dévastées. Contrôler les trois bandes de niveau N.21–35 et esquiver un souffle du dragon en quittant sa ligne après le lancement.
7. Depuis le Trône d’Obsidienne, suivre la chaussée sud puis la route vers l’est jusqu’au Belvédère des Brisants. Vérifier les trois bandes N.41–60 dans l’ATH, les limites des falaises et une esquive circulaire ou linéaire.
8. Vérifier l’apparition et le retour après défaite au Bastion de Braise, parler à Rakka, puis emprunter la porte est vers la clairière. Vérifier les halos de la forge et de la hutte et leur rendu fixe en mouvement réduit.
9. Créer un Démoniste, un Voleur et un Chasseur. Tester le projectile du diablotin, l’aggro du marcheur du Vide et l’interruption du drain. Vérifier un tir d’arc et une frappe de dague. Sur le Guerrier, équiper la hache, frapper puis retirer l’arme.
10. Vérifier les seuils de Malakor à 65 % et 25 %, la déferlante de la Rage sur toute la carte, le répit avant le premier balayage, la continuité des rayons dans les bandes dangereuses, leur désintégration et la disparition progressive des braises. À la victoire, équiper la pièce reçue dans l’inventaire et contrôler la fiche après rechargement.
11. Parcourir la clairière et un secteur sombre, puis vérifier que les halos restent centrés en déplaçant la caméra ou en redimensionnant la fenêtre. Vérifier les particules d’ambiance et les sprites d’impact. Contrôler la lisibilité des bandes de Malakor avec et sans mouvement réduit.

Contrôler le chargement de `combat-vfx.png`, `class-vfx.png`, `class-gear.png` et `class-familiars.png` dans l’onglet Réseau du navigateur. [Vérifications VFX](VFX.md#vérifications)

Pour PostgreSQL local, suivre le [démarrage Docker](../README.md#lancer-pixelforever-avec-postgresql). La procédure manuelle Render est décrite dans les [déploiements Render](https://render.com/docs/deploys).

## Lot XP/présence — contrôle Render

Déployer ensemble PHP, migration, Twig et ressources JavaScript. Les anciens onglets doivent être rechargés après conversion du barème. Comparer les niveaux et la fraction d’XP avant/après, puis reconnecter deux comptes distincts dans la même zone et vérifier apparences, marche, disparition après fermeture et conflit pour deux onglets du même personnage. Contrôler une potion puis la recharge commune de R/F. Le rendu à deux fenêtres n’a pas pu être validé localement (connexion locale expirée dans Edge) ; les parcours serveur avec deux comptes passent. Les monstres et récompenses restent individuels dans ce lot. Aucun déploiement Render n’a été déclenché par l’agent.

### Lot trappe du Chasseur

Déployer ensemble les modules de talents, règles de familier, combat/IA/rendu et Twig. L’atlas de trappe est déjà versionné, sans nouvel asset ni migration. Sur Render : Chasseur N.1, affaiblir un sanglier à 30 %, cibler puis `3` et W ; vérifier la capture sans coup de la cible, le coût affiché, les 20 s de recharge et la libération sur nouvelle attaque. Vérifier le refus sur squelette, niveau supérieur et hors portée sans consommation. Les autres créatures peuvent toujours interrompre la capture.

## Lot sorts et tchat

Branche `front/sorts-et-tchat`, dépendante du lot trappe de la PR #32. Déployer ensemble contrôleur, migration `Version20261121050000`, Twig, modules JavaScript, CSS et illustrations de sorts. Le démarrage Docker applique les migrations. Aucune modification directe de la base Render pendant le développement.

Après déploiement : vérifier les icônes de chaque classe et arme, compteur à l’échéance, gris à mana/énergie insuffisante et retour après régénération, invocations W/X/C et potion en recharge. Avec trois personnages : global pour tous, chuchotement privé, groupe après acceptation uniquement, proximité pour les personnages proches. Contrôler le refus d’un non-membre, départ du groupe et dissolution par le chef, message trop long et double envoi réseau. Écrire ZQSD/1/T dans le tchat sans déplacer le personnage ni lancer un sort ; Entrée pour saisir, Échap pour revenir à la carte.

Les tests serveur et de rendu logique passent localement ; les interactions visuelles réelles restent à contrôler sur Render faute d’accès au serveur HTTP local. Aucun déploiement Render déclenché par l’agent.

Inclure `spell-icons-atlas.png`, `spell-icons.js`, `spell-state.js`, `chat.js` et le partiel `game/_chat.html.twig` dans le même déploiement ; ne pas publier uniquement le CSS. La planche des sorts a été inspectée et sa direction validée par le propriétaire. Les sprites des personnages restent identiques.

## Lot fluidité réseau

Déployer ensemble `remote-motion.js`, `world-presence.js`, `world.js` et `WorldController.php`. Aucune migration. Vérifier à 2 puis 10 joueurs : marche continue, changement de direction, arrêt, neuf poses des attaques courtes, interruption d’une incantation, vraie téléportation et retour après défaite. Simuler ensuite un court retard réseau : pas de disparition immédiate ni de marche infinie ; reprise progressive. Fermer un onglet et contrôler l’expiration. Comparer les FPS, temps de réponse, CPU du service et charge PostgreSQL sur Render avant de relever la cible de population.

Les tests locaux de relecture passent, mais ils n’incluent ni le GPU du navigateur ni le réseau/hébergement Render. Le joueur local reste immédiat ; le tampon des acteurs distants ajoute volontairement un délai pour lisser leur mouvement. Aucun déploiement Render déclenché par l’agent.

ATH et initiation : déployer PHP, les templates, `hud.css`, `hud-controls.js`, `hud-settings.js`, `tutorial.js` et les modules modifiés ensemble ; reconstruire le cache Symfony. Aucune migration supplémentaire.

Après déploiement sur Render, vérifier une création de personnage, le menu Échap, la taille et l’opacité, les cadres à plusieurs résolutions, une permutation 2/3 et son raccourci réel, puis la restauration après rechargement. Tester aussi une insuffisance de mana et une recharge après déplacement du sort, ainsi que le tchat privé et de groupe.

La suppression des personnages utilise les clés étrangères et tables existantes : aucune migration supplémentaire. Déployer le contrôleur et les templates ensemble et reconstruire le cache Symfony pour enregistrer la route character_delete.

Le CSS et les modules applicatifs utilisent désormais des URL avec empreinte de contenu. Cela contourne immédiatement l’ancien cache d’une heure qui pouvait mélanger la nouvelle interface avec l’ancien moteur. Apache renvoie `Cache-Control: public, no-cache` pour les fichiers JS/CSS afin qu’ils soient revalidés, sans effacer les préférences du navigateur. Déployer aussi `GameAssets`, sa déclaration de service et les templates mis à jour ; aucune migration.

Contrôles automatiques : `php tests/game_assets.php`, `node --test tests/*.test.mjs` et `php tests/account_flow.php`. Pour le test visuel hors écran, définir `PIXEL_HUD_HTML` sur un fichier temporaire lors du parcours PHP, puis exécuter `node tools/check-hud-browser.cjs` avec le même chemin. Ce contrôle facultatif requiert Playwright ; `PIXEL_BROWSER_PATH` peut désigner un Chromium installé. `PIXEL_HUD_STALE_WORLD=1` rejoue le cas d’un ancien point d’entrée en cache. Le test vérifie démarrage, absence de superposition, icônes, menu, taille, glissement, raccourci, canal du tchat et restauration après rechargement, sans utiliser une session utilisateur ni ouvrir de fenêtre visible. Il ne valide pas le réseau Render ou une charge multijoueur.

Contrôler le compteur numérique en haut au centre avec deux personnages : 1 seul, 2 après l’entrée du second, toujours 2 quand ils sont éloignés de plus de 800 px, puis 1 après son départ ou 12 s sans nouvelles. Une coupure de connexion doit afficher « — », puis rétablir le total à la reconnexion. Aucune migration supplémentaire n’est nécessaire pour ce compteur.

Le conteneur inclut désormais Node 22 et la dépendance WebSocket verrouillée par `package-lock.json` ; aucun service Render supplémentaire ni migration n’est requis pour la visibilité des combats. `docker/start.sh` lance le relais local sur 8081 et Apache sur 8080, avec le même `APP_SECRET`, et arrête les deux processus si l’un termine. Apache relaie `/monde-socket` sous la même origine. Vérifier l’upgrade HTTP 101, deux sessions actives plus de 45 s (renouvellement du ticket), un combat vu depuis l’autre session, le compteur et le tchat de proximité. [Procédure et limites](VISIBILITE-COMBATS.md).

La construction Docker utilisée par Render comporte une étape `checks` obligatoire : suite Node, parcours PHP avec base temporaire, manifeste des ressources, syntaxe Twig et script Bash. Une commande en échec interrompt la construction. Les fichiers de test restent dans cette étape ; l’image finale repart du runtime, puis récupère uniquement le témoin de réussite.
