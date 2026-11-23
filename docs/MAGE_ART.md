# Mage : animations et effets

Le Mage garde l'identifiant historique `noe`, ses caractéristiques et ses règles de combat. Sa nouvelle apparence reprend la maquette validée : capuche bleue, tunique turquoise, bottes et équipement tenus en main. Le portrait est partagé par la création, la liste des personnages et l'ATH.

## Planches et sélection des poses

Les huit directions sont dessinées indépendamment. Chaque planche contient 40 poses : huit pas à la baguette, huit poses d'incantation à la baguette, huit pas au bâton, huit poses d'incantation au bâton et huit poses de frappe physique au bâton. Les 320 poses gardent leurs pixels et leur transparence d'origine, en WebP sans perte. `mage-frames.js` définit leurs découpes et leurs ancrages aux pieds ; `mage-art.js` les affiche à 40 pixels de hauteur de référence.

La distance parcourue choisit le pas. La marche reste prioritaire pendant une attaque en mouvement. À l'arrêt, le temps de préparation puis de récupération choisit la pose ; le dernier des neuf créneaux historiques partage la huitième pose dessinée. Le bâton au contact sélectionne `staff-strike`, les sorts à distance sélectionnent `staff-cast`. La baguette et le sceptre utilisent `cast`. Les anciens modules de personnages restent disponibles pour les autres classes.

## Nouveaux VFX

L'atlas `mage-vfx` contient six effets et six images par effet : boule de feu, mur de feu, tourbillon de feu, déflagration arcanique, nova de givre et armure de glace. La déflagration voyage vers la cible puis s'y dissipe. Le tourbillon et la nova restent centrés sur la cible. L'armure de glace est une aura discrète lorsque son talent passif est appris ; elle n'ajoute aucun bonus de combat.

Les effets utilisent le pool existant, limité à 80 images et borné à la caméra. Le mode de réduction des animations conserve une pose fixe. Le flux multijoueur autorise `mage-vfx` et un booléen facultatif `staff`, validé en PHP et dans le relais Node. Les autres clients reproduisent les dessins sans calculer de dégâts, butin ou XP.

## Sources et reconstruction

Les huit planches ont été générées avec imagegen à partir de la maquette approuvée. Consigne : même identité, proportions et palette dans chaque case, une direction par planche, quatre colonnes et dix lignes, cinq cycles de huit poses, fond transparent, arme tenue naturellement et aucun VFX intégré au personnage. Les VFX utilisent la planche de six lignes et six colonnes validée, dont les limites de lignes ont été relevées pour éviter les raccords entre effets.

`node tools/pack_hunter_art.cjs <sources.json>` reconstruit les ressources. Le manifeste comporte `character: "mage"`, huit chemins nommés `east`, `south-east`, `south`, `south-west`, `west`, `north-west`, `north`, `north-east`, et `vfx`. Les fichiers publiés dans `public/game/val-des-saules/mage-v2/` sont autonomes ; aucune génération ne s'exécute sur Render.

## Vérifications

- `node --test tests/*.test.mjs` inclut géométrie des atlas, empreintes, sélection des armes, marche pendant l'attaque, six images des six effets, matrice d'équipement et portée propre des sorts.
- Le parcours PHP vérifie le nouveau portrait et conserve l'identifiant `noe`, les règles de mana et les contrôles d'accès.
- `PIXEL_CHARACTER=mage`, `PIXEL_MAGE_HTML=<export PHP>` et `PIXEL_BROWSER_PATH=<Chrome>` avec `node tools/check-hunter-browser.cjs` vérifient les huit directions, les trois cycles du bâton, les VFX, les deux apparences distantes et le changement de bâton entre deux sessions hors écran. Ce banc utilise une présence HTTP simulée ; les tests du relais couvrent séparément deux connexions WebSocket réelles.
