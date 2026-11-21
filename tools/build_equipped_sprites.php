<?php

declare(strict_types=1);

// Compose les armes avec les corps existants, sans modifier les planches originales.
const ART = __DIR__.'/../public/game/val-des-saules';
const FACING = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
const OUTLINE = 0x141b21;

function canvas(int $w, int $h): GdImage
{
    $im = imagecreatetruecolor($w, $h);
    imagealphablending($im, false);
    imagefill($im, 0, 0, 0x7f000000);
    imagesavealpha($im, true);
    return $im;
}

function stroke(GdImage $im, array $a, array $b, int $color, int $width = 1): void
{
    imagesetthickness($im, $width);
    imageline($im, (int) round($a[0]), (int) round($a[1]), (int) round($b[0]), (int) round($b[1]), $color);
    imagesetthickness($im, 1);
}

function poly(GdImage $im, array $points, int $color): void
{
    imagefilledpolygon($im, array_map(static fn ($v) => (int) round($v), $points), $color);
}

function bottom(GdImage $im): int
{
    for ($y = imagesy($im) - 1; $y >= 0; $y--) {
        for ($x = 0; $x < imagesx($im); $x++) if ((imagecolorat($im, $x, $y) >> 24 & 127) < 75) return $y;
    }
    throw new RuntimeException('Image de corps vide.');
}

function hand(GdImage $body, bool $left, int $foot): ?array
{
    $center = (int) (imagesx($body) / 2);
    $pixels = [];
    for ($y = $foot - 10; $y >= $foot - 18; $y--) {
        for ($x = $center - 15; $x <= $center + 15; $x++) {
            if (($x < $center) !== $left) continue;
            $c = imagecolorat($body, $x, $y);
            $r = $c >> 16 & 255; $g = $c >> 8 & 255; $b = $c & 255;
            if (($c >> 24 & 127) < 50 && $r > 220 && $g > 130 && $g < 205 && $b > 90 && $b < 170) {
                $pixels[] = [$x, $y];
            }
        }
        if (count($pixels) >= 2) break;
    }
    if (!$pixels) return null;
    return [array_sum(array_column($pixels, 0)) / count($pixels), $pixels[0][1] - 1];
}

function palm(GdImage $im, array $p): void
{
    [$x, $y] = array_map('round', $p);
    imagefilledrectangle($im, (int) $x - 1, (int) $y - 1, (int) $x + 1, (int) $y + 1, 0xc7673c);
    imagefilledrectangle($im, (int) $x - 1, (int) $y - 1, (int) $x, (int) $y, 0xf6b886);
}

function arm(GdImage $im, array $shoulder, array $elbow, array $grip): void
{
    stroke($im, $shoulder, $elbow, OUTLINE, 6);
    stroke($im, $shoulder, $elbow, 0x9b9479, 4);
    stroke($im, [$shoulder[0] - 1, $shoulder[1]], [$elbow[0] - 1, $elbow[1]], 0xe4d8b7, 2);
    stroke($im, $elbow, $grip, OUTLINE, 5);
    stroke($im, $elbow, $grip, 0xc7673c, 3);
    stroke($im, [$elbow[0] - 1, $elbow[1]], [$grip[0] - 1, $grip[1]], 0xf6b886);
}

function bow(GdImage $im, array $grip, array $aim, float $draw, bool $arrow): array
{
    [$dx, $dy] = $aim;
    $point = static fn ($f, $t) => [$grip[0] + $dx * $f - $dy * $t, $grip[1] + $dy * $f + $dx * $t];
    $limbs = [[-5,-12],[-2,-10],[0,-6],[1,-3],[0,0],[1,3],[0,6],[-2,10],[-5,12]];
    for ($i = 1; $i < count($limbs); $i++) {
        $a = $point(...$limbs[$i - 1]); $b = $point(...$limbs[$i]);
        stroke($im, $a, $b, OUTLINE, 3);
        stroke($im, $a, $b, 0x805034, 2);
        stroke($im, [$a[0] + 1, $a[1]], [$b[0] + 1, $b[1]], 0xcb9d68);
    }
    foreach ([-1, 1] as $sign) {
        stroke($im, $point(-5, 12 * $sign), $point(-3, 10 * $sign), 0xe6d8a0, 2);
        stroke($im, $point(0, 4 * $sign), $point(0, 5 * $sign), 0xbcc8b6, 2);
    }
    stroke($im, $point(0,-2), $point(0,2), 0x3c302a, 3);
    stroke($im, $point(0,-1), $point(0,1), 0x52634a, 2);
    stroke($im, $point(-5,-12), $point(-5 - $draw,0), 0xb8aa89);
    stroke($im, $point(-5 - $draw,0), $point(-5,12), 0xb8aa89);
    if ($arrow) {
        stroke($im, $point(-9 - $draw,0), $point(11 - $draw,0), 0x503c29, 2);
        stroke($im, $point(-9 - $draw,0), $point(11 - $draw,0), 0xe5c486);
        $a = $point(11 - $draw, 0); $b = $point(8 - $draw,-2); $c = $point(8 - $draw,2);
        poly($im, [...$a,...$b,...$c], 0xe2e9de);
        stroke($im, $point(-8 - $draw,-2), $point(-6 - $draw,0), 0x85a8a0);
    }
    return $point(-5 - $draw, 0);
}

