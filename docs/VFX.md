# PixelForever · Effets visuels

Les VFX de combat indiquent la préparation, la trajectoire, l’impact et la dissipation. Une zone dangereuse utilise un repère au sol calculé à partir des règles du combat. Les flammes ou les débris peuvent dépasser visuellement ce repère. Les dégâts restent déterminés par la portée et la géométrie de l’attaque. [Règles de combat](GAME_DESIGN.md)

## Effets par classe

| Classe | Effets visibles en jeu |
| --- | --- |
| Guerrier | Croissant blanc-or pour la Taillade. La Hache de fer suit la main pendant l’attaque et projette un large croissant ambré avec des éclats chauds. Rempart dessine une onde bleu acier, qui se rejoue quand la protection absorbe un coup. |
| Mage | Boule de feu composée d’un projectile, d’une traînée et d’un impact. Tourbillon de feu en double hélice, Nova de givre en cristaux et Déflagration sous forme de rayon violet. |
| Démoniste | Trait d’ombre violet, sceaux de malédiction à la pose et à chaque pulsation, filaments entre le lanceur et la cible pendant Drain de vie. Le portail d’invocation s’ouvre en flammes violettes. Le diablotin lance un projectile de feu qui éclate à l’impact. |
| Voleur | Croissants d’acier et d’ombre pour les dagues, éclats verts pour le poison et la rupture. |
| Chasseur | Flèche dorée et traînée verte, éclats au point d’impact, volée et pointes de piège. Le faucon joue ses propres poses. |

Les corps du Guerrier, du Démoniste, du Voleur et du Chasseur ont huit directions, huit images de marche et neuf images d’attaque par direction. Les armes et le bouclier utilisent des sprites séparés, ancrés à la main pendant le geste. Chaque familier dispose de six poses de 32 × 32 px. [Rendu des avatars](../public/game/world.js) · [Techniques et familiers](../public/game/class-combat.js)

## Malakor et les faisceaux de lave

- **Clivage d’obsidienne** · Grand arc lié à la hallebarde, puis éclats à l’impact.
- **Onde sismique** · Anneau d’obsidienne soulevée, suivi d’un écho.
- **Faille de magma** · Fissure télégraphiée, puis éruptions le long de son axe.
- **Passage en Rage** · À 25 % de vie, les ailes, l’armure et la lame s’embrasent. Une déferlante de lumière et de braises se propage pendant 2,55 s sur la carte. Les premières bandes d’avertissement apparaissent 4,15 s après la transformation.
- **Balayage du Trône** · Après 1,32 s d’avertissement, un faisceau blanc-or bordé de rouge lave traverse chaque bande dangereuse pendant 600 ms. Un anneau marque le départ et une gerbe marque l’autre extrémité. Le cœur se resserre, se fragmente puis laisse des braises pendant environ trois secondes. Les couloirs entre les bandes restent praticables. La Rage alterne les orientations sur cinq vagues.

Le rendu des bandes et des faisceaux partage les coordonnées de la vague avec le test des dégâts. Les braises et la déferlante de transformation sont purement visuelles. [Combat et rendu de l’arène](../public/game/combat.js) · [Chronologie et géométrie des vagues](../public/game/malakor.js)

## Ambiance et éclairage des biomes

| Biome | Effet d’ambiance |
| --- | --- |
| Clairière | Pollen doré |
| Cimetière | Nappes de brume basse |
| Montagnes | Rafales de neige obliques |
| Terres dévastées | Braises ascendantes |
| Marais des Scories | Spores vertes |
| Remparts de Basalte | Cendres mauves |
| Cap du Gouffre | Étincelles violettes |

Les transitions mélangent les profils des biomes voisins. L’éclairage ajoute une teinte ambiante et des halos autour des lanternes, des fissures et de certains effets de combat. Avec `prefers-reduced-motion`, les ambiances se figent, les secousses de caméra sont désactivées et les effets animés sont atténués ou figés selon le cas. Les zones à esquiver restent visibles. [Ambiances](../public/game/zone-ambience.js) · [Lumière](../public/game/world-lighting.js) · [Caméra](../public/game/camera-feel.js)

## Atlas et génération

| Ressource | Format |
| --- | --- |
| [combat-vfx.png](../public/game/val-des-saules/combat-vfx.png) | 25 rangées de 16 images de 128 × 128 px pour les sorts, le boss et l’ambiance |
| [class-vfx.png](../public/game/val-des-saules/class-vfx.png) | 14 rangées de 16 images de 128 × 128 px pour les armes et techniques de classe |
| [Atlas de Malakor](../public/game/val-des-saules/monsters) | Cellules de 192 × 192 px pour les techniques et la forme Rage, 12 images par action et par direction |

Les deux atlas d’effets utilisent le même pool de sprites. Leurs rangées doivent suivre l’ordre des clés de `combat-vfx.js`. Les coordonnées, la durée et l’orientation viennent du combat. Le faisceau d’arène est dessiné directement en Phaser pour épouser les dimensions des bandes. [Lecteur d’atlas et faisceaux](../public/game/combat-vfx.js)

Depuis la racine, avec l’extension PHP `gd` active, exécuter la commande qui correspond aux ressources modifiées.

```sh
php tools/build_combat_vfx.php
php tools/build_class_sprites.php
php -d memory_limit=384M tools/build_malakor_animations.php
```

## Vérifications

Contrôler le diff des PNG générés et lancer les tests de dimensions, d’animation et de combat.

```sh
node --test tests/world-lighting.test.mjs tests/combat-animation.test.mjs tests/boss-and-mage-balance.test.mjs tests/new-classes.test.mjs
```

En navigateur, comparer WebGL et Canvas, avec et sans mouvement réduit. Vérifier la hache équipée puis rangée, un tir d’arc, un drain et l’impact du projectile du diablotin. Au Trône, vérifier la visibilité du télégraphe avant le rayon, les couloirs sûrs pendant le balayage et l’extinction des braises. [Vérifications après déploiement](DEPLOIEMENT.md#vérifications-après-déploiement)
