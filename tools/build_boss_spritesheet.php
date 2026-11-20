<?php

declare(strict_types=1);

/**
 * Construit la planche d'animation 8 directions x 40 images (128x128 px, 20 colonnes)
 * du Boss de palier N.40 « Malakor, Seigneur de la Brèche » à partir de la source 5 vues.
 *
 * Usage :
 *   php -d extension=gd tools/build_boss_spritesheet.php [chemin-source] [--preview chemin-apercu]
 */

const FRAME_SIZE = 128;
const WALK_FRAMES = 36;
const TOTAL_FRAMES = WALK_FRAMES + 4;
const ATLAS_COLUMNS = 20;
const VIEWS = 8;
const TARGET_HEIGHT = 98;
const FOOT_BASELINE_Y = 113;

/**
 * Détecte si un pixel appartient au fond vert chroma-key.
 */
function isChromaGreen(int $rgba): bool
{
    $r = ($rgba >> 16) & 0xFF;
    $g = ($rgba >> 8) & 0xFF;
    $b = $rgba & 0xFF;
    return $g > 110 && ($g - max($r, $b)) > 34;
}

/**
 * Détecte un halo vert résiduel sur le contour JPEG.
 */
function isGreenFringe(int $rgba): bool
{
    $r = ($rgba >> 16) & 0xFF;
    $g = ($rgba >> 8) & 0xFF;
    $b = $rgba & 0xFF;
    return $g > max($r, $b) + 7 && $g > 55;
}

function transparentColor(): int
{
    return 0x7F000000;
}

function newTransparentCanvas(int $width, int $height): GdImage
{
    $img = imagecreatetruecolor($width, $height);
    imagealphablending($img, false);
    imagesavealpha($img, true);
    imagefill($img, 0, 0, transparentColor());
    return $img;
}

/**
 * Supprime le fond vert par propagation depuis les bords et neutralise tout reflet vert
 * sur les contours du boss.
 */
function extractCleanSprite(GdImage $strip, int $x0, int $x1, int $yMax): GdImage
{
    $w = $x1 - $x0;
    $h = $yMax;
    $sprite = newTransparentCanvas($w, $h);
    $bgMask = array_fill(0, $w * $h, false);
    $queue = [];

    for ($x = 0; $x < $w; $x++) {
        foreach ([0, $h - 1] as $y) {
            if (isChromaGreen(imagecolorat($strip, $x0 + $x, $y))) {
                $idx = $y * $w + $x;
                if (!$bgMask[$idx]) {
                    $bgMask[$idx] = true;
                    $queue[] = [$x, $y];
                }
            }
        }
    }
    for ($y = 0; $y < $h; $y++) {
        foreach ([0, $w - 1] as $x) {
            if (isChromaGreen(imagecolorat($strip, $x0 + $x, $y))) {
                $idx = $y * $w + $x;
                if (!$bgMask[$idx]) {
                    $bgMask[$idx] = true;
                    $queue[] = [$x, $y];
                }
            }
        }
    }

    for ($head = 0; $head < count($queue); $head++) {
        [$cx, $cy] = $queue[$head];
        foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
            $nx = $cx + $dx;
            $ny = $cy + $dy;
            if ($nx < 0 || $nx >= $w || $ny < 0 || $ny >= $h) {
                continue;
            }
            $idx = $ny * $w + $nx;
            if ($bgMask[$idx]) {
                continue;
            }
            $rgba = imagecolorat($strip, $x0 + $nx, $ny);
            if (isChromaGreen($rgba) || isGreenFringe($rgba)) {
                $bgMask[$idx] = true;
                $queue[] = [$nx, $ny];
            }
        }
    }

    $minX = $w;
    $minY = $h;
    $maxX = -1;
    $maxY = -1;

    for ($y = 0; $y < $h; $y++) {
        for ($x = 0; $x < $w; $x++) {
            $idx = $y * $w + $x;
            if ($bgMask[$idx]) {
                continue;
            }
            $rgba = imagecolorat($strip, $x0 + $x, $y);
            $r = ($rgba >> 16) & 0xFF;
            $g = ($rgba >> 8) & 0xFF;
            $b = $rgba & 0xFF;

            // Neutraliser tout reflet vert sur les pixels bordant le fond détouré
            $touchesBg = false;
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1]] as [$dx, $dy]) {
                $nx = $x + $dx;
                $ny = $y + $dy;
                if ($nx < 0 || $nx >= $w || $ny < 0 || $ny >= $h || $bgMask[$ny * $w + $nx]) {
                    $touchesBg = true;
                    break;
                }
            }
            if ($touchesBg || $g > max($r, $b) + 3) {
                $g = min($g, max($r, $b));
                if ($r < 45 && $g < 45 && $b < 45) {
                    $r = 23;
                    $g = 16;
                    $b = 25;
                }
            }

            imagesetpixel($sprite, $x, $y, ($r << 16) | ($g << 8) | $b);
            $minX = min($minX, $x);
            $minY = min($minY, $y);
            $maxX = max($maxX, $x);
            $maxY = max($maxY, $y);
        }
    }

    if ($maxX < $minX) {
        throw new RuntimeException('Vue de boss vide après extraction chroma-key.');
    }

    $cw = $maxX - $minX + 1;
    $ch = $maxY - $minY + 1;
    $cropped = newTransparentCanvas($cw, $ch);
    imagecopy($cropped, $sprite, 0, 0, $minX, $minY, $cw, $ch);
    imagedestroy($sprite);

    return $cropped;
}

