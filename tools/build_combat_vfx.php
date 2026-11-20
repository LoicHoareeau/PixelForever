<?php

declare(strict_types=1);

const CELL = 128;
const FRAMES = 12;
const HOT = [0x6e2339, 0xd04024, 0xff722f, 0xffbb55, 0xfff1b6];
const ICE = [0x243b6f, 0x3d74b4, 0x69cef3, 0xa9ecff, 0xedffff];
const ARCANE = [0x38204f, 0x7047a3, 0xa864e1, 0xd5a4ff, 0xffedff];

function canvas(int $width, int $height): GdImage
{
    $image = imagecreatetruecolor($width, $height);
    imagealphablending($image, false);
    imagefill($image, 0, 0, 0x7f000000);
    imagesavealpha($image, true);
    imagealphablending($image, true);
    return $image;
}

function poly(GdImage $image, array $points, int $color): void
{
    imagefilledpolygon($image, array_map(static fn ($x) => (int) round($x), $points), $color);
}

function ellipse(GdImage $image, float $x, float $y, float $w, float $h, int $color): void
{
    imagefilledellipse($image, (int) round($x), (int) round($y), max(1, (int) round($w)), max(1, (int) round($h)), $color);
}

function jewel(GdImage $image, float $x, float $y, float $size, float $angle, array $palette): void
{
    $dx = cos($angle) * $size;
    $dy = sin($angle) * $size;
    $lx = -$dy * .34;
    $ly = $dx * .34;
    $tip = [$x + $dx, $y + $dy];
    $heel = [$x - $dx * .4, $y - $dy * .4];
    poly($image, [...$tip, $x+$lx, $y+$ly, ...$heel, $x-$lx, $y-$ly], $palette[0]);
    poly($image, [...$tip, $x+$lx*.74, $y+$ly*.74, ...$heel, $x-$lx*.72, $y-$ly*.72], $palette[2]);
    poly($image, [...$tip, $x-$lx*.5, $y-$ly*.5, ...$heel], $palette[4]);
}

function embers(GdImage $image, float $p, array $colors, int $count, float $radius, float $y = 67): void
{
    for ($i = 0; $i < $count; $i++) {
        $angle = $i * 2.39996323;
        $distance = (7 + ($i * 19) % 27) * (.25 + .8 * $p) * $radius;
        $x = 64 + cos($angle) * $distance;
        $dy = sin($angle) * $distance * .75 - $p * ($i % 7) * 3.6;
        $a = min(120, (int) (88 * $p) + ($i % 4) * 7);
        $size = 1 + (3 - $i % 4) * (1 - $p);
        jewel($image, $x, $y + $dy, $size, $angle, array_map(static fn ($c) => ($a << 24) | $c, $colors));
    }
}

function tongue(GdImage $image, float $x, float $y, float $w, float $h, float $lean, array $colors): void
{
    foreach ([1, .78, .52, .29] as $layer => $scale) {
        $width = $w * $scale;
        $height = $h * ($scale * .78 + .22);
        $curl = $lean * $scale;
        poly($image, [
            $x-$width, $y, $x-$width*.88, $y-$height*.31, $x-$width*.32, $y-$height*.56,
            $x-$width*.15+$curl*.32, $y-$height*.82, $x+$curl, $y-$height,
            $x+$width*.26+$curl*.48, $y-$height*.63, $x+$width*.25, $y-$height*.50,
            $x+$width*.7, $y-$height*.71, $x+$width, $y-$height*.25, $x+$width*.76, $y+2,
        ], $colors[$layer + ($layer > 1 ? 1 : 0)]);
    }
}

function ring(GdImage $image, float $p, array $colors, float $height = .64): void
{
    $r = 12 + $p * 36;
    for ($i = 0; $i < 23; $i++) {
        $theta = $i * 2 * M_PI / 23;
        $s = sin($theta);
        $c = cos($theta);
        $x = 64 + $c * $r;
        $y = 66 + $s * $r * $height;
        $step = (int) (100 * $p) << 24;
        ellipse($image, $x, $y, 11 - $p * 5, 4 - $p * 2, $step | $colors[1]);
        if ($i % 2 === 0) ellipse($image, $x, $y - 1, 5, 2, $step | $colors[3]);
    }
}

