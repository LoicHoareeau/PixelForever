<?php

declare(strict_types=1);

namespace App\Entity;

use App\Game\CharacterClass;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class PlayerCharacter
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column]
    private int $level = 1;

    #[ORM\Column]
    private int $experience = 0;

    #[ORM\Column]
    private int $gold = 0;

    public function __construct(
        #[ORM\ManyToOne]
        #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
        private User $owner,
        #[ORM\Column(length: 24)]
        private string $name,
        #[ORM\Column(length: 16, enumType: CharacterClass::class)]
        private CharacterClass $class,
    ) {
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getName(): string
    {
        return $this->name;
    }

    public function getClass(): CharacterClass
    {
        return $this->class;
    }

    public function getLevel(): int
    {
        return $this->level;
    }
}
