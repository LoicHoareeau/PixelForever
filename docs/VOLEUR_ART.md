# Voleur : apparence et VFX animés

L'apparence approuvée remplace celle du Voleur équipé de ses dagues : capuche ardoise, masque, cuir brun, petites épaulières et cape courte. Les huit orientations sont dessinées séparément, avec huit pas et huit poses d'attaque par direction. Le repos utilise la première pose d'attaque ; les deux dernières étapes temporelles du combat partagent la pose de retour. La marche reste prioritaire pendant les attaques en déplacement, comme pour le Chasseur. Il ne s'agit pas de superposer un buste d'attaque sur des jambes indépendantes.

`rogue-art.js` et `rogue-frames.js` décrivent les textures, les ancrages au sol et leur échelle (40 unités du monde). Les atlas `rogue-v2` sont en WebP sans perte, à leur résolution native, sans miroir ni marche fabriquée en décalant une image immobile. Un portrait frontal tiré du même dessin est utilisé pour la création, la liste des personnages et l'ATH. Les autres classes et le repli sans dagues conservent leurs ressources.

## Animations des effets

L'atlas transparent `rogue-vfx` contient quatre images successives pour chacun des effets : entaille argentée, double traînée de Rafale, particules de venin vertes et sillage d'ombre bleu ardoise. Les images progressent de l'apparition aux fragments qui disparaissent ; ce ne sont pas des icônes immobiles.

- L'attaque de base déclenche une courte entaille pendant la récupération du geste.
- Les compétences utilisant les doubles dagues déclenchent la double traînée pendant 320 ms.
- Le venin produit ses particules sur la cible et un reflet bref autour des dagues du joueur ; aucun poison gratuit ou bonus de dégâts n'est ajouté.
- Le Pas de l'ombre laisse trois groupes de fragments sur le déplacement de recul déjà existant, pendant 400 ms.

Les effets utilisent le pool existant, son plafond de 80 images et son filtrage par caméra. La réduction des animations conserve une image de référence plutôt que de faire défiler les images. Le flux multijoueur autorise `rogue-vfx` et transmet les effets dessinés, sans les recréer une seconde fois ni les réémettre. Le repli HTTP transmet les poses, sans les effets de combat.

Aucune modification des dégâts, portées, coûts, recharges, talents, XP ou sauvegardes. Aucune migration de base de données.

## Préparation et contrôles

L'outil intégré de génération d'images a produit les planches à partir des maquettes approuvées. Prompt des personnages : « exact approved adult rogue, slate hood and mask, brown leather, two short curved steel daggers naturally gripped; transparent 4×4 sheet, first two rows eight articulated walking poses, last two rows eight blade-dance poses, fixed scale and sole baseline, specified front/back/profile/diagonal direction, no text, effects, mirrored views or scenery ». Le profil ouest a été recadré par génération pour conserver les pointes des dagues.

Prompt VFX : « transparent 4×4 atlas, four sequential frames per row, compact silver crescent, double intersecting crescents, moss-emerald wisps and droplets, slate-blue shadow fragments; crisp 16-bit pixel clusters, no character, no blur, no text; final frames dissipating ».

`node tools/pack_hunter_art.cjs sources.json` réutilise le conditionnement du Chasseur. Le JSON porte `character: "rogue"`, les huit chemins des directions et `vfx`. Sharp est un outil de préparation ; aucune dépendance supplémentaire du navigateur. Les dimensions réelles sont lues avant de découper les rectangles et encoder sans perte. Les atlas portent une empreinte de contenu.

Vérifier avec la suite Node, dont `rogue-art`, `combat-animation`, `weapons` et `mage-spells`. Le parcours PHP peut exporter `PIXEL_ROGUE_HTML`. Le test hors écran à deux sessions utilise `PIXEL_CHARACTER=rogue`, `PIXEL_ROGUE_HTML`, `PIXEL_BROWSER_PATH` et `node tools/check-hunter-browser.cjs`.
