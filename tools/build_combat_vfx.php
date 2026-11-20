<?php

declare(strict_types=1);

const CELL = 128;
const FRAMES = 16;
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

function ease(float $x): float
{
    $x = max(0, min(1, $x));
    return $x * $x * (3 - 2 * $x);
}

function colorAt(int $rgb, float $opacity): int
{
    return ((127 - (int) round(max(0, min(1, $opacity)) * 127)) << 24) | $rgb;
}

function bloom(GdImage $image, float $x, float $y, float $width, float $height, int $color, float $power): void
{
    foreach ([1, .83, .64, .46] as $index => $scale) {
        ellipse($image, $x, $y, $width * $scale, $height * $scale, colorAt($color, $power * (.032 + $index * .034)));
    }
}

/** A tapered stroke rasterized on the same one-pixel grid as the game sprites. */
function energyStroke(GdImage $image, callable $path, callable $weight, array $palette, float $power, bool $rim = true): void
{
    if ($power <= .015) return;
    $points = [];
    for ($i = 0; $i <= 48; $i++) $points[] = $path($i / 48);
    foreach ([1.35, 1, .78, .48, .23] as $layer => $fraction) {
        if ($layer === 4 && !$rim) break;
        $positive = $negative = [];
        for ($i = 0; $i <= 48; $i++) {
            [$x, $y] = $points[$i];
            [$backX, $backY] = $points[max(0, $i - 1)];
            [$nextX, $nextY] = $points[min(48, $i + 1)];
            $dx = $nextX - $backX;
            $dy = $nextY - $backY;
            $length = max(.01, hypot($dx, $dy));
            $width = max(.25, $weight($i / 48) * $fraction);
            $edge = $layer >= 3 ? .38 * $width : 0;
            array_push($positive, $x - $dy * ($width + $edge) / $length, $y + $dx * ($width + $edge) / $length);
            array_unshift($negative, $x + $dy * ($width - $edge) / $length, $y - $dx * ($width - $edge) / $length);
        }
        poly($image, [...$positive, ...$negative], colorAt($palette[$layer], $power * [ .38, .81, .94, .98, 1 ][ $layer ]));
    }
}

function comet(GdImage $image, string $kind, float $p): void
{
    $palette = match ($kind) { 'arcane' => ARCANE, 'frostbolt' => ICE, default => HOT };
    $phase = $p * M_PI * 2;
    bloom($image, 67, 65, 94, 49, $palette[1], .9);
    for ($i = 0; $i < 8; $i++) {
        $x = 14 + $i * 5.2;
        $y = 66 + sin($phase + $i) * (7 + $i % 3 * 2);
        ellipse($image, $x, $y, 14 + $i % 3 * 6, 12 + $i % 4 * 4, colorAt($palette[0], .18 + $i * .048));
    }
    for ($i = 0; $i < 11; $i++) {
        $spread = ($i - 5) * 3.5;
        $curl = sin($phase + $i * 2.39) * 7;
        $length = 38 + $i * 11 % 38;
        energyStroke($image,
            static fn ($t) => [66 - $length * $t, 62 + $spread * (1 - $t * .34) + sin($t * 4 + $phase + $i) * (3 + $t * 7) + $curl * $t],
            static fn ($t) => (1.1 + $i % 4 * 1.3) * (1 - $t) ** .65,
            $palette, .47 + $i % 3 * .17, $i % 3 !== 0);
    }
    ellipse($image, 62, 64, 33, 29, colorAt($palette[0], .96));
    ellipse($image, 64, 63, 29, 25, $palette[1]);
    for ($i = 0; $i < 3; $i++) {
        $path = static function (float $t) use ($phase, $i): array {
            $angle = $phase + $i * 2.094 + $t * 3.95;
            $r = 1.6 + $t * 12.6;
            return [64 + cos($angle) * $r, 63 + sin($angle) * $r * .83];
        };
        energyStroke($image, $path, static fn (float $t) => sin($t * M_PI) * 4.1, $palette, .93);
    }
    ellipse($image, 65, 62, 6, 6, $palette[4]);
    for ($i = 0; $i < 13; $i++) {
        $x = 11 + ($i * 29 + (int) ($p * 46)) % 52;
        $y = 64 + sin($i * 2.39 + $phase) * (14 + $i % 5 * 3);
        jewel($image, $x, $y, 2 + $i % 4, .06, $palette);
    }
}

