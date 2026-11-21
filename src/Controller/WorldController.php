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

final class WorldController extends AbstractController
{
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
        // La présence ne crédite aucune action : positions et poses sont uniquement visuelles.
        $public = ['id' => $id, 'name' => $character->getName(), 'skin' => $character->getClass()->skin(),
            'level' => $character->getLevel(), 'x' => (float) $state['x'], 'y' => (float) $state['y'],
            'facing' => $state['facing'], 'walking' => $state['walking'], 'alive' => $state['alive'],
            'attackFrame' => $state['attackFrame'], 'ranged' => $state['ranged']];
        $connection = $entities->getConnection();
        $now = microtime(true);
        $result = $connection->transactional(function ($db) use ($id, $lease, $public, $now, $data): array {
            $db->executeStatement("INSERT INTO world_presence (character_id, lease, state, updated_at) VALUES (?, ?, '{}', 0) ON CONFLICT (character_id) DO NOTHING", [$id, $lease]);
            $lock = $db->getDatabasePlatform() instanceof \Doctrine\DBAL\Platforms\PostgreSQLPlatform ? ' FOR UPDATE' : '';
            $row = $db->fetchAssociative('SELECT lease, updated_at FROM world_presence WHERE character_id = ?'.$lock, [$id]);
            if ($row['lease'] !== $lease && (float) $row['updated_at'] > $now - 12) {
                return ['status' => 409, 'body' => ['error' => 'Ce personnage est déjà connecté dans un autre onglet.']];
            }
            if (($data['leave'] ?? false) === true) {
                $db->executeStatement('DELETE FROM world_presence WHERE character_id = ? AND lease = ?', [$id, $lease]);
                return ['status' => 200, 'body' => ['players' => []]];
            }
            if ((float) $row['updated_at'] > $now - .2) return ['status' => 429, 'body' => ['error' => 'Attends avant de resynchroniser.']];
            $db->executeStatement('UPDATE world_presence SET lease = ?, state = ?, updated_at = ? WHERE character_id = ?', [$lease, json_encode($public, JSON_THROW_ON_ERROR), $now, $id]);
            // shortcut: première carte unique ; partitionner spatialement avant plusieurs centaines de connexions.
            $players = [];
            foreach ($db->fetchAllAssociative('SELECT state FROM world_presence WHERE updated_at > ? AND character_id <> ? ORDER BY character_id', [$now - 12, $id]) as $other) {
                $player = json_decode($other['state'], true, 32, JSON_THROW_ON_ERROR);
                if (hypot($player['x'] - $public['x'], $player['y'] - $public['y']) <= 800) $players[] = $player;
                if (count($players) >= 100) break;
            }
            return ['status' => 200, 'body' => ['players' => $players]];
        });
        // Purger après libération du bail pour éviter les verrous croisés entre retours de joueurs.
        $connection->executeStatement('DELETE FROM world_presence WHERE updated_at < ?', [$now - 60]);
        $response = $this->json($result['body'], $result['status']);
        $response->headers->set('Cache-Control', 'no-store, private');
        return $response;
    }
}
