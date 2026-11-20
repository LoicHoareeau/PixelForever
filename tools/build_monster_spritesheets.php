<?php

declare(strict_types=1);

/**
 * Generates anatomically articulated 24-frame walking sprite sheets for all 6
 * PixelForever monster species (`boar`, `skeleton`, `dragon`, `imp`, `hound`,
 * `fiend`) in crisp binary-alpha pixel art.
 *
 * Output atlas contract (matching `public/game/monster-art.js`):
 *   - 14 columns x 16 rows (224 slots = 8 directions x 28 frames/direction)
 *   - Slot index = view * 28 + offset (view 0..7 = E, SE, S, SW, W, NW, N, NE)
 *   - offset 0       = original idle sprite (untouched)
 *   - offset 1..24   = 24 unique articulated walk frames (1 full gait cycle)
 *   - offset 25..27  = original 3 attack frames (untouched)
 *   - Binary alpha strictly enforced (alpha in {0, 127}, zero blur)
 */

const WALK_FRAMES = 24;
const SLOTS_PER_VIEW = 28;
const ATLAS_COLUMNS = 14;
const ATLAS_ROWS = 16;

$workspaceRoot = dirname(__DIR__);
$archiveDir = $workspaceRoot . '/PIxel/Refonte zones et bestiaire/Monstres/Planches deplacement';
$outputDir = $workspaceRoot . '/public/game/val-des-saules/monsters';
$previewDir = $workspaceRoot . '/PIxel/Refonte zones et bestiaire/Monstres/Apercus anatomie';

// ---------------------------------------------------------------------------
// Geometry & Color Primitives (Pure Integer / Binary-Alpha Pixel Art)
// ---------------------------------------------------------------------------

/**
 * Creates a transparent GD canvas with alpha blending disabled so raw RGBA
 * writes preserve exact binary alpha.
 */
function createBlankCanvas(int $width, int $height): GdImage
{
    $canvas = imagecreatetruecolor($width, $height);
    imagealphablending($canvas, false);
    imagesavealpha($canvas, true);
    $transparent = imagecolorallocatealpha($canvas, 0, 0, 0, 127);
    imagefill($canvas, 0, 0, $transparent);

    return $canvas;
}

/**
 * Reads an RGBA tuple `[r, g, b, a]` where GD `a` is `0` (opaque) to `127` (transparent).
 *
 * @return array{0:int,1:int,2:int,3:int}
 */
function readRgba(GdImage $im, int $x, int $y): array
{
    $rgba = imagecolorat($im, $x, $y);

    return [
        ($rgba >> 16) & 0xFF,
        ($rgba >> 8) & 0xFF,
        $rgba & 0xFF,
        ($rgba >> 24) & 0x7F,
    ];
}

/**
 * Writes an opaque or transparent pixel using binary alpha.
 *
 * @param array{0:int,1:int,2:int,3:int} $rgba
 */
function writeBinaryPixel(GdImage $im, int $x, int $y, array $rgba): void
{
    if ($rgba[3] >= 64) {
        return;
    }

    $color = ($rgba[0] << 16) | ($rgba[1] << 8) | $rgba[2];
    imagesetpixel($im, $x, $y, $color);
}

/**
 * Returns darkened copy of an RGBA pixel (used for depth-occluded far limbs).
 *
 * @param array{0:int,1:int,2:int,3:int} $rgba
 * @return array{0:int,1:int,2:int,3:int}
 */
function shadePixel(array $rgba, float $factor): array
{
    if ($rgba[3] >= 64) {
        return $rgba;
    }

    return [
        max(0, min(255, (int) round($rgba[0] * $factor))),
        max(0, min(255, (int) round($rgba[1] * $factor))),
        max(0, min(255, (int) round($rgba[2] * $factor))),
        0,
    ];
}

/**
 * Extracts a single frame matrix `[y][x] = [r, g, b, a]` from the atlas and
 * snaps any alpha < 64 to 0, >= 64 to 127.
 *
 * @return array<int, array<int, array{0:int,1:int,2:int,3:int}>>
 */
function extractSlotPixels(GdImage $atlas, int $size, int $slot): array
{
    $ox = ($slot % ATLAS_COLUMNS) * $size;
    $oy = intdiv($slot, ATLAS_COLUMNS) * $size;
    $grid = [];

    for ($y = 0; $y < $size; $y++) {
        $row = [];
        for ($x = 0; $x < $size; $x++) {
            [$r, $g, $b, $a] = readRgba($atlas, $ox + $x, $oy + $y);
            $row[$x] = ($a < 64) ? [$r, $g, $b, 0] : [0, 0, 0, 127];
        }
        $grid[$y] = $row;
    }

    return $grid;
}

/**
 * Copies a slot pixel-for-pixel from source atlas to destination atlas.
 */
function copyAtlasSlot(GdImage $src, GdImage $dst, int $size, int $slot): void
{
    $ox = ($slot % ATLAS_COLUMNS) * $size;
    $oy = intdiv($slot, ATLAS_COLUMNS) * $size;
    imagecopy($dst, $src, $ox, $oy, $ox, $oy, $size, $size);
}

/**
 * Writes a `[y][x]` RGBA matrix into an atlas slot.
 *
 * @param array<int, array<int, array{0:int,1:int,2:int,3:int}>> $grid
 */
function writeSlotPixels(GdImage $dst, int $size, int $slot, array $grid): void
{
    $ox = ($slot % ATLAS_COLUMNS) * $size;
    $oy = intdiv($slot, ATLAS_COLUMNS) * $size;

    for ($y = 0; $y < $size; $y++) {
        for ($x = 0; $x < $size; $x++) {
            $rgba = $grid[$y][$x];
            if ($rgba[3] === 0) {
                $color = ($rgba[0] << 16) | ($rgba[1] << 8) | $rgba[2];
                imagesetpixel($dst, $ox + $x, $oy + $y, $color);
            }
        }
    }
}

/**
 * Computes opaque bounding box `[minX, minY, maxX, maxY, centroidX]` of a grid.
 *
 * @return array{minX:int,minY:int,maxX:int,maxY:int,cx:float}
 */
function measureBounds(array $grid, int $size): array
{
    $minX = $size;
    $minY = $size;
    $maxX = -1;
    $maxY = -1;
    $sumX = 0;
    $count = 0;

    for ($y = 0; $y < $size; $y++) {
        for ($x = 0; $x < $size; $x++) {
            if ($grid[$y][$x][3] === 0) {
                if ($x < $minX) {
                    $minX = $x;
                }
                if ($x > $maxX) {
                    $maxX = $x;
                }
                if ($y < $minY) {
                    $minY = $y;
                }
                if ($y > $maxY) {
                    $maxY = $y;
                }
                $sumX += $x;
                $count++;
            }
        }
    }

    return [
        'minX' => $minX,
        'minY' => $minY,
        'maxX' => $maxX,
        'maxY' => $maxY,
        'cx' => $count > 0 ? $sumX / $count : $size / 2.0,
    ];
}

// ---------------------------------------------------------------------------
// Rig Definitions & View Mirroring
// ---------------------------------------------------------------------------

/**
 * Mirrors a `[x1, y1, x2, y2]` inclusive box horizontally for view size `size`
 * plus optional centroid compensation `dx`.
 */
function mirrorBox(array $box, int $size, int $dx = 0): array
{
    return [
        max(0, min($size - 1, $size - 1 - $box[2] + $dx)),
        $box[1],
        max(0, min($size - 1, $size - 1 - $box[0] + $dx)),
        $box[3],
    ];
}

/**
 * Mirrors a limb chain `[hx, hy, kx, ky, ax, ay]` horizontally.
 */
function mirrorJoints(array $j, int $size, int $dx = 0): array
{
    return [
        $size - 1 - $j[0] + $dx,
        $j[1],
        $size - 1 - $j[2] + $dx,
        $j[3],
        $size - 1 - $j[4] + $dx,
        $j[5],
    ];
}

/**
 * Derives a complete mirrored view rig (`3` from `1`, `4` from `0`, `7` from `5`),
 * compensating for any subtle 0-1px centroid asymmetry in the idle view sprite.
 */
function mirrorViewRig(array $src, int $size, int $dx = 0): array
{
    $mirrored = $src;
    $mirrored['facingX'] = -($src['facingX'] ?? 0);

    foreach (['head', 'wing', 'tail', 'tailBase', 'tailTip', 'frontTorso', 'rearTorso'] as $partKey) {
        if (isset($src[$partKey])) {
            $part = $src[$partKey];
            if (isset($part['box'])) {
                $part['box'] = mirrorBox($part['box'], $size, $dx);
            }
            if (isset($part['boxes'])) {
                $part['boxes'] = array_map(
                    static fn (array $b): array => mirrorBox($b, $size, $dx),
                    $part['boxes']
                );
            }
            if (isset($part['excludeBoxes'])) {
                $part['excludeBoxes'] = array_map(
                    static fn (array $b): array => mirrorBox($b, $size, $dx),
                    $part['excludeBoxes']
                );
            }
            if (isset($part['pivot'])) {
                $part['pivot'] = [
                    $size - 1 - $part['pivot'][0] + $dx,
                    $part['pivot'][1],
                ];
            }
            $mirrored[$partKey] = $part;
        }
    }

    if (isset($src['splitX'])) {
        $mirrored['splitX'] = $size - 1 - $src['splitX'] + $dx;
    }

    foreach (['legs', 'arms'] as $limbGroup) {
        if (!isset($src[$limbGroup])) {
            continue;
        }
        $outLimbs = [];
        foreach ($src[$limbGroup] as $limb) {
            $newLimb = $limb;
            $newLimb['box'] = mirrorBox($limb['box'], $size, $dx);
            $newLimb['joints'] = mirrorJoints($limb['joints'], $size, $dx);
            if (isset($limb['bendX'])) {
                $newLimb['bendX'] = -$limb['bendX'];
            }
            if (isset($limb['side'])) {
                $newLimb['side'] = $limb['side'] === 'L' ? 'R' : ($limb['side'] === 'R' ? 'L' : $limb['side']);
            }
            // Swap left/right logical role when mirroring left/right facing views
            if (isset($limb['role'])) {
                $swapMap = [
                    'FL' => 'FR',
                    'FR' => 'FL',
                    'HL' => 'HR',
                    'HR' => 'HL',
                    'L' => 'R',
                    'R' => 'L',
                ];
                $newLimb['role'] = $swapMap[$limb['role']] ?? $limb['role'];
            }
            $outLimbs[] = $newLimb;
        }
        $mirrored[$limbGroup] = $outLimbs;
    }

    return $mirrored;
}

/**
 * Returns the complete anatomical rig catalog for all 6 monster species.
 * Coordinates were verified directly against every view's idle pixel map.
 */