function tornado(GdImage $image, float $p): void
{
    $rise = ease($p / .29);
    $fade = 1 - ease(($p - .58) / .42);
    $height = 19 + 73 * $rise;
    $rotation = $p * 9;
    bloom($image, 64, 93, 107, 32, HOT[2], $fade);
    ribbon($image, $rotation, 34 + 10 * $rise, 4.7, 4.7, HOT, $p, .44);
    foreach ([false, true] as $front) {
        for ($arm = 0; $arm < 2; $arm++) {
            // Split the helical strips where they pass behind the core.
            for ($segment = 0; $segment < 9; $segment++) {
                $middle = ($segment + .5) / 9;
                $depth = sin($rotation + $arm * M_PI + $middle * 13.25);
                if (($depth >= 0) !== $front) continue;
                $path = static function (float $t) use ($segment, $arm, $rotation, $height): array {
                    $u = ($segment + $t) / 9;
                    $a = $rotation + $arm * M_PI + $u * 13.25;
                    $r = 16 + 19 * (abs($u - .43) / .57) ** 1.3;
                    return [64 + cos($a) * $r + sin($u * 8) * 5, 98 - $u * $height + sin($a) * 6];
                };
                energyStroke($image, $path, static fn ($t) => 4.8 + 3.5 * sin($t * M_PI),
                    $front ? HOT : [0x4a2037,0x952a30,0xba3a27,0xde592e,0xff9250],
                    $fade * ($front ? .97 : .68), $front);
            }
        }
        if (!$front) {
            tongue($image, 64, 98, 9 + 6 * $rise, $height * .76, sin($rotation) * 8,
                array_map(static fn ($color) => colorAt($color, .56 * $fade), HOT));
        }
    }
    embers($image, $p, HOT, 38, 1.4, 75);
}

function iceCrystal(GdImage $image, float $x, float $y, float $length, float $width, float $skew, float $opacity): void
{
    $tipX = $x + $skew * $length;
    $tipY = $y - $length;
    $shoulderX = $x + $skew * $length * .68;
    $shoulderY = $y - $length * .67;
    poly($image, [$x-$width,$y, $shoulderX-$width*.75,$shoulderY, $tipX,$tipY,
        $shoulderX+$width*.76,$shoulderY+3, $x+$width,$y-2, $x+1,$y+4], colorAt(ICE[0], $opacity));
    poly($image, [$x-$width*.78,$y-1,$shoulderX-$width*.62,$shoulderY+1,$tipX,$tipY,$x+1,$y+2], colorAt(ICE[2], $opacity));
    poly($image, [$tipX,$tipY,$shoulderX+$width*.65,$shoulderY+3,$x+$width*.76,$y-2,$x+1,$y+2], colorAt(0x797bd5, $opacity));
    poly($image, [$tipX,$tipY,$shoulderX-$width*.63,$shoulderY+1,$x+1,$y-5,$tipX-2,$tipY+9], colorAt(ICE[4], $opacity));
    poly($image, [$x+1,$y-5,$shoulderX+1,$shoulderY,$x+$width*.55,$y-$length*.29], colorAt(ICE[3], $opacity));
}

