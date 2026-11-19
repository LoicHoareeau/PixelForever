# PixelForever · Déploiement de la démo

Le développement local continue avec PHP, Symfony, Composer et SQLite. Le `Dockerfile` prépare un conteneur web utilisable sur Render ou Fly.io. Il installe les versions verrouillées dans `composer.lock`, ajoute le pilote PostgreSQL et sert Symfony sur le port `8080` depuis `public/`.

## Tester le conteneur en local

Avec Docker démarré, depuis la racine du projet.

```sh
docker build -t pixelforever-web .
docker run --rm -d --name pixelforever-web -p 127.0.0.1:8080:8080 pixelforever-web
docker exec --user www-data pixelforever-web php bin/console doctrine:schema:create --no-interaction
```

Ouvrir `http://localhost:8080`, puis tester l’inscription, la connexion et la création d’un personnage. Cette vérification crée une base SQLite jetable dans le conteneur. Pour terminer, lancer `docker stop pixelforever-web`.

## Avant d’ouvrir la démo au professeur

1. Intégrer dans la branche de déploiement le socle Symfony et son `composer.lock`. La migration locale utilise du SQL SQLite. Préparer une migration Doctrine compatible avec PostgreSQL et l’exécuter sur une base PostgreSQL vierge.
2. Créer une base PostgreSQL dédiée à la démo. Définir son URL de connexion dans `DATABASE_URL` depuis l’hébergeur. Garder `APP_ENV=prod` et `APP_DEBUG=0`. Relier `framework.secret` à `APP_SECRET` côté Symfony et définir une valeur aléatoire dans les secrets de l’hébergeur.
3. Appliquer les migrations une fois par livraison. La commande cible est `php bin/console doctrine:migrations:migrate --no-interaction`. Vérifier la prise en compte du HTTPS derrière le proxy de l’hébergeur et le fonctionnement du cookie de session.
4. Tester depuis l’URL publique l’inscription, la connexion, la création d’un personnage et la reconnexion. Redéployer puis vérifier que le personnage existe toujours dans PostgreSQL.
5. Une fois le monde partagé prêt, ajouter le processus PHP temps réel et son accès `wss://`. Pour la démo, faire rejoindre le même monde à deux navigateurs et vérifier les déplacements, le combat, le butin et la reconnexion.

## Render

Créer un **Web Service** à partir du dépôt GitHub. Choisir le runtime **Docker** et régler `PORT` sur `8080`. Utiliser l’URL interne de Render Postgres pour `DATABASE_URL`. Le *pre-deploy command* peut exécuter les migrations sur les offres qui le proposent. Sur une offre sans cette option, prévoir une exécution ponctuelle des migrations avant de partager la démo.

Pour une démo sur l’offre gratuite, tenir compte du démarrage après mise en veille et de l’expiration de PostgreSQL gratuit après 30 jours. [Hébergement PHP](https://render.com/hosting/php) · [Déploiements Render](https://render.com/docs/deploys) · [Offre gratuite](https://render.com/docs/free)

## Fly.io

Exécuter `fly launch --no-deploy` au moment de créer l’application. Dans le `fly.toml` généré, régler `[http_service].internal_port` sur `8080` et activer `force_https`. Rattacher PostgreSQL à l’application, configurer les secrets et ajouter la commande de migration comme `release_command` avant `fly deploy`.

Si le service doit rester immédiatement accessible pendant une démonstration, vérifier la configuration de veille des Machines. [Déploiement d’une application avec PostgreSQL](https://fly.io/web-app-with-postgres/)
