FROM php:8.2-apache-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev unzip \
    && docker-php-ext-install pdo_pgsql \
    && rm -rf /var/lib/apt/lists/* \
    && mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && printf 'Listen 8080\n' > /etc/apache2/ports.conf \
    && php -r 'exit(extension_loaded("pdo_sqlite") ? 0 : 1);'

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
COPY docker/apache.conf /etc/apache2/sites-available/000-default.conf

WORKDIR /var/www/html
COPY . .

ENV APP_ENV=prod APP_DEBUG=0
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader \
    && mkdir -p var \
    && chown www-data:www-data var

EXPOSE 8080

# shortcut: SQLite is for local/demo use, set DATABASE_URL on Render to retain accounts.
CMD export APP_SECRET="${APP_SECRET:-$(php -r 'echo bin2hex(random_bytes(32));')}" \
    && su -s /bin/sh -c 'php bin/console doctrine:migrations:migrate --no-interaction' www-data \
    && exec apache2-foreground
