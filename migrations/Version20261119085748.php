<?php

declare(strict_types=1);

namespace DoctrineMigrations;

use Doctrine\DBAL\Schema\Schema;
use Doctrine\Migrations\AbstractMigration;

final class Version20261119085748 extends AbstractMigration
{
    public function getDescription(): string
    {
        return 'Créer les comptes et les personnages dans SQLite.';
    }

    public function up(Schema $schema): void
    {
        $this->addSql('CREATE TABLE player_account (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, password VARCHAR(255) NOT NULL, nickname VARCHAR(40) NOT NULL, nicknameKey VARCHAR(40) NOT NULL, email VARCHAR(254) NOT NULL)');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_1CC2A9E1A188FE64 ON player_account (nickname)');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_1CC2A9E1945F4935 ON player_account (nicknameKey)');
        $this->addSql('CREATE UNIQUE INDEX UNIQ_1CC2A9E1E7927C74 ON player_account (email)');
        $this->addSql('CREATE TABLE PlayerCharacter (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, level INTEGER NOT NULL, experience INTEGER NOT NULL, gold INTEGER NOT NULL, name VARCHAR(24) NOT NULL, class VARCHAR(16) NOT NULL, owner_id INTEGER NOT NULL, CONSTRAINT FK_B15908897E3C61F9 FOREIGN KEY (owner_id) REFERENCES player_account (id) ON DELETE CASCADE NOT DEFERRABLE INITIALLY IMMEDIATE)');
        $this->addSql('CREATE INDEX IDX_B15908897E3C61F9 ON PlayerCharacter (owner_id)');
    }

    public function down(Schema $schema): void
    {
        $this->addSql('DROP TABLE PlayerCharacter');
        $this->addSql('DROP TABLE player_account');
    }
}
