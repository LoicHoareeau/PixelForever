# Déployer PixelForever sur Render

Le projet utilise un conteneur PHP 8.2 / Apache. Le `Dockerfile` installe les dépendances verrouillées par Composer, active PostgreSQL, exécute les migrations au démarrage et sert Symfony sur le port `8080`. Le service public est [PixelForever](https://pixelforever.onrender.com).

## Branche Git et déploiement

Les modifications passent par une branche dédiée et une pull request vers `main`. La PR #10 était un doublon de la refonte déjà intégrée et a été fermée ; la PR #11 (décors détaillés, butin et armes du Mage) a été fusionnée dans `main` au commit `559258d`.

Le paramétrage Render précédemment constaté suivait `codex/deployer-pixelforever`. Vérifier le champ Branch du service avant de déployer : fusionner dans `main` ne met pas à jour une autre branche automatiquement. Si le service suit encore cette branche, la synchroniser par avance rapide avec `main` après vérification de ses changements propres, ou choisir `main` dans Render. Ne pas forcer un push pour masquer une divergence.

Après mise à jour de la branche suivie, utiliser **Deploy latest commit** si le déploiement est manuel. Cette commande déploie le dernier commit de la branche configurée, pas nécessairement celui de `main`. Contrôler le SHA dans Render et attendre l’état actif. Les mises à jour des `.md` ne changent pas un service déjà déployé.

## Configuration et données

Conserver `PORT=8080`, une valeur stable de `APP_SECRET` et `DATABASE_URL` avec l’URL interne PostgreSQL dédiée au service. Garder ces valeurs dans les variables Render, sans publier les identifiants dans Git ou dans les rapports. Le conteneur peut générer un secret de secours au démarrage ; un secret stable évite les changements de session/CSRF lors des redémarrages.

PostgreSQL conserve comptes, personnages et niveau/XP. La sauvegarde utilise les colonnes existantes, sans migration supplémentaire. Sac, arme, allocations et quête restent locaux au navigateur : le stockage Render ne les rend pas persistants en base à lui seul. Vérifier dans Render la durée de validité et les sauvegardes de l’instance PostgreSQL utilisée.

## Vérifications après déploiement

1. Comparer le SHA déployé avec celui de la branche suivie ; consulter les journaux de construction et de migration en cas d’échec.
2. Ouvrir la connexion et accéder à un personnage existant ; vérifier son niveau et son XP après reconnexion.
3. Vérifier le plein écran, le défilement de caméra, les décors et le chargement des sprites sans erreur.
4. Vérifier l’arme équipée : Baguette de braise / Sceptre à distance, Bâton des saules au contact, Boule de feu toujours à distance. Contrôler le geste d’incantation, la recharge et le mana.
5. Vérifier l’ATH de sauvegarde après une victoire. Si les anciens scripts semblent encore actifs, recharger les ressources puis comparer les fichiers servis au commit déployé.
6. Suivre le chemin à l’est des montagnes jusqu’aux Terres dévastées. Contrôler les trois bandes de niveau N.21–35 et esquiver un souffle du dragon en quittant sa ligne après le lancement.
7. Depuis le Trône d’Obsidienne, suivre la chaussée sud puis la route vers l’est jusqu’au Belvédère des Brisants. Vérifier les trois bandes N.41–60 dans l’ATH, les limites des falaises et une esquive circulaire ou linéaire.

Les corrections de combat postérieures à #11 doivent elles aussi être fusionnées et déployées avant d’être visibles en production.

Pour PostgreSQL local, suivre le [démarrage Docker](../README.md#lancer-pixelforever-avec-postgresql). La procédure manuelle Render est décrite dans les [déploiements Render](https://render.com/docs/deploys).
