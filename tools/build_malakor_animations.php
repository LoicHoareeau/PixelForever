<?php

declare(strict_types=1);

// Artwork is drawn on the native pixel grid. All poses share the floor anchor at (96, 176).
const CELL = 192;
const COLS = 20;
const BASE_CELL = 128;
const BASE_POSES = 40;
const ACTION_POSES = 48;

function canvas(int $width, int $height): GdImage
{
    $image = imagecreatetruecolor($width, $height);
    imagealphablending($image, false);
    imagefill($image, 0, 0, 0x7f000000);
    imagesavealpha($image, true);
    imagealphablending($image, true);
    return $image;
}

function polygon(GdImage $image, array $points, int $color): void
{
    imagefilledpolygon($image, array_map(static fn ($n) => (int) round($n), $points), $color);
}

function line(GdImage $image, float $x1, float $y1, float $x2, float $y2, int $color, int $size = 1): void
{
    imagesetthickness($image, $size);
    imageline($image, (int) round($x1), (int) round($y1), (int) round($x2), (int) round($y2), $color);
    imagesetthickness($image, 1);
}

function sourcePose(GdImage $source, int $direction, int $pose): GdImage
{
    $index = $direction * BASE_POSES + $pose;
    $frame = canvas(BASE_CELL, BASE_CELL);
    imagealphablending($frame, false);
    imagecopy($frame, $source, 0, 0, $index % COLS * BASE_CELL, intdiv($index, COLS) * BASE_CELL, BASE_CELL, BASE_CELL);
    return $frame;
}

function lightArmor(GdImage $frame, int $direction, float $heat): void
{
    if ($heat <= 0) return;
    $chest = [65, 64, 64, 64, 62, 63, 64, 65][$direction];
    for ($y = 42; $y <= 107; $y++) {
        for ($x = $chest - 20; $x <= $chest + 20; $x++) {
            $pixel = imagecolorat($frame, $x, $y);
            $alpha = ($pixel >> 24) & 127;
            if ($alpha >= 110) continue;
            $r = ($pixel >> 16) & 255;
            $g = ($pixel >> 8) & 255;
            $b = $pixel & 255;
            $metal = max($r, $g, $b) - min($r, $g, $b) < 40 && $r + $g + $b > 75;
            $ember = $r > 84 && $r > $g * 1.22 && $r > $b * 1.47;
            if (!$metal && !$ember) continue;
            $falloff = max(0, 1 - hypot(($x - $chest) / 26, ($y - 71) / 46));
            $reflection = .52 + .48 * ((($x + $y * 2) % 9 < 3) ? 1 : 0);
            $power = $heat * $falloff * ($ember ? 1.12 : $reflection);
            $r = min(255, $r + (int) (130 * $power));
            $g = min(255, $g + (int) (63 * $power));
            $b = min(255, $b + (int) (16 * $power));
            imagesetpixel($frame, $x, $y, ($alpha << 24) | ($r << 16) | ($g << 8) | $b);
        }
    }
}

function flame(GdImage $image, float $x, float $y, float $height, float $lean, int $step): void
{
    $curl = sin($step * .73 + $x * .32) * 4;
    $tipX = $x + $lean + $curl;
    polygon($image, [$x-5,$y+4, $x-6,$y-4, $x-2,$y-$height*.55, $tipX-1,$y-$height,
        $tipX+3,$y-$height*.68, $x+5,$y-$height*.37, $x+6,$y+1, $x+2,$y+5], 0x31fa3a16);
    polygon($image, [$x-4,$y+2, $x-3,$y-5, $tipX,$y-$height*.87, $tipX+2,$y-$height*.6,
        $x+3,$y-$height*.4, $x+4,$y, $x,$y+5], 0x14f7792d);
    polygon($image, [$x-2,$y+1, $x-1,$y-4, $x+$lean*.45,$y-$height*.61,
        $x+1,$y-$height*.33, $x+2,$y, $x,$y+3], 0xffbe5e);
    if (($step + (int) $x) % 3 !== 0) {
        line($image, $tipX+2, $y-$height-4, $tipX+3, $y-$height-6, 0xff9652);
    }
}

