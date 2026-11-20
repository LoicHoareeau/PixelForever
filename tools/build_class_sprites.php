<?php

declare(strict_types=1);

const ROOT = __DIR__.'/../public/game/val-des-saules';
const DIRECTIONS = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const INK = 0x191521;

function sprite(int $width, int $height): GdImage
{
    $image = imagecreatetruecolor($width, $height);
    imagealphablending($image, false);
    imagefill($image, 0, 0, 0x7f000000);
    imagesavealpha($image, true);
    return $image;
}

function shape(GdImage $image, int $x, int $y, array $points, int $color): void
{
    foreach ($points as $i => &$point) $point += $i % 2 === 0 ? $x : $y;
    unset($point);
    imagefilledpolygon($image, $points, $color);
}

function tintCloth(int $color, string $skin, int $height): int
{
    $r = $color >> 16 & 255;
    $g = $color >> 8 & 255;
    $b = $color & 255;
    $tones = match ($skin) {
        'warlock' => $b > $r && $b > $g && $r > 26 ? [0x332438, 0x604052, 0x965e72] : null,
        'warrior' => $height > 10 && $height < 29 && $r > $b + 28 && $g > $b + 9 && $r < 204
            ? [0x283047, 0x506581, 0x9daebe] : null,
        'rogue' => $height > 10 && $height < 30 && $r > $b + 25 && $r < 180
            ? [0x2b2228, 0x584447, 0x856561] : null,
        'hunter' => $height > 10 && $height < 30 && $r > $b + 25 && $r < 190
            ? [0x282d24, 0x52593a, 0x879853] : null,
    };
    if ($tones === null) return $color;
    $light = (int) round(($r * .28 + $g * .52 + $b * .20));
    return ($color & 0x7f000000) | $tones[$light < 74 ? 0 : ($light < 125 ? 1 : 2)];
}

function dress(GdImage $source, int $sx, int $sy, string $skin, int $direction): GdImage
{
    $image = sprite(48, 48);
    $top = 48;
    for ($y = 0; $y < 48; $y++) {
        for ($x = 5; $x < 44; $x++) {
            $color = imagecolorat($source, $sx + $x, $sy + $y);
            if (($color >> 24 & 127) < 75) $top = min($top, $y);
        }
    }
    $side = str_contains(DIRECTIONS[$direction], 'west') ? -1 : 1;
    $back = $direction >= 5;
    if ($skin === 'hunter' || $skin === 'warlock') {
        $x = 24 - $side * 7;
        if ($skin === 'hunter') {
            shape($image, $x, $top + 10, [-3,-2, 1,-4, 5,11, 1,17,-2,16], INK);
            shape($image, $x, $top + 10, [-2,2, 1,0, 4,12, 1,15], 0x8f5939);
            imageline($image, $x, $top + 12, $x - 3, $top + 7, 0xdabb7c);
            imageline($image, $x + 2, $top + 10, $x + 1, $top + 6, 0xf4dc9d);
        } else {
            shape($image, $x, $top + 18, [0,-5, 8,-5, 9,3, 8,13, 3,18, -3,17, -1,10], INK);
            shape($image, $x, $top + 18, [0,-3, 6,-3, 6,8, 2,16, -2,16], 0x60364d);
        }
    }
    imagealphablending($image, true);
    for ($y = $top; $y < 48; $y++) {
        for ($x = 0; $x < 48; $x++) {
            $color = imagecolorat($source, $sx + $x, $sy + $y);
            if (($color >> 24 & 127) < 127) imagesetpixel($image, $x, $y, tintCloth($color, $skin, $y - $top));
        }
    }
    $shoulder = $top + 15;
    if ($skin === 'warrior') {
        $x = 24 + $side * ($direction % 2 === 0 ? 5 : 6);
        shape($image, $x, $shoulder, [-4,-3, 2,-5, 5,-3, 6,1, 1,5, -4,3], INK);
        shape($image, $x, $shoulder, [-3,-2, 2,-4, 4,-2, 4,1, 0,3, -3,2], 0x64788d);
        shape($image, $x, $shoulder, [-3,-2, 2,-4, 4,-2, 1,-2, 0,0,-3,1], 0xb5bec4);
        imagesetpixel($image, $x + 2, $shoulder + 1, 0xcaa362);
        if ($direction === 2 || $direction === 6) {
            shape($image, 17, $shoulder, [-3,-2, 0,-4, 3,-3, 3,1, -1,4, -4,1], INK);
            shape($image, 17, $shoulder, [-2,-2, 0,-3, 2,-2, 2,1, -1,2], 0x8799aa);
        }
        $x = 24 - $side * 3;
        if ($back) imageline($image, $x, $top + 16, $x + $side * 7, $top + 25, 0x533b31);
        else {
            imageline($image, $x, $top + 20, $x + $side * 5, $top + 23, 0x30242a);
            imagesetpixel($image, $x + $side, $top + 21, 0xcaa362);
        }
    } elseif ($skin === 'rogue' || $skin === 'hunter') {
        $cold = $skin === 'rogue';
        $base = $cold ? 0x315465 : 0x495b34;
        $light = $cold ? 0x608a94 : 0x849758;
        $x = 23 + $side * 2;
        shape($image, $x, $shoulder - 3, [-6,-1, 4,-2, 7,1, 5,4, -2,3, -7,2], INK);
        shape($image, $x, $shoulder - 3, [-6,0, 4,-1, 6,1, 4,3, -3,2, -6,1], $base);
        imageline($image, $x - 4, $shoulder - 2, $x + 3, $shoulder - 3, $light);
        if ($back || $direction % 2 === 0) {
            shape($image, $x - $side * 5, $shoulder, [0,-1, 3,1, 2,6, 1,11,-3,14,-3,8], $base);
        }
    } elseif (!$back) {
        imagesetpixel($image, 24 + $side * 2, $shoulder + 2, 0xf5bf73);
        imagesetpixel($image, 24 + $side * 2, $shoulder + 3, 0x91563f);
    }
    return $image;
}