/**
 * Trouve les 4 colonnes séparatrices les plus vertes pour découper les 5 vues.
 */
function findViewSlices(GdImage $strip, int $heightLimit): array
{
    $w = imagesx($strip);
    $columnDensity = array_fill(0, $w, 0);

    for ($x = 0; $x < $w; $x++) {
        $fg = 0;
        for ($y = 0; $y < $heightLimit; $y += 2) {
            if (!isChromaGreen(imagecolorat($strip, $x, $y))) {
                $fg++;
            }
        }
        $columnDensity[$x] = $fg;
    }

    $cuts = [0];
    $sliceW = $w / 5.0;
    for ($i = 1; $i < 5; $i++) {
        $center = (int) round($sliceW * $i);
        $bestX = $center;
        $bestScore = PHP_INT_MAX;
        for ($x = max(1, $center - 45); $x <= min($w - 2, $center + 45); $x++) {
            if ($columnDensity[$x] < $bestScore) {
                $bestScore = $columnDensity[$x];
                $bestX = $x;
            }
        }
        $cuts[] = $bestX;
    }
    $cuts[] = $w;

    return $cuts;
}

/**
 * Redimensionne proprement une vue en pixel art net en préservant les lueurs chaudes.
 */
function fitToBossFrame(GdImage $src, int $targetHeight): GdImage
{
    $sw = imagesx($src);
    $sh = imagesy($src);
    $scale = $targetHeight / $sh;
    $dw = max(1, (int) round($sw * $scale));
    $dh = $targetHeight;

    $scaled = newTransparentCanvas($dw, $dh);
    $cellX = $sw / $dw;
    $cellY = $sh / $dh;

    for ($dy = 0; $dy < $dh; $dy++) {
        $sy0 = (int) floor($dy * $cellY);
        $sy1 = min($sh - 1, max($sy0, (int) ceil(($dy + 1) * $cellY) - 1));
        for ($dx = 0; $dx < $dw; $dx++) {
            $sx0 = (int) floor($dx * $cellX);
            $sx1 = min($sw - 1, max($sx0, (int) ceil(($dx + 1) * $cellX) - 1));

            $rSum = 0;
            $gSum = 0;
            $bSum = 0;
            $opaqueCount = 0;
            $totalCount = 0;
            $maxMagma = -1;
            $magmaRgba = 0;

            for ($sy = $sy0; $sy <= $sy1; $sy++) {
                for ($sx = $sx0; $sx <= $sx1; $sx++) {
                    $totalCount++;
                    $rgba = imagecolorat($src, $sx, $sy);
                    if ((($rgba >> 24) & 0x7F) < 64) {
                        $opaqueCount++;
                        $r = ($rgba >> 16) & 0xFF;
                        $g = ($rgba >> 8) & 0xFF;
                        $b = $rgba & 0xFF;
                        $rSum += $r;
                        $gSum += $g;
                        $bSum += $b;
                        $warmth = $r + $g - $b * 2;
                        if ($r > 175 && $warmth > $maxMagma) {
                            $maxMagma = $warmth;
                            $magmaRgba = $rgba;
                        }
                    }
                }
            }

            if ($opaqueCount * 2 < $totalCount && $maxMagma < 180) {
                continue;
            }

            if ($maxMagma >= 180) {
                imagesetpixel($scaled, $dx, $dy, $magmaRgba & 0x00FFFFFF);
                continue;
            }

            $r = intdiv($rSum, max(1, $opaqueCount));
            $g = intdiv($gSum, max(1, $opaqueCount));
            $b = intdiv($bSum, max(1, $opaqueCount));
            $g = min($g, max($r, $b));
            imagesetpixel($scaled, $dx, $dy, ($r << 16) | ($g << 8) | $b);
        }
    }

    $frame = newTransparentCanvas(FRAME_SIZE, FRAME_SIZE);
    $ox = intdiv(FRAME_SIZE - $dw, 2);
    $oy = FOOT_BASELINE_Y - $dh;
    imagecopy($frame, $scaled, $ox, $oy, 0, 0, $dw, $dh);
    imagedestroy($scaled);

    return $frame;
}