function buildSpeciesCatalog(): array
{
    $boar = [
        'size' => 64,
        'gait' => 'boar_trot',
        'views' => [
            0 => [
                'facingX' => 1,
                'facingY' => 0,
                'splitX' => 27,
                'head' => [
                    'box' => [37, 25, 53, 41],
                    'pivot' => [39, 36],
                ],
                'tail' => [
                    'box' => [10, 36, 14, 44],
                    'pivot' => [14, 39],
                ],
                'legs' => [
                    [
                        'role' => 'HL',
                        'depth' => 1,
                        'box' => [20, 42, 26, 52],
                        'joints' => [22, 42, 21, 47, 22, 51],
                        'bendX' => -1,
                        'underfill' => true,
                    ],
                    [
                        'role' => 'FL',
                        'depth' => 1,
                        'cloneFrom' => 'FR',
                        'cloneShade' => 0.78,
                        'cloneOffsetX' => 2,
                        'box' => [30, 41, 37, 54],
                        'joints' => [34, 42, 33, 47, 34, 52],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 3,
                        'box' => [14, 40, 20, 54],
                        'joints' => [18, 42, 16, 48, 17, 53],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 3,
                        'box' => [30, 41, 37, 54],
                        'joints' => [35, 42, 33, 48, 34, 53],
                        'bendX' => -1,
                    ],
                ],
            ],
            1 => [
                'facingX' => 1,
                'facingY' => 1,
                'splitX' => 29,
                'head' => [
                    'box' => [33, 25, 48, 44],
                    'pivot' => [34, 37],
                ],
                'tail' => [
                    'box' => [15, 36, 18, 42],
                    'pivot' => [18, 39],
                ],
                'legs' => [
                    [
                        'role' => 'HL',
                        'depth' => 1,
                        'box' => [16, 43, 22, 52],
                        'joints' => [20, 42, 19, 47, 20, 51],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FL',
                        'depth' => 1,
                        'box' => [36, 44, 42, 53],
                        'joints' => [39, 44, 39, 48, 40, 52],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 3,
                        'cloneFrom' => 'HL',
                        'cloneShade' => 0.88,
                        'cloneOffsetX' => 3,
                        'box' => [16, 43, 22, 52],
                        'joints' => [23, 43, 22, 48, 23, 52],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 3,
                        'box' => [26, 44, 33, 54],
                        'joints' => [30, 44, 29, 49, 30, 53],
                        'bendX' => -1,
                    ],
                ],
            ],
            2 => [
                'facingX' => 0,
                'facingY' => 1,
                'splitY' => 41,
                'head' => [
                    'box' => [22, 31, 40, 45],
                    'pivot' => [31, 38],
                ],
                'legs' => [
                    [
                        'role' => 'HL',
                        'depth' => 1,
                        'cloneFrom' => 'FL',
                        'cloneShade' => 0.72,
                        'cloneOffsetX' => -1,
                        'box' => [23, 45, 29, 54],
                        'joints' => [26, 44, 25, 49, 25, 53],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 1,
                        'cloneFrom' => 'FR',
                        'cloneShade' => 0.72,
                        'cloneOffsetX' => 1,
                        'box' => [33, 45, 39, 54],
                        'joints' => [36, 44, 37, 49, 37, 53],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'FL',
                        'depth' => 3,
                        'box' => [23, 45, 29, 54],
                        'joints' => [26, 44, 25, 49, 25, 53],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 3,
                        'box' => [33, 45, 39, 54],
                        'joints' => [36, 44, 37, 49, 37, 53],
                        'bendX' => 1,
                    ],
                ],
            ],
            5 => [
                'facingX' => -1,
                'facingY' => -1,
                'splitX' => 31,
                'head' => [
                    'box' => [18, 25, 30, 41],
                    'pivot' => [29, 34],
                ],
                'tail' => [
                    'box' => [40, 38, 45, 45],
                    'pivot' => [41, 41],
                ],
                'legs' => [
                    [
                        'role' => 'FL',
                        'depth' => 1,
                        'box' => [21, 43, 27, 51],
                        'joints' => [25, 42, 24, 46, 25, 50],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 1,
                        'cloneFrom' => 'FL',
                        'cloneShade' => 0.85,
                        'cloneOffsetX' => 3,
                        'box' => [21, 43, 27, 51],
                        'joints' => [28, 43, 27, 47, 28, 50],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'HL',
                        'depth' => 3,
                        'box' => [29, 44, 36, 54],
                        'joints' => [34, 44, 33, 49, 33, 53],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 3,
                        'box' => [38, 45, 44, 53],
                        'joints' => [39, 44, 41, 49, 42, 52],
                        'bendX' => 1,
                    ],
                ],
            ],
            6 => [
                'facingX' => 0,
                'facingY' => -1,
                'splitY' => 41,
                'tail' => [
                    'box' => [29, 37, 33, 44],
                    'pivot' => [31, 40],
                ],
                'legs' => [
                    [
                        'role' => 'FL',
                        'depth' => 1,
                        'cloneFrom' => 'HL',
                        'cloneShade' => 0.72,
                        'cloneOffsetX' => -1,
                        'box' => [24, 44, 29, 54],
                        'joints' => [27, 44, 26, 49, 26, 53],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 1,
                        'cloneFrom' => 'HR',
                        'cloneShade' => 0.72,
                        'cloneOffsetX' => 1,
                        'box' => [34, 44, 39, 54],
                        'joints' => [36, 44, 37, 49, 37, 53],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'HL',
                        'depth' => 3,
                        'box' => [24, 44, 29, 54],
                        'joints' => [27, 44, 26, 49, 26, 53],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 3,
                        'box' => [34, 44, 39, 54],
                        'joints' => [36, 44, 37, 49, 37, 53],
                        'bendX' => 1,
                    ],
                ],
            ],
        ],
    ];

    $skeleton = [
        'size' => 60,
        'gait' => 'skeleton_walk',
        'views' => [
            0 => [
                'facingX' => 1,
                'facingY' => 0,
                'waistY' => 32,
                'head' => [
                    'box' => [23, 14, 35, 21],
                    'pivot' => [29, 21],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 1,
                        'cloneFrom' => 'R',
                        'cloneShade' => 0.70,
                        'cloneOffsetX' => 2,
                        'box' => [23, 25, 29, 41],
                        'joints' => [28, 25, 25, 31, 26, 38],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [23, 25, 29, 41],
                        'joints' => [28, 25, 25, 31, 26, 38],
                        'bendX' => -1,
                        'underfill' => true,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 1,
                        'cloneFrom' => 'R',
                        'cloneShade' => 0.70,
                        'cloneOffsetX' => 1,
                        'box' => [24, 36, 30, 50],
                        'joints' => [28, 36, 27, 43, 27, 49],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [24, 36, 30, 50],
                        'joints' => [28, 36, 27, 43, 27, 49],
                        'bendX' => 1,
                    ],
                ],
            ],
            1 => [
                'facingX' => 1,
                'facingY' => 1,
                'waistY' => 32,
                'head' => [
                    'box' => [26, 14, 38, 21],
                    'pivot' => [31, 21],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [21, 28, 26, 44],
                        'joints' => [25, 27, 23, 34, 24, 40],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 1,
                        'box' => [33, 27, 38, 39],
                        'joints' => [33, 27, 35, 32, 36, 38],
                        'bendX' => -1,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [23, 35, 30, 50],
                        'joints' => [27, 35, 26, 42, 26, 49],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 2,
                        'box' => [31, 35, 37, 48],
                        'joints' => [33, 35, 33, 41, 34, 47],
                        'bendX' => 1,
                    ],
                ],
            ],
            2 => [
                'facingX' => 0,
                'facingY' => 1,
                'waistY' => 32,
                'head' => [
                    'box' => [24, 14, 34, 21],
                    'pivot' => [29, 21],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [19, 27, 24, 44],
                        'joints' => [24, 27, 21, 34, 20, 41],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [34, 27, 39, 42],
                        'joints' => [34, 27, 37, 34, 37, 40],
                        'bendX' => 1,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [22, 35, 28, 50],
                        'joints' => [26, 35, 25, 42, 25, 49],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [30, 35, 36, 50],
                        'joints' => [32, 35, 33, 42, 33, 49],
                        'bendX' => 1,
                    ],
                ],
            ],
            5 => [
                'facingX' => -1,
                'facingY' => -1,
                'waistY' => 32,
                'head' => [
                    'box' => [24, 14, 34, 21],
                    'pivot' => [29, 21],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [20, 29, 26, 40],
                        'joints' => [26, 28, 23, 34, 21, 38],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 1,
                        'box' => [33, 27, 38, 40],
                        'joints' => [34, 27, 36, 33, 36, 38],
                        'bendX' => 1,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [22, 36, 29, 50],
                        'joints' => [27, 36, 26, 43, 25, 49],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 1,
                        'box' => [30, 35, 36, 48],
                        'joints' => [32, 35, 33, 41, 34, 47],
                        'bendX' => -1,
                    ],
                ],
            ],
            6 => [
                'facingX' => 0,
                'facingY' => -1,
                'waistY' => 32,
                'head' => [
                    'box' => [24, 14, 34, 21],
                    'pivot' => [29, 21],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [19, 27, 24, 40],
                        'joints' => [24, 27, 21, 33, 20, 38],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [34, 27, 40, 42],
                        'joints' => [35, 27, 37, 34, 38, 40],
                        'bendX' => 1,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [22, 35, 29, 50],
                        'joints' => [27, 35, 26, 42, 26, 49],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [30, 35, 37, 50],
                        'joints' => [32, 35, 33, 42, 33, 49],
                        'bendX' => 1,
                    ],
                ],
            ],
        ],
    ];

    $dragon = [
        'size' => 96,
        'gait' => 'dragon_heavy',
        'views' => [
            0 => [
                'facingX' => 1,
                'facingY' => 0,
                'splitX' => 45,
                'head' => [
                    'box' => [65, 34, 86, 60],
                    'pivot' => [65, 51],
                ],
                'wing' => [
                    'boxes' => [
                        [16, 29, 64, 54],
                        [65, 29, 75, 37],
                    ],
                    'pivot' => [46, 52],
                ],
                'tail' => [
                    'box' => [9, 60, 21, 74],
                    'pivot' => [22, 63],
                ],
                'legs' => [
                    [
                        'role' => 'HL',
                        'depth' => 1,
                        'box' => [40, 62, 54, 82],
                        'joints' => [45, 63, 46, 72, 48, 80],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FL',
                        'depth' => 1,
                        'box' => [67, 62, 85, 82],
                        'joints' => [72, 65, 76, 73, 79, 80],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 3,
                        'box' => [21, 62, 39, 85],
                        'joints' => [33, 63, 28, 73, 27, 82],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 3,
                        'box' => [55, 61, 70, 86],
                        'joints' => [60, 63, 59, 74, 63, 83],
                        'bendX' => 1,
                    ],
                ],
            ],
            1 => [
                'facingX' => 1,
                'facingY' => 1,
                'splitX' => 46,
                'head' => [
                    'box' => [65, 31, 86, 60],
                    'pivot' => [65, 51],
                ],
                'wing' => [
                    'boxes' => [
                        [13, 26, 64, 53],
                        [65, 26, 75, 34],
                    ],
                    'pivot' => [46, 51],
                ],
                'tail' => [
                    'box' => [9, 57, 20, 71],
                    'pivot' => [21, 61],
                ],
                'legs' => [
                    [
                        'role' => 'HL',
                        'depth' => 1,
                        'box' => [36, 60, 48, 79],
                        'joints' => [41, 62, 40, 70, 41, 76],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FL',
                        'depth' => 1,
                        'box' => [65, 59, 86, 84],
                        'joints' => [71, 63, 76, 72, 80, 81],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 3,
                        'box' => [19, 60, 33, 81],
                        'joints' => [26, 62, 22, 71, 24, 78],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 3,
                        'box' => [48, 59, 64, 86],
                        'joints' => [54, 62, 52, 74, 55, 83],
                        'bendX' => 1,
                    ],
                ],
            ],
            2 => [
                'facingX' => 0,
                'facingY' => 1,
                'splitY' => 57,
                'head' => [
                    'box' => [39, 29, 55, 54],
                    'pivot' => [47, 46],
                ],
                'wing' => [
                    'boxes' => [
                        [20, 24, 38, 60],
                        [56, 24, 74, 60],
                    ],
                    'pivot' => [47, 46],
                ],
                'legs' => [
                    [
                        'role' => 'HL',
                        'depth' => 1,
                        'box' => [20, 59, 29, 78],
                        'joints' => [27, 60, 25, 70, 25, 76],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 1,
                        'box' => [65, 59, 74, 78],
                        'joints' => [66, 60, 68, 70, 69, 76],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'FL',
                        'depth' => 3,
                        'box' => [30, 59, 40, 86],
                        'joints' => [36, 61, 35, 73, 35, 84],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 3,
                        'box' => [53, 59, 63, 86],
                        'joints' => [58, 61, 58, 73, 58, 84],
                        'bendX' => 1,
                    ],
                ],
            ],
            5 => [
                'facingX' => -1,
                'facingY' => -1,
                'splitX' => 45,
                'head' => [
                    'box' => [13, 24, 35, 51],
                    'pivot' => [34, 44],
                ],
                'wing' => [
                    'boxes' => [
                        [41, 36, 78, 56],
                    ],
                    'pivot' => [49, 49],
                ],
                'tail' => [
                    'box' => [70, 65, 81, 76],
                    'pivot' => [70, 67],
                ],
                'legs' => [
                    [
                        'role' => 'FL',
                        'depth' => 1,
                        'box' => [13, 58, 26, 76],
                        'joints' => [22, 61, 18, 68, 17, 74],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'HL',
                        'depth' => 1,
                        'box' => [51, 61, 61, 79],
                        'joints' => [56, 62, 55, 70, 55, 76],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 3,
                        'box' => [35, 62, 50, 86],
                        'joints' => [43, 63, 42, 74, 41, 83],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 3,
                        'box' => [59, 62, 70, 82],
                        'joints' => [64, 63, 64, 72, 66, 80],
                        'bendX' => 1,
                    ],
                ],
            ],
            6 => [
                'facingX' => 0,
                'facingY' => -1,
                'splitY' => 57,
                'head' => [
                    'box' => [39, 26, 56, 44],
                    'pivot' => [47, 42],
                ],
                'wing' => [
                    'boxes' => [
                        [25, 24, 38, 59],
                        [56, 24, 70, 59],
                    ],
                    'pivot' => [47, 46],
                ],
                'tail' => [
                    'box' => [45, 59, 55, 86],
                    'pivot' => [50, 60],
                ],
                'legs' => [
                    [
                        'role' => 'FL',
                        'depth' => 1,
                        'box' => [36, 63, 44, 77],
                        'joints' => [40, 63, 40, 70, 40, 75],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 1,
                        'box' => [54, 63, 60, 77],
                        'joints' => [57, 63, 57, 70, 57, 75],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'HL',
                        'depth' => 3,
                        'box' => [31, 64, 42, 82],
                        'joints' => [37, 64, 36, 73, 35, 80],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 3,
                        'box' => [59, 64, 70, 82],
                        'joints' => [64, 64, 64, 73, 65, 80],
                        'bendX' => 1,
                    ],
                ],
            ],
        ],
    ];

    $imp = [
        'size' => 56,
        'gait' => 'imp_bound',
        'views' => [
            0 => [
                'facingX' => 1,
                'facingY' => 0,
                'waistY' => 31,
                'head' => [
                    'box' => [22, 14, 41, 25],
                    'pivot' => [31, 25],
                ],
                'tail' => [
                    'box' => [14, 26, 21, 39],
                    'pivot' => [21, 36],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 1,
                        'cloneFrom' => 'R',
                        'cloneShade' => 0.72,
                        'cloneOffsetX' => -2,
                        'box' => [32, 28, 41, 37],
                        'joints' => [33, 28, 35, 32, 38, 35],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [32, 28, 41, 37],
                        'joints' => [33, 28, 35, 32, 38, 35],
                        'bendX' => -1,
                        'underfill' => true,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 1,
                        'cloneFrom' => 'R',
                        'cloneShade' => 0.70,
                        'cloneOffsetX' => 1,
                        'box' => [21, 34, 34, 46],
                        'joints' => [27, 33, 30, 38, 26, 44],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [21, 34, 34, 46],
                        'joints' => [27, 33, 30, 38, 26, 44],
                        'bendX' => 1,
                    ],
                ],
            ],
            1 => [
                'facingX' => 1,
                'facingY' => 1,
                'waistY' => 31,
                'head' => [
                    'box' => [22, 14, 39, 25],
                    'pivot' => [29, 25],
                ],
                'tail' => [
                    'box' => [15, 24, 21, 37],
                    'pivot' => [21, 35],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 1,
                        'box' => [34, 31, 39, 38],
                        'joints' => [34, 31, 36, 34, 38, 37],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [20, 30, 26, 37],
                        'joints' => [26, 30, 23, 33, 21, 36],
                        'bendX' => -1,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 2,
                        'box' => [29, 34, 37, 45],
                        'joints' => [31, 34, 33, 39, 33, 44],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [18, 34, 27, 46],
                        'joints' => [24, 34, 22, 40, 22, 45],
                        'bendX' => -1,
                    ],
                ],
            ],
            2 => [
                'facingX' => 0,
                'facingY' => 1,
                'waistY' => 31,
                'head' => [
                    'box' => [19, 14, 35, 25],
                    'pivot' => [27, 25],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [17, 28, 23, 36],
                        'joints' => [22, 28, 20, 32, 18, 34],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [31, 28, 37, 36],
                        'joints' => [32, 28, 34, 32, 36, 34],
                        'bendX' => 1,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [17, 35, 26, 46],
                        'joints' => [23, 34, 21, 40, 21, 45],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [28, 35, 37, 46],
                        'joints' => [31, 34, 33, 40, 33, 45],
                        'bendX' => 1,
                    ],
                ],
            ],
            5 => [
                'facingX' => -1,
                'facingY' => -1,
                'waistY' => 31,
                'head' => [
                    'box' => [16, 14, 31, 25],
                    'pivot' => [24, 25],
                ],
                'tail' => [
                    'box' => [33, 26, 39, 39],
                    'pivot' => [33, 36],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [15, 31, 22, 38],
                        'joints' => [21, 31, 19, 34, 17, 37],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 1,
                        'box' => [31, 29, 35, 36],
                        'joints' => [31, 29, 33, 32, 34, 35],
                        'bendX' => 1,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [18, 35, 27, 46],
                        'joints' => [24, 34, 22, 40, 22, 45],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 1,
                        'box' => [28, 34, 36, 45],
                        'joints' => [30, 34, 31, 39, 32, 44],
                        'bendX' => 1,
                    ],
                ],
            ],
            6 => [
                'facingX' => 0,
                'facingY' => -1,
                'waistY' => 31,
                'head' => [
                    'box' => [18, 14, 35, 25],
                    'pivot' => [27, 25],
                ],
                'tail' => [
                    'box' => [25, 36, 29, 44],
                    'pivot' => [27, 36],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [16, 28, 22, 36],
                        'joints' => [21, 28, 19, 32, 17, 35],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [32, 28, 38, 36],
                        'joints' => [33, 28, 35, 32, 37, 35],
                        'bendX' => 1,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [17, 35, 25, 46],
                        'joints' => [23, 34, 21, 40, 21, 45],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [29, 35, 38, 46],
                        'joints' => [31, 34, 33, 40, 34, 45],
                        'bendX' => 1,
                    ],
                ],
            ],
        ],
    ];

    $hound = [
        'size' => 68,
        'gait' => 'hound_gallop',
        'views' => [
            0 => [
                'facingX' => 1,
                'facingY' => 0,
                'splitX' => 31,
                'head' => [
                    'box' => [43, 24, 60, 42],
                    'pivot' => [45, 35],
                ],
                'tail' => [
                    'box' => [7, 38, 15, 47],
                    'pivot' => [15, 40],
                ],
                'legs' => [
                    [
                        'role' => 'HL',
                        'depth' => 1,
                        'box' => [22, 39, 30, 55],
                        'joints' => [25, 41, 26, 48, 27, 54],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FL',
                        'depth' => 1,
                        'box' => [44, 41, 55, 55],
                        'joints' => [45, 42, 48, 49, 50, 54],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 3,
                        'box' => [14, 40, 22, 57],
                        'joints' => [19, 41, 16, 49, 18, 56],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 3,
                        'box' => [35, 40, 44, 58],
                        'joints' => [39, 41, 39, 50, 41, 57],
                        'bendX' => 1,
                    ],
                ],
            ],
            1 => [
                'facingX' => 1,
                'facingY' => 1,
                'splitX' => 33,
                'head' => [
                    'box' => [36, 23, 51, 44],
                    'pivot' => [38, 35],
                ],
                'tail' => [
                    'box' => [16, 36, 22, 46],
                    'pivot' => [22, 38],
                ],
                'legs' => [
                    [
                        'role' => 'HL',
                        'depth' => 1,
                        'box' => [29, 39, 36, 52],
                        'joints' => [31, 41, 31, 46, 33, 50],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FL',
                        'depth' => 1,
                        'box' => [43, 40, 51, 55],
                        'joints' => [44, 41, 46, 48, 48, 54],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 3,
                        'box' => [20, 39, 28, 52],
                        'joints' => [24, 40, 22, 46, 24, 51],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 3,
                        'box' => [34, 40, 43, 58],
                        'joints' => [37, 42, 37, 50, 39, 57],
                        'bendX' => 1,
                    ],
                ],
            ],
            2 => [
                'facingX' => 0,
                'facingY' => 1,
                'splitY' => 39,
                'head' => [
                    'box' => [25, 24, 41, 43],
                    'pivot' => [33, 35],
                ],
                'legs' => [
                    [
                        'role' => 'HL',
                        'depth' => 1,
                        'box' => [23, 42, 28, 51],
                        'joints' => [26, 41, 25, 45, 25, 50],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 1,
                        'box' => [38, 42, 43, 51],
                        'joints' => [40, 41, 41, 45, 41, 50],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'FL',
                        'depth' => 3,
                        'box' => [26, 43, 33, 58],
                        'joints' => [29, 42, 28, 50, 29, 57],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 3,
                        'box' => [35, 43, 42, 58],
                        'joints' => [38, 42, 38, 50, 38, 57],
                        'bendX' => 1,
                    ],
                ],
            ],
            5 => [
                'facingX' => -1,
                'facingY' => -1,
                'splitX' => 34,
                'head' => [
                    'box' => [19, 23, 33, 38],
                    'pivot' => [30, 33],
                ],
                'tail' => [
                    'box' => [44, 46, 48, 52],
                    'pivot' => [44, 47],
                ],
                'legs' => [
                    [
                        'role' => 'FL',
                        'depth' => 1,
                        'box' => [19, 41, 27, 51],
                        'joints' => [24, 40, 23, 45, 21, 50],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'HL',
                        'depth' => 1,
                        'box' => [41, 44, 47, 52],
                        'joints' => [42, 42, 44, 47, 45, 50],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 3,
                        'box' => [30, 43, 37, 58],
                        'joints' => [33, 42, 33, 51, 33, 57],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 3,
                        'box' => [35, 43, 42, 56],
                        'joints' => [38, 42, 38, 49, 40, 55],
                        'bendX' => 1,
                    ],
                ],
            ],
            6 => [
                'facingX' => 0,
                'facingY' => -1,
                'splitY' => 39,
                'head' => [
                    'box' => [27, 24, 39, 36],
                    'pivot' => [33, 34],
                ],
                'tail' => [
                    'box' => [31, 40, 35, 47],
                    'pivot' => [33, 41],
                ],
                'legs' => [
                    [
                        'role' => 'FL',
                        'depth' => 1,
                        'box' => [26, 46, 31, 58],
                        'joints' => [29, 43, 28, 50, 28, 57],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'FR',
                        'depth' => 1,
                        'box' => [36, 46, 41, 58],
                        'joints' => [38, 43, 38, 50, 38, 57],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'HL',
                        'depth' => 3,
                        'box' => [24, 44, 29, 52],
                        'joints' => [27, 41, 26, 46, 25, 50],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'HR',
                        'depth' => 3,
                        'box' => [38, 44, 43, 52],
                        'joints' => [39, 41, 40, 46, 41, 50],
                        'bendX' => 1,
                    ],
                ],
            ],
        ],
    ];

    $fiend = [
        'size' => 72,
        'gait' => 'fiend_march',
        'views' => [
            0 => [
                'facingX' => 1,
                'facingY' => 0,
                'waistY' => 45,
                'head' => [
                    'box' => [29, 14, 45, 29],
                    'pivot' => [36, 28],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 1,
                        'cloneFrom' => 'R',
                        'cloneShade' => 0.80,
                        'cloneOffsetX' => 4,
                        'box' => [25, 29, 32, 51],
                        'joints' => [31, 30, 29, 40, 27, 48],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [25, 29, 32, 51],
                        'joints' => [31, 30, 29, 40, 27, 48],
                        'bendX' => -1,
                        'underfill' => true,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 1,
                        'cloneFrom' => 'R',
                        'cloneShade' => 0.80,
                        'cloneOffsetX' => 2,
                        'box' => [28, 47, 41, 62],
                        'joints' => [34, 48, 34, 55, 35, 61],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [28, 47, 41, 62],
                        'joints' => [34, 48, 34, 55, 35, 61],
                        'bendX' => 1,
                    ],
                ],
            ],
            1 => [
                'facingX' => 1,
                'facingY' => 1,
                'waistY' => 45,
                'head' => [
                    'box' => [27, 14, 49, 29],
                    'pivot' => [37, 28],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [19, 29, 27, 50],
                        'joints' => [26, 29, 23, 39, 22, 47],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 1,
                        'box' => [44, 28, 51, 49],
                        'joints' => [45, 28, 48, 38, 49, 46],
                        'bendX' => 1,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [25, 51, 35, 62],
                        'joints' => [29, 50, 29, 56, 30, 61],
                        'bendX' => 1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 1,
                        'box' => [37, 50, 48, 61],
                        'joints' => [40, 49, 41, 55, 43, 60],
                        'bendX' => 1,
                    ],
                ],
            ],
            2 => [
                'facingX' => 0,
                'facingY' => 1,
                'waistY' => 45,
                'head' => [
                    'box' => [27, 14, 45, 29],
                    'pivot' => [36, 28],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [16, 29, 26, 50],
                        'joints' => [25, 29, 20, 39, 19, 47],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [45, 29, 54, 50],
                        'joints' => [46, 29, 50, 39, 51, 47],
                        'bendX' => 1,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [23, 50, 33, 62],
                        'joints' => [29, 49, 27, 55, 27, 61],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [38, 50, 48, 62],
                        'joints' => [42, 49, 44, 55, 44, 61],
                        'bendX' => 1,
                    ],
                ],
            ],
            5 => [
                'facingX' => -1,
                'facingY' => -1,
                'waistY' => 45,
                'head' => [
                    'box' => [25, 14, 44, 27],
                    'pivot' => [34, 26],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [18, 29, 27, 50],
                        'joints' => [26, 29, 22, 39, 20, 47],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 1,
                        'box' => [44, 28, 52, 47],
                        'joints' => [45, 28, 49, 37, 50, 44],
                        'bendX' => 1,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [24, 50, 34, 62],
                        'joints' => [30, 49, 28, 56, 28, 61],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 1,
                        'box' => [37, 50, 47, 61],
                        'joints' => [41, 49, 42, 55, 42, 60],
                        'bendX' => -1,
                    ],
                ],
            ],
            6 => [
                'facingX' => 0,
                'facingY' => -1,
                'waistY' => 45,
                'head' => [
                    'box' => [26, 14, 45, 27],
                    'pivot' => [35, 26],
                ],
                'arms' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [16, 29, 25, 50],
                        'joints' => [24, 29, 20, 39, 19, 47],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [46, 29, 55, 50],
                        'joints' => [47, 29, 51, 39, 52, 47],
                        'bendX' => 1,
                    ],
                ],
                'legs' => [
                    [
                        'role' => 'L',
                        'depth' => 3,
                        'box' => [23, 50, 33, 62],
                        'joints' => [29, 49, 27, 55, 27, 61],
                        'bendX' => -1,
                    ],
                    [
                        'role' => 'R',
                        'depth' => 3,
                        'box' => [39, 50, 49, 62],
                        'joints' => [43, 49, 45, 55, 45, 61],
                        'bendX' => 1,
                    ],
                ],
            ],
        ],
    ];

    return [
        'boar' => $boar,
        'skeleton' => $skeleton,
        'dragon' => $dragon,
        'imp' => $imp,
        'hound' => $hound,
        'fiend' => $fiend,
    ];
}

