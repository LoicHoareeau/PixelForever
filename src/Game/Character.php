<?php

declare(strict_types=1);

namespace App\Game;

use DomainException;
use InvalidArgumentException;

final class Character
{
    public const SPECIAL_MANA_COST = 10;
    public const ATTACK_COOLDOWN_MS = 500;
    public const HEALTH_POTION_RESTORE = 20;
    public const MANA_POTION_RESTORE = 15;
    public const EQUIPPED_ATTACK_BONUS = 4;

    private int $health;
    private int $mana;
    private int $gold = 0;
    private int $nextAttackAtMs = 0;
    private ?Item $weapon = null;

    /** @var array<string, int> */
    private array $inventory = [];

    private readonly TrailQuest $trailQuest;

    public function __construct(
        public readonly string $id,
        public readonly CharacterClass $class,
    ) {
        $this->health = $class->maxHealth();
        $this->mana = $class->maxMana();
        $this->trailQuest = new TrailQuest();
    }

    public function health(): int
    {
        return $this->health;
    }

    public function mana(): int
    {
        return $this->mana;
    }

    public function gold(): int
    {
        return $this->gold;
    }

    public function equippedWeapon(): ?Item
    {
        return $this->weapon;
    }

    public function quantity(Item $item): int
    {
        return $this->inventory[$item->value] ?? 0;
    }

    public function receiveItem(Item $item): void
    {
        $this->inventory[$item->value] = $this->quantity($item) + 1;
    }

    public function equip(Item $item): void
    {
        if ($item !== $this->class->weapon() || $this->quantity($item) === 0) {
            throw new DomainException('Cette arme doit être possédée et compatible avec la classe.');
        }

        $this->weapon = $item;
    }

    public function unequipWeapon(): void
    {
        $this->weapon = null;
    }

    public function sellEquipment(Item $item): void
    {
        $price = $item->resalePrice();
        $reserved = $this->weapon === $item ? 1 : 0;

        if ($price === null || $this->quantity($item) <= $reserved) {
            throw new DomainException('La vente exige un équipement non équipé dans l’inventaire.');
        }

        $this->removeItem($item);
        $this->gold += $price;
    }

    public function drinkPotion(Item $item): void
    {
        if ($this->health === 0 || $this->quantity($item) === 0) {
            throw new DomainException('Le personnage doit être en vie et posséder la potion.');
        }

        switch ($item) {
            case Item::HealthPotion:
                if ($this->health === $this->class->maxHealth()) {
                    throw new DomainException('Les points de vie sont déjà au maximum.');
                }
                $this->health = min($this->class->maxHealth(), $this->health + self::HEALTH_POTION_RESTORE);
                break;
            case Item::ManaPotion:
                if ($this->mana === $this->class->maxMana()) {
                    throw new DomainException('Le mana est déjà au maximum.');
                }
                $this->mana = min($this->class->maxMana(), $this->mana + self::MANA_POTION_RESTORE);
                break;
            default:
                throw new DomainException('Cet objet n’est pas une potion.');
        }

        $this->removeItem($item);
    }

    public function takeDamage(int $damage): void
    {
        if ($damage < 0) {
            throw new InvalidArgumentException('Les dégâts doivent être positifs ou nuls.');
        }

        $this->health = max(0, $this->health - $damage);
    }

    /** Le serveur fournit la distance en tuiles et l’heure monotone en millisecondes. */
    public function performAttack(bool $special, float $distance, int $nowMs): int
    {
        if ($this->health === 0 || $nowMs < $this->nextAttackAtMs) {
            throw new DomainException('Le personnage ne peut pas encore attaquer.');
        }

        if (!is_finite($distance) || $distance < 0 || $distance > $this->class->attackRange()) {
            throw new DomainException('La cible est hors de portée.');
        }

        if ($special && $this->mana < self::SPECIAL_MANA_COST) {
            throw new DomainException('Le personnage n’a pas assez de mana.');
        }

        $damage = $this->class->damage($special);
        if ($special) {
            $this->mana -= self::SPECIAL_MANA_COST;
        } elseif ($this->weapon !== null) {
            $damage += self::EQUIPPED_ATTACK_BONUS;
        }

        $this->nextAttackAtMs = $nowMs + self::ATTACK_COOLDOWN_MS;

        return $damage;
    }

    public function claimTrailQuest(): void
    {
        $this->trailQuest->complete();
        $this->receiveItem(Item::HealthPotion);
        $this->receiveItem(Item::ManaPotion);
    }

    public function acceptTrailQuest(): void
    {
        $this->trailQuest->accept();
    }

    public function recordBlobDefeat(): void
    {
        $this->trailQuest->recordDefeat();
    }

    /** @return array{status: string, defeated: int, required: int} */
    public function trailQuestProgress(): array
    {
        return $this->trailQuest->progress();
    }

    private function removeItem(Item $item): void
    {
        if ($this->quantity($item) === 1) {
            unset($this->inventory[$item->value]);
        } else {
            --$this->inventory[$item->value];
        }
    }
}
