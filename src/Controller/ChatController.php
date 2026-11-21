<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\PlayerCharacter;
use App\Entity\User;
use Doctrine\DBAL\Connection;
use Doctrine\DBAL\Platforms\PostgreSQLPlatform;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Exception\JsonException;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;

final class ChatController extends AbstractController
{
    #[Route('/personnages/{id}/tchat', name: 'character_chat', requirements: ['id' => '\d+'], methods: ['POST'])]
    public function chat(int $id, Request $request, #[CurrentUser] User $owner, EntityManagerInterface $entities): Response
    {
        $character = $entities->getRepository(PlayerCharacter::class)->findOneBy(['id' => $id, 'owner' => $owner]);
        if (!$character) throw $this->createNotFoundException();
        if (strlen($request->getContent()) > 4096) return $this->json(['error' => 'Requête trop volumineuse.'], 413);
        try { $data = $request->toArray(); }
        catch (JsonException) { return $this->json(['error' => 'JSON invalide.'], 400); }
        if (!is_string($data['_token'] ?? null) || !$this->isCsrfTokenValid('character_progress_'.$id, $data['_token'])) {
            return $this->json(['error' => 'Session expirée. Recharge le jeu.'], 403);
        }
        $after = $data['after'] ?? 0;
        if (!is_int($after) || $after < 0 || !in_array($data['action'] ?? null, ['poll', 'send', 'invite', 'answer', 'leave'], true)) {
            return $this->json(['error' => 'Commande invalide.'], 400);
        }
        $db = $entities->getConnection();
        $now = microtime(true);
        try {
            if ($data['action'] !== 'poll') {
                $db->transactional(function (Connection $db) use ($character, $id, $data, $now, $owner): void {
                    $ownerId = $owner->getId();
                    $db->executeStatement('INSERT INTO chat_sender(owner_id, last_sent) VALUES (?, 0) ON CONFLICT(owner_id) DO NOTHING', [$ownerId]);
                    $last = (float) $db->fetchOne('SELECT last_sent FROM chat_sender WHERE owner_id = ?'.$this->lock($db), [$ownerId]);
                    if ($data['action'] === 'send') {
                        $this->send($db, $character, $data, $now, $last, $ownerId);
                    } elseif ($data['action'] === 'invite') {
                        if ($now - $last < 1) throw new \InvalidArgumentException('Attends une seconde avant de réessayer.');
                        $this->invite($db, $id, $data, $now);
                        $db->update('chat_sender', ['last_sent' => $now], ['owner_id' => $ownerId]);
                    } elseif ($data['action'] === 'answer') {
                        if (!is_bool($data['accept'] ?? null)) throw new \InvalidArgumentException('Réponse invalide.');
                        $invite = $db->fetchAssociative('SELECT party_id FROM chat_invite WHERE target_id = ? AND expires_at > ?', [$id, $now]);
                        if (!$invite || !is_int($data['invitation'] ?? null) || $data['invitation'] !== (int) $invite['party_id']) throw new \InvalidArgumentException('Cette invitation a expiré ou a changé.');
                        $party = $this->party($db, (int) $invite['party_id']);
                        if ($data['accept']) {
                            if (!$party || $db->fetchOne('SELECT party_id FROM chat_member WHERE character_id = ?', [$id])) throw new \InvalidArgumentException('Tu es déjà dans un groupe ou il a été dissous.');
                            if ((int) $db->fetchOne('SELECT COUNT(*) FROM chat_member WHERE party_id = ?', [$party['id']]) >= 5) throw new \InvalidArgumentException('Ce groupe est complet (5 joueurs).');
                            $db->insert('chat_member', ['character_id' => $id, 'party_id' => $party['id']]);
                        }
                        $db->delete('chat_invite', ['target_id' => $id]);
                    } else {
                        $partyId = $db->fetchOne('SELECT party_id FROM chat_member WHERE character_id = ?', [$id]);
                        if ($partyId) {
                            if (!is_int($data['party'] ?? null) || $data['party'] !== (int) $partyId) throw new \InvalidArgumentException('Le groupe a changé. Actualise le tchat.');
                            $party = $this->party($db, (int) $partyId);
                            if ($party && (int) $party['leader_id'] === $id) $db->delete('chat_party', ['id' => $partyId]);
                            else $db->delete('chat_member', ['character_id' => $id]);
                        }
                    }
                });
            }
        } catch (\InvalidArgumentException $error) {
            return $this->json(['error' => $error->getMessage()], 400);
        }
        // Nettoyage hors transaction d'action : aucun verrou de groupe/bail n'est conservé.
        $db->executeStatement('DELETE FROM chat_message WHERE created_at < ?', [$now - 604800]);
        $db->executeStatement('DELETE FROM chat_invite WHERE expires_at < ?', [$now]);
        $response = $this->json($this->snapshot($db, $id, $after, $now));
        $response->headers->set('Cache-Control', 'no-store, private');
        return $response;
    }

    private function lock(Connection $db): string { return $db->getDatabasePlatform() instanceof PostgreSQLPlatform ? ' FOR UPDATE' : ''; }
    private function party(Connection $db, int $id): array|false { return $db->fetchAssociative('SELECT * FROM chat_party WHERE id = ?'.$this->lock($db), [$id]); }

    private function target(Connection $db, mixed $value, float $now): int
    {
        if (!is_string($value) || mb_strlen($value) > 60) throw new \InvalidArgumentException('Choisis un personnage destinataire.');
        $value = trim($value);
        if ($value === '') throw new \InvalidArgumentException('Choisis un personnage destinataire.');
        $players = $db->fetchAllAssociative('SELECT c.id, c.name FROM PlayerCharacter c JOIN world_presence p ON p.character_id = c.id WHERE p.updated_at > ?', [$now - 12]);
        $matches = array_values(array_filter($players, static fn ($p) => preg_match('/#(\d+)$/D', $value, $m)
            ? (int) $p['id'] === (int) $m[1] : mb_strtolower($p['name']) === mb_strtolower(trim($value))));
        if (count($matches) !== 1) throw new \InvalidArgumentException('Personnage hors ligne ou nom ambigu : choisis son nom avec #numéro.');
        return (int) $matches[0]['id'];
    }

    private function invite(Connection $db, int $id, array $data, float $now): void
    {
        $target = $this->target($db, $data['target'] ?? null, $now);
        if ($target === $id || $db->fetchOne('SELECT party_id FROM chat_member WHERE character_id = ?', [$target])) throw new \InvalidArgumentException('Ce personnage est déjà en groupe ou c’est toi.');
        $partyId = $db->fetchOne('SELECT party_id FROM chat_member WHERE character_id = ?', [$id]);
        if (!$partyId) {
            $partyId = (int) $db->fetchOne('INSERT INTO chat_party(leader_id) VALUES (?) RETURNING id', [$id]);
            $db->insert('chat_member', ['character_id' => $id, 'party_id' => $partyId]);
        }
        $party = $this->party($db, (int) $partyId);
        if (!$party || (int) $party['leader_id'] !== $id) throw new \InvalidArgumentException('Seul le chef peut inviter.');
        if ((int) $db->fetchOne('SELECT COUNT(*) FROM chat_member WHERE party_id = ?', [$partyId]) >= 5) throw new \InvalidArgumentException('Le groupe est complet.');
        $pending = $db->fetchOne('SELECT expires_at FROM chat_invite WHERE target_id = ?', [$target]);
        if ($pending && (float) $pending > $now) throw new \InvalidArgumentException('Ce personnage a déjà une invitation en attente.');
        $invited = $db->executeStatement('INSERT INTO chat_invite(target_id, party_id, expires_at) VALUES (?, ?, ?) ON CONFLICT(target_id) DO UPDATE SET party_id = excluded.party_id, expires_at = excluded.expires_at WHERE chat_invite.expires_at <= ?', [$target, $partyId, $now + 120, $now]);
        if (!$invited) throw new \InvalidArgumentException('Ce personnage a déjà une invitation en attente.');
    }

    private function send(Connection $db, PlayerCharacter $character, array $data, float $now, float $last, int $ownerId): void
    {
        $id = $character->getId();
        $nonce = $data['nonce'] ?? null;
        $body = $data['text'] ?? null;
        $channel = $data['channel'] ?? null;
        if (!is_string($nonce) || !preg_match('/^[a-f0-9-]{36}$/D', $nonce) || !is_string($body)
            || !mb_check_encoding($body, 'UTF-8') || mb_strlen(trim($body)) < 1 || mb_strlen($body) > 500
            || preg_match('/[\x00-\x1f\x7f]/u', $body) || !in_array($channel, ['global', 'group', 'whisper', 'nearby'], true)) throw new \InvalidArgumentException('Message invalide (1 à 500 caractères, une seule ligne).');
        if ($db->fetchOne('SELECT id FROM chat_message WHERE sender_id = ? AND nonce = ?', [$id, $nonce])) return;
        if ($now - $last < 1) throw new \InvalidArgumentException('Attends une seconde entre deux messages.');
        $recipients = [$id]; $partyId = null; $target = null; $targetName = null;
        if ($channel === 'whisper') {
            $target = $this->target($db, $data['target'] ?? null, $now); $recipients[] = $target;
            $targetName = $db->fetchOne('SELECT name FROM PlayerCharacter WHERE id = ?', [$target]);
        }
        if ($channel === 'group') {
            $partyId = $db->fetchOne('SELECT party_id FROM chat_member WHERE character_id = ?', [$id]);
            if (!$partyId || !$this->party($db, (int) $partyId)) throw new \InvalidArgumentException('Rejoins un groupe pour utiliser ce canal.');
            $recipients = $db->fetchFirstColumn('SELECT character_id FROM chat_member WHERE party_id = ?', [$partyId]);
        }
        if ($channel === 'nearby') {
            $rows = $db->fetchAllAssociative('SELECT character_id, state FROM world_presence WHERE updated_at > ?', [$now - 12]);
            $positions = [];
            foreach ($rows as $row) $positions[(int) $row['character_id']] = json_decode($row['state'], true, 32, JSON_THROW_ON_ERROR);
            if (!isset($positions[$id]['x'])) throw new \InvalidArgumentException('Attends la connexion au monde pour parler à proximité.');
            foreach ($positions as $other => $position) if (hypot($position['x'] - $positions[$id]['x'], $position['y'] - $positions[$id]['y']) <= 192) $recipients[] = $other;
        }
        $message = (int) $db->fetchOne('INSERT INTO chat_message(sender_id, sender_name, target_id, target_name, channel, body, nonce, party_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id', [$id, $character->getName(), $target, $targetName, $channel, trim($body), $nonce, $partyId ?: null, $now]);
        if ($channel !== 'global') foreach (array_unique($recipients) as $recipient) $db->insert('chat_delivery', ['message_id' => $message, 'character_id' => $recipient]);
        $db->update('chat_sender', ['last_sent' => $now], ['owner_id' => $ownerId]);
    }

    private function snapshot(Connection $db, int $id, int $after, float $now): array
    {
        $party = $db->fetchAssociative('SELECT p.id, p.leader_id FROM chat_party p JOIN chat_member m ON m.party_id = p.id WHERE m.character_id = ?', [$id]);
        $messages = $db->fetchAllAssociative("SELECT m.id, m.sender_id, m.sender_name, m.target_id, m.target_name, m.channel, m.body, m.created_at FROM chat_message m WHERE m.id > ? AND (m.channel = 'global' OR (EXISTS (SELECT 1 FROM chat_delivery d WHERE d.message_id = m.id AND d.character_id = ?) AND (m.channel <> 'group' OR m.party_id = ?))) ORDER BY m.id ".($after ? 'ASC' : 'DESC').' LIMIT 50', [$after, $id, $party['id'] ?? 0]);
        if (!$after) $messages = array_reverse($messages);
        foreach ($messages as &$message) { $message['id'] = (int) $message['id']; $message['sender_id'] = $message['sender_id'] === null ? null : (int) $message['sender_id']; }
        unset($message);
        $members = $party ? $db->fetchAllAssociative('SELECT c.id, c.name FROM PlayerCharacter c JOIN chat_member m ON m.character_id = c.id WHERE m.party_id = ? ORDER BY c.id', [$party['id']]) : [];
        $invite = $db->fetchAssociative('SELECT p.id, c.name FROM chat_invite i JOIN chat_party p ON p.id = i.party_id JOIN PlayerCharacter c ON c.id = p.leader_id WHERE i.target_id = ? AND i.expires_at > ?', [$id, $now]);
        $online = $db->fetchAllAssociative('SELECT c.id, c.name FROM PlayerCharacter c JOIN world_presence p ON p.character_id = c.id WHERE p.updated_at > ? ORDER BY c.name LIMIT 100', [$now - 12]);
        return ['messages' => $messages, 'cursor' => $messages ? max(array_column($messages, 'id')) : $after,
            'party' => $party ? ['id' => (int) $party['id'], 'leader' => (int) $party['leader_id'], 'members' => $members] : null,
            'invitation' => $invite ?: null, 'online' => $online];
    }
}