function mirrorFrame(GdImage $src): GdImage
{
    $out = newTransparentCanvas(FRAME_SIZE, FRAME_SIZE);
    for ($y = 0; $y < FRAME_SIZE; $y++) {
        for ($x = 0; $x < FRAME_SIZE; $x++) {
            imagesetpixel($out, FRAME_SIZE - 1 - $x, $y, imagecolorat($src, $x, $y));
        }
    }
    return $out;
}

function isWarmEmberPixel(int $rgba): bool
{
    if ((($rgba >> 24) & 0x7F) >= 64) {
        return false;
    }
    $r = ($rgba >> 16) & 0xFF;
    $g = ($rgba >> 8) & 0xFF;
    $b = $rgba & 0xFF;
    return $r > 165 && ($r - $b) > 75 && $g < $r;
}

function brightenColor(int $rgba, int $boostR, int $boostG, int $boostB = 0): int
{
    $a = ($rgba >> 24) & 0x7F;
    $r = min(255, max(0, (($rgba >> 16) & 0xFF) + $boostR));
    $g = min(255, max(0, (($rgba >> 8) & 0xFF) + $boostG));
    $b = min(255, max(0, ($rgba & 0xFF) + $boostB));
    return ($a << 24) | ($r << 16) | ($g << 8) | $b;
}

/**
 * Calcule le profil cinématique d'une foulée pour une jambe avec appui lourd et flexion.
 *
 * @return array{0: float, 1: float, 2: float} [avant, levée, flexion_genou]
 */
function legStrideProfile(float $phase): array
{
    $stance = 0.68;
    if ($phase < $stance) {
        $progress = $phase / $stance;
        $reach = (0.5 - $progress) * 9.6;
        return [$reach, 0.0, sin(M_PI * $progress) * 0.7];
    }

    $swing = ($phase - $stance) / (1.0 - $stance);
    $smooth = $swing * $swing * (3.0 - 2.0 * $swing);
    $reach = ($smooth - 0.5) * 9.6;
    $lift = pow(sin(M_PI * $swing), 1.25) * 6.8;
    $kneeBend = sin(M_PI * $swing) * 3.0;
    return [$reach, $lift, $kneeBend];
}

