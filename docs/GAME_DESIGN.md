# PixelForever · Game design

PixelForever est un **MMORPG en pixel art** jouable dans un navigateur. Les joueurs explorent le même monde et combattent les monstres en temps réel à l’endroit où ils les rencontrent. Le premier parcours part d’un hameau, traverse une forêt, puis mène aux ruines et au repaire du dragon.

## Boucle de jeu

Créer un Guerrier ou un Mage et lui donner un nom → accepter une quête → explorer et combattre → gagner de l’XP et du butin → s’équiper ou vendre les doublons → accéder à des combats plus difficiles.

Chaque personnage possède son niveau, sa barre d’XP, son inventaire et son or. Le marchand du hameau rachète les équipements non équipés à un prix fixe indiqué sur leur fiche. La vie et le mana sont des ressources de combat. Les deux classes peuvent utiliser les mêmes potions de vie et de mana.

## Classes, équipement et sorts

| Classe et armes | Sorts | Style de jeu |
| --- | --- | --- |
| **Guerrier · Épée et bouclier** | **Attaque chargée** avec l’épée, **Coup de bouclier** pour interrompre une attaque interruptible, **Provocation** pour attirer un monstre. | Mêlée et protection des alliés. |
| **Guerrier · Hache à deux mains** | **Engagement** pour foncer sur la cible, **Taillade** pour frapper plusieurs ennemis proches, **Berserk** pour augmenter temporairement ses dégâts. | Entrée rapide en mêlée et dégâts de zone. |
| **Mage · Bâton ou baguette et livre d’incantation** | **Boule de feu** sur une cible, **Mur de feu** posé au sol, **Tourbillon de feu** qui brûle une zone. | Dégâts à distance et contrôle de l’espace. |

L’épée et la baguette occupent la main principale. Le bouclier et le livre d’incantation occupent la seconde main. La hache et le bâton occupent les deux mains. Passer à une arme à deux mains libère la seconde main.

| Classe | Armures de départ du catalogue |
| --- | --- |
| Guerrier | Heaume, cuirasse et gants en fer |
| Mage | Capuchon, robe et bottes en tissu |

Le personnage commence avec une arme de base et un premier sort. Le réglage initial proposé débloque les deux autres sorts de son profil aux niveaux 2 et 4. Les prérequis d’arme ou de bouclier continuent de s’appliquer.

### Attaque de base

Dès le niveau 1, chaque Guerrier et chaque Mage dispose d’une attaque de base **sans coût en mana ni en énergie**. Elle reste utilisable quand le mana est à zéro, si la cible est à portée et si le délai entre deux attaques est écoulé. Le Guerrier frappe en mêlée à l’épée ou à la hache. Le Mage tire un projectile simple avec son bâton ou sa baguette. Les compétences conservent leurs propres conditions et temps de recharge.

### Animations à produire

| Personnage ou équipement | Animations et effets |
| --- | --- |
| Guerrier · Épée et bouclier | Coup d’épée de base, préparation et frappe de l’Attaque chargée, impact du Coup de bouclier et geste de Provocation. |
| Guerrier · Hache à deux mains | Coup de hache de base, ruée d’Engagement, arc de Taillade et activation de Berserk avec un effet visible pendant sa durée. |
| Mage · Bâton ou baguette et livre d’incantation | Attaque de base avec projectile simple, geste d’incantation, projectile et impact de Boule de feu, apparition et extinction de Mur de feu, rotation et disparition de Tourbillon de feu. |

Prévoir les gestes dans les quatre directions de déplacement. Pour un sort à distance, le geste du personnage, le projectile et l’effet d’impact peuvent être joués séparément pour suivre la cible.

## Monde, XP et quêtes

| Zone | Monstres | Quête proposée |
| --- | --- | --- |
| Forêt proche du hameau | Sangliers, niveaux 1–2 | **Sécuriser le sentier** · repousser les sangliers pour la garde. |
| Ruines | Squelettes, niveaux 3–4 | **Les gardiens des ruines** · vaincre les squelettes, puis faire son rapport. |
| Repaire | Un dragon, niveau 5 | **Le dragon des ruines** · vaincre le boss. |

Le niveau 5 est le plafond proposé pour la première version. Le journal compte les défaites après acceptation de la quête et indique quand retourner voir le PNJ. En combat partagé, chaque personnage ayant réussi au moins une attaque reçoit l’XP complète du monstre, son tirage de butin et le crédit de sa propre quête active si l’objectif correspond.

Les sangliers et les squelettes réapparaissent après un délai. Le dragon annonce son souffle par une zone visible au sol, laissant aux joueurs le temps de se déplacer. Le Guerrier peut l’attirer avec Provocation pendant que le Mage attaque à distance. Un personnage vaincu réapparaît au hameau en conservant son or et ses objets.

## Butin et raretés

| Rareté | Source proposée |
| --- | --- |
| Commun | Sangliers et squelettes |
| Rare | Squelettes |
| Épique | Dragon |
| Légendaire | Dragon, avec une faible chance |

Le tirage est personnel. La table peut donner une potion commune ou un équipement compatible avec le personnage. Le premier prototype crédite le butin directement dans l’inventaire. Les taux de drop, les seuils d’XP et les statistiques précises des objets seront réglés après les premiers combats joués.

## Démonstration cible

Deux joueurs créent un Mage et un Guerrier, se retrouvent au hameau et progressent ensemble jusqu’au dragon. Chacun retrouve après reconnexion le niveau, l’XP, l’or, les objets et les quêtes de son personnage.

Voir aussi le [back-end](BACKEND.md) et le [front-end](FRONTEND.md).
