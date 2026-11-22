<?php

declare(strict_types=1);

use App\Kernel;
use Symfony\Bundle\FrameworkBundle\Console\Application;
use Symfony\Component\Console\Input\ArrayInput;
use Symfony\Component\Console\Output\BufferedOutput;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\RequestStack;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\Session\Session;
use Symfony\Component\HttpFoundation\Session\Storage\MockArraySessionStorage;
use Symfony\Component\Security\Csrf\CsrfTokenManager;
use Symfony\Component\Security\Csrf\TokenStorage\SessionTokenStorage;

require dirname(__DIR__).'/vendor/autoload.php';

const TEST_PASSWORD = 'Test-password-42';

function check(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function visit(Session $session, string $method, string $path, int $status, array $data = [], ?string $json = null): Response
{
    $kernel = new Kernel('test', false);
    $request = Request::create($path, $method, $data, [$session->getName() => $session->getId()], [],
        $json === null ? [] : ['CONTENT_TYPE' => 'application/json'], $json);
    $request->setSession($session);
    try {
        $response = $kernel->handle($request);
        $kernel->terminate($request, $response);
        $actualStatus = $response->getStatusCode();
        check($actualStatus === $status, "$method $path : statut $actualStatus, attendu $status.");

        return $response;
    } finally {
        $kernel->shutdown();
    }
}

function htmlValue(Response $response, string $xpath): string
{
    $document = new DOMDocument();
    $document->loadHTML($response->getContent(), LIBXML_NOERROR | LIBXML_NOWARNING | LIBXML_NONET);
    $value = (new DOMXPath($document))->evaluate("string($xpath)");
    check($value !== '', "Élément absent du formulaire ($xpath).");

    return $value;
}

function register(Session $session, string $nickname, string $email): string
{
    $page = visit($session, 'GET', '/inscription', 200);
    $response = visit($session, 'POST', '/inscription', 303, ['form' => [
        'nickname' => $nickname,
        'email' => $email,
        'password' => TEST_PASSWORD,
        '_token' => htmlValue($page, '//input[@name="form[_token]"]/@value'),
    ]]);
    check($response->headers->get('Location') === '/connexion', 'Redirection après inscription absente.');

    $page = visit($session, 'GET', '/connexion', 200);

    return htmlValue($page, '//input[@name="_csrf_token"]/@value');
}

function login(Session $session, string $email, string $token): void
{
    $response = visit($session, 'POST', '/connexion', 302, [
        '_username' => $email,
        '_password' => TEST_PASSWORD,
        '_csrf_token' => $token,
    ]);
    $location = $response->headers->get('Location') ?? '';
    check(parse_url($location, PHP_URL_PATH) === '/personnages', "Redirection après connexion inattendue ($location).");
}

function createCharacter(Session $session, string $name, string $class): void
{
    $page = visit($session, 'GET', '/personnages/nouveau', 200);
    visit($session, 'POST', '/personnages/nouveau', 303, ['form' => [
        'name' => $name,
        'class' => $class,
        '_token' => htmlValue($page, '//input[@name="form[_token]"]/@value'),
    ]]);
}

check(extension_loaded('pdo_sqlite') && extension_loaded('dom'), 'Active les extensions PHP pdo_sqlite et dom.');
$database = tempnam(sys_get_temp_dir(), 'pixel-account-');
check($database !== false, 'Impossible de créer la base de test temporaire.');
$_SERVER['DATABASE_URL'] = 'sqlite:///'.str_replace('\\', '/', $database);
$_SERVER['APP_SECRET'] = bin2hex(random_bytes(32));
$kernel = new Kernel('test', false);

try {
    $console = new Application($kernel);
    $console->setAutoExit(false);
    $output = new BufferedOutput();
    $status = $console->run(new ArrayInput(['command' => 'doctrine:migrations:migrate', '--no-interaction' => true]), $output);
    check($status === 0, $output->fetch());
    $kernel->shutdown();
    unset($console, $kernel);

    $alice = new Session(new MockArraySessionStorage());
    $bob = new Session(new MockArraySessionStorage());
    $home = visit($alice, 'GET', '/', 200);
    check(htmlValue($home, '//main//a[@href="/inscription"]/@href') === '/inscription', 'L’accueil doit proposer l’inscription.');
    check(htmlValue($home, '//main//a[@href="/connexion"]/@href') === '/connexion', 'L’accueil doit proposer la connexion.');
    $aliceToken = register($alice, 'Alice', 'alice@example.test');
    $bobToken = register($bob, 'Bob', 'bob@example.test');
    login($alice, 'alice@example.test', $aliceToken);
    login($bob, 'bob@example.test', $bobToken);

    $signedInHome = visit($alice, 'GET', '/', 200);
    check(htmlValue($signedInHome, '//main//a[@href="/personnages"]/@href') === '/personnages', 'L’accueil doit donner accès aux personnages du joueur connecté.');
    $emptyList = visit($alice, 'GET', '/personnages', 200);
    check(htmlValue($emptyList, '//main//a[@href="/personnages/nouveau"]/@href') === '/personnages/nouveau', 'La liste vide doit proposer la création d’un personnage.');

    createCharacter($alice, 'Roland', 'warrior');
    $rolandId = $alice->get('selected_character');
    check(is_int($rolandId), 'Roland doit être sélectionné après sa création.');
    createCharacter($bob, 'Merlin', 'mage');
    createCharacter($bob, 'Galaad', 'warrior');
    $aliceList = visit($alice, 'GET', '/personnages', 200);
    check(str_contains($aliceList->getContent(), 'Roland'), 'Roland doit être visible sur son compte.');
    check($alice->get('selected_character') === $rolandId, 'La sélection de Roland doit rester active.');
    $warriorPage = visit($alice, 'GET', '/personnages/jeu', 200);
    $warriorRules = json_decode(htmlValue($warriorPage, '//div[@id="world"]/@data-combat'), true, flags: JSON_THROW_ON_ERROR);
    if ($previewPath = getenv('PIXEL_HUD_HTML')) {
        file_put_contents($previewPath, $warriorPage->getContent());
    }
    check(str_contains(htmlValue($warriorPage, '//script[@type="module"]/@src'), '?v='), 'Le module du jeu doit changer d’URL lorsque son contenu change.');
    $moduleMap = json_decode(htmlValue($warriorPage, '//script[@type="importmap"]'), true, flags: JSON_THROW_ON_ERROR);
    check(str_contains($moduleMap['imports']['/game/hud-controls.js'], '?v=') && str_contains($moduleMap['imports']['/game/spell-icons.js'], '?v='), 'Les dépendances de l’ATH doivent aussi être versionnées.');
    check(htmlValue($warriorPage, '//dialog[@id="game-guide"]/@data-welcome') === 'true', 'Le nouveau personnage doit recevoir le tutoriel.');
    check(htmlValue($warriorPage, '//button[@id="guide-open"]/@aria-controls') === 'game-guide', 'L’ATH doit donner accès au guide.');
    check(htmlValue($warriorPage, '//button[@id="game-menu-open"]/@aria-controls') === 'game-menu', 'Le menu Échap doit être relié à son dialogue.');
    check(htmlValue($warriorPage, '//input[@id="hud-scale"]/@max') === '130', 'La taille de l’ATH doit être réglable.');
    check(htmlValue($warriorPage, '//button[@data-chat-channel="whisper"]/@aria-pressed') === 'false', 'Le tchat doit proposer le chuchotement.');
    $returnToGame = visit($alice, 'GET', '/personnages/jeu', 200);
    check(htmlValue($returnToGame, '//dialog[@id="game-guide"]/@data-welcome') === 'false', 'Le tutoriel ne doit pas se rouvrir automatiquement à chaque visite.');
    check(htmlValue($warriorPage, '//div[@id="world"]/@data-skin') === 'lina', 'Les personnages Guerrier existants doivent conserver leur identifiant.');
    check(str_ends_with(htmlValue($warriorPage, '//img[contains(@class,"hud-portrait")]/@src'), '/warrior/south.png'), 'Le portrait du Guerrier doit utiliser son nouvel atlas.');
    check(str_contains($warriorPage->getContent(), 'data-weapon="axe"') && isset($warriorRules['baseStats']['defense']), 'Le Guerrier voit sa hache et la Défense.');
    check($warriorRules['classKey'] === 'warrior' && !$warriorRules['ranged'] && $warriorRules['range'] === 2.5, 'La guerrière doit combattre au corps à corps à 2,5 cases.');
    check($warriorRules['specialManaCost'] === 7 && $warriorRules['baseManaRegen'] == 0.8 && $warriorRules['specialCastMs'] === 0, 'Le barème d’énergie et d’attaque de la guerrière doit rester intact.');
    check($warriorRules['resourceName'] === 'Énergie' && $warriorRules['specialName'] === 'Attaque chargée', 'La guerrière doit conserver son énergie et ses compétences de mêlée.');
    check($warriorRules['initialStatPoints'] === 0 && $warriorRules['initialSpellPoints'] === 0, 'Aucun point gratuit au niveau 1.');
    check($warriorRules['progress'] === ['level' => 1, 'xp' => 0, 'xpVersion' => 2], 'La base doit initialiser le personnage au niveau 1.');
    check(str_contains($warriorPage->getContent(), 'id="progress-save-status"'), 'L’état de sauvegarde doit être visible dans le jeu.');
    $bobList = visit($bob, 'GET', '/personnages', 200);
    check(str_contains($bobList->getContent(), 'Merlin'), 'Merlin doit être visible sur son compte.');
    check(!str_contains($bobList->getContent(), 'Roland'), 'Roland doit rester invisible sur le compte de Bob.');
    $selectionToken = htmlValue($bobList, '//input[@name="_token"]/@value');
    $selectionPath = htmlValue($bobList, '//form[input[@name="_token"]]/@action');
    $previousSelection = $bob->get('selected_character');
    visit($bob, 'POST', $selectionPath, 303, ['_token' => $selectionToken]);
    $bobSelection = $bob->get('selected_character');
    check(is_int($bobSelection) && $bobSelection !== $previousSelection, 'Bob doit pouvoir changer de personnage.');
    $magePage = visit($bob, 'GET', '/personnages/jeu', 200);
    $mageRules = json_decode(htmlValue($magePage, '//div[@id="world"]/@data-combat'), true, flags: JSON_THROW_ON_ERROR);
    if ($previewPath = getenv('PIXEL_HUD_BOB_HTML')) file_put_contents($previewPath, $magePage->getContent());
    check(htmlValue($magePage, '//div[@id="world"]/@data-skin') === 'noe', 'Le mage doit utiliser les animations de Noé.');
    check(str_ends_with(htmlValue($magePage, '//img[contains(@class,"hud-portrait")]/@src'), '/noe/south.png'), 'Le portrait du mage doit correspondre à son sprite.');
    check($mageRules['classKey'] === 'mage' && $mageRules['ranged'] && $mageRules['range'] == 5.0, 'La baguette doit porter à 5 cases.');
    check($mageRules['specialRange'] == 15.0 && $mageRules['wandDamageMultiplier'] == 1.0, 'Le mage doit lancer ses sorts à 15 cases et tirer à puissance normale à la baguette.');
    check(htmlValue($magePage, '//*[@data-sheet-basic-damage]') === '12 dégâts', 'La fiche doit afficher les dégâts réduits avant le démarrage du jeu.');
    check($mageRules['specialManaCost'] === 14 && $mageRules['baseManaRegen'] == 0.4 && $mageRules['specialCastMs'] === 1000, 'Le mage doit avoir sa régénération réduite, ses coûts ajustés et son cast d’une seconde.');
    check($mageRules['resourceName'] === 'Mana' && $mageRules['specialName'] === 'Boule de feu', 'Le mage doit conserver son mana et ses sorts.');
    foreach ([$warriorRules, $mageRules] as $rules) {
        check(array_sum(array_column($rules['loot'], 'chance')) === 100, 'Le tirage du butin doit couvrir exactement 100 %.');
        foreach (['rare', 'epic', 'scale', 'heart'] as $item) {
            check(is_file(dirname(__DIR__).'/public/game/val-des-saules/items/'.$rules['loot'][$item]['icon'].'.png'), 'Icône PixelLab manquante.');
        }
    }
    check($mageRules['loot']['rare']['icon'] === 'staff' && $mageRules['loot']['epic']['icon'] === 'wand', 'Les armes du mage doivent distinguer bâton et baguette.');
    visit($bob, 'POST', "/personnages/$rolandId/selection", 404, ['_token' => $selectionToken]);
    check($bob->get('selected_character') === $bobSelection, 'Le refus doit préserver la sélection de Bob.');
    foreach (['warlock' => 'Morgane', 'rogue' => 'Lys', 'hunter' => 'Arden'] as $class => $name) {
        createCharacter($bob, $name, $class);
        $game = visit($bob, 'GET', '/personnages/jeu', 200);
        if ($class === 'hunter' && ($previewPath = getenv('PIXEL_HUNTER_HTML'))) {
            file_put_contents($previewPath, $game->getContent());
        }
        if ($class === 'hunter') check(str_contains(htmlValue($game, '//img[contains(@class, "hud-portrait")]/@src'), 'hunter-v2/portrait.webp'), 'Le portrait du Chasseur doit utiliser son nouveau dessin.');
        if ($class === 'rogue' && ($previewPath = getenv('PIXEL_ROGUE_HTML'))) {
            file_put_contents($previewPath, $game->getContent());
        }
        if ($class === 'rogue') check(str_contains(htmlValue($game, '//img[contains(@class, "hud-portrait")]/@src'), 'rogue-v2/portrait.webp'), 'Le portrait du Voleur doit utiliser le nouveau dessin.');
        $rules = json_decode(htmlValue($game, '//div[@id="world"]/@data-combat'), true, flags: JSON_THROW_ON_ERROR);
        check($class === $rules['classKey'] && $class === htmlValue($game, '//div[@id="world"]/@data-skin'), 'La nouvelle classe doit accéder à son apparence.');
        check(array_sum(array_column($rules['loot'], 'chance')) === 100, 'Les nouvelles classes conservent un butin valide.');
        check(count($rules['baseStats']) === 6, 'Toutes les classes exposent les six caractéristiques.');
        check(str_contains($game->getContent(), 'Fiche (P)'), 'La fiche doit utiliser P pour libérer C.');
        check(substr_count($game->getContent(), 'data-pet-action=') === ($class === 'rogue' ? 0 : 3), 'Chasseur et Démoniste ont trois commandes dédiées de familier.');
        if ($class === 'hunter') check($rules['resourceName'] === 'Mana' && $rules['range'] == 7.0, 'Le Chasseur utilise le Mana à 7 cases.');
        if ($class === 'hunter') check(substr_count($game->getContent(), 'data-talent-slot=') === 5, 'Le Chasseur conserve cinq cases : trappe de départ et quatre talents actifs.');
        if ($class === 'warlock') check($rules['specialCastMs'] === 750 && $rules['range'] == 5.0, 'Le Démoniste incante Corruption à 5 cases.');
        if ($class === 'warlock') check($rules['weaponName'] === 'Essence de cendres' && !str_contains(strtolower($game->getContent()), 'grimoire'), 'Le Démoniste utilise une focalisation d’ombre sans grimoire affiché.');
    }
    if ($previewPath = getenv('PIXEL_ROSTER_HTML')) {
        file_put_contents($previewPath, visit($bob, 'GET', '/personnages', 200)->getContent());
    }

    $presenceDb = new PDO('sqlite:'.$database);
    $leaseAlice = '11111111-1111-4111-8111-111111111111';
    $leaseBob = '22222222-2222-4222-8222-222222222222';
    $position = ['x' => 1240, 'y' => 580, 'facing' => 'south', 'walking' => false, 'alive' => true, 'attackFrame' => -1, 'ranged' => false];
    $aliceWorld = ['_token' => $warriorRules['progressToken'], 'lease' => $leaseAlice, 'state' => $position];
    $bobWorld = ['_token' => $mageRules['progressToken'], 'lease' => $leaseBob, 'state' => [...$position, 'x' => 1260]];
    $worldPath = $warriorRules['worldUrl'];
    $first = visit($alice, 'POST', $worldPath, 200, json: json_encode($aliceWorld));
    check(json_decode($first->getContent(), true)['players'] === [], 'Le premier joueur arrive seul.');
    check(json_decode($first->getContent(), true)['onlineCount'] === 1, 'Le compteur inclut le personnage qui arrive seul.');
    $ticketPath = $warriorRules['worldStreamUrl'];
    $realtime = visit($alice, 'POST', $ticketPath, 200, json: json_encode($aliceWorld));
    $ticketData = json_decode($realtime->getContent(), true);
    [$encodedTicket, $signature] = explode('.', $ticketData['ticket']);
    $ticketProfile = json_decode(base64_decode(strtr($encodedTicket, '-_', '+/')), true);
    check($ticketProfile['id'] === $rolandId && $ticketProfile['lease'] === $leaseAlice && $ticketProfile['exp'] > time(), 'Le ticket doit être lié au personnage et à son bail actif.');
    $expectedSignature = rtrim(strtr(base64_encode(hash_hmac('sha256', $encodedTicket, $_SERVER['APP_SECRET'], true)), '+/', '-_'), '=');
    check(hash_equals($expectedSignature, $signature), 'Le ticket doit être signé avec le secret du serveur.');
    check(!isset($ticketProfile['email']) && $ticketData['url'] === '/monde-socket', 'Le ticket doit limiter son profil public et utiliser la même origine.');
    visit($bob, 'POST', $ticketPath, 404, json: json_encode($aliceWorld));
    visit($alice, 'POST', $ticketPath, 403, json: json_encode([...$aliceWorld, '_token' => 'bad']));
    visit($alice, 'POST', $ticketPath, 409, json: json_encode([...$aliceWorld, 'lease' => $leaseBob]));
    visit($alice, 'POST', $ticketPath, 400, json: '{broken');
    check(is_numeric(json_decode($first->getContent(), true)['serverTime']), 'Le serveur doit horodater ses instantanés.');
    $second = visit($bob, 'POST', $mageRules['worldUrl'], 200, json: json_encode($bobWorld));
    check(json_decode($second->getContent(), true)['onlineCount'] === 2, 'Les deux sessions actives doivent être comptées.');
    $visible = json_decode($second->getContent(), true)['players'];
    check(count($visible) === 1 && $visible[0]['name'] === 'Roland' && $visible[0]['skin'] === 'lina', 'Bob doit voir le personnage et l’apparence d’Alice.');
    check(!isset($visible[0]['email']) && !isset($visible[0]['lease']) && !isset($visible[0]['items']), 'La présence ne divulgue ni compte, ni session, ni sac.');
    visit($alice, 'POST', $worldPath, 429, json: json_encode($aliceWorld));
    visit($alice, 'POST', $worldPath, 409, json: json_encode([...$aliceWorld, 'lease' => $leaseBob]));
    visit($bob, 'POST', $worldPath, 404, json: json_encode($aliceWorld));
    visit(new Session(new MockArraySessionStorage()), 'POST', $worldPath, 302, json: json_encode($aliceWorld));
    visit($alice, 'POST', $worldPath, 403, json: json_encode([...$aliceWorld, '_token' => 'invalid']));
    visit($alice, 'POST', $worldPath, 400, json: '{broken');
    visit($alice, 'POST', $worldPath, 413, json: str_repeat(' ', 2049));
    foreach ([['x' => -1], ['x' => 4096], ['facing' => 'invalid'], ['attackFrame' => 9], ['walking' => 1], ['y' => 'NaN']] as $bad) {
        visit($alice, 'POST', $worldPath, 400, json: json_encode([...$aliceWorld, 'state' => [...$position, ...$bad]]));
    }
    $presenceDb->exec('UPDATE world_presence SET updated_at = updated_at - 1');
    $seen = visit($alice, 'POST', $worldPath, 200, json: json_encode($aliceWorld));
    check(json_decode($seen->getContent(), true)['players'][0]['name'] === 'Merlin', 'La présence doit être réciproque entre deux comptes.');

    $presenceDb->exec('UPDATE world_presence SET updated_at = updated_at - 1');
    visit($bob, 'POST', $mageRules['worldUrl'], 200, json: json_encode([...$bobWorld, 'state' => [...$position, 'x' => 3000]]));
    $far = json_decode(visit($alice, 'POST', $worldPath, 200, json: json_encode($aliceWorld))->getContent(), true);
    check($far['onlineCount'] === 2 && $far['players'] === [], 'Un personnage éloigné est compté sans être transmis comme voisin.');
    $presenceDb->exec('UPDATE world_presence SET updated_at = updated_at - 13');
    $alone = visit($alice, 'POST', $worldPath, 200, json: json_encode($aliceWorld));
    check(json_decode($alone->getContent(), true)['onlineCount'] === 1, 'Une présence expirée ne doit plus être comptée.');
    visit($bob, 'POST', $mageRules['worldUrl'], 200, json: json_encode($bobWorld));

    $animation = ['33333333-3333-4333-8333-333333333333', 120, 180, 390, true, 0];
    foreach (['invalid', ['bad' => $animation], [[$leaseAlice, 120, 180, 390, true, 0]], array_fill(0, 7, $animation), [[...$animation, 1]], [['bad', 120, 180, 390, true, 0]],
        [[$animation[0], 6001, 180, 390, true, 0]], [[$animation[0], 120, 0, 390, true, 0]],
        [[$animation[0], 120, 180, 391, true, 0]], [[$animation[0], 120, 180, 390, 1, 0]],
        [[$animation[0], 120, 180, 390, true, 8]]] as $invalidActions) {
        visit($alice, 'POST', $worldPath, 400, json: json_encode([...$aliceWorld, 'state' => [...$position, 'actions' => $invalidActions]]));
    }
    $presenceDb->exec('UPDATE world_presence SET updated_at = updated_at - 1');
    visit($alice, 'POST', $worldPath, 200, json: json_encode([...$aliceWorld, 'state' => [...$position, 'actions' => [$animation]]]));
    $stored = json_decode($presenceDb->query('SELECT state FROM world_presence WHERE character_id = '.$rolandId)->fetchColumn(), true);
    $actionStart = $stored['actions'][0][1];
    check($stored['updatedAt'] > $actionStart && $stored['actions'][0][0] === $animation[0], 'Le serveur doit reconstruire la chronologie visuelle sans exposer le bail.');
    $presenceDb->exec('UPDATE world_presence SET updated_at = updated_at - 1');
    $animation[1] = 220; $animation[3] = 80;
    visit($alice, 'POST', $worldPath, 200, json: json_encode([...$aliceWorld, 'state' => [...$position, 'actions' => [$animation]]]));
    $stored = json_decode($presenceDb->query('SELECT state FROM world_presence WHERE character_id = '.$rolandId)->fetchColumn(), true);
    check($stored['actions'][0][1] === $actionStart && $stored['actions'][0][3] === 80, 'L’identité d’une animation conserve son début et son annulation.');
    visit($bob, 'POST', $mageRules['worldUrl'], 200, json: json_encode([...$bobWorld, 'leave' => true]));
    $presenceDb->exec('UPDATE world_presence SET updated_at = updated_at - 13');
    $afterLeave = visit($alice, 'POST', $worldPath, 200, json: json_encode([...$aliceWorld, 'lease' => $leaseBob]));
    check(json_decode($afterLeave->getContent(), true)['onlineCount'] === 1, 'Le départ de Bob doit réduire le compteur.');
    check((int) $presenceDb->query('SELECT COUNT(*) FROM world_presence')->fetchColumn() === 1, 'La déconnexion retire Bob, le bail expiré d’Alice peut être repris.');
    $presenceDb = null;


    // Trois personnages isolés : Alice, Merlin et le Chasseur de Bob, sans utiliser la base réelle.
    $chatDb = new PDO('sqlite:'.$database);
    $chatDb->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $chatRules = ['a' => $warriorRules, 'b' => $mageRules, 'c' => $rules];
    $chatSessions = ['a' => $alice, 'b' => $bob, 'c' => $bob];
    $ids = array_map(static fn ($r) => $r['characterId'], $chatRules);
    foreach ($ids as $key => $characterId) {
        $state = json_encode(['x' => $key === 'c' ? 3000 : 1240, 'y' => 580]);
        $stmt = $chatDb->prepare('INSERT INTO world_presence(character_id, lease, state, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(character_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at');
        $stmt->execute([$characterId, $leaseAlice, $state, microtime(true)]);
    }
    $chat = static function (string $key, array $data, int $status = 200) use ($chatRules, $chatSessions): array {
        $response = visit($chatSessions[$key], 'POST', $chatRules[$key]['chatUrl'], $status, json: json_encode(['_token' => $chatRules[$key]['progressToken'], 'action' => 'poll', ...$data], JSON_THROW_ON_ERROR));
        return json_decode($response->getContent(), true, flags: JSON_THROW_ON_ERROR);
    };
    $nonce = static fn (): string => substr(bin2hex(random_bytes(18)), 0, 36);
    $send = static function (string $key, string $channel, string $text, string $target = '') use ($chat, $nonce): array {
        return $chat($key, ['action' => 'send', 'channel' => $channel, 'text' => $text, 'target' => $target, 'nonce' => $nonce()]);
    };
    $contains = static fn (array $snapshot, string $text): bool => in_array($text, array_column($snapshot['messages'] ?? [], 'body'), true);
    $resetRate = static fn () => $chatDb->exec('UPDATE chat_sender SET last_sent = 0');
    $chat('a', ['action' => 'send', 'channel' => 'group', 'text' => 'refus hors groupe', 'nonce' => $nonce()], 400);
    $global = $send('a', 'global', '<script>texte sans HTML</script>');
    check($contains($chat('b', []), '<script>texte sans HTML</script>') && $contains($chat('c', []), '<script>texte sans HTML</script>'), 'Le canal global doit être visible sur les autres personnages.');
    check($global['messages'][0]['sender_name'] === 'Roland', 'L’expéditeur vient de la session du propriétaire.');
    $chat('a', ['action' => 'send', 'channel' => 'global', 'text' => 'spam', 'nonce' => $nonce()], 400);
    $send('b', 'global', 'message de Bob');
    $chat('c', ['action' => 'send', 'channel' => 'global', 'text' => 'même compte trop rapide', 'nonce' => $nonce()], 400);
    $resetRate();
    $privateNonce = $nonce();
    $private = ['action' => 'send', 'channel' => 'whisper', 'text' => 'secret privé', 'target' => '#'.$ids['b'], 'nonce' => $privateNonce];
    $chat('a', $private); $chat('a', $private);
    check((int) $chatDb->query("SELECT COUNT(*) FROM chat_message WHERE body = 'secret privé'")->fetchColumn() === 1, 'Une relance réseau ne doit pas dupliquer un message.');
    check($contains($chat('b', []), 'secret privé') && !$contains($chat('c', []), 'secret privé'), 'Un chuchotement ne doit parvenir qu’au destinataire et à son auteur.');
    $resetRate(); $send('a', 'nearby', 'près du Bastion');
    check($contains($chat('b', []), 'près du Bastion') && !$contains($chat('c', []), 'près du Bastion'), 'Le canal de proximité ne doit pas atteindre les joueurs éloignés.');
    $chatDb->exec('UPDATE world_presence SET updated_at = updated_at - 13 WHERE character_id = '.$ids['a']);
    $resetRate(); $chat('a', ['action' => 'send', 'channel' => 'nearby', 'text' => 'position expirée', 'nonce' => $nonce()], 400);
    $chatDb->exec('UPDATE world_presence SET updated_at = '.microtime(true));
    $resetRate(); $chat('a', ['action' => 'invite', 'target' => '#'.$ids['b']]);
    check($chat('b', [])['invitation']['name'] === 'Roland', 'Le joueur invité doit pouvoir accepter ou refuser.');
    $chat('c', ['action' => 'answer', 'accept' => true], 400);
    $resetRate(); $send('a', 'group', 'avant acceptation');
    check(!$contains($chat('b', []), 'avant acceptation'), 'Une invitation seule ne doit pas donner accès aux messages de groupe.');
    $accepted = $chat('b', ['action' => 'answer', 'accept' => true, 'invitation' => (int) $chat('b', [])['invitation']['id']]);
    check(count($accepted['party']['members']) === 2 && !$contains($accepted, 'avant acceptation'), 'Seule l’acceptation ajoute au groupe, sans accès rétroactif.');

    $extras = $chatDb->query('SELECT id FROM PlayerCharacter WHERE id NOT IN ('.implode(',', $ids).') LIMIT 3')->fetchAll(PDO::FETCH_COLUMN);
    foreach ($extras as $extra) $chatDb->exec('INSERT INTO chat_member(character_id, party_id) VALUES ('.$extra.','.$accepted['party']['id'].')');
    $resetRate(); $chat('a', ['action' => 'invite', 'target' => '#'.$ids['c']], 400);
    foreach ($extras as $extra) $chatDb->exec('DELETE FROM chat_member WHERE character_id = '.$extra);
    $resetRate(); $send('a', 'group', 'secret du groupe');
    check($contains($chat('b', []), 'secret du groupe') && !$contains($chat('c', []), 'secret du groupe'), 'Le groupe doit rester privé.');
    $chat('c', ['action' => 'send', 'channel' => 'group', 'text' => 'intrus', 'party_id' => $accepted['party']['id'], 'nonce' => $nonce()], 400);
    $chat('b', ['action' => 'invite', 'target' => '#'.$ids['c']], 400);
    $resetRate(); $chat('a', ['action' => 'invite', 'target' => '#'.$ids['c']]);
    $chat('c', ['action' => 'answer', 'accept' => false, 'invitation' => (int) $chat('c', [])['invitation']['id']]);
    check($chat('c', [])['party'] === null && $chat('c', [])['invitation'] === null, 'Refuser ne doit pas créer une adhésion.');

    $resetRate(); $chat('a', ['action' => 'invite', 'target' => '#'.$ids['c']]);
    $chatDb->exec('UPDATE chat_invite SET expires_at = 0');
    check($chat('c', [])['invitation'] === null, 'Une invitation expirée doit disparaître.');
    $chat('c', ['action' => 'answer', 'accept' => true], 400);
    $chat('b', ['action' => 'leave', 'party' => $accepted['party']['id']]);
    $resetRate(); $send('a', 'group', 'après départ');
    check(!$contains($chat('b', []), 'après départ'), 'Un ancien membre ne reçoit plus le groupe.');
    $chat('a', ['action' => 'leave', 'party' => $accepted['party']['id']]);
    check((int) $chatDb->query('SELECT COUNT(*) FROM chat_party')->fetchColumn() === 0, 'Le chef dissout son groupe en partant.');
    foreach ([['channel' => 'invalid'], ['text' => str_repeat('x', 501)], ['text' => ''], ['text' => "ligne\nsuivante"], ['nonce' => 'invalid'], ['text' => []]] as $invalid) {
        $chat('a', ['action' => 'send', 'channel' => 'global', 'text' => 'test', 'nonce' => $nonce(), ...$invalid], 400);
    }
    $chat('a', ['after' => -1], 400);
    $chat('a', ['_token' => 'invalid'], 403);
    visit($bob, 'POST', $warriorRules['chatUrl'], 404, json: json_encode(['action' => 'poll', '_token' => $warriorRules['progressToken']]));
    visit(new Session(new MockArraySessionStorage()), 'POST', $warriorRules['chatUrl'], 302, json: '{}');
    visit($alice, 'POST', $warriorRules['chatUrl'], 413, json: str_repeat(' ', 4097));

    $cursor = $chat('c', [])['cursor'];
    $insertMessage = $chatDb->prepare("INSERT INTO chat_message(sender_id, sender_name, channel, body, nonce, created_at) VALUES (?, 'Roland', 'global', ?, ?, ?)");
    for ($i = 0; $i < 55; $i++) $insertMessage->execute([$ids['a'], 'pagination '.$i, $nonce(), microtime(true)]);
    $firstBatch = $chat('c', ['after' => $cursor]);
    $secondBatch = $chat('c', ['after' => $firstBatch['cursor']]);
    check(count($firstBatch['messages']) === 50 && count($secondBatch['messages']) === 5, 'Le curseur doit récupérer le retard sans perte ni doublon.');
    $chatDb->exec('UPDATE chat_message SET created_at = 0');
    check($chat('c', [])['messages'] === [], 'Les messages de plus de sept jours doivent être retirés.');
    $insertMessage = null;
    $resetRate = null;
    $stmt = null;
    $chatDb = null;

    $progressPath = $warriorRules['progressUrl'];
    $progressData = ['_token' => $warriorRules['progressToken'], 'level' => 3, 'xp' => 77, 'xpVersion' => 2];
    $saved = visit($alice, 'POST', $progressPath, 200, json: json_encode($progressData, JSON_THROW_ON_ERROR));
    check(json_decode($saved->getContent(), true) === ['level' => 3, 'xp' => 77, 'xpVersion' => 2], 'Niveau et XP doivent être enregistrés.');
    visit($bob, 'POST', $progressPath, 404, json: json_encode($progressData, JSON_THROW_ON_ERROR));
    visit(new Session(new MockArraySessionStorage()), 'POST', $progressPath, 302, json: json_encode($progressData, JSON_THROW_ON_ERROR));
    visit($alice, 'POST', $progressPath, 403, json: json_encode([...$progressData, '_token' => 'invalid'], JSON_THROW_ON_ERROR));
    visit($alice, 'POST', $progressPath, 400, json: '{broken');
    visit($alice, 'POST', $progressPath, 413, json: str_repeat(' ', 4097));
    visit($alice, 'POST', $progressPath, 409, json: json_encode([...$progressData, 'xpVersion' => 1]));
    foreach ([['level' => 0], ['level' => 10000], ['level' => '3'], ['xp' => -1], ['xp' => 320]] as $invalid) {
        visit($alice, 'POST', $progressPath, 400, json: json_encode([...$progressData, ...$invalid], JSON_THROW_ON_ERROR));
    }
    foreach ([['level' => 1, 'xp' => 99], ['level' => 3, 'xp' => 50]] as $stale) {
        $result = visit($alice, 'POST', $progressPath, 200, json: json_encode([...$progressData, ...$stale], JSON_THROW_ON_ERROR));
        check(json_decode($result->getContent(), true) === ['level' => 3, 'xp' => 77, 'xpVersion' => 2], 'Une ancienne sauvegarde ne doit pas faire régresser le personnage.');
    }

    $reconnected = new Session(new MockArraySessionStorage());
    $loginPage = visit($reconnected, 'GET', '/connexion', 200);
    login($reconnected, 'alice@example.test', htmlValue($loginPage, '//input[@name="_csrf_token"]/@value'));
    $reconnectedList = visit($reconnected, 'GET', '/personnages', 200);
    check(str_contains($reconnectedList->getContent(), 'Niveau 3'), 'La liste doit retrouver le niveau 3 après une nouvelle connexion.');
    visit($reconnected, 'POST', "/personnages/$rolandId/selection", 303, ['_token' => htmlValue($reconnectedList, '//input[@name="_token"]/@value')]);
    $restoredGame = visit($reconnected, 'GET', '/personnages/jeu', 200);
    $restoredRules = json_decode(htmlValue($restoredGame, '//div[@id="world"]/@data-combat'), true, flags: JSON_THROW_ON_ERROR);
    check($restoredRules['progress'] === ['level' => 3, 'xp' => 77, 'xpVersion' => 2], 'Le jeu doit restaurer le niveau et l’XP depuis la base.');

    $deletePath = "/personnages/$rolandId/suppression";
    $confirmation = visit($reconnected, 'GET', $deletePath, 200);
    check(str_contains($confirmation->getContent(), 'irréversible'), 'La confirmation doit prévenir de la suppression définitive.');
    visit($reconnected, 'GET', '/personnages/jeu', 200);
    visit($bob, 'GET', $deletePath, 404);
    visit($bob, 'POST', $deletePath, 404);
    visit(new Session(new MockArraySessionStorage()), 'POST', $deletePath, 302);
    visit($reconnected, 'POST', $deletePath, 403, ['_token' => 'invalid']);
    visit($reconnected, 'GET', '/personnages/jeu', 200);
    $deleted = visit($reconnected, 'POST', $deletePath, 303, ['_token' => htmlValue($confirmation, '//input[@name="_token"]/@value')]);
    check($deleted->headers->get('Location') === '/personnages', 'La suppression doit revenir à la liste.');
    check(!$reconnected->has('selected_character'), 'La suppression doit effacer la sélection du personnage supprimé.');
    visit($reconnected, 'GET', '/personnages/jeu', 302);
    visit($reconnected, 'GET', $deletePath, 404);
    visit($reconnected, 'POST', $progressPath, 404, json: json_encode($progressData, JSON_THROW_ON_ERROR));
    visit($bob, 'GET', '/personnages/jeu', 200);

    createCharacter($reconnected, 'À supprimer', 'mage');
    $spareId = $reconnected->get('selected_character');
    createCharacter($reconnected, 'À garder', 'hunter');
    $keptId = $reconnected->get('selected_character');
    $sparePath = "/personnages/$spareId/suppression";
    $sparePage = visit($reconnected, 'GET', $sparePath, 200);
    $deleteDb = new PDO('sqlite:'.$database);
    $deleteDb->exec("INSERT INTO world_presence(character_id, lease, state, updated_at) VALUES ($spareId, 'deletion-test', '{}', 1)");
    $deleteDb->exec("INSERT INTO chat_party(leader_id) VALUES ($spareId)");
    $partyToDelete = $deleteDb->lastInsertId();
    $deleteDb->exec("INSERT INTO chat_member(character_id, party_id) VALUES ($spareId, $partyToDelete), ($keptId, $partyToDelete)");
    visit($reconnected, 'POST', $sparePath, 303, ['_token' => htmlValue($sparePage, '//input[@name="_token"]/@value')]);
    check($reconnected->get('selected_character') === $keptId, 'Supprimer un autre personnage doit conserver la sélection.');
    check(!in_array($spareId, $reconnected->get('tutorial_pending', []), true), 'La suppression doit retirer le tutoriel en attente du personnage.');
    check((int) $deleteDb->query("SELECT COUNT(*) FROM world_presence WHERE character_id = $spareId")->fetchColumn() === 0, 'La présence du personnage supprimé doit disparaître.');
    check((int) $deleteDb->query("SELECT COUNT(*) FROM chat_party WHERE id = $partyToDelete")->fetchColumn() === 0, 'Le groupe du chef supprimé doit être dissous.');
    check((int) $deleteDb->query("SELECT COUNT(*) FROM chat_member WHERE party_id = $partyToDelete")->fetchColumn() === 0, 'Les membres du groupe dissous doivent être libérés.');
    $deleteDb = null;

    // Le formulaire de connexion redirige les utilisateurs déjà authentifiés.
    $requestStack = new RequestStack();
    $request = Request::create('/connexion');
    $request->setSession($alice);
    $requestStack->push($request);
    $tokens = new CsrfTokenManager(storage: new SessionTokenStorage($requestStack), namespace: $requestStack);
    login($alice, 'bob@example.test', $tokens->getToken('authenticate')->getValue());
    $switchedList = visit($alice, 'GET', '/personnages', 200);
    check(str_contains($switchedList->getContent(), 'Merlin'), 'La session doit afficher les personnages de Bob.');
    check(!$alice->has('selected_character'), 'La session ne doit plus contenir la sélection du compte précédent.');
} finally {
    if (isset($kernel)) {
        $kernel->shutdown();
        unset($console, $kernel);
    }
    unlink($database);
}

fwrite(STDOUT, "Parcours compte et personnages validé.\n");
