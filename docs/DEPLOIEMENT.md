# Déployer PixelForever sur Render

Le service [PixelForever](https://pixelforever.onrender.com) utilise Docker et suit la branche `codex/deployer-pixelforever`. Le conteneur installe les dépendances verrouillées par Composer, exécute les migrations Doctrine et sert Symfony sur le port `8080`.

Dans les variables d’environnement du service, conserver `PORT=8080` et `DATABASE_URL` avec l’URL interne de PostgreSQL et les identifiants dédiés à PixelForever. Stocker les identifiants dans Render. Avec un dépôt connecté par URL publique, lancer le déploiement du dernier commit après la mise à jour de la branche. [Déploiements Render](https://render.com/docs/deploys)

Une fois le déploiement actif, vérifier le commit affiché dans Render, l’accès à la page de connexion et la reconnexion à un compte existant. Les comptes, les personnages, leur niveau et leur XP utilisent PostgreSQL. Les colonnes de niveau et d’expérience existent déjà : aucune migration supplémentaire n’est requise pour cette sauvegarde. Le jeu affiche l’état d’enregistrement et retente une sauvegarde en cas d’échec réseau. Le sac, les allocations de caractéristiques/talents et les quêtes de cette démo restent dans le navigateur.

L’instance PostgreSQL gratuite a sa propre date d’expiration, visible dans Render. [Limites de l’offre gratuite](https://render.com/docs/free#30-day-limit)

Pour tester le même socle avec une base PostgreSQL locale, suivre le [démarrage Docker](../README.md#lancer-pixelforever-avec-postgresql).
