# Déployer PixelForever sur Render

Le projet utilise un conteneur PHP 8.2 / Apache. Le `Dockerfile` installe les dépendances verrouillées par Composer, active PostgreSQL, exécute les migrations au démarrage et sert Symfony sur le port `8080`. Le service public est [PixelForever](https://pixelforever.onrender.com).

## Branche Git et déploiement

Les modifications passent par une branche dédiée et une pull request vers `main`. La PR #10 était un doublon de la refonte déjà intégrée et a été fermée ; la PR #11 (décors détaillés, butin et armes du Mage) a été fusionnée dans `main` au commit `559258d`.

Le paramétrage Render précédemment constaté suivait `codex/deployer-pixelforever`. Vérifier le champ Branch du service avant de déployer : fusionner dans `main` ne met pas à jour une autre branche automatiquement. Si le service suit encore cette branche, la synchroniser par avance rapide avec `main` après vérification de ses changements propres, ou choisir `main` dans Render. Ne pas forcer un push pour masquer une divergence.

Après mise à jour de la branche suivie, utiliser **Deploy latest commit** si le déploiement est manuel. Cette commande déploie le dernier commit de la branche configurée, pas nécessairement celui de `main`. Contrôler le SHA dans Render et attendre l’état actif. Les mises à jour des `.md` ne changent pas un service déjà déployé.

## Configuration et données

Conserver `PORT=8080`, une valeur stable de `APP_SECRET` et `DATABASE_URL` avec l’URL interne PostgreSQL dédiée au service. Garder ces valeurs dans les variables Render, sans publier les identifiants dans Git ou dans les rapports. Le conteneur peut générer un secret de secours au démarrage ; un secret stable évite les changements de session/CSRF lors des redémarrages.

PostgreSQL conserve comptes, personnages et niveau/XP. La sauvegarde utilise les colonnes existantes, sans migration supplémentaire. Sac, arme, coiffes, gants, allocations et quête restent locaux au navigateur : le stockage Render ne les rend pas persistants en base à lui seul. Vérifier dans Render la durée de validité et les sauvegardes de l’instance PostgreSQL utilisée.

## Vérifications après déploiement

1. Comparer le SHA déployé avec celui de la branche suivie ; consulter les journaux de construction et de migration en cas d’échec.
2. Ouvrir l’accueil et vérifier que le diorama se charge. Suivre **Se connecter**, jouer avec un personnage existant et vérifier son niveau et son XP après reconnexion.
3. Vérifier le plein écran, le défilement de caméra, les décors et le chargement des sprites sans erreur.
4. Vérifier que la Baguette de braise et le Sceptre tirent en mouvement à 7,5 cases avant bonus avec des dégâts réduits, et que le Bâton des saules frappe au contact. Lancer Boule de feu à 15 cases avec le bâton, puis vérifier la recharge, le mana et le remboursement si le Mage se déplace pendant l’incantation.
5. Vérifier l’ATH de sauvegarde après une victoire. Si les anciens scripts semblent encore actifs, recharger les ressources puis comparer les fichiers servis au commit déployé.
6. Suivre le chemin à l’est des montagnes jusqu’aux Terres dévastées. Contrôler les trois bandes de niveau N.21–35 et esquiver un souffle du dragon en quittant sa ligne après le lancement.
7. Depuis le Trône d’Obsidienne, suivre la chaussée sud puis la route vers l’est jusqu’au Belvédère des Brisants. Vérifier les trois bandes N.41–60 dans l’ATH, les limites des falaises et une esquive circulaire ou linéaire.
8. Vérifier l’apparition et le retour après défaite au Bastion de Braise, parler à Rakka, puis emprunter la porte est vers la clairière. Vérifier les halos de la forge et de la hutte et leur rendu fixe en mouvement réduit.
8. Vérifier les seuils de Malakor à 65 % et 25 %, la déferlante de la Rage sur toute la carte, le répit avant le premier balayage, la continuité des rayons dans les bandes dangereuses, leur désintégration et la disparition progressive des braises. À la victoire, équiper la pièce reçue dans l’inventaire et contrôler la fiche après rechargement.
9. Parcourir la clairière et un secteur sombre, puis vérifier que les halos restent centrés en déplaçant la caméra ou en redimensionnant la fenêtre. Vérifier les particules d’ambiance et les sprites d’impact. Contrôler la lisibilité des bandes de Malakor avec et sans mouvement réduit.

Les corrections de combat postérieures à #11 doivent elles aussi être fusionnées et déployées avant d’être visibles en production.

Pour PostgreSQL local, suivre le [démarrage Docker](../README.md#lancer-pixelforever-avec-postgresql). La procédure manuelle Render est décrite dans les [déploiements Render](https://render.com/docs/deploys).