function buildHero(string $skin, string $rig): void
{
    $folder = ROOT.'/'.$skin;
    if (!is_dir($folder)) mkdir($folder);
    $source = imagecreatefrompng(ROOT.'/'.$rig.'/walk.png');
    $walk = sprite(384, 384);
    $attack = sprite(9 * 64, 8 * 64);
    foreach (DIRECTIONS as $row => $facing) {
        for ($i = 0; $i < 8; $i++) {
            $frame = $rig === 'noe' && $row === 5 ? [0, 1, 2, 5, 6, 0, 1, 2][$i] : $i;
            imagecopy($walk, dress($source, $frame * 48, $row * 48, $skin, $row),
                $i * 48, $row * 48, 0, 0, 48, 48);
        }
        $rest = dress(imagecreatefrompng(ROOT.'/'.$rig.'/'.$facing.'.png'), 0, 0, $skin, $row);
        imagepng($rest, $folder.'/'.$facing.'.png', 8);
        $bottom = 47;
        while ($bottom > 0) {
            for ($x = 5; $x < 43; $x++) if ((imagecolorat($rest, $x, $bottom) >> 24 & 127) < 75) break 2;
            $bottom--;
        }
        for ($i = 0; $i < 9; $i++) {
            $offset = [-1,-2,-3,-3,3,4,3,2,0][$i];
            $lift = [0,0,1,1,2,1,0,0,0][$i];
            $dx = (int) round(cos($row * M_PI / 4) * $offset);
            $dy = (int) round(sin($row * M_PI / 4) * $offset * .48) - $lift;
            $cut = $bottom - 12;
            $anchor = $row * 64 + 53 - $bottom;
            imagealphablending($attack, true);
            imagecopy($attack, $rest, $i * 64 + 8, $anchor + $cut, 0, $cut, 48, 48 - $cut);
            imagecopy($attack, $rest, $i * 64 + 8 + $dx, $anchor + $dy, 0, 0, 48, $cut + 1);
            imagealphablending($attack, false);
        }
    }
    imagepng($walk, $folder.'/walk.png', 8);
    imagepng($attack, $folder.'/attack.png', 8);
}