// ---------------------------------------------------------------------------
// Anatomical Segmentation & Under-fill Socket Construction
// ---------------------------------------------------------------------------

function pointInBoxes(int $x, int $y, array $boxes): bool
{
    foreach ($boxes as $b) {
        if ($x >= $b[0] && $x <= $b[2] && $y >= $b[1] && $y <= $b[3]) {
            return true;
        }
    }

    return false;
}

/**
 * Splits a pixel sprite into discrete anatomical grids:
 * `torso`, `head`, `wing`, `tail`, `arms[]`, `legs[]`.
 * Removes limbs/head/wings/tail from `torso` and heals socket interiors so
 * moving limbs never tear holes in the chest or pelvis.
 */
function segmentViewSprite(array $idleGrid, array $rig, int $size): array
{
    $torso = array_fill(0, $size, array_fill(0, $size, [0, 0, 0, 127]));
    $head = array_fill(0, $size, array_fill(0, $size, [0, 0, 0, 127]));
    $wing = array_fill(0, $size, array_fill(0, $size, [0, 0, 0, 127]));
    $tail = array_fill(0, $size, array_fill(0, $size, [0, 0, 0, 127]));

    $removedMask = array_fill(0, $size, array_fill(0, $size, false));
    $underfillMask = array_fill(0, $size, array_fill(0, $size, false));

    // Extract legs (real source limbs first, then optional profile far-limb clones)
    $legs = [];
    foreach (($rig['legs'] ?? []) as $index => $limbSpec) {
        $grid = array_fill(0, $size, array_fill(0, $size, [0, 0, 0, 127]));
        if (!isset($limbSpec['cloneFrom'])) {
            $b = $limbSpec['box'];
            [$hx, $hy] = [$limbSpec['joints'][0], $limbSpec['joints'][1]];
            for ($y = $b[1]; $y <= $b[3]; $y++) {
                for ($x = $b[0]; $x <= $b[2]; $x++) {
                    if ($x < 0 || $x >= $size || $y < 0 || $y >= $size) {
                        continue;
                    }
                    if ($idleGrid[$y][$x][3] === 0) {
                        $grid[$y][$x] = $idleGrid[$y][$x];
                        // Keep top 2px hip socket overlapping inside torso, remove lower exterior
                        if ($y >= $hy + 2) {
                            $removedMask[$y][$x] = true;
                            if (!empty($limbSpec['underfill'])) {
                                $underfillMask[$y][$x] = true;
                            }
                        }
                    }
                }
            }
        }
        $legs[] = [
            'spec' => $limbSpec,
            'grid' => $grid,
            'index' => $index,
        ];
    }

    // Resolve cloned far legs on profile views
    foreach ($legs as $idx => $legData) {
        $cloneRole = $legData['spec']['cloneFrom'] ?? null;
        if ($cloneRole === null) {
            continue;
        }
        foreach ($legs as $donor) {
            if (($donor['spec']['role'] ?? '') === $cloneRole && !isset($donor['spec']['cloneFrom'])) {
                $shade = $legData['spec']['cloneShade'] ?? 0.72;
                $ox = (int) ($legData['spec']['cloneOffsetX'] ?? 0);
                for ($y = 0; $y < $size; $y++) {
                    for ($x = 0; $x < $size; $x++) {
                        $nx = $x + $ox;
                        if ($nx >= 0 && $nx < $size && $donor['grid'][$y][$x][3] === 0) {
                            $legs[$idx]['grid'][$y][$nx] = shadePixel($donor['grid'][$y][$x], $shade);
                        }
                    }
                }
                break;
            }
        }
    }

    // Extract arms
    $arms = [];
    foreach (($rig['arms'] ?? []) as $index => $armSpec) {
        $grid = array_fill(0, $size, array_fill(0, $size, [0, 0, 0, 127]));
        if (!isset($armSpec['cloneFrom'])) {
            $b = $armSpec['box'];
            [$sx, $sy] = [$armSpec['joints'][0], $armSpec['joints'][1]];
            for ($y = $b[1]; $y <= $b[3]; $y++) {
                for ($x = $b[0]; $x <= $b[2]; $x++) {
                    if ($x < 0 || $x >= $size || $y < 0 || $y >= $size) {
                        continue;
                    }
                    if ($idleGrid[$y][$x][3] === 0 && !$removedMask[$y][$x]) {
                        $grid[$y][$x] = $idleGrid[$y][$x];
                        // Remove below shoulder pivot so arm swings without static duplicate
                        if ($y >= $sy + 2 || abs($x - $sx) >= 3) {
                            $removedMask[$y][$x] = true;
                            if (!empty($armSpec['underfill'])) {
                                $underfillMask[$y][$x] = true;
                            }
                        }
                    }
                }
            }
        }
        $arms[] = [
            'spec' => $armSpec,
            'grid' => $grid,
            'index' => $index,
        ];
    }

    foreach ($arms as $idx => $armData) {
        $cloneRole = $armData['spec']['cloneFrom'] ?? null;
        if ($cloneRole === null) {
            continue;
        }
        foreach ($arms as $donor) {
            if (($donor['spec']['role'] ?? '') === $cloneRole && !isset($donor['spec']['cloneFrom'])) {
                $shade = $armData['spec']['cloneShade'] ?? 0.72;
                $ox = (int) ($armData['spec']['cloneOffsetX'] ?? 0);
                for ($y = 0; $y < $size; $y++) {
                    for ($x = 0; $x < $size; $x++) {
                        $nx = $x + $ox;
                        if ($nx >= 0 && $nx < $size && $donor['grid'][$y][$x][3] === 0) {
                            $arms[$idx]['grid'][$y][$nx] = shadePixel($donor['grid'][$y][$x], $shade);
                        }
                    }
                }
                break;
            }
        }
    }

    // Extract wings (before head/torso so head horns take priority if close)
    $wingBoxes = $rig['wing']['boxes'] ?? (isset($rig['wing']['box']) ? [$rig['wing']['box']] : []);
    if ($wingBoxes !== []) {
        $wingPivot = $rig['wing']['pivot'];
        $headBox = $rig['head']['box'] ?? null;
        for ($y = 0; $y < $size; $y++) {
            for ($x = 0; $x < $size; $x++) {
                if ($idleGrid[$y][$x][3] !== 0 || $removedMask[$y][$x]) {
                    continue;
                }
                if ($headBox !== null && pointInBoxes($x, $y, [$headBox])) {
                    continue;
                }
                if (pointInBoxes($x, $y, $wingBoxes)) {
                    $wing[$y][$x] = $idleGrid[$y][$x];
                    // Keep 2px root overlap on back, clear upper wing from torso
                    if ($y <= $wingPivot[1] - 2 || abs($x - $wingPivot[0]) > 5) {
                        $removedMask[$y][$x] = true;
                    }
                }
            }
        }
    }

    // Extract head
    if (isset($rig['head'])) {
        $hb = $rig['head']['box'];
        $hp = $rig['head']['pivot'];
        for ($y = $hb[1]; $y <= $hb[3]; $y++) {
            for ($x = $hb[0]; $x <= $hb[2]; $x++) {
                if ($x < 0 || $x >= $size || $y < 0 || $y >= $size) {
                    continue;
                }
                if ($idleGrid[$y][$x][3] === 0 && !$removedMask[$y][$x]) {
                    $head[$y][$x] = $idleGrid[$y][$x];
                    // Clear head outside a 2px neck socket collar
                    $distPivot = hypot($x - $hp[0], $y - $hp[1]);
                    if ($distPivot > 2.5) {
                        $removedMask[$y][$x] = true;
                    }
                }
            }
        }
    }

    // Extract tail
    if (isset($rig['tail'])) {
        $tb = $rig['tail']['box'];
        $tp = $rig['tail']['pivot'];
        for ($y = $tb[1]; $y <= $tb[3]; $y++) {
            for ($x = $tb[0]; $x <= $tb[2]; $x++) {
                if ($x < 0 || $x >= $size || $y < 0 || $y >= $size) {
                    continue;
                }
                if ($idleGrid[$y][$x][3] === 0 && !$removedMask[$y][$x]) {
                    $tail[$y][$x] = $idleGrid[$y][$x];
                    if (hypot($x - $tp[0], $y - $tp[1]) > 2.0) {
                        $removedMask[$y][$x] = true;
                    }
                }
            }
        }
    }

    // Remaining non-removed pixels belong to torso
    for ($y = 0; $y < $size; $y++) {
        for ($x = 0; $x < $size; $x++) {
            if ($idleGrid[$y][$x][3] === 0 && !$removedMask[$y][$x]) {
                $torso[$y][$x] = $idleGrid[$y][$x];
            }
        }
    }

    // Smooth torso under-fill where profile arms overlap flank/ribcage
    $filledTorso = $torso;
    for ($pass = 0; $pass < 4; $pass++) {
        $nextTorso = $filledTorso;
        for ($y = 1; $y < $size - 1; $y++) {
            for ($x = 1; $x < $size - 1; $x++) {
                if (!$underfillMask[$y][$x] || $filledTorso[$y][$x][3] === 0) {
                    continue;
                }
                // Only fill if an adjacent remaining torso pixel exists horizontally
                foreach ([[1, 0], [-1, 0], [0, -1]] as [$ox, $oy]) {
                    $nx = $x + $ox;
                    $ny = $y + $oy;
                    if ($filledTorso[$ny][$nx][3] === 0) {
                        $nextTorso[$y][$x] = shadePixel($filledTorso[$ny][$nx], 0.94);
                        break;
                    }
                }
            }
        }
        $filledTorso = $nextTorso;
    }

    return [
        'torso' => $filledTorso,
        'head' => $head,
        'wing' => $wing,
        'tail' => $tail,
        'arms' => $arms,
        'legs' => $legs,
    ];
}