function fracture(GdImage $image, float $p, bool $frost): void
{
    $growth = ease($p / .34);
    $opacity = 1 - ease(($p - .56) / .44);
    $palette = $frost ? ICE : [0x392236,0x713741,0xd55c36,0xff982e,0xffd287];
    bloom($image, 64, 74, 108, 47, $palette[2], $opacity);
    for ($band = 0; $band < 3; $band++) {
        ribbon($image, -.1 + $band * 2.1, 15 + 38 * $growth, 1.96, 3 - $p,
            $palette, $p, .62);
    }
    for ($i = 0; $i < 12; $i++) {
        $a = ($i + 6) * M_PI / 6;
        $phase = ease(($p - $i % 4 * .024) / .28);
        $r = (15 + 31 * $growth + $i % 3 * 3);
        $x = 64 + cos($a) * $r;
        $y = 74 + sin($a) * $r * .51;
        $size = (13 + $i * 19 % 19) * $phase * (1 - .30 * ease(($p - .38) / .62));
        if ($frost) {
            iceCrystal($image, $x, $y, $size * 1.22, 3.5 + $i % 4, cos($a) * .62 - .07, $opacity);
            iceCrystal($image, $x - 5, $y + 2, $size * .55, 2.8, cos($a) * .83, $opacity * .83);
        } else {
            $drift = sin(M_PI * $p) * ($i % 3 + 2) * 3;
            $top = $y - $size - $drift;
            $w = 7 + $i % 4 * 1.7;
            ellipse($image, $x - 5, $top + 2, 20 + $p * 9, 12 + $p * 9, colorAt(0x70555c, $opacity * .33));
            $bottom = $y - $drift;
            poly($image, [$x-$w-2,$bottom+3,$x-$w-4,$top+8,$x-1,$top,$x+$w-2,$top+3,$x+$w+3,$bottom-5,$x+2,$bottom+5],
                colorAt($palette[3], $opacity));
            poly($image, [$x-$w,$bottom,$x-$w-3,$top+7,$x-1,$top,$x+$w-2,$top+3,$x+$w+1,$bottom-6,$x+2,$bottom+2],
                colorAt($palette[0], $opacity));
            poly($image, [$x-$w-3,$top+7,$x-1,$top,$x+$w-2,$top+3,$x+1,$top+11], colorAt(0x796071, $opacity));
            poly($image, [$x+$w-2,$top+4,$x+$w+1,$bottom-6,$x+2,$bottom+2,$x+1,$top+11], colorAt(0x533d54, $opacity));
            poly($image, [$x-1,$top+4,$x+1,$top+10,$x-6,$top+17,$x-3,$top+10], colorAt(0xa88088, $opacity * .72));
            poly($image, [$x-1,$top+11,$x-4,$top+15,$x-2,$bottom-4,$x-5,$bottom], colorAt($palette[3], $opacity * .88));
        }
    }
    embers($image, $p, $palette, 34, 1.42, 71);
}

function flames(GdImage $image, string $kind, float $p): void
{
    $magma = $kind === 'magma';
    $wall = $kind === 'flame';
    $impact = ease($p / ($magma ? .23 : .19));
    $wane = 1 - ease(($p - ($wall ? .58 : .40)) / ($wall ? .42 : .60));
    $height = ($magma ? 87 : ($wall ? 60 : 53)) * $impact * $wane;
    $floor = 94;
    bloom($image, 64, $floor - $height * .34, $wall ? 125 : 104, 34 + $height * .8, HOT[2], $wane);
    ellipse($image, 64, $floor + 4, $wall ? 118 : 90, 14, colorAt(0x642739, .70 * $wane));
    ellipse($image, 64, $floor + 1, $wall ? 98 : 76, 9, colorAt(HOT[1], .82 * $wane));

    if ($magma) {
        for ($stone = 0; $stone < 10; $stone++) {
            $x = 23 + $stone * 9;
            $y = $floor + sin($stone * 2.39) * 7;
            $w = 3 + $stone * 11 % 6;
            $h = 4 + $stone * 7 % 7 + $height * .09;
            poly($image, [$x-$w,$y+3, $x-$w-1,$y-$h*.46, $x-2,$y-$h, $x+$w-1,$y-$h+2, $x+$w+3,$y+1, $x+3,$y+6],
                colorAt(0x402d41, .88 * (1 - $p * .47)));
            poly($image, [$x-2,$y-$h, $x+$w-1,$y-$h+2, $x+1,$y-3, $x-$w-1,$y-$h*.46],
                colorAt(0xac6252, .81 * (1 - $p)));
        }
    }

    for ($i = 0; $i < 10; $i++) {
        $fan = ($i - 4.5) / 4.5;
        $x = 64 + $fan * ($wall ? 51 : 37) + sin($i * 2.4 + $p * 8) * 4;
        $y = $floor - $height * (.63 + $i % 3 * .08) - $p * (8 + $i % 4 * 5);
        $size = (14 + $i * 17 % 17) * (.62 + $p * .65);
        ellipse($image, $x, $y, $size, $size * .81, colorAt($magma ? 0x604659 : 0x66293a, $impact * (.40 + .36 * $p) * (1 - $p)));
        ellipse($image, $x+3, $y-2, $size*.61, $size*.61, colorAt(0xa44c40, $impact * $wane * .32));
    }

    $columns = $wall ? 9 : 7;
    for ($i = 0; $i < $columns; $i++) {
        $fan = ($i - ($columns - 1) / 2) / (($columns - 1) / 2);
        $x = 64 + $fan * ($wall ? 50 : 33);
        $delay = ($i * 7 % 5) * .035;
        $rise = ease(($p - $delay) / .27) * $wane;
        $h = ($magma ? 86 : ($wall ? 57 : 42)) * $rise * (1 - abs($fan) * .57);
        if ($h < 2) continue;
        $bend = sin($i * 2.19 + $p * 11) * 8 + $fan * 22;
        $path = static fn ($t) => [$x + $bend * $t ** 1.38 + sin($t * 11 + $i) * $t * 5
            + sin($t * 30 + $i + $p * 16) * $t * 1.8, $floor - $h * $t];
        energyStroke($image, $path, static fn ($t) => (8 + $i % 3 * 3) * sin((.18 + .82 * $t) * M_PI) ** .58, HOT, .91 * $wane);
    }
    if (!$wall && !$magma) {
        for ($cloud = 0; $cloud < 9; $cloud++) {
            $t = ($cloud - 4) / 4;
            $x = 64 + $t * (10 + $impact * 29);
            $y = $floor - $height * (1 - abs($t) * .66) + $p * 8;
            $s = (21 + $cloud * 7 % 17) * $impact * $wane;
            if ($s < 2) continue;
            ellipse($image, $x, $y, $s + 4, $s, colorAt(HOT[1], $wane * .86));
            ellipse($image, $x + 1, $y - 3, $s * .74, $s * .65, colorAt(HOT[3], $wane * .83));
            ellipse($image, $x - 3, $y - 5, $s * .36, $s * .34, colorAt(HOT[4], $wane));
        }
    }
    embers($image, $p, HOT, $magma ? 49 : 36, 1.45, 81);
}

