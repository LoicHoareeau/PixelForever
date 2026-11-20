<?php

declare(strict_types=1);

namespace App\Game;

enum Item: string
{
    case HealthPotion = 'health_potion';
    case ManaPotion = 'mana_potion';
    case IronSword = 'iron_sword';
    case EmberStaff = 'ember_staff';
    case Grimoire = 'grimoire';
    case Daggers = 'daggers';
    case Bow = 'bow';

    public function resalePrice(): ?int
    {
        return match ($this) {
            self::IronSword, self::EmberStaff, self::Grimoire, self::Daggers, self::Bow => 10,
            self::HealthPotion, self::ManaPotion => null,
        };
    }
}