function drawWingFire(GdImage $image, GdImage $frame, int $direction, int $step, float $heat, int $dy): void
{
    if ($heat <= .08) return;
    $sides = match ($direction) {
        0 => [-1],
        4 => [1],
        default => [-1, 1],
    };
    // Attach each flame to the actual opaque wing edge of this source frame.
    foreach ($sides as $side) {
        for ($index = 3; $index >= 0; $index--) {
            $y = 47 + $index * 8;
            $start = $side < 0 ? 15 : 112;
            $edge = $start;
            while (($side < 0 ? $edge < 55 : $edge > 72) && (imagecolorat($frame, $edge, $y) >> 24) > 48) {
                $edge -= $side;
            }
            if ($side < 0 ? $edge >= 55 : $edge <= 72) continue;
            $variation = sin($step * .69 + $index * 1.87 + $direction);
            $height = max(3, (14 + $variation * 5 + ($index % 2) * 3) * $heat);
            flame($image, 32 + $edge + $side * 3, 64 + $y + $dy, $height, $side * (3 + $index), $step);
        }
    }
}

function drawPose(GdImage $source, int $direction, int $pose, int $step, float $heat, int $dy = 0): GdImage
{
    $image = canvas(CELL, CELL);
    $frame = sourcePose($source, $direction, $pose);
    drawWingFire($image, $frame, $direction, $step, $heat, $dy);
    lightArmor($frame, $direction, $heat);
    imagecopy($image, $frame, 32, 64 + $dy, 0, 0, BASE_CELL, BASE_CELL);
    // Light on the edge stays close to the original contour.
    if ($heat >= .45) {
        $side = $direction >= 3 && $direction <= 5 ? -1 : 1;
        $wing = [76,72,75,53,52,51,78,80][$direction];
        for ($index = 0; $index < 5; $index++) {
            $x = 32 + $wing + $side * (10 + $index * 2) + sin($step + $index * 2) * 4;
            $y = 125 + $dy - ($index * 6 + $step * 2) % 52;
            line($image, $x, $y, $x + $side, $y - 2, $index % 2 ? 0xf2783f : 0xffce74);
        }
    }
    return $image;
}

function attackPose(GdImage $source, int $direction, int $action, int $step, bool $rage): GdImage
{
    $poses = [37, 37, 37, 37, 37, 37, 38, 38, 38, 39, 39, 0];
    $pose = $action === 3 ? 0 : $poses[$step];
    $heat = $rage ? ($action === 3 ? $step / 11 : .88 + .12 * sin($step * .75)) : 0;
    $image = drawPose($source, $direction, $pose, $step, $heat);
    if ($action !== 3 && $step >= 6 && $step <= 9) {
        $angle = $direction * M_PI / 4;
        for ($index = 0; $index < 12; $index++) {
            // The effect follows the live strike while leaving the authored body frames stationary.
            $alpha = 20 + ($step - 6) * 20;
            $color = ($alpha << 24) | ($index % 4 ? 0xff8a40 : 0xffedb8);
            $rad = (24 + $index % 6 * 4 + ($step - 6) * 5);
            $theta = $action === 1 ? $index * .52 : $angle + ($index - 6) * ($action === 0 ? .15 : .035);
            $x = 96 + $rad * cos($theta);
            $y = ($action === 1 ? 164 : 145) + $rad * sin($theta) * .58;
            line($image, $x, $y, $x + cos($theta) * 5, $y + sin($theta) * 3, $color, 2);
        }
    }
    return $image;
}

function saveSlot(GdImage $atlas, GdImage $frame, int $index): void
{
    imagecopy($atlas, $frame, $index % COLS * CELL, intdiv($index, COLS) * CELL, 0, 0, CELL, CELL);
}