// ---------------------------------------------------------------------------
// 2-Bone Analytical IK + Crisp Nearest-Neighbor Piecewise Warping
// ---------------------------------------------------------------------------

/**
 * Solves 2-bone analytical IK in 2D screen space (`A -> B -> C`) while
 * allowing gentle anatomical bend even under perspective foreshortening.
 *
 * @return array{0:array{0:float,1:float},1:array{0:float,1:float},2:array{0:float,1:float}}
 */
function solveTwoBoneIK(
    float $ax,
    float $ay,
    float $bx,
    float $by,
    float $cx,
    float $cy,
    float $targetAx,
    float $targetAy,
    float $targetCx,
    float $targetCy,
    int $bendSign,
    float $flexBias = 0.0
): array {
    $l1 = max(2.0, hypot($bx - $ax, $by - $ay));
    $l2 = max(2.0, hypot($cx - $bx, $cy - $by));

    $vx = $targetCx - $targetAx;
    $vy = $targetCy - $targetAy;
    $dist = hypot($vx, $vy);

    if ($dist < 0.001) {
        return [[$targetAx, $targetAy], [$targetAx, $targetAy + $l1 * 0.5], [$targetCx, $targetCy]];
    }

    // Clamp max reach just short of full lock to prevent hyperextension snapping
    $maxReach = ($l1 + $l2) * 0.99;
    $minReach = max(1.5, abs($l1 - $l2) + 0.5);
    $clamped = max($minReach, min($maxReach, $dist));

    // Direction unit vector from target hip to target foot
    $ux = $vx / $dist;
    $uy = $vy / $dist;

    // Perpendicular bend normal pointing toward anatomical bend direction
    $px = -$uy;
    $py = $ux;
    if ($bendSign !== 0 && ($px * $bendSign) < 0) {
        $px = -$px;
        $py = -$py;
    }

    $cosAngle = ($l1 * $l1 + $clamped * $clamped - $l2 * $l2) / (2.0 * $l1 * $clamped);
    $cosAngle = max(-1.0, min(1.0, $cosAngle));
    $h = $l1 * sqrt(max(0.0, 1.0 - $cosAngle * $cosAngle));
    $proj = $l1 * $cosAngle;

    // Subtle anatomical flex boost on lift frames so front/back views still bend knees cleanly
    $h = max($h, abs($flexBias));

    $targetBx = $targetAx + $ux * $proj + $px * $h;
    $targetBy = $targetAy + $uy * $proj + $py * $h;

    return [
        [$targetAx, $targetAy],
        [$targetBx, $targetBy],
        [$targetCx, $targetCy],
    ];
}

/**
 * Renders a two-bone articulated limb (`A -> B -> C` -> `A' -> B' -> C'`)
 * using nearest-neighbor inverse mapping onto `dstGrid` with flat foot orientation
 * near `C'` so paws/hooves/boots anchor firmly on the ground plane.
 */
