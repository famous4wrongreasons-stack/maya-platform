// Exact AConsentGate submit function from local signed build 9. No secrets.
function submit() {
    if (status === 'need_pdn' && !pdn) {
      setErr('Поставьте галочку согласия на обработку персональных данных.');
      return;
    }
    setErr('');
    setBusy(true);
    var rq = window.__meAuthReq({
      accept_pdn: true,
      accept_marketing: !!mkt
    });
    if (!rq) {
      setBusy(false);
      return;
    }
    fetch(CONSENT_PROXY + '?action=consent_submit', {
      method: 'POST',
      headers: rq.headers,
      body: rq.body
    }).then(function (r) {
      return r.json().catch(function () {
        return null;
      });
    }).then(function (d) {
      setBusy(false);
      if (d && d.status === 'pass') {
        setShow(false);
        try {
          if (window.__meHydrate) window.__meHydrate('cabinet'); // перетянуть кабинет: needs_consent → full
        } catch (x) {}
        try {
          if (window.__meRefresh) window.__meRefresh();
        } catch (x) {}
      } else {
        setErr(d && d.message || 'Не удалось сохранить. Попробуйте ещё раз.');
      }
    }).catch(function () {
      setBusy(false);
      setErr('Ошибка сети. Попробуйте ещё раз.');
    });
  }
