# PixelForever · Back-end

Ce document décrit le back-end prévu pour la première version jouable. Le projet dispose d’un premier noyau métier PHP dans `src/Game/` et d’un chargement automatique Composer. Symfony, Doctrine, l’authentification, la persistance et le serveur temps réel restent à intégrer. Le Blob du noyau actuel sert de référence pour le combat et le butin. Le bestiaire cible figure dans le [game design](GAME_DESIGN.md).

## Parcours du compte au monde

1. Le joueur s’inscrit avec un pseudo, un e-mail et un mot de passe. Le pseudo et l’e-mail sont uniques. Symfony hache le mot de passe.
2. Le joueur se connecte avec son e-mail et son mot de passe. Symfony ouvre une session et affiche ses personnages.
3. Le joueur crée un personnage en choisissant un nom et une classe, Guerrier ou Mage. Le serveur initialise sa vie, son mana, son équipement de départ, son niveau, son XP et son or.
4. Le joueur sélectionne un personnage. Symfony vérifie qu’il appartient au compte connecté et émet un jeton de connexion de courte durée pour le serveur de jeu. Le serveur temps réel associe la connexion à ce personnage.
5. À la reconnexion, le serveur recharge le niveau, l’XP, l’or, l’inventaire, l’équipement et les quêtes du personnage.

## Modèle Doctrine

| Entité | Relations et données principales |
| --- | --- |
| `User` | Pseudo, e-mail, mot de passe haché. Un compte peut posséder plusieurs personnages. |
| `Character` | `ManyToOne` vers `User`. Nom, classe, niveau, XP et or. |
| `ItemDefinition` | Catalogue des potions et équipements. Type, rareté, classe requise, emplacement, mains occupées et prix de revente. |
| `InventoryEntry` | `ManyToOne` vers `Character` et `ItemDefinition`. Une entrée par pièce d’équipement, une quantité pour les consommables empilables. |
| `EquipmentSlot` | Emplacement d’un personnage associé à une entrée de son inventaire. Unicité par personnage et emplacement. Une même entrée ne peut occuper qu’un emplacement. |
| `MonsterDefinition` | Famille, niveau, statistiques de base et XP accordée. Plusieurs définitions peuvent représenter des variantes de la même famille. |
| `LootEntry` | `ManyToOne` vers `MonsterDefinition` et `ItemDefinition`. Porte le poids du tirage de cet objet. |
| `QuestDefinition` | Donneur de quête, objectif, nombre requis et récompense. |
| `CharacterQuest` | `ManyToOne` vers `Character` et `QuestDefinition`. Statut et progression. Unicité par couple personnage et quête pour les quêtes non répétables. |

Le `ManyToOne` porte la clé étrangère. On ajoute le `OneToMany` inverse quand l’application doit parcourir la collection, par exemple pour l’écran des personnages d’un compte.

### Classes, types et comportements

- `CharacterClass` reste un enum PHP réutilisable. Doctrine le stocke dans une seule table de personnages. Les sorts vérifient la classe et l’équipement au moment de l’utilisation.
- Les objets partagent le même catalogue. Des enums décrivent le type, la rareté et les emplacements. Une règle métier traite les armes à deux mains et libère la seconde main lorsque nécessaire.
- Les monstres partagent le même modèle de définition. Les comportements de poursuite, de mêlée ou de souffle du dragon vivent dans le code du serveur de jeu. Une apparition possède son propre identifiant, sa position, ses PV et son état de combat.

## Combat et monde partagé

- **Symfony** gère les écrans de compte, la session, la sélection du personnage et la persistance des données.
- **Le serveur de jeu PHP** fait évoluer le monde et communique avec le client via WebSocket. Le client envoie une direction, une cible ou une action demandée. Le serveur détermine la position, la portée, les coûts, les temps de recharge, les dégâts et les résultats de combat. Un client reçoit l’état des entités proches et les événements qui le concernent.
- **Doctrine** persiste la progression et les opérations durables. La position instantanée des entités, les projectiles et les effets de zone vivent dans le serveur de jeu. Une arme équipée reste liée à son entrée d’inventaire, y compris lorsqu’elle est déséquipée par le passage à une arme à deux mains.

## Écritures à protéger

- **Défaite d’un monstre.** Une apparition vaincue ne rapporte son XP, son butin et sa progression de quête qu’une fois par participant. Utiliser un identifiant de défaite stable et une contrainte unique par défaite et personnage. Enregistrer l’attribution et ses effets dans la même transaction.
- **Vente.** Vérifier la proximité du marchand, le propriétaire de l’objet et son état équipé. Le retrait de l’équipement et l’ajout de l’or se font dans la même transaction.
- **Récompense de quête.** Vérifier le statut, la proximité du PNJ et l’unicité de la remise. Enregistrer le changement de statut et la récompense ensemble.

## Ordre de réalisation

1. Inscription, connexion, création et sélection d’un personnage.
2. Inventaire, équipement, marchand et sauvegarde du solde d’or.
3. Connexion de deux joueurs au même monde, déplacements et premier combat contre un sanglier.
4. Récompenses de combat, niveau, quêtes et progression jusqu’au dragon.

Voir aussi le [front-end](FRONTEND.md) et le [game design](GAME_DESIGN.md).
