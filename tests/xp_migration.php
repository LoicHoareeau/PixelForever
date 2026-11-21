<?php

declare(strict_types=1);

require dirname(__DIR__).'/vendor/autoload.php';
require dirname(__DIR__).'/migrations/Version20261120090000.php';

use App\Game\Balance;
use Doctrine\DBAL\DriverManager;
use Doctrine\DBAL\Schema\Schema;
use DoctrineMigrations\Version20261120090000;
use Psr\Log\NullLogger;

$db = DriverManager::getConnection(['driver' => 'pdo_sqlite', 'memory' => true]);
$db->executeStatement('CREATE TABLE PlayerCharacter (id INTEGER PRIMARY KEY, level INTEGER, experience INTEGER)');
$cases = [];
foreach ([1, 9, 10, 29, 30, 60, 9999] as $level) {
    foreach ([0, .57, .999] as $ratio) {
        $id = count($cases) + 1;
        $xp = (int) floor((100 + 50 * ($level - 1)) * $ratio);
        $cases[$id] = [$level, $xp];
        $db->insert('PlayerCharacter', ['id' => $id, 'level' => $level, 'experience' => $xp]);
    }
}
$migration = new Version20261120090000($db, new NullLogger());
$migration->up(new Schema());
foreach ($migration->getSql() as $query) $db->executeStatement($query->getStatement());
foreach ($db->fetchAllAssociative('SELECT * FROM PlayerCharacter') as $row) {
    [$level, $xp] = $cases[$row['id']];
    $expected = (int) floor($xp * Balance::xpRequired($level) / (100 + 50 * ($level - 1)));
    if ((int) $row['level'] !== $level || (int) $row['experience'] !== $expected) throw new RuntimeException('Conversion XP incorrecte.');
}
$migration = new Version20261120090000($db, new NullLogger());
$migration->down(new Schema());
foreach ($migration->getSql() as $query) $db->executeStatement($query->getStatement());
foreach ($db->fetchAllAssociative('SELECT * FROM PlayerCharacter') as $row) {
    [$level, $xp] = $cases[$row['id']];
    if ((int) $row['level'] !== $level || abs((int) $row['experience'] - $xp) > 1) throw new RuntimeException('Retour du barème incorrect.');
}
echo "Migration XP aller/retour validée sur 21 progressions.\n";