$root = dirname(__DIR__) . '/public/game/val-des-saules';
$source = imagecreatefrompng($root . '/monsters/breach_lord.png');
foreach ([false, true] as $rage) {
    $atlas = canvas(COLS * CELL, (int) ceil(8 * ACTION_POSES / COLS) * CELL);
    for ($direction = 0; $direction < 8; $direction++) {
        for ($action = 0; $action < 4; $action++) {
            for ($step = 0; $step < 12; $step++) {
                saveSlot($atlas, attackPose($source, $direction, $action, $step, $rage),
                    $direction * ACTION_POSES + $action * 12 + $step);
            }
        }
    }
    imagepng($atlas, $root . '/monsters/' . ($rage ? 'malakor-rage-actions' : 'malakor-actions') . '.png', 7);
    unset($atlas);
}
$atlas = canvas(COLS * CELL, intdiv(8 * BASE_POSES, COLS) * CELL);
for ($direction = 0; $direction < 8; $direction++) {
    for ($step = 0; $step < BASE_POSES; $step++) {
        $frame = drawPose($source, $direction, $step, $step, .88 + .12 * cos($step / 36 * 2 * M_PI));
        saveSlot($atlas, $frame, $direction * BASE_POSES + $step);
    }
}
imagepng($atlas, $root . '/monsters/malakor-rage.png', 7);
unset($atlas);

$palettes = [
    32 => [0x523b53, 0xab745a, 0xffb472],
    40 => [0x572637, 0xc4523a, 0xffcd76],
    48 => [0x393451, 0x8c81b0, 0xdbc0ed],
    56 => [0x552452, 0xb04d8c, 0xffa4dc],
];
foreach ($palettes as $level => [$shade, $mid, $glow]) {
    foreach (['warrior', 'mage'] as $class) {
        foreach (['head', 'hands'] as $slot) {
            $icon = canvas(32, 32);
            if ($slot === 'head' && $class === 'warrior') {
                polygon($icon, [4,23,5,10,10,7,15,3,19,7,26,9,28,23,23,28,9,28], INK);
                polygon($icon, [6,22,7,11,11,8,15,5,19,9,25,10,26,22,22,26,10,26], $shade);
                polygon($icon, [7,12,13,10,15,7,24,11,25,16,19,17,15,22,11,17,7,17], $mid);
                line($icon, 9, 15, 22, 15, INK, 3);
                line($icon, 13, 14, 13, 11, $glow, 2);
                line($icon, 16, 16, 16, 25, $mid, 2);
            } elseif ($slot === 'head') {
                polygon($icon, [3,25,8,19,9,13,17,4,21,5,23,13,26,20,29,26,22,28,9,28], INK);
                polygon($icon, [5,24,10,19,11,13,17,6,21,8,21,14,24,20,27,25,22,26,10,26], $shade);
                polygon($icon, [11,16,13,12,17,8,20,9,20,16,15,18], $mid);
                polygon($icon, [10,20,15,16,19,16,23,20,19,24,12,23], INK);
                line($icon, 13, 19, 16, 16, $glow, 2);
            } else {
                polygon($icon, [3,20,5,12,8,10,9,6,13,5,16,7,20,7,21,10,25,10,28,15,26,20,26,27,11,29,7,23], INK);
                polygon($icon, [5,20,7,13,10,12,11,8,13,7,17,9,20,9,22,12,25,12,26,15,24,21,24,26,12,27,9,22], $shade);
                polygon($icon, [8,14,12,12,13,8,17,10,20,10,21,13,24,13,24,17,19,19,13,18], $mid);
                if ($class === 'warrior') {
                    line($icon, 14, 10, 13, 15, $glow, 2);
                    line($icon, 18, 11, 17, 15, $glow, 2);
                    line($icon, 22, 13, 21, 16, $glow);
                } else {
                    polygon($icon, [11,21,16,16,20,20,15,25], $mid);
                    line($icon, 13, 22, 17, 18, $glow, 2);
                }
                line($icon, 13, 26, 21, 24, $mid, 2);
            }
            imagepng($icon, "$root/items/$class-$slot-$level.png", 7);
        }
    }
}
