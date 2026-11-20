<?php

declare(strict_types=1);

namespace App\Game;

enum CharacterClass: string
{
    case Warrior = 'warrior';
    case Mage = 'mage';
    case Warlock = 'warlock';
    case Rogue = 'rogue';
    case Hunter = 'hunter';

    public function label(): string
    {
        return match ($this) {
            self::Warrior => 'Guerrier',
            self::Mage => 'Mage',
            self::Warlock => 'Démoniste',
            self::Rogue => 'Voleur',
            self::Hunter => 'Chasseur',
        };
    }

    public function maxHealth(): int
    {
        return match ($this) {
            self::Warrior => 60,
            self::Mage => 40,
            self::Warlock => 45,
            self::Rogue => 49,
            self::Hunter => 52,
        };
    }

    public function skin(): string
    {
        return match ($this) {
            self::Warrior => 'lina',
            self::Mage => 'noe',
            self::Warlock, self::Rogue, self::Hunter => $this->value,
        };
    }

    public function maxMana(): int
    {
        return match ($this) {
            self::Warrior => 20,
            self::Mage => 40,
            self::Warlock => 44,
            self::Rogue => 25,
            self::Hunter => 30,
        };
    }

    public function damage(bool $special): int
    {
        return match ($this) {
            self::Warrior => $special ? 18 : 10,
            self::Mage => $special ? 22 : 8,
            self::Warlock => $special ? 22 : 9,
            self::Rogue => $special ? 21 : 10,
            self::Hunter => $special ? 22 : 9,
        };
    }

    public function attackRange(): float
    {
        return match ($this) {
            self::Warrior => 1.5,
            self::Mage => 7.5,
            self::Warlock => 7.0,
            self::Rogue => 1.5,
            self::Hunter => 8.0,
        };
    }

    public function specialManaCost(): int
    {
        return match ($this) {
            self::Warrior => Character::SPECIAL_MANA_COST,
            self::Mage => 18,
            self::Warlock => 13,
            self::Rogue => 8,
            self::Hunter => 11,
        };
    }

    public function specialCastMs(): int
    {
        return match ($this) {
            self::Warrior, self::Rogue => 0,
            self::Mage => 1000,
            self::Warlock => 0,
            self::Hunter => 430,
        };
    }

    public function weapon(): Item
    {
        return match ($this) {
            self::Warrior => Item::IronSword,
            self::Mage => Item::EmberStaff,
            self::Warlock => Item::Grimoire,
            self::Rogue => Item::Daggers,
            self::Hunter => Item::Bow,
        };
    }

    /**
     * Retourne les caractéristiques de base au niveau 1.
     *
     * @return array<string, int>
     */
    public function baseStats(): array
    {
        return match ($this) {
            self::Warrior => [
                'strength' => 8,
                'intelligence' => 4,
                'vitality' => 8,
                'spirit' => 5,
                'defense' => 6,
            ],
            self::Mage => [
                'strength' => 4,
                'intelligence' => 8,
                'vitality' => 5,
                'spirit' => 8,
            ],
            self::Warlock => ['strength' => 4, 'intelligence' => 9, 'vitality' => 6, 'spirit' => 7],
            self::Rogue => ['strength' => 5, 'intelligence' => 4, 'vitality' => 6, 'spirit' => 5, 'dexterity' => 9],
            self::Hunter => ['strength' => 5, 'intelligence' => 4, 'vitality' => 7, 'spirit' => 6, 'dexterity' => 8],
        };
    }

    /**
     * Retourne les points gagnés naturellement à chaque montée de niveau.
     *
     * @return array<string, int>
     */
    public function levelGrowthStats(): array
    {
        return match ($this) {
            self::Warrior => [
                'strength' => 2,
                'intelligence' => 1,
                'vitality' => 2,
                'spirit' => 1,
                'defense' => 0,
            ],
            self::Mage => [
                'strength' => 1,
                'intelligence' => 2,
                'vitality' => 1,
                'spirit' => 2,
            ],
            self::Warlock => ['strength' => 1, 'intelligence' => 2, 'vitality' => 1, 'spirit' => 2],
            self::Rogue, self::Hunter => ['strength' => 1, 'intelligence' => 1, 'vitality' => 1, 'spirit' => 1, 'dexterity' => 2],
        };
    }

    /**
     * Retourne la régénération automatique de base par seconde (mana ou énergie).
     */
    public function baseManaRegen(): float
    {
        return match ($this) {
            self::Warrior, self::Rogue => 2.0,
            self::Mage, self::Warlock => 1.0,
            self::Hunter => 1.6,
        };
    }

    public function resourceName(): string
    {
        return match ($this) {
            self::Warrior, self::Rogue => 'Énergie',
            self::Hunter => 'Concentration',
            default => 'Mana',
        };
    }

    public function icon(): string
    {
        return match ($this) {
            self::Warrior => '⚔',
            self::Mage => '✦',
            self::Warlock => '☽',
            self::Rogue => '✧',
            self::Hunter => '➶',
        };
    }
}