function renderArticulatedLimb(
    array &$dstGrid,
    array $limbGrid,
    array $restJoints,
    array $animJoints,
    int $size,
    float $footAngleFactor = 0.2
): void {
    [$ax, $ay, $bx, $by, $cx, $cy] = array_map('floatval', $restJoints);
    [$nax, $nay] = $animJoints[0];
    [$nbx, $nby] = $animJoints[1];
    [$ncx, $ncy] = $animJoints[2];

    $bounds = measureBounds($limbGrid, $size);
    if ($bounds['maxX'] < 0) {
        return;
    }

    // Rest segment vectors
    $uDx = $bx - $ax;
    $uDy = $by - $ay;
    $uLenSq = max(1.0, $uDx * $uDx + $uDy * $uDy);
    $uAngle = atan2($uDy, $uDx);

    $lDx = $cx - $bx;
    $lDy = $cy - $by;
    $lLenSq = max(1.0, $lDx * $lDx + $lDy * $lDy);
    $lAngle = atan2($lDy, $lDx);

    // Animated segment vectors + scale
    $nuDx = $nbx - $nax;
    $nuDy = $nby - $nay;
    $nuLen = max(1.0, hypot($nuDx, $nuDy));
    $nuAngle = atan2($nuDy, $nuDx);
    $uScale = $nuLen / sqrt($uLenSq);

    $nlDx = $ncx - $nbx;
    $nlDy = $ncy - $nby;
    $nlLen = max(1.0, hypot($nlDx, $nlDy));
    $nlAngle = atan2($nlDy, $nlDx);
    $lScale = $nlLen / sqrt($lLenSq);

    $duCos = cos($uAngle - $nuAngle);
    $duSin = sin($uAngle - $nuAngle);
    $dlCos = cos($lAngle - $nlAngle);
    $dlSin = sin($lAngle - $nlAngle);

    // Flat-foot damped angle for ground contact zone near C
    $dampedAngle = $nlAngle * $footAngleFactor + $lAngle * (1.0 - $footAngleFactor);
    $dfCos = cos($lAngle - $dampedAngle);
    $dfSin = sin($lAngle - $dampedAngle);

    $pad = 8;
    $minX = max(0, (int) floor(min($nax, $nbx, $ncx)) - $pad);
    $maxX = min($size - 1, (int) ceil(max($nax, $nbx, $ncx)) + $pad);
    $minY = max(0, (int) floor(min($nay, $nby, $ncy)) - $pad);
    $maxY = min($size - 1, (int) ceil(max($nay, $nby, $ncy)) + $pad);

    for ($dy = $minY; $dy <= $maxY; $dy++) {
        for ($dx = $minX; $dx <= $maxX; $dx++) {
            // Parameter along animated lower vs upper segments
            $rxB = $dx - $nbx;
            $ryB = $dy - $nby;
            $tLower = ($rxB * $nlDx + $ryB * $nlDy) / max(1.0, $nlLen * $nlLen);

            $rxA = $dx - $nax;
            $ryA = $dy - $nay;
            $tUpper = ($rxA * $nuDx + $ryA * $nuDy) / max(1.0, $nuLen * $nuLen);

            $rxC = $dx - $ncx;
            $ryC = $dy - $ncy;
            $distFoot = hypot($rxC, $ryC);

            $chosenPixel = null;

            // Foot / claw / hoof zone anchored firmly around ankle C'
            if ($distFoot <= 4.2) {
                $ix = (int) round($cx + ($rxC * $dfCos - $ryC * $dfSin));
                $iy = (int) round($cy + ($rxC * $dfSin + $ryC * $dfCos));
                if ($ix >= 0 && $ix < $size && $iy >= 0 && $iy < $size && $limbGrid[$iy][$ix][3] === 0) {
                    $chosenPixel = $limbGrid[$iy][$ix];
                }
            }

            if ($chosenPixel === null && $tLower >= -0.08 && $tLower <= 1.25) {
                $invScale = 1.0 / max(0.62, min(1.28, $lScale));
                // Preserve true bone-orthogonal width without mirroring across the bone axis
                $along = ($rxB * $nlDx + $ryB * $nlDy) / $nlLen;
                $perp = (-$rxB * $nlDy + $ryB * $nlDx) / $nlLen;
                $lNorm = sqrt($lLenSq);
                $lCos = $lDx / $lNorm;
                $lSin = $lDy / $lNorm;
                $ix = (int) round($bx + ($along * $invScale) * $lCos - $perp * $lSin);
                $iy = (int) round($by + ($along * $invScale) * $lSin + $perp * $lCos);
                if ($ix >= 0 && $ix < $size && $iy >= 0 && $iy < $size && $limbGrid[$iy][$ix][3] === 0) {
                    $chosenPixel = $limbGrid[$iy][$ix];
                }
            }

            if ($chosenPixel === null && $tUpper >= -0.30 && $tUpper <= 1.15) {
                $invScale = 1.0 / max(0.62, min(1.28, $uScale));
                $along = ($rxA * $nuDx + $ryA * $nuDy) / $nuLen;
                $perp = (-$rxA * $nuDy + $ryA * $nuDx) / $nuLen;
                $uNorm = sqrt($uLenSq);
                $uCos = $uDx / $uNorm;
                $uSin = $uDy / $uNorm;
                $ix = (int) round($ax + ($along * $invScale) * $uCos - $perp * $uSin);
                $iy = (int) round($ay + ($along * $invScale) * $uSin + $perp * $uCos);
                if ($ix >= 0 && $ix < $size && $iy >= 0 && $iy < $size && $limbGrid[$iy][$ix][3] === 0) {
                    $chosenPixel = $limbGrid[$iy][$ix];
                }
            }

            if ($chosenPixel !== null) {
                $dstGrid[$dy][$dx] = $chosenPixel;
            }
        }
    }
}

/**
 * Renders a rigid or gently pivoted part (`head`, `wing`, `tail`, `body`) via
 * nearest-neighbor inverse transformation around `(px, py)` plus optional shear.
 */
function renderTransformedPart(
    array &$dstGrid,
    array $srcGrid,
    int $size,
    float $pivotX,
    float $pivotY,
    float $dxShift,
    float $dyShift,
    float $angleRad = 0.0,
    float $tipShearX = 0.0,
    float $tipShearY = 0.0
): void {
    $bounds = measureBounds($srcGrid, $size);
    if ($bounds['maxX'] < 0) {
        return;
    }

    $cos = cos(-$angleRad);
    $sin = sin(-$angleRad);
    $maxRadius = max(
        6.0,
        hypot($bounds['minX'] - $pivotX, $bounds['minY'] - $pivotY),
        hypot($bounds['maxX'] - $pivotX, $bounds['maxY'] - $pivotY)
    );

    $pad = (int) ceil(abs($dxShift) + abs($dyShift) + abs($tipShearX) + abs($tipShearY)) + 6;
    $minX = max(0, $bounds['minX'] - $pad);
    $maxX = min($size - 1, $bounds['maxX'] + $pad);
    $minY = max(0, $bounds['minY'] - $pad);
    $maxY = min($size - 1, $bounds['maxY'] + $pad);

    $newPx = $pivotX + $dxShift;
    $newPy = $pivotY + $dyShift;

    for ($y = $minY; $y <= $maxY; $y++) {
        for ($x = $minX; $x <= $maxX; $x++) {
            $rx = $x - $newPx;
            $ry = $y - $newPy;
            $distRatio = min(1.0, hypot($rx, $ry) / $maxRadius);
            $ux = $rx - $tipShearX * $distRatio;
            $uy = $ry - $tipShearY * $distRatio;
            $sx = (int) round($pivotX + ($ux * $cos - $uy * $sin));
            $sy = (int) round($pivotY + ($ux * $sin + $uy * $cos));

            if ($sx >= 0 && $sx < $size && $sy >= 0 && $sy < $size && $srcGrid[$sy][$sx][3] === 0) {
                $dstGrid[$y][$x] = $srcGrid[$sy][$sx];
            }
        }
    }
}

/**
 * Renders the torso with real anatomical spinal flexion/compression/sway along
 * either `splitX` (quadrupeds in E/W/diagonal views) or `waistY`/`splitY` (bipeds
 * and front/back views), blending across a 5px anatomical hinge zone with zero seams.
 */
function renderFlexedTorso(
    array &$dstGrid,
    array $torsoGrid,
    array $rig,
    array $pose,
    int $size
): void {
    $bounds = measureBounds($torsoGrid, $size);
    if ($bounds['maxX'] < 0) {
        return;
    }

    $rearDx = $pose['rearTorsoDx'] ?? $pose['torsoDx'] ?? 0.0;
    $rearDy = $pose['rearTorsoDy'] ?? $pose['torsoDy'] ?? 0.0;
    $frontDx = $pose['frontTorsoDx'] ?? $pose['torsoDx'] ?? 0.0;
    $frontDy = $pose['frontTorsoDy'] ?? $pose['torsoDy'] ?? 0.0;
    $archDy = $pose['archDy'] ?? 0.0;

    $fxDir = $rig['facingX'] ?? 0;
    $fyDir = $rig['facingY'] ?? 0;
    $splitX = $rig['splitX'] ?? null;
    $waistY = $rig['waistY'] ?? ($rig['splitY'] ?? null);

    $pad = 6;
    $minX = max(0, $bounds['minX'] - $pad);
    $maxX = min($size - 1, $bounds['maxX'] + $pad);
    $minY = max(0, $bounds['minY'] - $pad);
    $maxY = min($size - 1, $bounds['maxY'] + $pad);

    for ($y = $minY; $y <= $maxY; $y++) {
        for ($x = $minX; $x <= $maxX; $x++) {
            // Compute local blend factor `w` in [0=rear/pelvis, 1=front/chest]
            if ($splitX !== null && $fxDir !== 0) {
                $signedDist = ($x - $splitX) * $fxDir;
                $w = max(0.0, min(1.0, ($signedDist + 3.0) / 6.0));
                $archWeight = max(0.0, 1.0 - abs($signedDist) / 7.0);
            } elseif ($waistY !== null) {
                // Upper chest vs lower pelvis for bipeds or N/S quadrupeds
                $signedDist = ($waistY - $y);
                $w = max(0.0, min(1.0, ($signedDist + 2.0) / 4.0));
                $archWeight = 0.0;
            } else {
                $w = 0.5;
                $archWeight = 0.0;
            }

            $dx = (1.0 - $w) * $rearDx + $w * $frontDx;
            $dy = (1.0 - $w) * $rearDy + $w * $frontDy + $archDy * $archWeight;

            $sx = (int) round($x - $dx);
            $sy = (int) round($y - $dy);
            if ($sx >= 0 && $sx < $size && $sy >= 0 && $sy < $size && $torsoGrid[$sy][$sx][3] === 0) {
                $dstGrid[$y][$x] = $torsoGrid[$sy][$sx];
            }
        }
    }
}

/**
 * Post-render pixel-art cleanup: heals tiny interior 1px holes (>=3 cardinal
 * opaque neighbors) while stripping isolated stray 1px sparkles.
 */
function polishFramePixels(array $grid, array $idleGrid, int $size): array
{
    // Pass 1: Heal isolated 1px transparent pinholes
    $healed = $grid;
    for ($y = 1; $y < $size - 1; $y++) {
        for ($x = 1; $x < $size - 1; $x++) {
            if ($grid[$y][$x][3] === 0) {
                continue;
            }
            $opaqueNeighbors = [];
            foreach ([[0, -1], [1, 0], [0, 1], [-1, 0]] as [$nx, $ny]) {
                if ($grid[$y + $ny][$x + $nx][3] === 0) {
                    $opaqueNeighbors[] = $grid[$y + $ny][$x + $nx];
                }
            }
            if (count($opaqueNeighbors) >= 3) {
                $healed[$y][$x] = $opaqueNeighbors[0];
            }
        }
    }

    // Pass 2: Prune stray single pixels that have zero cardinal opaque neighbors
    $cleaned = $healed;
    for ($y = 1; $y < $size - 1; $y++) {
        for ($x = 1; $x < $size - 1; $x++) {
            if ($healed[$y][$x][3] !== 0) {
                continue;
            }
            $cardinal = 0;
            foreach ([[0, -1], [1, 0], [0, 1], [-1, 0]] as [$nx, $ny]) {
                if ($healed[$y + $ny][$x + $nx][3] === 0) {
                    $cardinal++;
                }
            }
            if ($cardinal === 0 && $idleGrid[$y][$x][3] !== 0) {
                $cleaned[$y][$x] = [0, 0, 0, 127];
            }
        }
    }

    return $cleaned;
}

// ---------------------------------------------------------------------------
// Biomechanical Gait Curves per Species (24 Frames = 1 Full Gait Cycle)
// ---------------------------------------------------------------------------

/**
 * Computes normalized sinusoidal stride curves for a limb with explicit duty
 * factor: `duty` in ground stance, `(1 - duty)` in aerial swing arc.
 *
 * @return array{stride:float,lift:float,phase:float}
 */
