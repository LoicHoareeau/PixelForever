# Mage : animations et effets

Le Mage garde l'identifiant historique `noe`, ses caractéristiques et ses règles de combat. Sa nouvelle apparence reprend la maquette validée : capuche bleue, tunique turquoise, bottes et équipement tenus en main. Le portrait est partagé par la création, la liste des personnages et l'ATH.

## Planches et sélection des poses

Les huit directions sont dessinées indépendamment, sur deux planches par direction : 32 poses à la baguette (16 pas et 16 incantations), 48 au bâton (16 pas, 16 incantations et 16 frappes physiques). Les 640 poses gardent leurs pixels et leur transparence d'origine, en WebP sans perte. `mage-frames.js` définit leurs découpes et leurs ancrages ; `mage-art.js` les affiche à 40 pixels de hauteur de référence par arme.

La distance parcourue choisit le pas tous les 3,5 pixels, soit 16 poses pour un cycle de 56 pixels. La marche reste prioritaire pendant une attaque en mouvement. À l'arrêt, le temps réel d'attaque choisit huit poses de préparation puis huit de récupération, indépendamment des neuf créneaux historiques des autres classes. Le bâton au contact sélectionne `staff-strike`, les sorts à distance sélectionnent `staff-cast`. La baguette et le sceptre utilisent `cast`.

Les marges et hauteurs des lignes générées étant inégales, `tools/mage-sprite-bounds.cjs` détecte les figures complètes, vérifie leur nombre et les ordonne par ligne. Les petits éléments proches (cristal, extrémité de vêtement) sont rattachés au personnage ; un fond opaque, une figure absente ou coupée bloque la reconstruction. L'ancrage horizontal est ensuite calculé sur les pixels opaques des bottes. Les pixels translucides parasites sont exclus du découpage. Le contrôle navigateur mesure la position des pieds dans les images réellement chargées, pour repérer un glissement même si la position du personnage et le nom de frame restent corrects. Le portrait validé est conservé lors de la reconstruction.

## Nouveaux VFX

L'atlas `mage-vfx` contient six effets et six images par effet : boule de feu, mur de feu, tourbillon de feu, déflagration arcanique, nova de givre et armure de glace. Les projectiles utilisent uniquement leurs dessins de vol pendant le trajet ; les dessins d'explosion commencent à l'impact. La déflagration voyage vers la cible puis s'y dissipe. Le tourbillon et la nova restent centrés sur la cible. L'armure de glace est une aura discrète lorsque son talent passif est appris ; elle n'ajoute aucun bonus de combat.

Les effets utilisent le pool existant, limité à 80 images et borné à la caméra. Le mode de réduction des animations conserve une pose fixe. Le flux multijoueur autorise `mage-vfx` et un booléen facultatif `staff`, validé en PHP et dans le relais Node. Les autres clients reproduisent les dessins sans calculer de dégâts, butin ou XP.

## Sources et reconstruction

Les seize planches ont été générées avec imagegen à partir de la maquette approuvée. Consigne : même identité, proportions et palette dans chaque case, une direction et une arme par planche, quatre colonnes ; huit lignes à la baguette et douze au bâton, cycles de seize poses, fond transparent, arme tenue naturellement et aucun VFX intégré au personnage. Les VFX utilisent la planche de six lignes et six colonnes validée, dont les limites de lignes ont été relevées pour éviter les raccords entre effets.

`node tools/pack_hunter_art.cjs <sources.json>` reconstruit les ressources. Le manifeste comporte `character: "mage"`, `poseCount: 16`, huit chemins de baguette nommés `east`, `south-east`, `south`, `south-west`, `west`, `north-west`, `north`, `north-east`, un objet `staff` avec les huit mêmes clés, et `vfx`. Les fichiers publiés dans `public/game/val-des-saules/mage-v2/` sont autonomes ; aucune génération ne s'exécute sur Render.

## Vérifications

- `node --test tests/*.test.mjs` inclut géométrie des atlas, empreintes, sélection des armes, marche pendant l'attaque, six images des six effets, matrice d'équipement et portée propre des sorts.
- Le parcours PHP vérifie le nouveau portrait et conserve l'identifiant `noe`, les règles de mana et les contrôles d'accès.
- `PIXEL_CHARACTER=mage`, `PIXEL_MAGE_HTML=<export PHP>` et `PIXEL_BROWSER_PATH=<Chrome>` avec `node tools/check-hunter-browser.cjs` vérifient les huit directions, les trois cycles du bâton, les VFX, les deux apparences distantes et le changement de bâton entre deux sessions hors écran. Ce banc utilise une présence HTTP simulée ; les tests du relais couvrent séparément deux connexions WebSocket réelles.

Le banc mesure également une course continue : temps entre images, pas maximaux, nombre de poses affichées et erreur d'ancrage. Ces mesures locales ne certifient pas les performances de la machine d'un joueur. Pour un aperçu GIF, définir une durée pour **chaque** image : un simple paramètre scalaire peut ne temporiser que la première image et créer des saccades absentes du moteur. La marche à vitesse normale est présentée à environ 25 images/s ; le contrôle au ralenti est distinct.