function dagger(GdImage $im, array $grip, float $angle): void
{
    $dx = cos($angle); $dy = sin($angle);
    $p = static function ($f, $t) use ($grip, $dx, $dy) {
        $f = $f > 2 ? 2 + ($f - 2) * .68 : $f;
        return [$grip[0] + $dx * $f - $dy * $t, $grip[1] + $dy * $f + $dx * $t];
    };
    poly($im, [...$p(-3,-1),...$p(2,-2),...$p(12,-1),...$p(15,0),...$p(10,3),...$p(2,2),...$p(-3,1)], OUTLINE);
    poly($im, [...$p(3,-1),...$p(13,0),...$p(9,2),...$p(3,1)], 0x8ba7b0);
    stroke($im, $p(3,-1), $p(12,0), 0xe0e6d9);
    stroke($im, $p(1,-3), $p(1,3), 0xb89259);
    stroke($im, $p(-2,0), $p(1,0), 0x79513f, 2);
    imagesetpixel($im, (int) round($p(2,0)[0]), (int) round($p(2,0)[1]), 0x8ac0bd);
}

function equipped(GdImage $body, string $skin, int $direction, int $pose, int $foot): GdImage
{
    $out = canvas(imagesx($body), imagesy($body));
    $left = hand($body, true, $foot); $right = hand($body, false, $foot);
    $back = $direction >= 5;
    $aim = [cos($direction * M_PI / 4), sin($direction * M_PI / 4)];
    $center = imagesx($body) / 2;
    $gear = canvas(imagesx($body), imagesy($body));
    if ($skin === 'hunter') {
        $grip = ($aim[0] < -.3 ? $left : $right) ?? $left ?? $right;
        if (!$grip) throw new RuntimeException('Main du Chasseur introuvable.');
        if ($pose >= 0) {
            // Retire les avant-bras au repos avant de dessiner la véritable prise à deux mains.
            foreach (array_filter([$left,$right]) as [$hx,$hy]) {
                for ($y = (int) $hy - 7; $y <= $hy + 2; $y++) for ($x = (int) $hx - 2; $x <= $hx + 2; $x++) {
                    $color = abs($x - $center) < 6 ? imagecolorat($body, (int) $center + ($hx < $center ? 4 : -4), $y) : 0x7f000000;
                    imagesetpixel($body, $x, $y, $color);
                }
            }
            $grip = [$center + $aim[0] * 12, $foot - 22 + $aim[1] * 7];
            $draw = [0,2,4,5,0,.5,0,0,0][$pose];
            $pull = bow($gear, $grip, $aim, $draw, $pose < 4);
            $shoulder = [$center + ($aim[0] < 0 ? 5 : -5), $foot - 25];
            arm($gear, $shoulder, [$center - $aim[0] * 7, $foot - 24], $pull);
            arm($gear, [$center + ($aim[0] < 0 ? -5 : 5), $foot - 25], [$center + $aim[0] * 8, $foot - 24 + $aim[1] * 5], $grip);
            palm($gear, $pull);
        } else bow($gear, $grip, [$aim[0] < -.3 ? -1 : 1, 0], 0, false);
        if ($pose>=0) palm($gear, $grip);
    } elseif ($skin === 'rogue') {
        $reach = $pose < 0 ? 0 : [0,.2,.5,.8,1,.85,.5,.2,0][$pose];
        foreach ([[$left,M_PI/2+.22],[$right,M_PI/2-.22]] as [$grip,$restAngle]) {
            if (!$grip) continue;
            $delta = $direction*M_PI/4 - $restAngle;
            $angle = $restAngle + atan2(sin($delta),cos($delta)) * $reach;
            dagger($gear,$grip,$angle);
        }
    }
    imagealphablending($out, true);
    if ($back) imagecopy($out, $gear, 0,0,0,0,imagesx($out),imagesy($out));
    imagecopy($out, $body, 0,0,0,0,imagesx($out),imagesy($out));
    if (!$back) imagecopy($out, $gear, 0,0,0,0,imagesx($out),imagesy($out));
    if ($skin==='rogue' || ($skin==='hunter' && $pose<0)) {
        foreach (array_filter([$left,$right]) as [$hx,$hy]) {
            $hx=(int)round($hx)-2; $hy=(int)round($hy)-2;
            imagecopy($out,$body,$hx,$hy,$hx,$hy,5,5);
        }
    }
    // La tête et le col passent devant une extrémité d'arme qui les croise.
    imagecopy($out,$body,0,0,0,0,imagesx($body),$foot-27);
    for ($y = 0; $y < imagesy($out); $y++) for ($x = 0; $x < imagesx($out); $x++) {
        if (($x === 0 || $y === 0 || $x === imagesx($out)-1 || $y === imagesy($out)-1)
            && (imagecolorat($out,$x,$y) >> 24 & 127) < 127) throw new RuntimeException('Arme coupée au bord de sa cellule.');
        if ($y < $foot - 27 && (imagecolorat($body,$x,$y) >> 24 & 127) < 75
            && imagecolorat($body,$x,$y) !== imagecolorat($out,$x,$y)) throw new RuntimeException("Visage modifié : $skin direction=$direction pose=$pose pixel=$x,$y.");
    }
    return $out;
}

