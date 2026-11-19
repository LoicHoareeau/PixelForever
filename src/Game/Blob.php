<?php

declare(strict_types=1);

namespace App\Game;

use DomainException;
use Random\Randomizer;

final class Blob
{
    private const DAMAGE = 8;
    private const ATTACK_RANGE = 1.0;

    private int $health = 36;

    /** @var array<array-key, Character> */
    private array $participants = [];

    public function __construct(private readonly Randomizer $randomizer = new Randomizer())
    {
    }

    public function health(): int
    {
        return $this->health;
    }

    /** @return array<array-key, Item> Butin attribué par identifiant de personnage. */
    public function hitBy(Character $attacker, bool $special, float $distance, int $nowMs): array
    {
        if ($this->health === 0) {
            throw new DomainException('Ce Blob a déjà été vaincu.');
        }

        $damage = $attacker->performAttack($special, $distance, $nowMs);
        $this->participants[$attacker->id] = $attacker;
        if ($damage < $this->health) {
            $this->health -= $damage;

            return [];
        }

        $loot = [];
        foreach ($this->participants as $id => $participant) {
            $roll = $this->randomizer->getInt(1, 100);
            $loot[$id] = match (true) {
                $roll <= 45 => Item::HealthPotion,
                $roll <= 75 => Item::ManaPotion,
                default => $participant->class->weapon(),
            };
        }

        $this->health = 0;
        foreach ($this->participants as $id => $participant) {
            $participant->receiveItem($loot[$id]);
            $participant->recordBlobDefeat();
        }
        $this->participants = [];

        return $loot;
    }

    public function strike(Character $target, float $distance): void
    {
        if ($this->health === 0 || !is_finite($distance) || $distance < 0 || $distance > self::ATTACK_RANGE) {
            throw new DomainException('Le Blob ne peut pas toucher cette cible.');
        }

        $target->takeDamage(self::DAMAGE);
    }
}
