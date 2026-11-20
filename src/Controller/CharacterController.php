<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\PlayerCharacter;
use App\Entity\User;
use App\Game\Character;
use App\Game\CharacterClass;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\Form\Extension\Core\Type\EnumType;
use Symfony\Component\Form\Extension\Core\Type\TextType;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Exception\JsonException;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\AccessDeniedHttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\Validator\Constraints as Assert;

#[Route('/personnages')]
final class CharacterController extends AbstractController
{
    private const SELECTED_CHARACTER = 'selected_character';

    #[Route('', name: 'character_list', methods: ['GET'])]
    public function list(Request $request, #[CurrentUser] User $owner, EntityManagerInterface $entities): Response
    {
        $characters = $entities->getRepository(PlayerCharacter::class)->findBy(
            ['owner' => $owner],
            ['id' => 'ASC'],
        );

        $session = $request->getSession();
        $selectedId = $session->get(self::SELECTED_CHARACTER);
        if ($selectedId !== null) {
            $ownedIds = array_map(
                static fn (PlayerCharacter $character): ?int => $character->getId(),
                $characters,
            );
            if (!in_array($selectedId, $ownedIds, true)) {
                $session->remove(self::SELECTED_CHARACTER);
                $selectedId = null;
            }
        }

        return $this->render('character/list.html.twig', [
            'characters' => $characters,
            'selectedId' => $selectedId,
        ]);
    }

    #[Route('/nouveau', name: 'character_create', methods: ['GET', 'POST'])]
    public function create(Request $request, #[CurrentUser] User $owner, EntityManagerInterface $entities): Response
    {
        $form = $this->createFormBuilder(null, ['csrf_token_id' => 'create_character'])
            ->add('name', TextType::class, [
                'label' => 'Nom du personnage',
                'attr' => ['minlength' => 2, 'maxlength' => 24],
                'constraints' => [
                    new Assert\NotBlank(message: 'Choisis un nom.'),
                    new Assert\Length(min: 2, max: 24, minMessage: 'Le nom doit contenir au moins 2 caractères.', maxMessage: 'Le nom doit contenir au plus 24 caractères.'),
                    new Assert\Regex(pattern: "/^\\p{L}[\\p{L}\\p{M} '\\x{2019}-]*$/uD", message: 'Utilise des lettres, des espaces, des apostrophes ou des tirets.'),
                ],
            ])
            ->add('class', EnumType::class, [
                'label' => 'Classe',
                'class' => CharacterClass::class,
                'choice_label' => static fn (CharacterClass $class): string => $class->label(),
                'expanded' => true,
                'placeholder' => false,
                'invalid_message' => 'Choisis une classe valide.',
                'constraints' => [new Assert\NotNull(message: 'Choisis une classe.')],
            ])
            ->getForm();

        $form->handleRequest($request);
        if ($form->isSubmitted() && $form->isValid()) {
            $data = $form->getData();
            $character = new PlayerCharacter($owner, $data['name'], $data['class']);
            $entities->persist($character);
            $entities->flush();
            $request->getSession()->set(self::SELECTED_CHARACTER, $character->getId());
            $this->addFlash('success', 'Ton personnage est créé.');

            return $this->redirectToRoute('character_list', status: Response::HTTP_SEE_OTHER);
        }

        return $this->render('character/create.html.twig', ['form' => $form]);
    }

    #[Route('/{id}/selection', name: 'character_select', requirements: ['id' => '\d+'], methods: ['POST'])]
    public function select(int $id, Request $request, #[CurrentUser] User $owner, EntityManagerInterface $entities): Response
    {
        if (!$this->isCsrfTokenValid('select_character', $request->request->getString('_token'))) {
            throw new AccessDeniedHttpException('Le formulaire a expiré.');
        }

        $character = $entities->getRepository(PlayerCharacter::class)->findOneBy([
            'id' => $id,
            'owner' => $owner,
        ]);
        if (!$character) {
            throw $this->createNotFoundException();
        }

        $request->getSession()->set(self::SELECTED_CHARACTER, $character->getId());

        return $this->redirectToRoute('game_play', status: Response::HTTP_SEE_OTHER);
    }

    #[Route('/jeu', name: 'game_play', methods: ['GET'])]
    public function play(Request $request, #[CurrentUser] User $owner, EntityManagerInterface $entities): Response
    {
        $session = $request->getSession();
        $selectedId = $session->get(self::SELECTED_CHARACTER);
        $character = $selectedId === null ? null : $entities->getRepository(PlayerCharacter::class)->findOneBy([
            'id' => $selectedId,
            'owner' => $owner,
        ]);

        if ($character === null) {
            $session->remove(self::SELECTED_CHARACTER);

            return $this->redirectToRoute('character_list');
        }

        $class = $character->getClass();
        [$basic, $special, $weapon, $basicIcon, $specialIcon, $rareName, $epicName, $rareIcon, $epicIcon, $usage] = match ($class) {
            CharacterClass::Warrior => ['Coup d’épée', 'Attaque chargée', 'Épée de fer', 'sword', 'charge', 'Lame des saules', 'Croc de Saphyr', 'blade', 'fang', 'Corps à corps'],
            CharacterClass::Mage => ['Trait arcanique', 'Boule de feu', 'Baguette de braise', 'bolt', 'fire', 'Bâton des saules', 'Sceptre de Saphyr', 'staff', 'wand', 'Corps à corps'],
            CharacterClass::Warlock => ['Trait d’ombre', 'Corruption', 'Grimoire de cendres', 'bolt', 'rune', 'Codex des saules', 'Codex de Saphyr', 'grimoire', 'grimoire', 'Grimoire · à distance'],
            CharacterClass::Rogue => ['Coup de dague', 'Entaille venimeuse', 'Dagues de fer', 'sword', 'charge', 'Dagues des saules', 'Dagues de Saphyr', 'daggers', 'daggers', 'Dagues · corps à corps'],
            CharacterClass::Hunter => ['Flèche rapide', 'Tir perforant', 'Arc de frêne', 'bolt', 'charge', 'Arc des saules', 'Arc de Saphyr', 'bow', 'bow', 'Arc · à distance'],
        };

        return $this->render('game/play.html.twig', [
            'character' => $character,
            'combat' => [
                'classKey' => $class->value,
                'health' => $class->maxHealth(),
                'mana' => $class->maxMana(),
                'resourceName' => $class->resourceName(),
                'range' => $class->attackRange(),
                'specialRange' => $class === CharacterClass::Mage ? 15.0 : $class->attackRange(),
                'wandDamageMultiplier' => 0.5,
                'ranged' => $class->attackRange() > 1.5,
                'basicDamage' => $class->damage(false),
                'specialDamage' => $class->damage(true),
                'basicName' => $basic,
                'specialName' => $special,
                'weaponName' => $weapon,
                'basicIcon' => $basicIcon,
                'specialIcon' => $specialIcon,
                'specialManaCost' => $class->specialManaCost(),
                'specialCastMs' => $class->specialCastMs(),
                'cooldownMs' => Character::ATTACK_COOLDOWN_MS,
                'healthRestore' => Character::HEALTH_POTION_RESTORE,
                'manaRestore' => Character::MANA_POTION_RESTORE,
                'weaponBonus' => Character::EQUIPPED_ATTACK_BONUS,
                'level' => $character->getLevel(),
                'progress' => ['level' => max(1, $character->getLevel()), 'xp' => $character->getExperience()],
                'progressUrl' => $this->generateUrl('character_progress', ['id' => $character->getId()]),
                'progressToken' => $this->container->get('security.csrf.token_manager')->getToken('character_progress_'.$character->getId())->getValue(),
                'baseStats' => $class->baseStats(),
                'growthStats' => $class->levelGrowthStats(),
                'baseManaRegen' => $class->baseManaRegen(),
                'initialStatPoints' => Character::INITIAL_STAT_POINTS,
                'initialSpellPoints' => Character::INITIAL_SPELL_POINTS,
                'statPointsPerLevel' => Character::STAT_POINTS_PER_LEVEL,
                'spellPointsPerLevel' => Character::SPELL_POINTS_PER_LEVEL,
                'basicSpellRankBonus' => Character::BASIC_SPELL_RANK_BONUS,
                'specialSpellRankBonus' => Character::SPECIAL_SPELL_RANK_BONUS,
                'progressKey' => hash('sha256', implode("\0", [$owner->getUserIdentifier(), $character->getId(), $character->getName(), $class->value])),
                'loot' => [
                    'scale' => ['name' => 'Écaille de Saphyr', 'chance' => 2, 'rarity' => 'Rare', 'icon' => 'scale'],
                    'heart' => ['name' => 'Cœur de flamme bleue', 'chance' => 1, 'rarity' => 'Épique', 'icon' => 'heart'],
                    'health' => [
                        'name' => 'Potion de vie',
                        'chance' => 47,
                        'rarity' => 'Commun',
                    ],
                    'mana' => [
                        'name' => match ($class->resourceName()) {
                            'Énergie' => 'Potion d’énergie',
                            'Concentration' => 'Potion de concentration',
                            default => 'Potion de mana',
                        },
                        'chance' => 30,
                        'rarity' => 'Commun',
                    ],
                    'rare' => [
                        'name' => $rareName,
                        'chance' => 15,
                        'rarity' => 'Rare',
                        'bonus' => 7,
                        'icon' => $rareIcon,
                        'usage' => $class === CharacterClass::Mage ? 'Bâton · corps à corps' : $usage,
                    ],
                    'epic' => [
                        'name' => $epicName,
                        'chance' => 5,
                        'rarity' => 'Épique',
                        'bonus' => 11,
                        'icon' => $epicIcon,
                        'usage' => $class === CharacterClass::Mage ? 'Baguette · à distance' : $usage,
                    ],
                ],
            ],
        ]);
    }

    #[Route('/{id}/progression', name: 'character_progress', requirements: ['id' => '\d+'], methods: ['POST'])]
    public function saveProgress(int $id, Request $request, #[CurrentUser] User $owner, EntityManagerInterface $entities): Response
    {
        $character = $entities->getRepository(PlayerCharacter::class)->findOneBy(['id' => $id, 'owner' => $owner]);
        if ($character === null) {
            throw $this->createNotFoundException();
        }
        if (strlen($request->getContent()) > 4096) {
            return $this->json(['error' => 'Requête trop volumineuse.'], 413);
        }
        try {
            $data = $request->toArray();
        } catch (JsonException) {
            return $this->json(['error' => 'JSON invalide.'], 400);
        }
        if (!is_string($data['_token'] ?? null) || !$this->isCsrfTokenValid('character_progress_'.$id, $data['_token'])) {
            return $this->json(['error' => 'Session de sauvegarde invalide.'], 403);
        }
        $level = $data['level'] ?? null;
        $xp = $data['xp'] ?? null;
        if (!is_int($level) || $level < 1 || $level > 9999 || !is_int($xp) || $xp < 0 || $xp >= 100 + ($level - 1) * 50) {
            return $this->json(['error' => 'Niveau ou expérience invalide.'], 400);
        }

        // shortcut: combat is client-side; validate victories on the server before competitive play.
        $entities->createQuery('UPDATE App\Entity\PlayerCharacter c SET c.level = :level, c.experience = :xp
            WHERE c.id = :id AND c.owner = :owner AND (c.level < :level OR (c.level = :level AND c.experience < :xp))')
            ->setParameters(['level' => $level, 'xp' => $xp, 'id' => $id, 'owner' => $owner])->execute();
        $entities->refresh($character);

        return $this->json(['level' => $character->getLevel(), 'xp' => $character->getExperience()]);
    }
}
