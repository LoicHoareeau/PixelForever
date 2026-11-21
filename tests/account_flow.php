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


    $presenceDb = new PDO('sqlite:'.$database);
    $leaseAlice = '11111111-1111-4111-8111-111111111111';
    $leaseBob = '22222222-2222-4222-8222-222222222222';
    $position = ['x' => 1240, 'y' => 580, 'facing' => 'south', 'walking' => false, 'alive' => true, 'attackFrame' => -1, 'ranged' => false];
    $aliceWorld = ['_token' => $warriorRules['progressToken'], 'lease' => $leaseAlice, 'state' => $position];
    $bobWorld = ['_token' => $mageRules['progressToken'], 'lease' => $leaseBob, 'state' => [...$position, 'x' => 1260]];
    $worldPath = $warriorRules['worldUrl'];
    $first = visit($alice, 'POST', $worldPath, 200, json: json_encode($aliceWorld));
    check(json_decode($first->getContent(), true)['players'] === [], 'Le premier joueur arrive seul.');
    $second = visit($bob, 'POST', $mageRules['worldUrl'], 200, json: json_encode($bobWorld));
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
    visit($bob, 'POST', $mageRules['worldUrl'], 200, json: json_encode([...$bobWorld, 'leave' => true]));
    $presenceDb->exec('UPDATE world_presence SET updated_at = updated_at - 13');
    visit($alice, 'POST', $worldPath, 200, json: json_encode([...$aliceWorld, 'lease' => $leaseBob]));
    check((int) $presenceDb->query('SELECT COUNT(*) FROM world_presence')->fetchColumn() === 1, 'La déconnexion retire Bob, le bail expiré d’Alice peut être repris.');
    $presenceDb = null;

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