function gear(GdImage $sheet): void
{
    // All grips are at (16, 16). The active end points east.
    shape($sheet, 0, 0, [8,14,15,14,15,11,19,11,19,13,32,13,38,16,32,19,19,19,19,21,15,21,15,18,8,18], INK);
    shape($sheet, 0, 0, [18,14,32,14,36,16,32,18,18,18], 0x748390);
    shape($sheet, 0, 0, [18,14,32,14,36,16,18,16], 0xd9e5e3);
    imageline($sheet, 9, 16, 17, 16, 0x936a4b);
    imageline($sheet, 17, 12, 17, 20, 0xc39a58);

    $x = 40;
    shape($sheet, $x, 0, [5,14,28,14,28,5,32,2,37,2,39,5,39,18,37,22,32,24,26,20,25,17,5,19], INK);
    shape($sheet, $x, 0, [6,15,32,14,33,16,6,18], 0x815543);
    imageline($sheet, $x + 8, 15, $x + 27, 15, 0xc99460);
    shape($sheet, $x, 0, [28,8,32,5,36,3,38,6,38,17,36,21,32,22,28,18], 0x607182);
    shape($sheet, $x, 0, [36,3,38,6,38,17,36,21,32,22,33,19,36,17], 0xd9e5e3);
    shape($sheet, $x, 0, [28,11,32,8,35,7,34,9,31,10,30,14,28,15], 0x9cabb5);
    imagesetpixel($sheet, $x + 30, 15, 0xd1a96d);

    $x = 80;
    shape($sheet, $x, 0, [9,14,20,13,29,15,23,18,17,19,9,18], INK);
    shape($sheet, $x, 0, [17,14,27,15,23,17,17,18], 0xaabfc4);
    imageline($sheet, $x + 16, 14, $x + 26, 15, 0xf5edda);
    imageline($sheet, $x + 10, 16, $x + 17, 16, 0x9a7352);

    $x = 120;
    shape($sheet, $x, 0, [15,2,18,3,22,7,24,13,24,19,21,26,17,30,14,29,18,23,20,17,20,13,18,7], INK);
    shape($sheet, $x, 0, [16,4,20,7,22,12,23,17,21,23,17,28,16,27,19,21,21,16,20,11,18,7], 0xcf9760);
    imageline($sheet, $x + 16, 4, $x + 16, 27, 0xead8a7);
    imageline($sheet, $x + 12, 16, $x + 29, 16, 0xf6dcb0);

    $x = 160;
    shape($sheet, $x, 0, [9,7,16,10,24,6,30,9,30,23,22,26,16,23,8,21], INK);
    shape($sheet, $x, 0, [9,9,16,12,24,8,29,10,28,21,22,23,16,21,10,20], 0x724256);
    shape($sheet, $x, 0, [11,9,16,11,24,7,27,9,26,18,22,20,16,19,11,18], 0xe5c38e);
    imageline($sheet, $x + 16, 12, $x + 16, 19, 0x91604b);
    imageline($sheet, $x + 21, 13, $x + 24, 11, 0xb46888);

    $x = 200;
    shape($sheet, $x, 0, [9,6,17,2,26,5,28,8,26,19,20,26,16,30,9,25,6,15,6,8], INK);
    shape($sheet, $x, 0, [9,8,17,4,25,7,26,9,24,18,19,24,16,28,11,23,8,14], 0xb98e5a);
    shape($sheet, $x, 0, [10,10,17,6,23,8,24,10,22,18,16,25,12,21,10,14], 0x486480);
    shape($sheet, $x, 0, [10,10,17,6,16,23,12,21], 0x6985a4);
    imageline($sheet, $x + 16, 10, $x + 16, 20, 0xe7bd71);
    imageline($sheet, $x + 13, 14, $x + 20, 14, 0xe7bd71);
}

