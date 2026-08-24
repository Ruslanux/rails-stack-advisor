#!/usr/bin/env bash
# Собирает сайт локально и публикует его в ветку gh-pages.
#
# Нужен, пока на аккаунте заблокированы GitHub Actions. Когда они заработают,
# верните push-триггер в .github/workflows/pages.yml и переключите
# Settings -> Pages -> Source на "GitHub Actions" — этот скрипт станет не нужен.
set -euo pipefail

REPO_URL="$(git config --get remote.origin.url)"
BASEURL="${BASEURL:-/rails-stack-advisor}"
BUILD_DIR="$(mktemp -d)"
trap 'rm -rf "$BUILD_DIR"' EXIT

echo "==> Сборка (baseurl: $BASEURL)"
JEKYLL_ENV=production bundle exec jekyll build --baseurl "$BASEURL" --destination "$BUILD_DIR/site"

# .nojekyll не даёт GitHub повторно прогонять Jekyll по уже собранным файлам.
touch "$BUILD_DIR/site/.nojekyll"

echo "==> Публикация в gh-pages"
cd "$BUILD_DIR/site"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" config user.name || echo deploy)" \
    -c user.email="$(git -C "$OLDPWD" config user.email || echo deploy@local)" \
    commit -q -m "Сборка сайта $(date -u '+%Y-%m-%d %H:%M UTC')"
git remote add origin "$REPO_URL"
git push -q -f origin gh-pages

echo "==> Готово. Обновление на сайте появится через минуту-другую."