function evaluateGaitLimb(float $cyclePhase, float $duty, float $liftExponent = 1.0): array
{
    $p = fmod($cyclePhase + 10.0, 1.0);
    if ($p < $duty) {
        // Stance phase: foot sweeps linearly/smoothly from +1 (front plant) to -1 (rear push-off)
        $u = $p / $duty;
        $stride = 1.0 - 2.0 * $u;
        $lift = 0.0;
    } else {
        // Swing phase: foot lifts in clean parabolic arc from -1 to +1
        $u = ($p - $duty) / (1.0 - $duty);
        $stride = -cos(M_PI * $u);
        $lift = pow(sin(M_PI * $u), $liftExponent);
    }

    return ['stride' => $stride, 'lift' => $lift, 'phase' => $p];
}

/**
 * Computes directional 2D screen offsets for stride amplitude `(ampX, ampY)`
 * projected accurately onto each of the 8 view axes.
 */
function projectStrideToView(int $view, float $strideVal, float $liftVal, float $roleSignX, float $amp): array
{
    switch ($view) {
        case 0: // East
            return [$strideVal * $amp, -$liftVal * ($amp * 0.56)];
        case 4: // West
            return [-$strideVal * $amp, -$liftVal * ($amp * 0.56)];
        case 1: // South-East
            return [$strideVal * ($amp * 0.72), $strideVal * ($amp * 0.25) - $liftVal * ($amp * 0.60)];
        case 3: // South-West
            return [-$strideVal * ($amp * 0.72), $strideVal * ($amp * 0.25) - $liftVal * ($amp * 0.60)];
        case 5: // North-West
            return [-$strideVal * ($amp * 0.72), -$strideVal * ($amp * 0.22) - $liftVal * ($amp * 0.58)];
        case 7: // North-East
            return [$strideVal * ($amp * 0.72), -$strideVal * ($amp * 0.22) - $liftVal * ($amp * 0.58)];
        case 2: // South (pure front view: minimal lateral sway, clear vertical lift & fore-shortened stride)
            return [$roleSignX * (0.4 * $liftVal), -$liftVal * ($amp * 0.72) + $strideVal * ($amp * 0.28)];
        case 6: // North (pure rear view: heel lift pushes visually upward)
            return [$roleSignX * (0.4 * $liftVal), -$liftVal * ($amp * 0.76) - $strideVal * ($amp * 0.24)];
        default:
            return [0.0, 0.0];
    }
}

/**
 * Generates exact biomechanical pose state for species `(gait, view, frameIndex 0..23)`.
 */
