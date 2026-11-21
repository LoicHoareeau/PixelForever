<?php

declare(strict_types=1);

namespace App\Game;

final class Balance
{
    public static function xpRequired(int $level): int
    {
        return (50 + 10 * $level) * ($level < 10 ? 4 : ($level < 30 ? 5 : 6));
    }
}
