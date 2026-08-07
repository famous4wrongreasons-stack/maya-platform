#!/bin/bash
# Обёртка ssh для rsync: строку ProxyCommand нельзя протащить через -e без
# потери кавычек, поэтому опции заданы здесь. VPS закрыт напрямую (22, 80, 443),
# ходим только трамплином через Beget; ключи остаются на рабочей машине.
exec ssh \
  -o BatchMode=yes -o ConnectTimeout=25 -o ServerAliveInterval=15 \
  -o StrictHostKeyChecking=accept-new \
  -o ProxyCommand="ssh -i $HOME/.ssh/beget_deploy -o BatchMode=yes -o ConnectTimeout=20 -W %h:%p mocine3388@prime.beget.com" \
  -i "$HOME/.ssh/yandex_bot" \
  "$@"
