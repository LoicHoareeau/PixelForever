<?php

declare(strict_types=1);

namespace App\Controller;

use App\Entity\PlayerCharacter;
use App\Entity\User;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\Exception\JsonException;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\CurrentUser;
use Symfony\Component\DependencyInjection\Attribute\Autowire;

final class WorldController extends AbstractController
{
    public function __construct(#[Autowire('%env(APP_SECRET)%')] private readonly string $worldSecret) {}

    #[Route('/personnages/{id}/temps-reel', name: 'character_realtime', requirements: ['id' => '\d+'], methods: ['POST'])]
    public function ticket(int $id, Request $request, #[CurrentUser] User $owner, EntityManagerInterface $entities): Response
    {
        $character = $entities->getRepository(PlayerCharacter::class)->findOneBy(['id' => $id, 'owner' => $owner]);
        if (!$character) throw $this->createNotFoundException();
        if (strlen($request->getContent()) > 2048) return $this->json(['error' => 'Requête trop volumineuse.'], 413);
        try { $data = $request->toArray(); } catch (JsonException) { return $this->json(['error' => 'JSON invalide.'], 400); }
        if (!is_string($data['_token'] ?? null) || !$this->isCsrfTokenValid('character_progress_'.$id, $data['_token'])) {
            return $this->json(['error' => 'Session invalide.'], 403);
        }
        $lease = $data['lease'] ?? null;
        if (!is_string($lease) || !preg_match('/^[a-f0-9-]{36}$/D', $lease)) return $this->json(['error' => 'Bail invalide.'], 400);
        $row = $entities->getConnection()->fetchAssociative('SELECT lease, updated_at FROM world_presence WHERE character_id = ?', [$id]);
        if (!$row || $row['lease'] !== $lease || (float) $row['updated_at'] <= microtime(true) - 12) {
            return $this->json(['error' => 'Présence inactive.'], 409);
        }
        $profile = ['id' => $id, 'name' => $character->getName(), 'skin' => $character->getClass()->skin(),
            'level' => $character->getLevel(), 'lease' => $lease, 'exp' => time() + 45];
        $base64 = static fn (string $value): string => rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
        $payload = $base64(json_encode($profile, JSON_THROW_ON_ERROR));
        $response = $this->json(['ticket' => $payload.'.'.$base64(hash_hmac('sha256', $payload, $this->worldSecret, true)),
            'url' => $request->getBasePath().'/monde-socket']);
        $response->headers->set('Cache-Control', 'no-store, private');
        return $response;
    }

    #[Route('/personnages/{id}/monde', name: 'character_world', requirements: ['id' => '\d+'], methods: ['POST'])]
    public function sync(int $id, Request $request, #[CurrentUser] User $owner, EntityManagerInterface $entities): Response
    {
        $character = $entities->getRepository(PlayerCharacter::class)->findOneBy(['id' => $id, 'owner' => $owner]);
        if (!$character) throw $this->createNotFoundException();
        if (strlen($request->getContent()) > 2048) return $this->json(['error' => 'Requête trop volumineuse.'], 413);
        try {
            $data = $request->toArray();
        } catch (JsonException) {
            return $this->json(['error' => 'JSON invalide.'], 400);
        }
        if (!is_string($data['_token'] ?? null) || !$this->isCsrfTokenValid('character_progress_'.$id, $data['_token'])) {
            return $this->json(['error' => 'Session invalide.'], 403);
        }
        $lease = $data['lease'] ?? null;
        $state = $data['state'] ?? null;
        $directions = ['east', 'south-east', 'south', 'south-west', 'west', 'north-west', 'north', 'north-east'];
        if (!is_string($lease) || !preg_match('/^[a-f0-9-]{36}$/D', $lease) || !is_array($state)
            || !is_numeric($state['x'] ?? null) || !is_numeric($state['y'] ?? null)
            || !is_finite((float) $state['x']) || !is_finite((float) $state['y'])
            || $state['x'] < 0 || $state['x'] >= 4096 || $state['y'] < 0 || $state['y'] >= 4032
            || !in_array($state['facing'] ?? null, $directions, true)
            || !is_bool($state['walking'] ?? null) || !is_bool($state['alive'] ?? null)
            || !is_int($state['attackFrame'] ?? null) || $state['attackFrame'] < -1 || $state['attackFrame'] > 8
            || !is_bool($state['ranged'] ?? null)) {
            return $this->json(['error' => 'Présence invalide.'], 400);
        }
        $actions = $state['actions'] ?? [];
        if (!is_array($actions) || !array_is_list($actions) || count($actions) > 6) return $this->json(['error' => 'Animations invalides.'], 400);
        foreach ($actions as $action) {
            if (!is_array($action) || !array_is_list($action) || count($action) !== 6
                || !is_string($action[0]) || $action[0] === $lease || !preg_match('/^[a-f0-9-]{36}$/D', $action[0])
                || !is_int($action[1]) || $action[1] < 0 || $action[1] > 6000
                || !is_int($action[2]) || $action[2] < 1 || $action[2] > 5000
                || !is_int($action[3]) || $action[3] < 0 || $action[3] > $action[2] + 210
                || !is_bool($action[4]) || !is_int($action[5]) || $action[5] < 0 || $action[5] > 7) {
                return $this->json(['error' => 'Animation invalide.'], 400);
            }
        }
        // La présence ne crédite aucune action : positions et poses sont uniquement visuelles.
        $public = ['id' => $id, 'name' => $character->getName(), 'skin' => $character->getClass()->skin(),
            'level' => $character->getLevel(), 'x' => (float) $state['x'], 'y' => (float) $state['y'],
            'facing' => $state['facing'], 'walking' => $state['walking'], 'alive' => $state['alive'],
            'attackFrame' => $state['attackFrame'], 'ranged' => $state['ranged']];
        $connection = $entities->getConnection();
        $now = microtime(true);
        $result = $connection->transactional(function ($db) use ($id, $lease, $public, $now, $data, $actions): array {
            $db->executeStatement("INSERT INTO world_presence (character_id, lease, state, updated_at) VALUES (?, ?, '{}', 0) ON CONFLICT (character_id) DO NOTHING", [$id, $lease]);
            $lock = $db->getDatabasePlatform() instanceof \Doctrine\DBAL\Platforms\PostgreSQLPlatform ? ' FOR UPDATE' : '';
            $row = $db->fetchAssociative('SELECT lease, updated_at, state FROM world_presence WHERE character_id = ?'.$lock, [$id]);
            $now = microtime(true);
            if ($row['lease'] !== $lease && (float) $row['updated_at'] > $now - 12) {
                return ['status' => 409, 'body' => ['error' => 'Ce personnage est déjà connecté dans un autre onglet.']];
            }
            if (($data['leave'] ?? false) === true) {
                $db->executeStatement('DELETE FROM world_presence WHERE character_id = ? AND lease = ?', [$id, $lease]);
                return ['status' => 200, 'body' => ['players' => []]];
            }
            if ((float) $row['updated_at'] > $now - .2) return ['status' => 429, 'body' => ['error' => 'Attends avant de resynchroniser.']];
            $previous = json_decode($row['state'], true, 32, JSON_THROW_ON_ERROR);
            $starts = [];
            foreach ($previous['actions'] ?? [] as $action) $starts[$action[0]] = $action;
            $public['updatedAt'] = $now * 1000;
            $public['actions'] = array_map(static function (array $action) use ($starts, $now): array {
                $previous = $starts[$action[0]] ?? null;
                $action[1] = $previous[1] ?? $now * 1000 - $action[1];
                if ($previous) $action[3] = min($action[3], $previous[3]);
                return $action;
            }, $actions);
            $db->executeStatement('UPDATE world_presence SET lease = ?, state = ?, updated_at = ? WHERE character_id = ?', [$lease, json_encode($public, JSON_THROW_ON_ERROR), $now, $id]);
            // shortcut: première carte unique ; partitionner spatialement avant plusieurs centaines de connexions.
            $players = [];
            foreach ($db->fetchAllAssociative('SELECT state FROM world_presence WHERE updated_at > ? AND character_id <> ? ORDER BY character_id', [$now - 12, $id]) as $other) {
                $player = json_decode($other['state'], true, 32, JSON_THROW_ON_ERROR);
                if (hypot($player['x'] - $public['x'], $player['y'] - $public['y']) <= 800) $players[] = $player;
                if (count($players) >= 100) break;
            }
            $onlineCount = (int) $db->fetchOne('SELECT COUNT(*) FROM world_presence WHERE updated_at > ?', [$now - 12]);
            return ['status' => 200, 'body' => ['players' => $players, 'onlineCount' => $onlineCount, 'serverTime' => microtime(true) * 1000]];
        });
        // Purger après libération du bail pour éviter les verrous croisés entre retours de joueurs.
        $connection->executeStatement('DELETE FROM world_presence WHERE updated_at < ?', [$now - 60]);
        $response = $this->json($result['body'], $result['status']);
        $response->headers->set('Cache-Control', 'no-store, private');
        return $response;
    }
}
