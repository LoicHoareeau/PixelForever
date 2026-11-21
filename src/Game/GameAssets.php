<?php

declare(strict_types=1);

namespace App\Game;

final class GameAssets
{
    public function __construct(private readonly string $projectDir) {}

    public function forGame(string $basePath): array
    {
        $imports = [];
        foreach (glob($this->projectDir.'/public/game/*.js') as $file) {
            $url = $basePath.'/game/'.basename($file);
            $imports[$url] = $url.'?v='.substr(hash_file('sha256', $file), 0, 12);
        }

        return [
            'gameModules' => ['imports' => $imports],
            'gameEntryUrl' => $imports[$basePath.'/game/world.js'],
            'gameCssVersion' => substr(hash_file('sha256', $this->projectDir.'/public/game/hud.css'), 0, 12),
            'pixelCssVersion' => substr(hash_file('sha256', $this->projectDir.'/public/pixel.css'), 0, 12),
        ];
    }
}