function swordArc(GdImage $image, string $kind, float $p): void
{
    $steel = $kind === 'steel_slash';
    $circle = $kind === 'gilded_spin';
    $palette = $steel || $circle ? [0x3f3142,0x946955,0xc9a480,0xffd592,0xfff7d1]
        : [0x4d2238,0xd74130,0xf87540,0xffb656,0xffead0];
    $fade = 1 - ease(($p - .50) / .50);
    $sweep = ($circle ? 5.75 : 2.63) * (.45 + .55 * ease($p / .24));
    $radius = ($circle ? 41 : 34) + $p * 17;
    $base = ($circle ? -2.4 : -1.18) + $p * .32;
    bloom($image, $circle ? 64 : 94, 66, $circle ? 112 : 53, 83, $palette[2], .60 * $fade);
    for ($layer = 0; $layer < 3; $layer++) {
        $path = static function (float $t) use ($radius, $base, $sweep, $layer, $p, $circle): array {
            $angle = $base + $sweep * $t + $layer * .17;
            $r = ($radius - $layer * 5.2) * (.8 + .2 * $t) + sin($t * 9 + $p * 7) * 2.3;
            return [64 + cos($angle) * $r, 64 + sin($angle) * $r * ($circle ? .72 : .97)];
        };
        $weight = static fn ($t) => sin($t * M_PI) ** .69 * (10 - $layer * 2);
        energyStroke($image, $path, $weight, $palette, $fade * [1, .70, .43][$layer]);
        for ($i = 0; $i < 8; $i++) {
            [$x,$y] = $path(($i + .5) / 8);
            jewel($image, $x + $layer * 1.5, $y - $layer * 3, 1 + $i % 4,
                $base + $sweep * $i / 8, array_map(static fn ($rgb) => colorAt($rgb, $fade * .70), $palette));
        }
    }
}

