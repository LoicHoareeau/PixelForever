# PixelForever · Missions pour Antigravity ou Gemini

Codex confie ici des vérifications ciblées à Antigravity ou Gemini. Pour chaque mission, relève les erreurs et les régressions, exécute les vérifications pertinentes et remets un rapport qui permette à Codex de décider des corrections et de vérifier leur résultat.

## Consignes de travail

1. Ouvre le dossier PixelForever indiqué dans la mission, lis son `AGENTS.md`, puis relève la branche, le commit et les changements locaux avec `git status --short --branch` et `git rev-parse --short HEAD`.
2. Compare le diff de la mission au comportement attendu. Suis les appels jusqu’aux contrôleurs, règles métier ou écritures en base concernés. Examine aussi les modifications indexées ou non indexées si la mission les inclut.
3. Lance d’abord les vérifications rapides, puis la suite existante et les scénarios qui peuvent révéler une régression. Utilise des données fictives et une base locale jetable pour les vérifications qui écrivent en base. Si une commande est bloquée, relève son erreur et poursuis les vérifications indépendantes.
4. Pour une mission de revue, rends ton rapport dans la conversation où la mission t’a été donnée. Garde le code et l’index intacts. Si Codex te confie explicitement une correction ultérieure, travaille sur une branche dédiée en suivant `AGENTS.md` et limite tes changements au périmètre demandé.

## Première mission · Compte et personnages

- **Dossier à examiner** · `C:/Users/lic97/Documents/ProjectExpernet/PixelForever`
- **Branche de référence** · `back/compte-personnage`
- **Changement à relire** · `b3e67b8`, création et sauvegarde des comptes et personnages. Commence par `git show --stat b3e67b8` et `git diff b3e67b8~1 b3e67b8 --`. Confirme que les fichiers exécutés correspondent à la révision visée avant d’attribuer un résultat à ce commit.
- **Priorité** · Inscription et unicité du pseudo et de l’e-mail, connexion et déconnexion, validation du nom et de la classe, sélection et appartenance au compte, cohérence entre les entités Doctrine et la migration.

### Vérifications

Depuis la racine du dossier applicatif, vérifie les prérequis du `README.md`. Le parcours local utilise PHP 8.2 ou ultérieur, Composer et `pdo_sqlite`. Avec les dépendances installées, exécute les commandes suivantes séparément.

```powershell
git diff --check b3e67b8~1 b3e67b8
composer validate --strict
git ls-files -- '*.php' 'bin/console' | ForEach-Object { php -l $_; if ($LASTEXITCODE -ne 0) { throw "Échec du lint PHP pour $_" } }
php bin/console lint:yaml config
php bin/console lint:twig templates
php bin/console lint:container
```

Pour le parcours dans le navigateur, réserve une base SQLite temporaire pour cette vérification. Lance son initialisation et le serveur depuis le même terminal afin que les deux utilisent la même valeur de `DATABASE_URL`.

```powershell
$reviewDb = Join-Path ([System.IO.Path]::GetTempPath()) ("pixelforever-review-" + [guid]::NewGuid() + ".sqlite")
$env:DATABASE_URL = "sqlite:///" + $reviewDb.Replace('\', '/')
php bin/console doctrine:migrations:migrate --no-interaction
if ($LASTEXITCODE -ne 0) { throw "Échec de la migration de la base temporaire" }
php -S 127.0.0.1:8000 -t public
```

- Crée un compte, connecte-toi, crée un Guerrier et un Mage avec des noms valides, puis sélectionne chacun. Déconnecte-toi et reconnecte-toi pour vérifier que les personnages ont bien été sauvegardés.
- Vérifie le refus d’un mot de passe erroné, d’un pseudo ou e-mail en double et d’un nom de personnage invalide. Confirme que le formulaire affiche une erreur et que les données existantes restent cohérentes.
- Avec deux comptes fictifs dans des profils de navigateur distincts, vérifie que chaque compte voit ses propres personnages. Contrôle dans le code que la sélection exige le propriétaire courant. Si une suite fonctionnelle couvre déjà le refus de sélection d’un personnage tiers, exécute ce test et relève son résultat.
- Arrête le serveur à la fin et retire la variable du terminal de revue avec `Remove-Item Env:DATABASE_URL`.

## Rapport à remettre à Codex

- **Révision** · Branche et commit examinés, avec l’état local s’il influence le résultat.
- **Constats** · Par impact décroissant, indique `fichier:ligne`, résultat attendu, résultat observé, conséquence et piste de correction. Précise si le constat a été confirmé par un test ou relevé en lecture du code.
- **Vérifications** · Pour chaque commande ou scénario pertinent, indique **réussi**, **échoué** ou **bloqué**, puis donne le résultat ou la raison. Indique explicitement si aucun défaut n’a été relevé.
- **Premier suivi** · Propose la correction ou la vérification la plus utile à reprendre dans Codex.

Pour une mission suivante, Codex peut garder les consignes et le format du rapport, puis fournir le nouveau dossier, la branche, le diff et les scénarios à couvrir.
