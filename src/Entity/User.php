<?php

declare(strict_types=1);

namespace App\Entity;

use App\Repository\UserRepository;
use Doctrine\ORM\Mapping as ORM;
use Symfony\Component\Security\Core\User\PasswordAuthenticatedUserInterface;
use Symfony\Component\Security\Core\User\UserInterface;

#[ORM\Entity(repositoryClass: UserRepository::class)]
#[ORM\Table(name: 'player_account')]
class User implements UserInterface, PasswordAuthenticatedUserInterface
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $password = '';

    public function __construct(
        #[ORM\Column(length: 40, unique: true)]
        private string $nickname,
        #[ORM\Column(length: 40, unique: true)]
        private string $nicknameKey,
        #[ORM\Column(length: 254, unique: true)]
        private string $email,
    ) {
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getNickname(): string
    {
        return $this->nickname;
    }

    public function getUserIdentifier(): string
    {
        return $this->email;
    }

    public function getRoles(): array
    {
        return ['ROLE_USER'];
    }

    public function getPassword(): string
    {
        return $this->password;
    }

    public function setPassword(string $passwordHash): void
    {
        $this->password = $passwordHash;
    }

    public function eraseCredentials(): void
    {
    }

    public function __serialize(): array
    {
        return [
            'id' => $this->id,
            'nickname' => $this->nickname,
            'nicknameKey' => $this->nicknameKey,
            'email' => $this->email,
            'password' => hash('crc32c', $this->password),
        ];
    }
}