/**
 * Échantillonne une couche par mapping inverse sans jamais créer de lignes vides.
 */
function blitShiftedBand(
    GdImage $src,
    GdImage $dst,
    int $yStart,
    int $yEnd,
    callable $shiftForPixel,
    int $emberBoost,
): void {
    for ($dy = max(0, $yStart - 8); $dy <= min(FRAME_SIZE - 1, $yEnd + 8); $dy++) {
        for ($dx = 0; $dx < FRAME_SIZE; $dx++) {
            [$sxOff, $syOff] = $shiftForPixel($dx, $dy);
            $sx = $dx - $sxOff;
            $sy = $dy - $syOff;
            if ($sx < 0 || $sx >= FRAME_SIZE || $sy < $yStart || $sy > $yEnd) {
                continue;
            }
            $rgba = imagecolorat($src, $sx, $sy);
            if ((($rgba >> 24) & 0x7F) >= 64) {
                continue;
            }
            if ($emberBoost > 0 && isWarmEmberPixel($rgba)) {
                $rgba = brightenColor($rgba, $emberBoost, intdiv($emberBoost * 2, 3), intdiv($emberBoost, 5));
            }
            imagesetpixel($dst, $dx, $dy, $rgba & 0x00FFFFFF);
        }
    }
}

/**
 * Génère les 36 images uniques d'un cycle de marche articulé pour une orientation donnée.
 *
 * @return list<GdImage>
 */
function renderWalkCycle(GdImage $idle, int $view): array
{
    $angle = $view * M_PI / 4.0;
    $dirX = cos($angle);
    $dirY = sin($angle) * 0.42;
    $lateralX = abs($dirX) < 0.35 ? 1.0 : 0.45;
    $topY = FOOT_BASELINE_Y - TARGET_HEIGHT;
    $crownSplitY = $topY + 17;
    $hipY = $topY + (int) round(TARGET_HEIGHT * 0.72);
    $kneeY = $topY + (int) round(TARGET_HEIGHT * 0.85);
    $centerX = intdiv(FRAME_SIZE, 2);

    $frames = [];
    for ($i = 0; $i < WALK_FRAMES; $i++) {
        $t = $i / WALK_FRAMES;
        $beat = sin(2.0 * M_PI * $t);
        $doubleStep = 0.5 + 0.5 * cos(4.0 * M_PI * $t);

        $bodyDrop = (int) round(2.2 * $doubleStep);
        $bodySwayX = (int) round($beat * 1.6 * abs($dirX) + cos(2.0 * M_PI * $t) * 1.1 * $lateralX);
        $crownFloatY = (int) round(sin(2.0 * M_PI * $t + 0.7) * 1.8);
        $emberPulse = (int) round(16 * (0.5 + 0.5 * sin(4.0 * M_PI * $t)));

        [$reachL, $liftL, $kneeL] = legStrideProfile($t);
        [$reachR, $liftR, $kneeR] = legStrideProfile(fmod($t + 0.5, 1.0));

        $frame = newTransparentCanvas(FRAME_SIZE, FRAME_SIZE);

        // 1. Jambes articulées (mapping inverse sans trous de pixels)
        blitShiftedBand(
            $idle,
            $frame,
            $hipY,
            FRAME_SIZE - 1,
            static function (int $x, int $y) use (
                $centerX,
                $hipY,
                $kneeY,
                $reachL,
                $liftL,
                $kneeL,
                $reachR,
                $liftR,
                $kneeR,
                $dirX,
                $dirY,
                $bodyDrop,
            ): array {
                $isLeftSide = $x < $centerX;
                $reach = $isLeftSide ? $reachL : $reachR;
                $lift = $isLeftSide ? $liftL : $liftR;
                $kneeBend = $isLeftSide ? $kneeL : $kneeR;

                $depthFactor = max(0.0, min(1.0, ($y - $hipY) / max(1, FOOT_BASELINE_Y - $hipY)));
                $shinWeight = $y >= $kneeY ? 1.0 : $depthFactor * 0.65;
                $dx = (int) round($dirX * $reach * $shinWeight + ($isLeftSide ? -0.45 : 0.45) * $kneeBend * (1.0 - abs($dirX)));
                $dy = (int) round(($dirY * $reach - $lift) * $shinWeight + $bodyDrop * (1.0 - $depthFactor));
                return [$dx, $dy];
            },
            $emberPulse,
        );

        // 2. Torse, ailes, cape déchirée et hache (oscillation de foule + battement des ailes)
        blitShiftedBand(
            $idle,
            $frame,
            $crownSplitY,
            $hipY + 4,
            static function (int $x, int $y) use ($centerX, $hipY, $bodySwayX, $bodyDrop, $t, $beat): array {
                $distFromCenter = abs($x - $centerX);
                $wingLift = $distFromCenter > 22 && $y < $hipY - 8
                    ? (int) round(sin(4.0 * M_PI * $t + ($distFromCenter - 22) * 0.08) * 1.5)
                    : 0;
                $cloakWave = $y >= $hipY - 8 && $distFromCenter <= 22
                    ? (int) round(sin(2.0 * M_PI * $t + ($x - $centerX) * 0.14) * 1.1)
                    : 0;
                $shoulderRoll = (int) round((($x - $centerX) / 28.0) * $beat * 0.8);
                return [$bodySwayX + $cloakWave, $bodyDrop + $wingLift + $shoulderRoll];
            },
            $emberPulse,
        );

        // 3. Halo-couronne runique en lévitation au-dessus des cornes
        blitShiftedBand(
            $idle,
            $frame,
            0,
            $crownSplitY - 1,
            static fn (int $x, int $y): array => [intdiv($bodySwayX, 2), $crownFloatY + intdiv($bodyDrop, 2)],
            $emberPulse + 6,
        );

        $frames[] = $frame;
    }

    return $frames;
}

