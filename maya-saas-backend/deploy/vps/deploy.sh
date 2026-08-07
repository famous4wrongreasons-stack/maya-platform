#!/bin/bash
# Выкат бэкенда MAYA через Beget как трамплин.
#
# 🔴 ГЛАВНОЕ ПРАВИЛО: релиз собирается ЦЕЛИКОМ и ни на что не ссылается.
# Все три аварии 06-07.08 выросли из одного решения — зависимости не
# устанавливались, а перетаскивались из соседнего релиза:
#   а) cp -a скопировал симлинк на чужой node_modules → уборка снесла донора →
#      сервис упал при первом рестарте;
#   б) cp -aL разыменовал .bin → порвались относительные require → не
#      запустилась миграция;
#   в) вместе с зависимостями приезжал СТАРЫЙ сгенерированный клиент Prisma,
#      который не знал новых колонок → запись расхода упала бы в рантайме.
# Теперь на сервере честный npm ci. Медленнее на минуту, зато без чужого
# состояния.
#
# Второе правило: боевой симлинк переключается ТОЛЬКО после того, как новый
# релиз ответил на запасном порту, и ни один шаг не прячет код возврата.
set -euo pipefail

BE="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
JUMP="ssh -i $HOME/.ssh/beget_deploy -o BatchMode=yes -o ConnectTimeout=20 -W %h:%p mocine3388@prime.beget.com"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=25 -o ServerAliveInterval=15
          -o StrictHostKeyChecking=accept-new -o "ProxyCommand=$JUMP"
          -i "$HOME/.ssh/yandex_bot")
HOST="botadmin@111.88.148.206"
STAMP="${1:?укажите имя релиза, например 20260807i-clean-deploy}"
REL="/opt/maya-saas/releases/$STAMP"
KEEP=3   # меньше пяти: полноценный npm ci весит больше заимствованного

# 🔴 rsync разбивает значение -e по пробелам, а путь к проекту содержит их
# («сайт и приложение»). Кладём обёртку во временный путь без пробелов.
RSH="$(mktemp -d)/ssh-jump.sh"
cp "$HERE/ssh-jump.sh" "$RSH" && chmod +x "$RSH"
trap 'rm -rf "$(dirname "$RSH")"' EXIT

run() { ssh "${SSH_OPTS[@]}" "$HOST" "$@"; }
step() { echo; echo "### $*"; }
fail() { echo "ПРОВАЛ: $* — боевой релиз не тронут"; exit 1; }

step "1/7 каталог релиза"
# /opt/maya-saas/releases принадлежит maya-saas, поэтому создаём под sudo и
# сразу отдаём botadmin — иначе rsync не сможет писать.
run "sudo -n mkdir -p '$REL' && sudo -n chown botadmin:botadmin '$REL'" \
  || fail "каталог не создан"

step "2/7 заливка сборки"
# prisma.config.ts обязателен: в схеме нет url, строка подключения берётся
# оттуда. Без него migrate deploy падает с «datasource.url is required».
rsync -az --delete --timeout=180 -e "$RSH" \
  "$BE/dist" "$BE/package.json" "$BE/package-lock.json" "$BE/prisma" \
  "$BE/prisma.config.ts" "$BE/tsconfig.json" \
  "$HOST:$REL/" || fail "rsync"

step "3/7 установка зависимостей (npm ci, без dev)"
run "set -e
  cd '$REL'
  export PATH=/opt/node-v24/bin:\$PATH
  npm ci --omit=dev --no-audit --no-fund 2>&1 | tail -4
  test -d node_modules/@nestjs/common || { echo 'НЕТ @nestjs/common'; exit 1; }
  test -d node_modules/prisma        || { echo 'НЕТ prisma CLI'; exit 1; }
  # 🔴 Проверяем ЗАГРУЗКУ, а не наличие каталога. npm 11 блокирует
  # install-скрипты незнакомых пакетов, и нативный модуль может лежать на месте,
  # но не собраться. Пароли проверяются через bcrypt — молчаливая поломка тут
  # означает, что никто не может войти.
  node -e \"require('bcrypt').hashSync('x',4); console.log('bcrypt собран и работает')\"" \
  || fail "npm ci"