function ribbon(GdImage $image, float $angle, float $radius, float $sweep, float $width, array $colors, float $p, float $aspect = .72): void
{
    foreach ([1, .64, .27] as $layer => $thickness) {
        $outer = [];
        $inner = [];
        for ($i = 0; $i <= 22; $i++) {
            $u = $i / 22;
            $a = $angle + $u * $sweep;
            $r = $radius * (.73 + .27 * $u) + sin($u * 8 + $p * 7) * 2;
            $half = sin(M_PI * $u) ** .6 * $width * $thickness;
            array_push($outer, 64 + cos($a) * ($r + $half), 64 + sin($a) * ($r + $half) * $aspect);
            array_unshift($inner, 64 + cos($a) * ($r - $half), 64 + sin($a) * ($r - $half) * $aspect);
        }
        $alpha = (int) (max(0, $p - .58) / .42 * 92);
        poly($image, [...$outer, ...$inner], ($alpha << 24) | $colors[$layer * 2]);
    }
}

function drawFrame(string $kind, int $frame): GdImage
{
    $image = canvas(CELL, CELL);
    $p = $frame / FRAMES;
    if ($kind === 'mist' || $kind === 'marsh_wisp') {
        $marsh = $kind === 'marsh_wisp';
        $palette = $marsh ? [0x645cc4ab, 0x697ed6b9, 0x5f9ee0c5] : [0x697ba8c4, 0x609ac5d7, 0x66bedcdf];
        for ($band = 0; $band < 6; $band++) {
            $sway = sin($p * 2 * M_PI + $band * .8);
            $x = 19 + $band * 15 + 3 * $sway;
            $y = 67 + ($band % 3 - 1) * ($marsh ? 6 : 4) + 2 * $sway;
            $width = ($marsh ? 27 : 41) + 7 * $sway;
            ellipse($image, $x, $y, $width, 5 + $band % 3, $palette[$band % 3]);
            ellipse($image, $x + 3, $y - 1, $width * .60, 2, $palette[2]);
        }
        if ($marsh) {
            for ($i = 0; $i < 7; $i++) {
                $a = $p * 2 * M_PI + $i * 2.4;
                $x = 18 + $i * 15 + cos($a) * 5;
                $y = 58 - ($i * 3 % 13) + sin($a) * 6;
                ellipse($image, $x, $y, 9, 8, 0x6764e8b3);
                ellipse($image, $x, $y, 2, 2, 0xc7ffda);
            }
        }
        return $image;
    }

    $weather = match ($kind) {
        'pollen' => [0xeac977, 0xffedbc, 0x949a49, 1.8, -4],
        'snow' => [0x99c7df, 0xd9f2fd, 0x6a89b4, 2.6, 7],
        'ash' => [0xb88182, 0xe7b095, 0x74576d, 1.7, -9],
        'cinders' => [0xe5773c, 0xffc775, 0x9d4d43, 1.9, -16],
        default => null,
    };
    if ($weather) {
        [$midtone, $bright, $shadow, $size, $speed] = $weather;
        for ($i = 0; $i < 15; $i++) {
            $a = $p * 2 * M_PI + $i * 2.39996;
            $x = 18 + $i * 23 % 90 + sin($a) * (4 + $i % 4);
            $y = 26 + $i * 19 % 76 + cos($a) * $speed;
            $f = sin($a + .5) ** 2;
            $alpha = (int) ((1 - $f) * 83 + 15) << 24;
            $length = $size + ($i % 4 === 0 ? 2.25 : 0);
            jewel($image, $x, $y, $length, $kind === 'snow' ? -.42 : -1.35,
                [$alpha | $shadow, $alpha | $shadow, $alpha | $midtone, $alpha | $midtone, $alpha | $bright]);
        }
        return $image;
    }

    $p = $frame / (FRAMES - 1);
    if ($kind === 'rage_aura' || $kind === 'rage_ignition') {
        $ignition = $kind === 'rage_ignition';
        $heat = $ignition ? sin(M_PI * $p) ** .9 : .78 + .22 * cos($p * 2 * M_PI);
        $smoke = [0x522e46, 0xac402d, 0xe86227, 0xffb260, 0xffdf94];
        $lift = $ignition ? $p * 16 : 0;
        if ($ignition) {
            ribbon($image, .4, 27 + 24 * $p, 2.5, 5 * $heat, HOT, $p);
            ribbon($image, 3.55, 27 + 24 * $p, 2.5, 5 * $heat, HOT, $p);
        }
        foreach ([-1, 1] as $side) {
            for ($i = 0; $i < 4; $i++) {
                $oscillation = sin($p * 2 * M_PI + $i * 1.6 + $side * .45);
                $x = 64 + $side * (29 + $i * 3 + $oscillation * 3 + $lift * .4);
                $y = 96 - $i * 13 - $lift;
                $height = 5 + (5 + .5 * $i + $oscillation * 3 + ($ignition ? 21 : 7) * $heat) * $heat;
                $width = (4 + ($i % 2) * 2) * (.5 + .5 * $heat);
                tongue($image, $x, $y, $width, $height, $side * (3 + $oscillation * 5), $smoke);
                $sparkX = $x + $side * (6 + $i % 2 * 4);
                $sparkY = $y - $height - 4 + $oscillation * 4;
                jewel($image, $sparkX, $sparkY, 1.5 + $heat * 2.5, -1.3, $smoke);
            }
        }
        if ($ignition) embers($image, $p, HOT, 27, 1.35, 71);
        return $image;
    }

    if (in_array($kind, ['firebolt', 'arcane', 'frostbolt'], true)) {
        $colors = match ($kind) { 'arcane' => ARCANE, 'frostbolt' => ICE, default => HOT };
        $sway = sin($p * 2 * M_PI) * 5;
        foreach ([1, .72, .42] as $layer => $scale) {
            $w = 15 * $scale;
            poly($image, [20 + $layer*11,64+$sway, 33+$layer*8,59-$w*.3, 42+$layer*4,64-$w,
                63,62-$w, 80,63-$w*.65, 88-$layer*3,64, 79,66+$w*.65, 61,66+$w,
                48,66+$w*.4, 28+$layer*8,70+$sway], $colors[$layer + 1]);
        }
        jewel($image, 74, 64, 13, 0, $colors);
        for ($i = 0; $i < 7; $i++) {
            $x = 23 + ($i * 11 + $frame * 3) % 48;
            $y = 64 + sin($i * 2.2 + $frame * .45) * (9 + $i % 3 * 4);
            ellipse($image, $x, $y, 3 + $i % 3, 2, $colors[2 + $i % 3]);
        }
        return $image;
    }

    if ($kind === 'vortex') {
        for ($arm = 0; $arm < 3; $arm++) {
            ribbon($image, $arm * 2 * M_PI / 3 + $p * 5.5 - .17, 22 + $p * 30, 2.45, 10,
                [0x552039, 0, 0xa2342e, 0, 0xe85f32], $p, .78);
            ribbon($image, $arm * 2 * M_PI / 3 + $p * 5.5, 22 + $p * 30, 2.2, 7, HOT, $p);
        }
        if ($p < .8) tongue($image, 64, 68, 9 * (1 - $p), 21 * (1 - $p), sin($p*16)*5, HOT);
        embers($image, $p, HOT, 27, 1.25);
        return $image;
    }

    if ($kind === 'frost' || $kind === 'arcane_burst' || $kind === 'seismic') {
        $colors = match ($kind) {
            'arcane_burst' => ARCANE,
            'seismic' => [0x302334, 0x5b3b43, 0xb6523a, 0xf28a4f, 0xffbf73],
            default => ICE,
        };
        ring($image, $p, $colors, $kind === 'seismic' ? 1 : .7);
        for ($i = 0; $i < 16; $i++) {
            $a = $i * 2 * M_PI / 16 + ($i % 3) * .09;
            $r = (7 + 45 * $p) * (.86 + $i % 4 * .06);
            $x = 64 + cos($a) * $r;
            $y = 66 + sin($a) * $r * ($kind === 'seismic' ? .94 : .69);
            $size = (6 + ($i * 13) % 13) * (.45 + .55 * sin(M_PI * $p)) * (1 - $p * .55);
            if ($kind === 'frost' && $i % 3 === 0) {
                ellipse($image, $x, $y + 1, 15, 5, 0x495da9e7);
                jewel($image, $x, $y - 4, $size * 1.75, -1.64 + sin($a) * .27, $colors);
                jewel($image, $x + 5, $y, $size * .67, -1.05, $colors);
            }
            jewel($image, $x, $y, $size, $kind === 'seismic' ? $a : $a * .3 - 1.3, $colors);
        }
        embers($image, $p, $colors, 20, 1.3);
        return $image;
    }

    if ($kind === 'flame' || $kind === 'magma' || $kind === 'fire_burst') {
        $height = ($kind === 'magma' ? 59 : 44) * sin(M_PI * (.08 + .90 * $p)) ** .68;
        $count = $kind === 'flame' ? 5 : 7;
        ellipse($image, 64, 86, 50 + $p * 8, 12, 0x37492328);
        if ($kind === 'magma') {
            ellipse($image, 64, 87, 58, 13, 0x4abb382a);
            ellipse($image, 64, 86, 43, 5, 0x1be9692b);
            for ($plume = 0; $plume < 3; $plume++) {
                $x = 50 + $plume * 13 + sin($p * 9 + $plume) * 5;
                $y = max(17, 79 - $height - ($plume % 2) * 7);
                ellipse($image, $x, $y + 5, 19 + 13 * $p, 12 + 9 * $p, 0x54613341);
                ellipse($image, $x + 4, $y - 1, 13 + 9 * $p, 10 + 7 * $p, 0x606d4146);
            }
            for ($i = 0; $i < 6; $i++) {
                $x = 37 + $i * 10;
                $y = 90 - ($i * 7) % 7;
                poly($image, [$x-7,$y, $x-3,$y-12, $x+4,$y-16, $x+8,$y-5, $x+5,$y+2], 0x392739);
                poly($image, [$x-3,$y-12, $x+4,$y-16,$x+3,$y-9, $x-1,$y-5], 0xb3533a);
            }
        }
        for ($i = 0; $i < $count; $i++) {
            $fan = ($i - ($count - 1) / 2);
            $x = 64 + $fan * ($kind === 'fire_burst' ? 10 : 7);
            $h = max(2, $height * (.9 - abs($fan) * .13) + sin($i * 2.9 + $frame * .82) * 6);
            tongue($image, $x, 85 + $i % 3 * 2, 5 + ($i % 3) * 2, $h, sin($i * 2.1 + $frame * .53) * 7 + $fan * 2, HOT);
        }
        if ($kind === 'magma') {
            tongue($image, 64, 88, 16, $height * 1.09, sin($frame * .64) * 7, HOT);
            for ($i = 0; $i < 8; $i++) {
                $x = 64 + ($i * 29 % 41 - 20) * (.4 + $p);
                $y = 85 - (11 + $i * 11 % 38) * sin($p * M_PI * .8);
                jewel($image, $x, $y, 1.5 + $i % 3, -1.6, [0x442636, 0x783233, 0xb24530, 0xe67340, 0xffb362]);
            }
        }
        embers($image, $p, HOT, 26, 1.35, 80);
        return $image;
    }

    if ($kind === 'slash') {
        ribbon($image, -1.32, 36 + $p * 15, 2.59, 11 * (1 - $p * .42), HOT, $p, .95);
        ribbon($image, -1.06, 30 + $p * 13, 2.10, 4 * (1 - $p * .48), [0x793c55,0,0xf59751,0,0xffe8b0], $p, .95);
        for ($i = 0; $i < 11; $i++) {
            $a = ($i - 5) * .23;
            $r = 34 + $p * 25 + $i % 3 * 3;
            jewel($image, 64 + cos($a) * $r, 64 + sin($a) * $r, 2 + $i % 3, $a, HOT);
        }
        return $image;
    }

    $a = (1 - $p) * .7 + .2;
    ring($image, .34 + $p * .28, HOT);
    for ($i = 0; $i < 8; $i++) {
        $theta = $i * M_PI / 4 + $p * .75;
        $x = 64 + cos($theta) * (26 + $p * 9);
        $y = 65 + sin($theta) * (18 + $p * 4);
        jewel($image, $x, $y, 3 + $a * 4, $theta + M_PI / 2, HOT);
    }
    embers($image, $p, HOT, 15, .75);
    return $image;
}

$kinds = ['firebolt','arcane','frostbolt','vortex','frost','arcane_burst','seismic','flame','magma','fire_burst','slash','rune','rage_aura','rage_ignition','mist','marsh_wisp','pollen','snow','ash','cinders'];
$atlas = canvas(CELL * FRAMES, CELL * count($kinds));
foreach ($kinds as $row => $kind) {
    for ($frame = 0; $frame < FRAMES; $frame++) {
        imagecopy($atlas, drawFrame($kind, $frame), CELL * $frame, CELL * $row, 0, 0, CELL, CELL);
    }
}
imagepng($atlas, dirname(__DIR__) . '/public/game/val-des-saules/combat-vfx.png', 8);