/**
 * Construit les 3 poses d'attaque épiques par mapping inverse (zéro faille d'interpolation) :
 * armé incandescent, fente tranchante avec arc de magma et ancrage au sol.
 *
 * @return list<GdImage>
 */
function renderAttackPoses(GdImage $idle, int $view): array
{
    $angle = $view * M_PI / 4.0;
    $dirX = cos($angle);
    $dirY = sin($angle) * 0.65;
    $centerX = intdiv(FRAME_SIZE, 2);
    $bodyMidY = FOOT_BASELINE_Y - intdiv(TARGET_HEIGHT, 2);

    $configs = [
        ['shiftX' => -4.0 * $dirX, 'shiftY' => -3.5, 'glow' => 28, 'arc' => false, 'sparks' => false],
        ['shiftX' => 7.0 * $dirX,  'shiftY' => 4.0 * $dirY + 1.5, 'glow' => 44, 'arc' => true, 'sparks' => true],
        ['shiftX' => 3.5 * $dirX,  'shiftY' => 2.0, 'glow' => 18, 'arc' => false, 'sparks' => true],
    ];

    $poses = [];
    foreach ($configs as $cfg) {
        $pose = newTransparentCanvas(FRAME_SIZE, FRAME_SIZE);

        blitShiftedBand(
            $idle,
            $pose,
            0,
            FRAME_SIZE - 1,
            static function (int $x, int $y) use ($cfg): array {
                $anchorFactor = max(0.0, min(1.0, (FOOT_BASELINE_Y - $y) / max(1, TARGET_HEIGHT)));
                return [
                    (int) round($cfg['shiftX'] * (0.25 + 0.75 * $anchorFactor)),
                    (int) round($cfg['shiftY'] * $anchorFactor),
                ];
            },
            $cfg['glow'],
        );

        // Arc tranchant incandescent balayant devant l'arme (adapté à chaque orientation)
        if ($cfg['arc']) {
            $arcCenterX = $centerX + $dirX * 20;
            $arcCenterY = $bodyMidY + 8 + $dirY * 14;
            for ($step = -16; $step <= 16; $step++) {
                $a = $angle + $step * 0.075;
                $rOuter = 27;
                for ($thickness = 0; $thickness < 4; $thickness++) {
                    $px = (int) round($arcCenterX + cos($a) * ($rOuter - $thickness));
                    $py = (int) round($arcCenterY + sin($a) * ($rOuter - $thickness) * 0.68);
                    if ($px < 1 || $px >= FRAME_SIZE - 1 || $py < 1 || $py >= FRAME_SIZE - 1) {
                        continue;
                    }
                    $color = $thickness === 0 ? 0x00FFF2C2 : ($thickness <= 2 ? 0x00FF9F45 : 0x00C83F26);
                    imagesetpixel($pose, $px, $py, $color);
                }
            }
        }

        // Étincelles et éclats de magma autour des sabots lors de la frappe et de l'ancrage
        if ($cfg['sparks']) {
            $sparkOffsets = [[-16, -2], [18, 1], [-9, 4], [11, 5], [22, -4], [-21, -5]];
            foreach ($sparkOffsets as $idx => [$sx, $sy]) {
                $px = (int) round($centerX + $dirX * 14 + $sx);
                $py = (int) round(FOOT_BASELINE_Y - 8 + $dirY * 6 + $sy);
                if ($px >= 0 && $px < FRAME_SIZE - 1 && $py >= 0 && $py < FRAME_SIZE - 1) {
                    $col = $idx % 2 === 0 ? 0x00FFD67E : 0x00FF7B3B;
                    imagesetpixel($pose, $px, $py, $col);
                    imagesetpixel($pose, $px + 1, $py, $col);
                }
            }
        }

        $poses[] = $pose;
    }

    return $poses;
}