foreach (['hunter','rogue','warlock'] as $skin) {
    $walkSource = imagecreatefrompng(ART.'/'.$skin.'/walk.png');
    $idle = canvas(64 * 8, 64);
    $walk = canvas(64 * 8, 64 * 8);
    $attack = canvas(64 * 9, 64 * 8);
    foreach (FACING as $dir => $facing) {
        $rest = imagecreatefrompng(ART.'/'.$skin.'/'.$facing.'.png');
        $restBottom = bottom($rest);
        $body = canvas(64,64);
        imagecopy($body, $rest, 8,54-$restBottom,0,0,48,48);
        imagecopy($idle, equipped($body,$skin,$dir,-1,54), $dir*64,0,0,0,64,64);
        for ($frame = 0; $frame < 8; $frame++) {
            $source = canvas(48,48);
            imagecopy($source,$walkSource,0,0,$frame*48,$dir*48,48,48);
            $body = canvas(64,64);
            imagecopy($body,$source,8,54-bottom($source),0,0,48,48);
            imagecopy($walk,equipped($body,$skin,$dir,-1,54),$frame*64,$dir*64,0,0,64,64);
        }
        for ($frame = 0; $frame < 9; $frame++) {
            $body = canvas(64,64);
            $offset = [-1,-1,-2,-1,0,1,1,1,0][$frame];
            $dx = (int) round(cos($dir*M_PI/4)*$offset);
            $dy = (int) round(sin($dir*M_PI/4)*$offset*.5) - ($frame >= 2 && $frame <= 4 ? 1 : 0);
            $cut = $restBottom - 11;
            imagecopy($body,$rest,8,54-$restBottom+$cut,0,$cut,48,48-$cut);
            imagecopy($body,$rest,8+$dx,54-$restBottom+$dy,0,0,48,$cut);
            imagecopy($attack,equipped($body,$skin,$dir,$frame,54),$frame*64,$dir*64,0,0,64,64);
        }
    }
    foreach (['idle-equipped'=>$idle,'walk-equipped'=>$walk,'attack-equipped'=>$attack] as $name=>$sheet) {
        $path = ART.'/'.$skin.'/'.$name.'.png';
        if (in_array('--check', $argv, true)) {
            $saved = imagecreatefrompng($path);
            if (imagesx($saved) !== imagesx($sheet) || imagesy($saved) !== imagesy($sheet)) throw new RuntimeException('Dimensions incorrectes : '.$path);
            for ($y=0; $y<imagesy($sheet); $y++) for ($x=0; $x<imagesx($sheet); $x++) {
                if (imagecolorat($sheet,$x,$y) !== imagecolorat($saved,$x,$y)) throw new RuntimeException('Planche à régénérer : '.$path);
            }
        } else imagepng($sheet,$path,9);
    }
}
echo in_array('--check', $argv, true) ? "Planches équipées vérifiées.\n" : "Planches équipées générées pour Chasseur, Voleur et Démoniste.\n";

if (!in_array('--check',$argv,true)) {
    $icon=canvas(40,32);
    foreach ([[11,0x23152f],[8,0x4a285e],[5,0x925bba],[2,0xd8b4e9]] as [$radius,$color]) {
        poly($icon,[20,16-$radius,20+$radius,16,20,16+$radius,20-$radius,16],$color);
    }
    stroke($icon,[10,21],[27,8],0x7b9f95);
    stroke($icon,[12,23],[29,10],0xc9e0b9);
    imagepng($icon,ART.'/items/shadow-focus.png',9);
}