function familiars(): GdImage
{
    $sheet = sprite(32 * 6, 32 * 4);
    $colors = [
        [0x563046,0x9d3d45,0xd85a48,0xffb552],
        [0x4c304d,0x825889,0xc88fbd,0xffbadd],
        [0x312952,0x554989,0x8b69cb,0xd8adff],
        [0x573a32,0x916044,0xcea575,0xfce195],
    ];
    foreach ($colors as $row => [$shade, $mid, $light, $eye]) {
        for ($frame = 0; $frame < 6; $frame++) {
            $x = $frame * 32 + 15;
            $ground = $row * 32 + 27;
            $strike = $frame >= 4;
            $y = $ground - ($row === 3 ? 8 : 1) - [0,1,2,1,0,2][$frame];
            $wing = [-9,-13,-15,-6,-14,-5][$frame];
            if ($row === 3) $wing += 5;
            if ($row !== 2) {
                shape($sheet, $x, $y, [-3,-10,-12,$wing-5,-14,$wing,-12, -5,-9,-7,-8,-3,-4,-5], INK);
                shape($sheet, $x, $y, [-4,-9,-12,$wing-4,-13,$wing,-11,-6,-9,-8,-7,-5], $shade);
                imageline($sheet, $x-11, $y+$wing-3, $x-5, $y-8, $mid);
            }
            if ($row === 3) {
                shape($sheet, $x, $y, [-12,-1,-15,3,-7,2,-4,0,4,1,9,-3,12,-4,11,-7,7,-7,3,-5,-3,-4], INK);
                shape($sheet, $x, $y, [-11,0,-12,2,-5,1,3,0,8,-3,10,-5,7,-6,3,-4,-4,-3], $mid);
                shape($sheet, $x, $y, [5,-5,8,-6,11,-5,10,-3,7,-3], $light);
                imagesetpixel($sheet, $x+9, $y-5, $eye);
                continue;
            }
            if ($row === 1) {
                $hand = $strike ? 13 : 8;
                shape($sheet, $x, $y, [-5,-9,-6,-17,-9,-20,-6,-21,-3,-18,3,-19,6,-22,8,-19,6,-15,
                    4,-11,$hand,-10,$hand,-7,5,-6,3,-4,6,3,3,3,1,0,-1,-3,-2,2,-6,3,-7,1,-5,-5], INK);
                shape($sheet, $x, $y, [-4,-15,-4,-18,-1,-19,3,-18,5,-16,4,-13,1,-11,-3,-11], $light);
                shape($sheet, $x, $y, [-4,-10,3,-11,5,-8,2,-4,4,1,2,1,-1,-4,-3,1,-5,1,-3,-4,-5,-8], $mid);
                imageline($sheet, $x - 3, $y - 7, $x + 2, $y - 5, $shade);
                imageline($sheet, $x + 4, $y - 9, $x + $hand - 1, $y - 8, $light);
                imagesetpixel($sheet, $x+2, $y-15, $eye);
                imageline($sheet, $x-4, $y-4, $x-11, $y+1, $mid);
                imagesetpixel($sheet, $x-12, $y+2, $light);
                continue;
            }
            $heavy = $row === 2 ? 3 : 0;
            $arm = $strike ? 13 : 8;
            shape($sheet, $x, $y, [-8-$heavy,-9,-5,-14,-3,-16,4,-16,8+$heavy,-11,$arm,-8,$arm,-5,6,-5,7,0,4,2,1,-2,-3,2,-6,1,-6,-4,-9-$heavy,-5], INK);
            shape($sheet, $x, $y, [-7-$heavy,-9,-3,-13,4,-13,7+$heavy,-10,$arm-1,-8,$arm-1,-6,5,-7,5,-1,3,0,1,-3,-4,0,-5,-4,-8-$heavy,-6], $shade);
            shape($sheet, $x, $y, [-4,-12,4,-13,7,-9,4,-6,-1,-5,-4,-8], $mid);
            shape($sheet, $x, $y, [-2,-12,4,-12,4,-10,-2,-9], $light);
            shape($sheet, $x, $y, $row === 2 ? [-5,-11,-4,-16,0,-18,6,-15,6,-11] : [-4,-11,-5,-18,-1,-15,4,-15,8,-19,7,-12,4,-9,-2,-9], INK);
            shape($sheet, $x, $y, [-3,-12,-2,-15,4,-15,6,-12,4,-10,-2,-10], $light);
            imageline($sheet, $x + 1, $y - 13, $x + 4, $y - 13, $eye);
            if ($strike) {
                shape($sheet, $x, $y, [$arm,-9,$arm+2,-12,$arm+4,-10,$arm+3,-7,$arm,-6], $mid);
                imagesetpixel($sheet, $x+$arm+2, $y-9, $eye);
            }
        }
    }
    return $sheet;
}

foreach (['warrior' => 'lina', 'warlock' => 'noe', 'rogue' => 'lina', 'hunter' => 'lina'] as $skin => $rig) {
    buildHero($skin, $rig);
}
$gear = sprite(240, 32);
gear($gear);
imagepng($gear, ROOT.'/class-gear.png', 8);
imagepng(familiars(), ROOT.'/class-familiars.png', 8);
foreach (['axe' => 1, 'daggers' => 2, 'bow' => 3, 'grimoire' => 4] as $kind => $index) {
    $icon = sprite(40, 32);
    imagecopy($icon, $gear, 0, 0, $index * 40, 0, 40, 32);
    imagepng($icon, ROOT.'/items/'.$kind.'.png', 8);
}