/**
 * Calcule une empreinte des pixels pour vérifier que les 36 foulées sont distinctes.
 */
function frameHash(GdImage $frame): string
{
    $data = '';
    for ($y = 0; $y < FRAME_SIZE; $y += 2) {
        for ($x = 0; $x < FRAME_SIZE; $x += 2) {
            $data .= pack('V', imagecolorat($frame, $x, $y));
        }
    }
    return md5($data);
}

/**
 * Génère une image d'aperçu claire pour contrôle visuel humain.
 */
function writePreview(array $allViews, string $previewPath): void
{
    $sampleIndices = [0, 3, 9, 15, 21, 27, 33, 37, 38, 39];
    $labels = ['Repos', 'Marche 3', 'Marche 9', 'Marche 15', 'Marche 21', 'Marche 27', 'Marche 33', 'Arme', 'Frappe', 'Ancrage'];
    $viewLabels = [0 => 'EST', 1 => 'SUD-EST', 2 => 'SUD', 6 => 'NORD'];
    $cellW = FRAME_SIZE + 8;
    $cellH = FRAME_SIZE + 22;
    $preview = imagecreatetruecolor(count($sampleIndices) * $cellW + 70, count($viewLabels) * $cellH + 34);
    imagefill($preview, 0, 0, imagecolorallocate($preview, 22, 24, 34));
    $labelCol = imagecolorallocate($preview, 244, 222, 178);
    $subCol = imagecolorallocate($preview, 154, 166, 184);

    foreach ($labels as $col => $text) {
        imagestring($preview, 2, 74 + $col * $cellW, 8, $text, $labelCol);
    }

    $row = 0;
    foreach ($viewLabels as $viewIdx => $vName) {
        $oy = 28 + $row * $cellH;
        imagestring($preview, 3, 8, $oy + 54, $vName, $labelCol);
        foreach ($sampleIndices as $col => $poseIdx) {
            $ox = 70 + $col * $cellW;
            imagefilledrectangle($preview, $ox, $oy, $ox + FRAME_SIZE - 1, $oy + FRAME_SIZE - 1, imagecolorallocate($preview, 34, 38, 52));
            imageline($preview, $ox + 6, $oy + FOOT_BASELINE_Y, $ox + FRAME_SIZE - 6, $oy + FOOT_BASELINE_Y, $subCol);
            imagecopy($preview, $allViews[$viewIdx][$poseIdx], $ox, $oy, 0, 0, FRAME_SIZE, FRAME_SIZE);
        }
        $row++;
    }

    imagepng($preview, $previewPath);
    imagedestroy($preview);
}

