FROM php:8.3-cli-alpine

WORKDIR /var/www

RUN apk add --no-cache sqlite-dev libpng-dev libzip-dev zip unzip \
    && docker-php-ext-install pdo pdo_sqlite bcmath

COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

COPY . .

RUN composer install --no-dev --optimize-autoloader --no-interaction

EXPOSE 8000

CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]

