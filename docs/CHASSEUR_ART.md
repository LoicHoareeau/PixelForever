# Chasseur : animations et effets

État jouable : huit orientations indépendantes (est, sud-est, sud, sud-ouest, ouest, nord-ouest, nord et nord-est), chacune comprenant huit dessins de marche et huit dessins de tir. Les directions ne sont pas des copies retournées. La neuvième étape temporelle du combat réutilise la dernière pose de retour au repos. Le repos utilise la première pose du tir.

Les pieds sont ancrés au sol ; une hauteur de référence par direction conserve l'échelle entre les poses. Le personnage conserve une hauteur de 40 unités du monde. Les originaux haute définition restent à leur résolution native dans des atlas WebP sans perte, avec transparence. Le moteur applique le zoom et le filtrage pixel existants ; aucune moyenne de couleurs ni planche de marche obtenue en décalant un dessin immobile.

`public/game/hunter-art.js` charge les textures et partage les mêmes choix de poses entre le joueur local et `WorldPresence`. `hunter-frames.js` décrit les rectangles natifs et les ancrages. Les anciens fichiers restent disponibles pour les autres classes et le repli sans arc. La portée, les coûts, les dégâts et les temps de combat sont inchangés.

Les effets de poussière et de décoche utilisent le pool existant de VFX, limité à 80 images visibles et filtré par le champ de la caméra. La flèche est libérée à la fin de la préparation, suit la cible avec la durée de vol existante puis produit un impact. Les autres joueurs montrent marche et décoche ; le protocole de présence ne transporte pas les cibles/projectiles de combat distants. La préférence de réduction des animations supprime les poussières et éclats sur le personnage.

## Provenance et reconstruction

Création avec l'outil intégré de génération d'images, à partir du Chasseur approuvé en maquette (capuche verte, cape, cuir brun, arc de bois et carquois). Prompt par direction : « same approved adult ranger, crisp detailed clean 16-bit pixel art, transparent 4x4 sheet, eight articulated walk poses in rows 1–2 and eight sports archery poses in rows 3–4, fixed scale, foot baseline, left hand holding bow, right hand drawing string, specified front/back/diagonal view, no mirrored views, no text, scenery or effects ». Les vues sud et nord ont été corrigées pour garder la perspective frontale et arrière pendant le tir.

Prompt VFX : « transparent 4x4 sprite sheet, four chronological frames per row: earthy foot dust, ivory/sage release flash, right-facing wooden arrow with segmented air trail, practice-target impact; crisp clustered pixels, restrained natural palette, no character or text ». La rangée contenant la cible de démonstration n'est pas utilisée dans le monde jouable.

La commande `node tools/pack_hunter_art.cjs chemin/vers/sources.json` utilise Sharp (outil de préparation, pas dépendance du navigateur). Le JSON désigne `east.walk`, `east.shot`, les sept autres directions et `vfx`. Elle lit les dimensions réelles, repère les rectangles opaques, conserve les pixels natifs, encode sans perte et nomme chaque fichier avec son empreinte. Les chemins des originaux dépendent du poste de création ; les fichiers publiés sont autonomes.

Vérifications : tests Node incluant `hunter-art`, `combat-animation`, `weapons`, `mage-spells`, et parcours hors écran à deux sessions avec `tools/check-hunter-browser.cjs`. Le test navigateur utilise `PIXEL_HUNTER_HTML`, exporté par `tests/account_flow.php`, ainsi que `PIXEL_BROWSER_PATH` et Playwright externe.