function arcaneStream(GdImage $image, float $p): void
{
    $fade = 1 - ease(($p - .58) / .42);
    bloom($image, 64, 64, 123, 56, ARCANE[2], $fade);
    for ($i = 0; $i < 7; $i++) {
        $phase = $p * 17 + $i * 2.391;
        $path = static fn ($t) => [
            6 + $t * 116, 64 + sin($t * 11 + $phase) * (6 + $i * 2) * sin(M_PI * $t) ** .69
                + sin($t * 25 + $phase * .44) * 3,
        ];
        energyStroke($image, $path, static fn ($t) => sin(M_PI * $t) ** .63 * (2.4 + $i % 3 * 2.1),
            ARCANE, $fade * (.32 + $i % 3 * .21), $i % 2 === 0);
    }
    for ($i = 0; $i < 14; $i++) {
        $x = 10 + ($i * 53 + (int) ($p * 96)) % 113;
        $y = 64 + sin($i * 5.2 + $p * 19) * (12 + $i % 4 * 3);
        jewel($image, $x, $y, 1 + $i % 4, 0, array_map(static fn ($rgb) => colorAt($rgb, $fade), ARCANE));
    }
    for ($arc = 0; $arc < 3; $arc++) {
        $lastX = 17 + $arc * 7;
        $lastY = 64 + sin($p * 19 + $arc) * 6;
        for ($step = 1; $step < 8; $step++) {
            $x = 17 + $arc * 7 + $step * 12;
            $y = 64 + (($step * 37 + $arc * 11 + (int) ($p * 18)) % 37 - 19) * sin($step * M_PI / 8);
            imageline($image, (int) $lastX, (int) $lastY, (int) $x, (int) $y, colorAt(ARCANE[4], $fade * .67));
            $lastX = $x;
            $lastY = $y;
        }
    }
}

function shieldImpact(GdImage $image, float $p): void
{
    $envelope = 1 - ease(($p - .44) / .56);
    $rise = ease($p / .21);
    $palette = [0x25484b,0x408c90,0x87d7c3,0xc5f1d5,0xfcffe2];
    bloom($image, 64, 66, 105, 85, $palette[1], $envelope);
    for ($band = 0; $band < 3; $band++) {
        $radius = (19 + 22 * $rise + $p * 11) - $band * 7;
        ribbon($image, -2.77 + $band * .15, $radius, 2.45, 6 - $band, $palette, $p, .72);
        ribbon($image, .4 + $band * .19, $radius, 2.1, 4 - $band, $palette, $p, .72);
    }
    embers($image, $p, $palette, 27, 1.23);
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
        comet($image, $kind, $p);
        return $image;
    }
    if ($kind === 'vortex') {
        tornado($image, $p);
        return $image;
    }
    if ($kind === 'frost' || $kind === 'seismic') {
        fracture($image, $p, $kind === 'frost');
        return $image;
    }

    if ($kind === 'arcane_burst') {
        $colors = ARCANE;
        bloom($image, 64, 67, 95, 40, ARCANE[2], 1 - $p);
        ring($image, $p, $colors, .7);
        for ($i = 0; $i < 16; $i++) {
            $a = $i * 2 * M_PI / 16 + ($i % 3) * .09;
            $r = (7 + 45 * $p) * (.86 + $i % 4 * .06);
            $x = 64 + cos($a) * $r;
            $y = 66 + sin($a) * $r * .69;
            $size = (6 + ($i * 13) % 13) * (.45 + .55 * sin(M_PI * $p)) * (1 - $p * .55);
            jewel($image, $x, $y, $size * 1.36, $a - .5, $colors);
        }
        embers($image, $p, $colors, 20, 1.3);
        return $image;
    }

    if (in_array($kind, ['flame', 'magma', 'fire_burst'], true)) {
        flames($image, $kind, $p);
        return $image;
    }
    if (in_array($kind, ['slash', 'steel_slash', 'gilded_spin'], true)) {
        swordArc($image, $kind, $p);
        return $image;
    }
    if ($kind === 'arcane_stream') {
        arcaneStream($image, $p);
        return $image;
    }
    if ($kind === 'ward') {
        shieldImpact($image, $p);
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

$kinds = ['firebolt','arcane','frostbolt','vortex','frost','arcane_burst','seismic','flame','magma','fire_burst','slash','rune','rage_aura','rage_ignition','mist','marsh_wisp','pollen','snow','ash','cinders','steel_slash','gilded_spin','arcane_stream','ward'];
$atlas = canvas(CELL * FRAMES, CELL * count($kinds));
foreach ($kinds as $row => $kind) {
    for ($frame = 0; $frame < FRAMES; $frame++) {
        imagecopy($atlas, drawFrame($kind, $frame), CELL * $frame, CELL * $row, 0, 0, CELL, CELL);
    }
}
imagepng($atlas, dirname(__DIR__) . '/public/game/val-des-saules/combat-vfx.png', 8);
