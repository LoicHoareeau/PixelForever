<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261120090000 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Convertir proportionnellement l’XP sans changer les niveaux et stocker la présence multijoueur.';
    }

    public function up(Schema $schema): void
    {
        // Formule figée : une migration historique ne dépend pas du barème courant.
        $threshold = '((50 + 10 * level) * CASE WHEN level < 10 THEN 4 WHEN level < 30 THEN 5 ELSE 6 END)';
        $this->addSql('UPDATE PlayerCharacter SET experience = CAST(CAST(experience AS BIGINT) * '.$threshold.' / (100 + (level - 1) * 50) AS INTEGER)');
        $this->addSql('CREATE TABLE world_presence (character_id INTEGER PRIMARY KEY NOT NULL, lease VARCHAR(64) NOT NULL, state TEXT NOT NULL, updated_at DOUBLE PRECISION NOT NULL, CONSTRAINT FK_WORLD_CHARACTER FOREIGN KEY (character_id) REFERENCES PlayerCharacter (id) ON DELETE CASCADE)');
        $this->addSql('CREATE INDEX IDX_WORLD_UPDATED ON world_presence (updated_at)');
    }

    public function down(Schema $schema): void
    {
        $threshold = '((50 + 10 * level) * CASE WHEN level < 10 THEN 4 WHEN level < 30 THEN 5 ELSE 6 END)';
        $this->addSql('UPDATE PlayerCharacter SET experience = CAST(CAST(experience AS BIGINT) * (100 + (level - 1) * 50) / '.$threshold.' AS INTEGER)');
        $this->addSql('DROP TABLE world_presence');
    }
}