step "4/7 миграция базы (до переключения)"
run "set -e
  cd '$REL'
  export PATH=/opt/node-v24/bin:\$PATH
  set -a; . <(sudo -n cat /etc/maya-saas/live-widgets.env); set +a
  node node_modules/prisma/build/index.js migrate deploy 2>&1 | tail -6" \
  || fail "миграция"

step "5/7 клиент базы под свежую схему"
run "set -e
  cd '$REL'
  export PATH=/opt/node-v24/bin:\$PATH
  node node_modules/prisma/build/index.js generate 2>&1 | tail -3
  # Клиент обязан не только сгенерироваться, но и знать свежую схему: раньше он
  # приезжал из чужого релиза и не видел новых колонок — миграция проходила,
  # здоровье было зелёным, а первая же запись падала в рантайме.
  node -e \"const c=require('@prisma/client'); if(!c.PrismaClient||!c.Prisma) throw new Error('клиент неполный'); console.log('клиент базы сгенерирован и загружается')\"" \
  || fail "генерация клиента"

step "6/7 смоук на запасном порту 3199"
# Гейт по /api/health/ready, а не /api/health: ready проверяет соединение с
# базой. Здоровый процесс без базы — это не готовый релиз.
run "set -e
  cd '$REL'
  set -a; . <(sudo -n cat /etc/maya-saas/live-widgets.env); set +a
  PORT=3199 nohup /opt/node-v24/bin/node dist/src/main.js > /tmp/smoke-$STAMP.log 2>&1 &
  SPID=\$!
  CODE=''
  for i in \$(seq 1 25); do
    sleep 2
    CODE=\$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3199/api/health/ready || true)
    [ \"\$CODE\" = '200' ] && break
  done
  kill \$SPID 2>/dev/null || true
  [ \"\$CODE\" = '200' ] || { echo 'СМОУК ПРОВАЛЕН'; tail -25 /tmp/smoke-$STAMP.log; exit 1; }
  echo 'смоук пройден'" || fail "смоук"

step "7/7 переключение, проверка, уборка"
run "set -e
  PREV=\$(readlink /opt/maya-saas/current)
  echo \"\$PREV\" | sudo -n tee /opt/maya-saas/previous-release >/dev/null
  sudo -n ln -sfn '$REL' /opt/maya-saas/current
  sudo -n systemctl restart maya-saas

  OK=''
  for i in \$(seq 1 20); do
    sleep 2
    R=\$(curl -s http://127.0.0.1:3107/api/health || true)
    echo \"\$R\" | grep -q '$STAMP' && { OK=1; break; }
  done
  # 🔴 Проверка обязана уметь провалить выкат. Раньше цикл просто заканчивался,
  # и релиз, который не поднялся, считался выкаченным.
  if [ -z \"\$OK\" ]; then
    echo 'НОВЫЙ РЕЛИЗ НЕ ОТВЕТИЛ — откатываю на \$PREV'
    sudo -n ln -sfn \"\$PREV\" /opt/maya-saas/current
    sudo -n systemctl restart maya-saas
    exit 1
  fi
  echo \"здоровье: \$R\"
  curl -s http://127.0.0.1:3107/api/health/ready; echo

  echo '--- ошибки за 2 минуты ---'
  sudo -n journalctl -u maya-saas --since '2 min ago' -p err --no-pager | grep -v '^Journal file' | tail -8 || true

  # Уборка: никогда не трогаем current и предыдущий — им откатываться.
  echo '--- уборка (оставляю $KEEP + current + previous) ---'
  cd /opt/maya-saas/releases
  CUR=\$(basename \$(readlink /opt/maya-saas/current))
  PRV=\$(basename \"\$PREV\")
  ls -1t | tail -n +$((KEEP+1)) | grep -v \"^\$CUR\$\" | grep -v \"^\$PRV\$\" | xargs -r sudo -n rm -rf
  df -h /opt | tail -1" || fail "переключение или проверка"

echo
echo "### ГОТОВО: $STAMP"
