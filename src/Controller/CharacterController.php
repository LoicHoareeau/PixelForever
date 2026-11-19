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
        $warrior = $class === CharacterClass::Warrior;

        return $this->render('game/play.html.twig', [
            'character' => $character,
            'combat' => [
                'classKey' => $class->value,
                'health' => $class->maxHealth(),
                'mana' => $class->maxMana(),
                'resourceName' => $class === CharacterClass::Warrior ? 'Énergie' : 'Mana',
                'range' => $class->attackRange(),
                'ranged' => $class === CharacterClass::Mage,
                'basicDamage' => $class->damage(false),
                'specialDamage' => $class->damage(true),
                'basicName' => $class === CharacterClass::Warrior ? 'Coup d’épée' : 'Trait arcanique',
                'specialName' => $class === CharacterClass::Warrior ? 'Attaque chargée' : 'Boule de feu',
                'specialManaCost' => Character::SPECIAL_MANA_COST,
                'cooldownMs' => Character::ATTACK_COOLDOWN_MS,
                'healthRestore' => Character::HEALTH_POTION_RESTORE,
                'manaRestore' => Character::MANA_POTION_RESTORE,
                'weaponBonus' => Character::EQUIPPED_ATTACK_BONUS,
                'level' => $character->getLevel(),
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
                    'health' => [
                        'name' => 'Potion de vie',
                        'chance' => 50,
                        'rarity' => 'Commun',
                    ],
                    'mana' => [
                        'name' => $warrior ? 'Potion d’énergie' : 'Potion de mana',
                        'chance' => 30,
                        'rarity' => 'Commun',
                    ],
                    'rare' => [
                        'name' => $warrior ? 'Lame des saules' : 'Bâton des saules',
                        'chance' => 15,
                        'rarity' => 'Rare',
                        'bonus' => 7,
                    ],
                    'epic' => [
                        'name' => $warrior ? 'Croc de Saphyr' : 'Sceptre de Saphyr',
                        'chance' => 5,
                        'rarity' => 'Épique',
                        'bonus' => 11,
                    ],
                ],
            ],
        ]);
    }
}
