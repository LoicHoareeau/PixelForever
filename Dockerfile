FROM node:22-bookworm-slim AS realtime
WORKDIR /runtime
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM php:8.2-apache-bookworm AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev unzip \
    && docker-php-ext-install pdo_pgsql \
    && rm -rf /var/lib/apt/lists/* \
    && mv "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && a2enmod deflate expires headers proxy proxy_http proxy_wstunnel \
    && printf 'Listen 8080\n' > /etc/apache2/ports.conf \
    && php -r 'exit(extension_loaded("pdo_sqlite") ? 0 : 1);'

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
COPY --from=realtime /usr/local/bin/node /usr/local/bin/node
COPY docker/apache.conf /etc/apache2/sites-available/000-default.conf

WORKDIR /var/www/html
COPY composer.json composer.lock package.json package-lock.json ./
COPY bin/ ./bin/
COPY config/ ./config/
COPY migrations/ ./migrations/
COPY public/ ./public/
COPY src/ ./src/
COPY templates/ ./templates/
COPY server/ ./server/
COPY docker/start.sh ./docker/start.sh
COPY --from=realtime /runtime/node_modules ./node_modules

ENV APP_ENV=prod APP_DEBUG=0
RUN composer install --no-dev --no-interaction --prefer-dist --optimize-autoloader \
    && mkdir -p var \
    && chown www-data:www-data var

EXPOSE 8080

HEALTHCHECK CMD php -r 'exit(@file_get_contents("http://127.0.0.1:8081/health") === false ? 1 : 0);'
CMD ["bash", "docker/start.sh"]

FROM runtime AS checks
COPY tests/ ./tests/
RUN node --test tests/*.test.mjs \
    && php tests/account_flow.php \
    && php tests/game_assets.php \
    && APP_ENV=test APP_SECRET=build-check php bin/console lint:twig templates \
    && bash -n docker/start.sh \
    && touch /tmp/tests-passed

FROM runtime AS production
COPY --from=checks /tmp/tests-passed /tmp/tests-passed
