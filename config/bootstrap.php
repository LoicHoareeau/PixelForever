<?php

declare(strict_types=1);

require dirname(__DIR__).'/vendor/autoload.php';

$_SERVER['APP_ENV'] = $_SERVER['APP_ENV'] ?? getenv('APP_ENV') ?: 'dev';
$debug = $_SERVER['APP_DEBUG'] ?? getenv('APP_DEBUG');
$_SERVER['APP_DEBUG'] = $debug === false ? $_SERVER['APP_ENV'] === 'dev' : filter_var($debug, FILTER_VALIDATE_BOOL);
