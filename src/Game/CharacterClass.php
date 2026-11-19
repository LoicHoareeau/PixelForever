<?php

declare(strict_types=1);

namespace App\Game;

enum CharacterClass: string
{
    case Warrior = 'warrior';
    case Mage = 'mage';

    public function label(): string
    {
        return match ($this) {
            self::Warrior => 'Guerrier',
            self::Mage => 'Mage',
        };
    }

    public function maxHealth(): int
    {
        return match ($this) {
            self::Warrior => 60,
            self::Mage => 40,
        };
    }

    public function maxMana(): int
    {
        return match ($this) {
            self::Warrior => 20,
            self::Mage => 40,
        };
    }

    public function damage(bool $special): int
    {
        return match ($this) {
            self::Warrior => $special ? 18 : 10,
            self::Mage => $special ? 22 : 8,
        };
    }

    public function attackRange(): float
    {
        return match ($this) {
            self::Warrior => 1.5,
            self::Mage => 5.0,
        };
    }

    public function weapon(): Item
    {
        return match ($this) {
            self::Warrior => Item::IronSword,
            self::Mage => Item::EmberStaff,
        };
    }
}
