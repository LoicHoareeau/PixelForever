<?php

declare(strict_types=1);

namespace App\Game;

use DomainException;

final class TrailQuest
{
    private const REQUIRED_BLOBS = 3;

    private ?int $defeated = null;
    private bool $completed = false;

    public function accept(): void
    {
        if ($this->defeated !== null) {
            throw new DomainException('La quête a déjà été acceptée.');
        }

        $this->defeated = 0;
    }

    public function recordDefeat(): void
    {
        if ($this->defeated !== null && $this->defeated < self::REQUIRED_BLOBS) {
            ++$this->defeated;
        }
    }

    public function complete(): void
    {
        if ($this->defeated !== self::REQUIRED_BLOBS || $this->completed) {
            throw new DomainException('La récompense de cette quête n’est pas disponible.');
        }

        $this->completed = true;
    }

    /** @return array{status: string, defeated: int, required: int} */
    public function progress(): array
    {
        return [
            'status' => match (true) {
                $this->completed => 'completed',
                $this->defeated === null => 'available',
                $this->defeated === self::REQUIRED_BLOBS => 'ready_to_turn_in',
                default => 'active',
            },
            'defeated' => $this->defeated ?? 0,
            'required' => self::REQUIRED_BLOBS,
        ];
    }
}