function computeSpeciesPose(string $gait, int $view, int $frameIndex, array $rig): array
{
    $p = $frameIndex / (float) WALK_FRAMES;
    $twoPi = 2.0 * M_PI;
    $fx = $rig['facingX'] ?? 0;

    $pose = [
        'torsoDx' => 0.0,
        'torsoDy' => 0.0,
        'rearTorsoDx' => 0.0,
        'rearTorsoDy' => 0.0,
        'frontTorsoDx' => 0.0,
        'frontTorsoDy' => 0.0,
        'archDy' => 0.0,
        'headDx' => 0.0,
        'headDy' => 0.0,
        'headRot' => 0.0,
        'tailDx' => 0.0,
        'tailDy' => 0.0,
        'tailRot' => 0.0,
        'tailShearX' => 0.0,
        'tailShearY' => 0.0,
        'wingDx' => 0.0,
        'wingDy' => 0.0,
        'wingRot' => 0.0,
        'wingShearY' => 0.0,
        'limbs' => [],
    ];

    if ($gait === 'boar_trot') {
        // Brisk 2-beat diagonal trot: FL+HR (0.00), FR+HL (0.50)
        $offsets = ['FL' => 0.00, 'HR' => 0.02, 'FR' => 0.50, 'HL' => 0.52];
        $bob = -1.3 * abs(sin($twoPi * $p)) + 0.5;
        $lagBob = -1.2 * abs(sin($twoPi * ($p - 1.0 / 24.0))) + 0.4;
        $pitch = 0.6 * cos(2.0 * $twoPi * $p);

        $pose['frontTorsoDy'] = $bob - $pitch * 0.5;
        $pose['rearTorsoDy'] = $bob + $pitch * 0.5;
        $pose['frontTorsoDx'] = $fx * 0.35 * sin(2.0 * $twoPi * $p);
        $pose['rearTorsoDx'] = -$pose['frontTorsoDx'];

        $pose['headDx'] = $pose['frontTorsoDx'] + $fx * 0.6 * cos(2.0 * $twoPi * ($p - 0.05));
        $pose['headDy'] = $lagBob + 0.7 * sin(2.0 * $twoPi * ($p - 0.05));
        $pose['headRot'] = ($fx !== 0 ? $fx : 1) * 0.045 * sin(2.0 * $twoPi * ($p - 0.05));

        $pose['tailDx'] = $pose['rearTorsoDx'] + ($fx === 0 ? 1.5 * sin($twoPi * $p) : 0.0);
        $pose['tailDy'] = $pose['rearTorsoDy'] - 1.2 * sin(2.0 * $twoPi * ($p - 0.08));
        $pose['tailShearY'] = -1.2 * sin(2.0 * $twoPi * ($p - 0.12));

        foreach ($offsets as $role => $off) {
            $eval = evaluateGaitLimb($p + $off, 0.55, 0.9);
            $signX = str_ends_with($role, 'R') ? 1.0 : -1.0;
            [$fdx, $fdy] = projectStrideToView($view, $eval['stride'], $eval['lift'], $signX, 3.6);
            $isFront = str_starts_with($role, 'F');
            $hipDx = $isFront ? $pose['frontTorsoDx'] : $pose['rearTorsoDx'];
            $hipDy = $isFront ? $pose['frontTorsoDy'] : $pose['rearTorsoDy'];
            $pose['limbs'][$role] = [
                'hipDx' => $hipDx * 0.6,
                'hipDy' => $hipDy,
                'endDx' => $fdx,
                'endDy' => $fdy,
                'flexBias' => ($view === 2 || $view === 6) ? (1.2 + 1.5 * $eval['lift']) * $signX : 1.5 * $eval['lift'],
                'footFlat' => $eval['lift'] > 0.15 ? 0.35 : 0.10,
            ];
        }
    } elseif ($gait === 'skeleton_walk') {
        // Jerky skeletal biped walk: crisp heel-strike drop + counter arm-leg swing
        $rawBob = -abs(sin($twoPi * $p));
        // Sharp drop right after passing mid-stance for clacking bone impact
        $jerkyBob = 1.6 * $rawBob + 0.45 * cos(2.0 * $twoPi * $p) + 0.6;
        $swayX = ($view === 2 || $view === 6) ? 1.2 * sin($twoPi * $p) : 0.0;
        $twistX = ($fx !== 0) ? 0.7 * sin($twoPi * $p) : 0.0;

        $pose['rearTorsoDx'] = $swayX;
        $pose['rearTorsoDy'] = $jerkyBob;
        $pose['frontTorsoDx'] = $swayX * 0.7 + $twistX;
        $pose['frontTorsoDy'] = $jerkyBob;

        $skullLag = -1.3 * abs(sin($twoPi * ($p - 2.0 / 24.0))) + 0.5;
        $pose['headDx'] = $pose['frontTorsoDx'] + ($fx !== 0 ? $fx * 0.5 : 0.4 * sin($twoPi * ($p - 0.08)));
        $pose['headDy'] = $skullLag + 0.4 * cos(2.0 * $twoPi * ($p - 0.08));
        $pose['headRot'] = ($fx !== 0 ? $fx : 1) * 0.055 * cos(2.0 * $twoPi * ($p - 0.08));

        // Legs: L (0.00) vs R (0.50)
        $skelAmp = ($fx !== 0) ? 4.8 : 4.2;
        foreach (['L' => 0.00, 'R' => 0.50] as $role => $off) {
            $eval = evaluateGaitLimb($p + $off, 0.58, 0.85);
            $signX = $role === 'R' ? 1.0 : -1.0;
            [$fdx, $fdy] = projectStrideToView($view, $eval['stride'], $eval['lift'], $signX, $skelAmp);
            $pose['limbs']['leg_' . $role] = [
                'hipDx' => $pose['rearTorsoDx'],
                'hipDy' => $pose['rearTorsoDy'],
                'endDx' => $fdx,
                'endDy' => $fdy,
                'flexBias' => ($view === 2 || $view === 6) ? (1.0 + 1.8 * $eval['lift']) * $signX : 2.0 * $eval['lift'],
                'footFlat' => $eval['lift'] > 0.2 ? 0.30 : 0.08,
            ];
        }

        // Arms swing in strict opposition to same-side legs (Arm L = Leg R phase)
        foreach (['L' => 0.50, 'R' => 0.00] as $role => $off) {
            $swing = sin($twoPi * ($p + $off));
            $signX = $role === 'R' ? 1.0 : -1.0;
            if ($view === 0 || $view === 4) {
                $adx = ($fx !== 0 ? $fx : 1) * 3.8 * $swing;
                $ady = -1.2 * abs($swing);
            } elseif ($view === 2 || $view === 6) {
                $adx = $signX * (0.8 + 0.7 * $swing);
                $ady = -1.6 * max(0.0, $swing) + 0.8 * max(0.0, -$swing);
            } else {
                $adx = $fx * 2.8 * $swing + $signX * 0.4;
                $ady = -1.0 * abs($swing) + ($rig['facingY'] ?? 0) * 0.9 * $swing;
            }
            $pose['limbs']['arm_' . $role] = [
                'hipDx' => $pose['frontTorsoDx'],
                'hipDy' => $pose['frontTorsoDy'],
                'endDx' => $adx,
                'endDy' => $ady,
                'flexBias' => 1.5 + 1.2 * max(0.0, $swing),
                'footFlat' => 0.75,
            ];
        }
    } elseif ($gait === 'dragon_heavy') {
        // Heavy 4-beat lateral walk: HL -> FL -> HR -> FR (high 72% duty factor = massive weight)
        $offsets = ['HL' => 0.00, 'FL' => 0.25, 'HR' => 0.50, 'FR' => 0.75];
        $hipRoll = 1.1 * sin($twoPi * $p);
        $shoulderRoll = 1.2 * sin($twoPi * ($p - 0.25));
        $swayX = ($view === 2 || $view === 6) ? 1.4 * sin($twoPi * $p) : 0.0;

        $pose['rearTorsoDx'] = $swayX + ($fx * 0.5 * cos($twoPi * $p));
        $pose['rearTorsoDy'] = -0.9 * abs(sin($twoPi * $p)) + 0.4;
        $pose['frontTorsoDx'] = -$swayX * 0.6 + ($fx * 0.5 * cos($twoPi * ($p + 0.25)));
        $pose['frontTorsoDy'] = -1.0 * abs(sin($twoPi * ($p + 0.25))) + 0.5;
        $pose['archDy'] = 0.5 * sin(2.0 * $twoPi * $p);

        // Head stabilizes and dips slightly behind shoulder rhythm
        $pose['headDx'] = $pose['frontTorsoDx'] + $fx * 0.9 * cos($twoPi * ($p + 0.20));
        $pose['headDy'] = -0.8 * abs(sin($twoPi * ($p + 0.16))) + 0.6;
        $pose['headRot'] = ($fx !== 0 ? $fx : 1) * 0.032 * sin($twoPi * ($p + 0.18));

        // Heavy wings settle and rise softly 2 frames after chest heave
        $wingBob = -1.6 * abs(sin($twoPi * ($p + 0.14))) + 0.7;
        $pose['wingDx'] = $pose['frontTorsoDx'] * 0.8;
        $pose['wingDy'] = $wingBob;
        $pose['wingRot'] = ($fx !== 0 ? -$fx : 0) * 0.035 * sin($twoPi * ($p + 0.14));
        $pose['wingShearY'] = 1.4 * sin($twoPi * ($p + 0.10));

        // Sinuous tail S-wave counterbalancing the pelvis
        if ($view === 2 || $view === 6) {
            $pose['tailDx'] = $pose['rearTorsoDx'];
            $pose['tailDy'] = $pose['rearTorsoDy'];
            $pose['tailShearX'] = -3.4 * sin($twoPi * ($p - 0.12));
        } else {
            $pose['tailDx'] = $pose['rearTorsoDx'] - $fx * 0.9 * sin($twoPi * ($p - 0.12));
            $pose['tailDy'] = $pose['rearTorsoDy'] + 0.6 * cos($twoPi * ($p - 0.10));
            $pose['tailShearY'] = 2.4 * sin($twoPi * ($p - 0.15));
        }

        foreach ($offsets as $role => $off) {
            $eval = evaluateGaitLimb($p + $off, 0.72, 1.15);
            $signX = str_ends_with($role, 'R') ? 1.0 : -1.0;
            [$fdx, $fdy] = projectStrideToView($view, $eval['stride'], $eval['lift'], $signX, 4.6);
            $isFront = str_starts_with($role, 'F');
            $hipDx = $isFront ? $pose['frontTorsoDx'] : $pose['rearTorsoDx'];
            $hipDy = ($isFront ? $pose['frontTorsoDy'] : $pose['rearTorsoDy'])
                + ($isFront ? $shoulderRoll : $hipRoll) * 0.25 * $signX;
            $pose['limbs'][$role] = [
                'hipDx' => $hipDx * 0.7,
                'hipDy' => $hipDy,
                'endDx' => $fdx,
                'endDy' => $fdy,
                'flexBias' => ($view === 2 || $view === 6) ? (0.6 + 1.0 * $eval['lift']) * $signX : 1.6 * $eval['lift'],
                'footFlat' => $eval['lift'] > 0.15 ? 0.22 : 0.05,
            ];
        }
    } elseif ($gait === 'imp_bound') {
        // Springy digitigrade bounding skip (two crisp leaps per cycle: L push-off 0.00, R push-off 0.50)
        $bounceWave = sin(2.0 * $twoPi * $p);
        $apexWave = -max(0.0, -$bounceWave); // negative Y = airborne apex
        $crouchWave = max(0.0, $bounceWave);  // positive Y = deep crouch compression
        $vertical = 1.1 * $crouchWave + 2.2 * $apexWave;

        $leanX = ($fx !== 0) ? $fx * (0.8 * $crouchWave - 0.5 * $apexWave) : 0.0;
        $swayX = ($view === 2 || $view === 6) ? 1.0 * sin($twoPi * $p) : 0.0;

        $pose['rearTorsoDx'] = $swayX + $leanX * 0.6;
        $pose['rearTorsoDy'] = $vertical;
        $pose['frontTorsoDx'] = $swayX * 0.7 + $leanX * 1.0;
        $pose['frontTorsoDy'] = $vertical + 0.15 * $crouchWave;

        $headBounce = 1.0 * max(0.0, sin(2.0 * $twoPi * ($p - 0.05))) - 2.1 * max(0.0, -sin(2.0 * $twoPi * ($p - 0.05)));
        $pose['headDx'] = $pose['frontTorsoDx'] + $fx * 0.4 * cos(2.0 * $twoPi * ($p - 0.05));
        $pose['headDy'] = $headBounce;
        $pose['headRot'] = ($fx !== 0 ? $fx : 1) * 0.05 * sin(2.0 * $twoPi * ($p - 0.05));

        // Whip tail snaps dramatically downward during upward spring and whips high on landing
        $tailWave = sin(2.0 * $twoPi * ($p - 0.12));
        $pose['tailDx'] = $pose['rearTorsoDx'] - $fx * 0.9 * $tailWave;
        $pose['tailDy'] = $pose['rearTorsoDy'] + 1.1 * $tailWave;
        $pose['tailShearY'] = 2.4 * $tailWave;
        $pose['tailShearX'] = ($view === 6) ? 2.2 * sin($twoPi * ($p - 0.10)) : 0.0;

        foreach (['L' => 0.00, 'R' => 0.50] as $role => $off) {
            $eval = evaluateGaitLimb($p + $off, 0.48, 0.85);
            $signX = $role === 'R' ? 1.0 : -1.0;
            // During airborne phase feet stay tucked under belly relative to ground
            $airTuck = max(0.0, -$vertical) * 0.50;
            [$fdx, $fdy] = projectStrideToView($view, $eval['stride'], $eval['lift'], $signX, 3.8);
            $pose['limbs']['leg_' . $role] = [
                'hipDx' => $pose['rearTorsoDx'],
                'hipDy' => $pose['rearTorsoDy'],
                'endDx' => $fdx,
                'endDy' => min(0.0, $fdy - $airTuck * 0.5),
                'flexBias' => ($view === 2 || $view === 6) ? (0.8 + 1.6 * $eval['lift']) * $signX : 2.0 * $eval['lift'] + 0.6 * $crouchWave,
                'footFlat' => $eval['lift'] > 0.15 ? 0.30 : 0.08,
            ];
        }

        foreach (['L' => 0.50, 'R' => 0.00] as $role => $off) {
            $swing = sin($twoPi * ($p + $off));
            $signX = $role === 'R' ? 1.0 : -1.0;
            $adx = ($fx !== 0 ? $fx * 2.8 * $swing : $signX * (1.0 + 0.6 * $swing));
            $ady = $pose['frontTorsoDy'] * 0.6 - 1.4 * max(0.0, -$bounceWave);
            $pose['limbs']['arm_' . $role] = [
                'hipDx' => $pose['frontTorsoDx'],
                'hipDy' => $pose['frontTorsoDy'],
                'endDx' => $adx,
                'endDy' => $ady,
                'flexBias' => 1.2 + 0.9 * abs($swing),
                'footFlat' => 0.75,
            ];
        }
    } elseif ($gait === 'hound_gallop') {
        // Rotary predator gallop with real spinal arch/extension & stabilized head
        // p in [0, 1): gathered compression peak at p=0.18, explosive extension peak at p=0.68
        $coil = cos($twoPi * ($p - 0.18)); // +1 = fully coiled, -1 = fully extended
        $gallopPitch = sin($twoPi * ($p - 0.10));

        // Spine coils shorter (front pulls back, rear pulls forward, mid-back arches up)
        // Spine uncoils flat & long during extended leap!
        $spineFlex = 1.5 * $coil;
        $torsoAirY = -2.0 * max(0.0, sin($twoPi * ($p - 0.55))) - 0.8 * max(0.0, $coil);
        $pose['frontTorsoDx'] = $fx * (-$spineFlex);
        $pose['rearTorsoDx'] = $fx * ($spineFlex);
        $pose['frontTorsoDy'] = $torsoAirY + 0.9 * $gallopPitch;
        $pose['rearTorsoDy'] = $torsoAirY - 1.0 * $gallopPitch;
        $pose['archDy'] = -1.4 * max(-0.4, $coil);

        // Predator head stays locked horizontally with reduced vertical bob
        $pose['headDx'] = $pose['frontTorsoDx'] + $fx * 0.7 * cos($twoPi * ($p - 0.65));
        $pose['headDy'] = $pose['frontTorsoDy'] * 0.40 + 0.4 * $gallopPitch;
        $pose['headRot'] = ($fx !== 0 ? -$fx : 0) * 0.04 * $gallopPitch;

        // Counterbalancing whip tail follows rear spine curvature
        $pose['tailDx'] = $pose['rearTorsoDx'] - $fx * 1.1 * cos($twoPi * ($p - 0.68));
        $pose['tailDy'] = $pose['rearTorsoDy'] - 1.4 * $coil;
        $pose['tailShearY'] = 2.2 * $gallopPitch;
        $pose['tailShearX'] = ($view === 6) ? 2.4 * sin($twoPi * ($p - 0.12)) : 0.0;

        // Asymmetric rotary gallop leg phases
        $offsets = ['HL' => 0.00, 'HR' => 0.12, 'FL' => 0.52, 'FR' => 0.64];
        foreach ($offsets as $role => $off) {
            $eval = evaluateGaitLimb($p + $off, 0.42, 0.85);
            $signX = str_ends_with($role, 'R') ? 1.0 : -1.0;
            $isFront = str_starts_with($role, 'F');
            [$fdx, $fdy] = projectStrideToView($view, $eval['stride'], $eval['lift'], $signX, 4.5);
            $hipDx = $isFront ? $pose['frontTorsoDx'] : $pose['rearTorsoDx'];
            $hipDy = $isFront ? $pose['frontTorsoDy'] : $pose['rearTorsoDy'];
            $pose['limbs'][$role] = [
                'hipDx' => $hipDx * 0.85,
                'hipDy' => $hipDy,
                'endDx' => $fdx,
                'endDy' => $fdy - ($eval['lift'] > 0.2 ? 0.7 * max(0.0, -$torsoAirY) : 0.0),
                'flexBias' => ($view === 2 || $view === 6) ? (0.8 + 1.4 * $eval['lift']) * $signX : 1.7 * $eval['lift'],
                'footFlat' => $eval['lift'] > 0.18 ? 0.28 : 0.06,
            ];
        }
    } elseif ($gait === 'fiend_march') {
        // Heavy armored demon march: lateral hip weight shift, counter chest roll, heavy drop
        $weightShift = sin($twoPi * $p);
        $heavyDrop = -1.4 * pow(abs(sin($twoPi * $p)), 0.75) + 0.8;
        $swayLat = ($view === 2 || $view === 6) ? 1.9 * $weightShift : ($fx * 0.8 * cos($twoPi * $p));

        $pose['rearTorsoDx'] = $swayLat;
        $pose['rearTorsoDy'] = $heavyDrop;
        $pose['frontTorsoDx'] = $swayLat * 0.45 + ($fx * 0.9 * sin($twoPi * $p));
        $pose['frontTorsoDy'] = $heavyDrop + 0.35 * sin(2.0 * $twoPi * $p);

        // Horned head dips with heavy inertia 2 frames after heel thud
        $headDrop = -1.2 * pow(abs(sin($twoPi * ($p - 2.0 / 24.0))), 0.75) + 1.0;
        $pose['headDx'] = $pose['frontTorsoDx'] + ($fx !== 0 ? $fx * 0.4 : -0.4 * $weightShift);
        $pose['headDy'] = $headDrop;
        $pose['headRot'] = ($fx !== 0 ? $fx : 1) * 0.04 * cos(2.0 * $twoPi * ($p - 0.08));

        foreach (['L' => 0.00, 'R' => 0.50] as $role => $off) {
            $eval = evaluateGaitLimb($p + $off, 0.62, 1.1);
            $signX = $role === 'R' ? 1.0 : -1.0;
            [$fdx, $fdy] = projectStrideToView($view, $eval['stride'], $eval['lift'], $signX, 4.8);
            $pose['limbs']['leg_' . $role] = [
                'hipDx' => $pose['rearTorsoDx'],
                'hipDy' => $pose['rearTorsoDy'],
                'endDx' => $fdx,
                'endDy' => $fdy,
                'flexBias' => ($view === 2 || $view === 6) ? (1.2 + 1.8 * $eval['lift']) * $signX : 2.1 * $eval['lift'],
                'footFlat' => $eval['lift'] > 0.15 ? 0.25 : 0.04,
            ];
        }

        // Heavy clawed arms pump rhythmically in opposition
        foreach (['L' => 0.50, 'R' => 0.00] as $role => $off) {
            $swing = sin($twoPi * ($p + $off));
            $signX = $role === 'R' ? 1.0 : -1.0;
            if ($view === 0 || $view === 4) {
                $adx = ($fx !== 0 ? $fx : 1) * 4.5 * $swing;
                $ady = -1.4 * max(0.0, $swing) + 0.5;
            } elseif ($view === 2 || $view === 6) {
                $adx = $signX * (1.1 + 0.9 * $swing);
                $ady = -1.8 * max(0.0, $swing) + 1.0 * max(0.0, -$swing);
            } else {
                $adx = $fx * 3.4 * $swing + $signX * 0.5;
                $ady = -1.1 * abs($swing) + ($rig['facingY'] ?? 0) * 1.1 * $swing;
            }
            $pose['limbs']['arm_' . $role] = [
                'hipDx' => $pose['frontTorsoDx'],
                'hipDy' => $pose['frontTorsoDy'],
                'endDx' => $adx,
                'endDy' => $ady,
                'flexBias' => 1.8 + 1.4 * max(0.0, $swing),
                'footFlat' => 0.72,
            ];
        }
    }

    return $pose;
}

// ---------------------------------------------------------------------------
// Frame Compositor & Preview Generator
// ---------------------------------------------------------------------------

/**
 * Renders one articulated frame by solving limb IK and compositing layers back-to-front.
 */
