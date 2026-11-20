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

    public function skin(): string
    {
        return match ($this) {
            self::Warrior => 'lina',
            self::Mage => 'noe',
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
            self::Mage => 7.5,
        };
    }

    public function specialManaCost(): int
    {
        return match ($this) {
            self::Warrior => Character::SPECIAL_MANA_COST,
            self::Mage => 18,
        };
    }

    public function specialCastMs(): int
    {
        return match ($this) {
            self::Warrior => 0,
            self::Mage => 1000,
        };
    }

    public function weapon(): Item
    {
        return match ($this) {
            self::Warrior => Item::IronSword,
            self::Mage => Item::EmberStaff,
        };
    }

    /**
     * Retourne les caractéristiques de base au niveau 1.
     *
     * @return array{strength: int, intelligence: int, vitality: int, spirit: int}
     */
    public function baseStats(): array
    {
        return match ($this) {
            self::Warrior => [
                'strength' => 8,
                'intelligence' => 4,
                'vitality' => 8,
                'spirit' => 5,
            ],
            self::Mage => [
                'strength' => 4,
                'intelligence' => 8,
                'vitality' => 5,
                'spirit' => 8,
            ],
        };
    }

    /**
     * Retourne les points gagnés naturellement à chaque montée de niveau.
     *
     * @return array{strength: int, intelligence: int, vitality: int, spirit: int}
     */
    public function levelGrowthStats(): array
    {
        return match ($this) {
            self::Warrior => [
                'strength' => 2,
                'intelligence' => 1,
                'vitality' => 2,
                'spirit' => 1,
            ],
            self::Mage => [
                'strength' => 1,
                'intelligence' => 2,
                'vitality' => 1,
                'spirit' => 2,
            ],
        };
    }

    /**
     * Retourne la régénération automatique de base par seconde (mana ou énergie).
     */
    public function baseManaRegen(): float
    {
        return match ($this) {
            self::Warrior => 2.0,
            self::Mage => 1.0,
        };
    }
}
