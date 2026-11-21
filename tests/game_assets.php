<?php

declare(strict_types=1);

require dirname(__DIR__).'/src/Game/GameAssets.php';

function ensure(bool $ok, string $message): void { if (!$ok) throw new RuntimeException($message); }

$root = sys_get_temp_dir().'/pixel-assets-'.bin2hex(random_bytes(8));
mkdir($root.'/public/game', 0777, true);
$files = ['game/world.js' => "import './hud-controls.js';", 'game/hud-controls.js' => "import './spell-icons.js';", 'game/spell-icons.js' => 'export const icons = [];', 'game/hud.css' => 'body {}', 'pixel.css' => 'html {}'];
try {
    foreach ($files as $path => $body) file_put_contents($root.'/public/'.$path, $body);
    $assets = new App\Game\GameAssets($root);
    $before = $assets->forGame('/pixel');
    foreach (['world.js', 'hud-controls.js', 'spell-icons.js'] as $name) {
        $url = '/pixel/game/'.$name;
        ensure(str_starts_with($before['gameModules']['imports'][$url], $url.'?v='), 'Une dépendance ne contourne pas l’ancien cache.');
    }
    ensure($before['gameEntryUrl'] === $before['gameModules']['imports']['/pixel/game/world.js'], 'Le point d’entrée doit employer la version publiée.');
    file_put_contents($root.'/public/game/spell-icons.js', 'export const icons = [1];');
    file_put_contents($root.'/public/game/hud.css', 'body { color: red; }');
    $after = $assets->forGame('/pixel');
    ensure($before['gameModules']['imports']['/pixel/game/spell-icons.js'] !== $after['gameModules']['imports']['/pixel/game/spell-icons.js'], 'Un module modifié doit changer d’URL.');
    ensure($before['gameEntryUrl'] === $after['gameEntryUrl'], 'Un module inchangé garde son URL.');
    ensure($before['gameCssVersion'] !== $after['gameCssVersion'], 'Le CSS modifié doit changer de version.');
    fwrite(STDOUT, "Versions des fichiers et import map validées.\n");
} finally {
    foreach (array_keys($files) as $path) unlink($root.'/public/'.$path);
    rmdir($root.'/public/game'); rmdir($root.'/public'); rmdir($root);
}
