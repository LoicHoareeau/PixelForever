<?php
declare(strict_types=1);
$root=__DIR__.'/../public/game/val-des-saules/warlock/';
$equipped=imagecreatefrompng($root.'idle-equipped.png');
foreach (['east','south-east','south','south-west','west','north-west','north','north-east'] as $row=>$direction) {
    $source=imagecreatefrompng($root.$direction.'.png');
    imagepalettetotruecolor($source);
    $bottom=47;
    while ($bottom>0) {
        for ($x=0;$x<48;$x++) if ((imagecolorat($source,$x,$bottom)>>24&127)<75) break 2;
        $bottom--;
    }
    for ($y=0;$y<64;$y++) for ($x=0;$x<64;$x++) {
        $sx=$x-8; $sy=$y-54+$bottom;
        $expected=$sx>=0 && $sx<48 && $sy>=0 && $sy<48 ? imagecolorat($source,$sx,$sy) : 0x7f000000;
        $actual=imagecolorat($equipped,$row*64+$x,$y);
        if (($expected>>24&127)===127 && ($actual>>24&127)===127) continue;
        if ($expected!==$actual) throw new RuntimeException("Objet ajouté au Démoniste : $direction ($x,$y).");
    }
}
echo "Démoniste sans objet visible, personnage préservé dans huit directions.\n";
