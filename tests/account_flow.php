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

function visit(Session $session, string $method, string $path, int $status, array $data = []): Response
{
    $kernel = new Kernel('test', false);
    $request = Request::create($path, $method, $data, [$session->getName() => $session->getId()]);
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
    $aliceToken = register($alice, 'Alice', 'alice@example.test');
    $bobToken = register($bob, 'Bob', 'bob@example.test');
    login($alice, 'alice@example.test', $aliceToken);
    login($bob, 'bob@example.test', $bobToken);

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
    check(htmlValue($warriorPage, '//div[@id="world"]/@data-skin') === 'lina', 'La guerrière doit utiliser les animations d’épée de Lina.');
    check(str_ends_with(htmlValue($warriorPage, '//img[contains(@class,"hud-portrait")]/@src'), '/lina/south.png'), 'Le portrait de la guerrière doit correspondre à son sprite.');
    check($warriorRules['classKey'] === 'warrior' && !$warriorRules['ranged'] && $warriorRules['range'] === 1.5, 'La guerrière doit combattre au corps à corps.');
    check($warriorRules['resourceName'] === 'Énergie' && $warriorRules['specialName'] === 'Attaque chargée', 'La guerrière doit conserver son énergie et ses compétences de mêlée.');
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
    check($mageRules['classKey'] === 'mage' && $mageRules['ranged'] && $mageRules['range'] == 5, 'Le mage doit combattre à distance.');
    check($mageRules['resourceName'] === 'Mana' && $mageRules['specialName'] === 'Boule de feu', 'Le mage doit conserver son mana et ses sorts.');
    visit($bob, 'POST', "/personnages/$rolandId/selection", 404, ['_token' => $selectionToken]);
    check($bob->get('selected_character') === $bobSelection, 'Le refus doit préserver la sélection de Bob.');

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