$sourcePath = $argv[1] ?? null;
if ($sourcePath === null || !is_file($sourcePath)) {
    fwrite(STDERR, "Source introuvable.\n");
    exit(1);
}

$previewPath = null;
for ($i = 2; $i < $argc; $i++) {
    if ($argv[$i] === '--preview' && isset($argv[$i + 1])) {
        $previewPath = $argv[$i + 1];
        $i++;
    }
}

$raw = imagecreatefromjpeg($sourcePath);
if (!$raw) {
    fwrite(STDERR, "Impossible de charger l'image source JPEG.\n");
    exit(1);
}

$stripHeight = (int) floor(imagesy($raw) * 0.47);
$cuts = findViewSlices($raw, $stripHeight);

// Ordre dans la source : 0=Est, 1=Sud-Est, 2=Sud, 3=Nord-Est, 4=Nord
$rawViews = [];
for ($i = 0; $i < 5; $i++) {
    $extracted = extractCleanSprite($raw, $cuts[$i], $cuts[$i + 1], $stripHeight);
    $rawViews[$i] = fitToBossFrame($extracted, TARGET_HEIGHT);
    imagedestroy($extracted);
}
imagedestroy($raw);

// Ordre de l'atlas Phaser : Est, Sud-Est, Sud, Sud-Ouest, Ouest, Nord-Ouest, Nord, Nord-Est
$idles = [
    0 => $rawViews[0],
    1 => $rawViews[1],
    2 => $rawViews[2],
    3 => mirrorFrame($rawViews[1]),
    4 => mirrorFrame($rawViews[0]),
    5 => mirrorFrame($rawViews[3]),
    6 => $rawViews[4],
    7 => $rawViews[3],
];

$atlasHeight = FRAME_SIZE * ((TOTAL_FRAMES * VIEWS) / ATLAS_COLUMNS);
$atlas = newTransparentCanvas(FRAME_SIZE * ATLAS_COLUMNS, $atlasHeight);
$allViews = [];

for ($view = 0; $view < VIEWS; $view++) {
    $idle = $idles[$view];
    $walk = renderWalkCycle($idle, $view);
    $hashes = array_map(frameHash(...), $walk);
    if (count(array_unique($hashes)) !== WALK_FRAMES) {
        fwrite(STDERR, "Des frames de marche du boss sont dupliquées pour la vue $view.\n");
        exit(1);
    }
    $attacks = renderAttackPoses($idle, $view);
    $sequence = [$idle, ...$walk, ...$attacks];
    $allViews[$view] = $sequence;

    foreach ($sequence as $offset => $frameImg) {
        $slot = $view * TOTAL_FRAMES + $offset;
        $dstX = ($slot % ATLAS_COLUMNS) * FRAME_SIZE;
        $dstY = intdiv($slot, ATLAS_COLUMNS) * FRAME_SIZE;
        imagecopy($atlas, $frameImg, $dstX, $dstY, 0, 0, FRAME_SIZE, FRAME_SIZE);
    }
}

$destPath = dirname(__DIR__) . '/public/game/val-des-saules/monsters/breach_lord.png';
imagepng($atlas, $destPath, 6);
imagedestroy($atlas);

if ($previewPath !== null) {
    writePreview($allViews, $previewPath);
}

echo "BOSS_ATLAS_OK: $destPath (" . (FRAME_SIZE * ATLAS_COLUMNS) . "x$atlasHeight)\n";
