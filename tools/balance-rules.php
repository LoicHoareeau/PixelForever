<?php

declare(strict_types=1);

require dirname(__DIR__).'/vendor/autoload.php';

$rules = [];
foreach (App\Game\CharacterClass::cases() as $class) {
    $rules[$class->value] = ['classKey' => $class->value, 'health' => $class->maxHealth(), 'mana' => $class->maxMana(),
        'basicDamage' => $class->damage(false), 'specialDamage' => $class->damage(true), 'range' => $class->attackRange(),
        'baseManaRegen' => $class->baseManaRegen(), 'specialManaCost' => $class->specialManaCost(), 'specialCastMs' => $class->specialCastMs(),
        'baseStats' => $class->baseStats(), 'growthStats' => $class->levelGrowthStats(), 'wandDamageMultiplier' => 1,
        'resourceName' => $class->resourceName(), 'ranged' => !in_array($class, [App\Game\CharacterClass::Warrior, App\Game\CharacterClass::Rogue], true)];
}
echo json_encode($rules, JSON_THROW_ON_ERROR | JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
