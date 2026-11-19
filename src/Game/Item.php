<?php

declare(strict_types=1);

namespace App\Game;

enum Item: string
{
    case HealthPotion = 'health_potion';
    case ManaPotion = 'mana_potion';
    case IronSword = 'iron_sword';
    case EmberStaff = 'ember_staff';

    public function resalePrice(): ?int
    {
        return match ($this) {
            self::IronSword, self::EmberStaff => 10,
            self::HealthPotion, self::ManaPotion => null,
        };
    }
}
