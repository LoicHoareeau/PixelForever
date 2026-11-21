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
