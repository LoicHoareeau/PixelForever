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
            self::Warrior, self::Rogue => 2.5,
            self::Mage, self::Warlock => 5.0,
            self::Hunter => 7.0,
        };
    }

    public function specialManaCost(): int
    {
        return match ($this) {
            self::Warrior => 7,
            self::Rogue => 8,
            self::Hunter => 10,
            self::Mage => 14,
            self::Warlock => 14,
        };
    }

    public function specialCastMs(): int
    {
        return match ($this) {
            self::Warrior, self::Rogue => 0,
            self::Mage => 1000,
            self::Warlock => 750,
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
                'dexterity' => 5,
                'intelligence' => 4,
                'spirit' => 5,
                'vitality' => 8,
                'defense' => 6,
            ],
            self::Mage => [
                'strength' => 4,
                'dexterity' => 5,
                'intelligence' => 8,
                'spirit' => 8,
                'vitality' => 5,
                'defense' => 4,
            ],
            self::Warlock => [
                'strength' => 4,
                'dexterity' => 5,
                'intelligence' => 9,
                'spirit' => 7,
                'vitality' => 6,
                'defense' => 4,
            ],
            self::Rogue => [
                'strength' => 5,
                'dexterity' => 9,
                'intelligence' => 4,
                'spirit' => 5,
                'vitality' => 6,
                'defense' => 5,
            ],
            self::Hunter => [
                'strength' => 5,
                'dexterity' => 8,
                'intelligence' => 4,
                'spirit' => 6,
                'vitality' => 7,
                'defense' => 5,
            ],
        };
    }

    /**
     * Retourne les points gagnés naturellement à chaque montée de niveau (priorités par classe).
     *
     * @return array<string, float>
     */
    public function levelGrowthStats(): array
    {
        return match ($this) {
            self::Warrior => [
                'strength' => 1.0,
                'defense' => 0.6,
                'vitality' => 0.35,
                'dexterity' => 0.15,
                'intelligence' => 0.15,
                'spirit' => 0.15,
            ],
            self::Mage, self::Warlock => [
                'intelligence' => 1.0,
                'spirit' => 0.6,
                'vitality' => 0.35,
                'strength' => 0.15,
                'dexterity' => 0.15,
                'defense' => 0.15,
            ],
            self::Rogue => [
                'dexterity' => 1.0,
                'strength' => 0.6,
                'vitality' => 0.35,
                'intelligence' => 0.15,
                'spirit' => 0.15,
                'defense' => 0.15,
            ],
            self::Hunter => [
                'dexterity' => 1.0,
                'spirit' => 0.6,
                'intelligence' => 0.35,
                'strength' => 0.15,
                'vitality' => 0.15,
                'defense' => 0.15,
            ],
        };
    }

    /**
     * Retourne la régénération automatique de base par seconde (mana ou énergie).
     */
    public function baseManaRegen(): float
    {
        return match ($this) {
            self::Warrior, self::Rogue => 0.8,
            self::Mage, self::Warlock, self::Hunter => 0.4,
        };
    }

    public function resourceName(): string
    {
        return match ($this) {
            self::Warrior, self::Rogue => 'Énergie',
            self::Mage, self::Warlock, self::Hunter => 'Mana',
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
