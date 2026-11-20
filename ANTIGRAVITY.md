# PixelForever · Revue pour Antigravity ou Gemini

Ce document décrit les vérifications à appliquer au dépôt actuel. Les anciennes missions sur un chemin local et un commit de compte particuliers ne constituent plus le périmètre courant.

## Consignes de travail

1. Ouvrir le checkout indiqué dans la mission, lire `AGENTS.md`, puis relever branche, commit et changements avec `git status --short --branch` et `git rev-parse --short HEAD`.
2. Lire `README.md` et les pages de documentation pertinentes. Pour les animations, consulter le [guide VFX](docs/VFX.md).
3. Suivre les appels dans les contrôleurs, le code client, les tests et les sauvegardes concernés. `src/Game/Character`/`Blob` est un ancien prototype PHP, distinct du moteur Phaser.
4. Pour une revue, garder code et index intacts et rendre le rapport dans la conversation d’origine. Pour une correction explicitement demandée, travailler sur une branche dédiée selon `AGENTS.md`.

## Points de contrôle actuels

- Apparences · Vérifier Noé, le Guerrier en armure et les atlas du Démoniste, du Voleur et du Chasseur. Sur le Guerrier, contrôler le passage de l’épée à la hache puis aux mains nues.
- Combat · Vérifier la baguette et le sceptre à 7,5 cases avant bonus, le bâton à 1,5 case et Boule de feu au bâton. Contrôler le coût, la recharge et les prérequis de talents.
- Classes · Tester les dégâts périodiques du Démoniste, l’interruption du drain, le tir à distance du diablotin et l’aggro du marcheur du Vide. Vérifier la Dextérité du Voleur et du Chasseur et la Défense du Guerrier.
- Sorts du Mage : vérifier à distance avec chaque arme, zones de Tourbillon/Nova centrées sur la cible et absence de dépense sans cible vivante à portée. Les archives `pixel` ne contiennent pas encore de cycle d’incantation dédié.
- Animation : un tir du Mage utilise une incantation, pas sa frappe à la lanterne. Vérifier directions, cadence à 30 FPS, sorts de talents et impacts.
- Monde · Vérifier la caméra, les falaises, la route vers les côtes N.41–60 et la lisibilité des faisceaux de Malakor dans les bandes dangereuses.
- Progression : aucun point au N.1, +3 caractéristiques / +1 talent à chaque montée suivante ; niveau/XP en base, reste de la progression encore local au navigateur.
- Quête : accepter, vaincre trois sangliers, revenir recevoir deux potions de vie une fois ; marqueurs disponible/en cours/à rendre/terminé.
- Compte : inscription, unicité, connexion, sélection appartenant au compte, CSRF et refus d’une sauvegarde invalide ou régressive.
- Déploiement : comparer SHA et branche suivie par Render ; ne pas confondre une PR fusionnée dans `main` avec un service à jour.

## Vérifications

```powershell
git diff --check
node --test tests/*.test.mjs
composer test:accounts
git ls-files -- '*.php' 'bin/console' | ForEach-Object { php -l $_; if ($LASTEXITCODE -ne 0) { throw "Échec PHP : $_" } }
php bin/console lint:yaml config
php bin/console lint:twig templates
```

Utiliser les prérequis du README. Le test PHP crée sa propre base SQLite temporaire. Pour le navigateur, réserver également une base jetable ; ne pas réutiliser la base Render pour des essais destructifs. Initialiser et lancer le serveur avec le même `DATABASE_URL` et arrêter le serveur de test à la fin. `lint:container` en production requiert notamment un `APP_SECRET` défini. Signaler séparément les avertissements Composer préexistants, sans inventer de licence.

## Rapport

Donner la révision, les scénarios et les résultats (réussi, échoué ou bloqué). Pour chaque défaut, indiquer fichier/ligne, attendu, observé, conséquence et preuve ou test de reproduction. Signaler les limites de validation et proposer le premier suivi utile. Ne pas présenter une fonction prévue comme déjà disponible.