function renderWalkFrame(
    array $segments,
    array $rig,
    array $idleGrid,
    string $gait,
    int $view,
    int $frameIndex,
    int $size
): array {
    $pose = computeSpeciesPose($gait, $view, $frameIndex, $rig);
    $canvas = array_fill(0, $size, array_fill(0, $size, [0, 0, 0, 127]));

    $isBiped = in_array($gait, ['skeleton_walk', 'imp_bound', 'fiend_march'], true);
    $limbKeyPrefix = $isBiped ? 'leg_' : '';

    // 1. Far legs (depth 1) & Far arms (depth 1) behind torso
    foreach ($segments['arms'] as $armData) {
        if (($armData['spec']['depth'] ?? 3) > 1) {
            continue;
        }
        $key = 'arm_' . $armData['spec']['role'];
        $lp = $pose['limbs'][$key];
        [$ax, $ay, $bx, $by, $cx, $cy] = $armData['spec']['joints'];
        $ik = solveTwoBoneIK(
            (float) $ax,
            (float) $ay,
            (float) $bx,
            (float) $by,
            (float) $cx,
            (float) $cy,
            $ax + $lp['hipDx'],
            $ay + $lp['hipDy'],
            $cx + $lp['endDx'] + $lp['hipDx'] * 0.5,
            $cy + $lp['endDy'] + $lp['hipDy'] * 0.5,
            (int) ($armData['spec']['bendX'] ?? 1),
            (float) ($lp['flexBias'] ?? 0.0)
        );
        renderArticulatedLimb($canvas, $armData['grid'], $armData['spec']['joints'], $ik, $size, (float) $lp['footFlat']);
    }

    foreach ($segments['legs'] as $legData) {
        if (($legData['spec']['depth'] ?? 3) > 1) {
            continue;
        }
        $key = $limbKeyPrefix . $legData['spec']['role'];
        $lp = $pose['limbs'][$key];
        [$ax, $ay, $bx, $by, $cx, $cy] = $legData['spec']['joints'];
        $ik = solveTwoBoneIK(
            (float) $ax,
            (float) $ay,
            (float) $bx,
            (float) $by,
            (float) $cx,
            (float) $cy,
            $ax + $lp['hipDx'],
            $ay + $lp['hipDy'],
            $cx + $lp['endDx'],
            $cy + $lp['endDy'],
            (int) ($legData['spec']['bendX'] ?? 1),
            (float) ($lp['flexBias'] ?? 0.0)
        );
        renderArticulatedLimb($canvas, $legData['grid'], $legData['spec']['joints'], $ik, $size, (float) $lp['footFlat']);
    }

    // 2. Tail behind torso when facing toward viewer (or above back)
    if (isset($rig['tail']) && in_array($view, [0, 1, 3, 4], true)) {
        [$tpx, $tpy] = $rig['tail']['pivot'];
        renderTransformedPart(
            $canvas,
            $segments['tail'],
            $size,
            (float) $tpx,
            (float) $tpy,
            $pose['tailDx'],
            $pose['tailDy'],
            0.0,
            $pose['tailShearX'],
            $pose['tailShearY']
        );
    }

    // 3. Flexed Torso
    renderFlexedTorso($canvas, $segments['torso'], $rig, $pose, $size);

    // 4. Tail in front on rear/NW/NE views (6, 5, 7)
    if (isset($rig['tail']) && in_array($view, [2, 5, 6, 7], true)) {
        [$tpx, $tpy] = $rig['tail']['pivot'];
        renderTransformedPart(
            $canvas,
            $segments['tail'],
            $size,
            (float) $tpx,
            (float) $tpy,
            $pose['tailDx'],
            $pose['tailDy'],
            0.0,
            $pose['tailShearX'],
            $pose['tailShearY']
        );
    }

    // 5. Mid-depth legs (depth 2)
    foreach ($segments['legs'] as $legData) {
        if (($legData['spec']['depth'] ?? 3) !== 2) {
            continue;
        }
        $key = $limbKeyPrefix . $legData['spec']['role'];
        $lp = $pose['limbs'][$key];
        [$ax, $ay, $bx, $by, $cx, $cy] = $legData['spec']['joints'];
        $ik = solveTwoBoneIK(
            (float) $ax,
            (float) $ay,
            (float) $bx,
            (float) $by,
            (float) $cx,
            (float) $cy,
            $ax + $lp['hipDx'],
            $ay + $lp['hipDy'],
            $cx + $lp['endDx'],
            $cy + $lp['endDy'],
            (int) ($legData['spec']['bendX'] ?? 1),
            (float) ($lp['flexBias'] ?? 0.0)
        );
        renderArticulatedLimb($canvas, $legData['grid'], $legData['spec']['joints'], $ik, $size, (float) $lp['footFlat']);
    }

    // 6. Wings (for dragon) behind head on South view, on shoulders otherwise
    if (isset($rig['wing']) && in_array($view, [0, 1, 2, 3, 4], true)) {
        [$wpx, $wpy] = $rig['wing']['pivot'];
        renderTransformedPart(
            $canvas,
            $segments['wing'],
            $size,
            (float) $wpx,
            (float) $wpy,
            $pose['wingDx'],
            $pose['wingDy'],
            $pose['wingRot'],
            0.0,
            $pose['wingShearY']
        );
    }

    // 7. Head / Snout / Horns (with neck overlap on top of torso shoulders)
    if (isset($rig['head'])) {
        [$hpx, $hpy] = $rig['head']['pivot'];
        renderTransformedPart(
            $canvas,
            $segments['head'],
            $size,
            (float) $hpx,
            (float) $hpy,
            $pose['headDx'],
            $pose['headDy'],
            $pose['headRot']
        );
    }

    // 8. Wings on back/NW/NE views (drawn cleanly on top of back)
    if (isset($rig['wing']) && in_array($view, [5, 6, 7], true)) {
        [$wpx, $wpy] = $rig['wing']['pivot'];
        renderTransformedPart(
            $canvas,
            $segments['wing'],
            $size,
            (float) $wpx,
            (float) $wpy,
            $pose['wingDx'],
            $pose['wingDy'],
            $pose['wingRot'],
            0.0,
            $pose['wingShearY']
        );
    }

    // 9. Near legs (depth 3) & Near arms (depth 3)
    foreach ($segments['legs'] as $legData) {
        if (($legData['spec']['depth'] ?? 3) < 3) {
            continue;
        }
        $key = $limbKeyPrefix . $legData['spec']['role'];
        $lp = $pose['limbs'][$key];
        [$ax, $ay, $bx, $by, $cx, $cy] = $legData['spec']['joints'];
        $ik = solveTwoBoneIK(
            (float) $ax,
            (float) $ay,
            (float) $bx,
            (float) $by,
            (float) $cx,
            (float) $cy,
            $ax + $lp['hipDx'],
            $ay + $lp['hipDy'],
            $cx + $lp['endDx'],
            $cy + $lp['endDy'],
            (int) ($legData['spec']['bendX'] ?? 1),
            (float) ($lp['flexBias'] ?? 0.0)
        );
        renderArticulatedLimb($canvas, $legData['grid'], $legData['spec']['joints'], $ik, $size, (float) $lp['footFlat']);
    }

    foreach ($segments['arms'] as $armData) {
        if (($armData['spec']['depth'] ?? 3) < 3) {
            continue;
        }
        $key = 'arm_' . $armData['spec']['role'];
        $lp = $pose['limbs'][$key];
        [$ax, $ay, $bx, $by, $cx, $cy] = $armData['spec']['joints'];
        $ik = solveTwoBoneIK(
            (float) $ax,
            (float) $ay,
            (float) $bx,
            (float) $by,
            (float) $cx,
            (float) $cy,
            $ax + $lp['hipDx'],
            $ay + $lp['hipDy'],
            $cx + $lp['endDx'] + $lp['hipDx'] * 0.5,
            $cy + $lp['endDy'] + $lp['hipDy'] * 0.5,
            (int) ($armData['spec']['bendX'] ?? 1),
            (float) ($lp['flexBias'] ?? 0.0)
        );
        renderArticulatedLimb($canvas, $armData['grid'], $armData['spec']['joints'], $ik, $size, (float) $lp['footFlat']);
    }

    return polishFramePixels($canvas, $idleGrid, $size);
}

/**
 * Generates a x3 nearest-neighbor inspection preview PNG showing idle + 8 key
 * cycle frames `[0, 1, 4, 7, 10, 13, 16, 19, 22]` for a target direction view.
 */
function buildPreviewSheet(array $atlases, array $speciesCatalog, int $view, string $outPath): void
{
    $sampleOffsets = [0, 1, 4, 7, 10, 13, 16, 19, 22];
    $scale = 3;
    $cellPad = 8;
    $speciesList = array_keys($speciesCatalog);

    $maxWidth = 0;
    $totalHeight = 16;
    foreach ($speciesList as $name) {
        $size = $speciesCatalog[$name]['size'];
        $maxWidth = max($maxWidth, count($sampleOffsets) * ($size * $scale + $cellPad) + 24);
        $totalHeight += $size * $scale + 28;
    }

    $preview = imagecreatetruecolor($maxWidth, $totalHeight);
    imagealphablending($preview, true);
    $bgDark = imagecolorallocate($preview, 26, 30, 38);
    $bgCell = imagecolorallocate($preview, 38, 44, 56);
    $bgGrid = imagecolorallocate($preview, 48, 56, 70);
    $textColor = imagecolorallocate($preview, 225, 232, 240);
    imagefill($preview, 0, 0, $bgDark);

    $cursorY = 12;
    foreach ($speciesList as $name) {
        $size = $speciesCatalog[$name]['size'];
        $atlas = $atlases[$name];
        $scaled = $size * $scale;
        imagestring($preview, 3, 12, $cursorY, strtoupper($name) . " (view {$view}, {$size}x{$size} x{$scale})", $textColor);
        $cursorY += 18;

        foreach ($sampleOffsets as $idx => $offset) {
            $cellX = 12 + $idx * ($scaled + $cellPad);
            imagefilledrectangle($preview, $cellX, $cursorY, $cellX + $scaled - 1, $cursorY + $scaled - 1, $bgCell);
            imagerectangle($preview, $cellX, $cursorY, $cellX + $scaled - 1, $cursorY + $scaled - 1, $bgGrid);

            $slot = $view * SLOTS_PER_VIEW + $offset;
            $ox = ($slot % ATLAS_COLUMNS) * $size;
            $oy = intdiv($slot, ATLAS_COLUMNS) * $size;
            imagecopyresized($preview, $atlas, $cellX, $cursorY, $ox, $oy, $scaled, $scaled, $size, $size);

            $label = $offset === 0 ? 'IDLE' : 'F' . $offset;
            imagestring($preview, 2, $cellX + 4, $cursorY + 3, $label, $textColor);
        }

        $cursorY += $scaled + 10;
    }

    if (!is_dir(dirname($outPath))) {
        mkdir(dirname($outPath), 0775, true);
    }
    imagepng($preview, $outPath);
    imagedestroy($preview);
}

// ---------------------------------------------------------------------------
// Main Execution
// ---------------------------------------------------------------------------

if (!extension_loaded('gd')) {
    fwrite(STDERR, "The PHP GD extension is required (run with `php -d extension=gd`).\n");
    exit(1);
}

$speciesCatalog = buildSpeciesCatalog();
$generatedAtlases = [];

foreach ($speciesCatalog as $name => $config) {
    $size = $config['size'];
    $archivePath = $archiveDir . '/' . $name . '.png';
    $outPath = $outputDir . '/' . $name . '.png';
    $srcPath = is_file($archivePath) ? $archivePath : $outPath;

    if (!is_file($srcPath)) {
        fwrite(STDERR, "Missing source sprite sheet for {$name}: {$srcPath}\n");
        exit(1);
    }

    $srcAtlas = imagecreatefrompng($srcPath);
    $dstAtlas = createBlankCanvas($size * ATLAS_COLUMNS, $size * ATLAS_ROWS);

    // Pre-extract all 8 idle frames so mirrored view centroids match pixel-accurately
    $idleGrids = [];
    $idleBounds = [];
    for ($v = 0; $v < 8; $v++) {
        $idleGrids[$v] = extractSlotPixels($srcAtlas, $size, $v * SLOTS_PER_VIEW);
        $idleBounds[$v] = measureBounds($idleGrids[$v], $size);
    }

    // Complete views 3, 4, 7 via exact centroid-aligned mirroring from 1, 0, 5
    $views = $config['views'];
    foreach ([[1, 3], [0, 4], [5, 7]] as [$srcV, $dstV]) {
        $expectedCx = $size - 1 - $idleBounds[$srcV]['cx'];
        $dx = (int) round($idleBounds[$dstV]['cx'] - $expectedCx);
        $views[$dstV] = mirrorViewRig($views[$srcV], $size, $dx);
    }

    for ($v = 0; $v < 8; $v++) {
        $baseSlot = $v * SLOTS_PER_VIEW;

        // Preserve idle (slot 0) and attack frames (slots 25..27) verbatim
        copyAtlasSlot($srcAtlas, $dstAtlas, $size, $baseSlot);
        for ($atk = 25; $atk <= 27; $atk++) {
            copyAtlasSlot($srcAtlas, $dstAtlas, $size, $baseSlot + $atk);
        }

        $segments = segmentViewSprite($idleGrids[$v], $views[$v], $size);

        for ($f = 0; $f < WALK_FRAMES; $f++) {
            $walkGrid = renderWalkFrame(
                $segments,
                $views[$v],
                $idleGrids[$v],
                $config['gait'],
                $v,
                $f,
                $size
            );
            writeSlotPixels($dstAtlas, $size, $baseSlot + 1 + $f, $walkGrid);
        }
    }

    imagepng($dstAtlas, $outPath);
    $generatedAtlases[$name] = $dstAtlas;
    imagedestroy($srcAtlas);
    echo "Generated {$name}.png (" . ($size * ATLAS_COLUMNS) . 'x' . ($size * ATLAS_ROWS) . ")\n";
}

// Render x3 nearest-neighbor inspection preview sheets into PIxel/ (gitignored)
if (is_dir($archiveDir)) {
    buildPreviewSheet($generatedAtlases, $speciesCatalog, 0, $previewDir . '/phases-profil-anatomie.png');
    buildPreviewSheet($generatedAtlases, $speciesCatalog, 2, $previewDir . '/phases-face-anatomie.png');
    buildPreviewSheet($generatedAtlases, $speciesCatalog, 1, $previewDir . '/phases-3-4-anatomie.png');
    echo "Generated preview sheets in {$previewDir}\n";
}

foreach ($generatedAtlases as $atlas) {
    imagedestroy($atlas);
}
