# SB-1: минимальное решение о persistent correlation (JSON V2)

OPTION B и OTP-verifier уже одобрены. Это не повторное решение об authority. В вашем сообщении отдельно задан STOP: «If additional persistent correlation fields are actually required, STOP with the minimal additive schema decision before migration».

## Конкретное расширение

Разрешить **четыре новых immutable correlation members** внутри существующего `ClientLinkChallenge.issuanceEvidenceJson` для отдельной policy/contract V2:

```json
{
  "mayaUserId": "<authenticated User.id>",
  "mayaSubjectHash": "<canonical maya_user subject HMAC>",
  "verificationChannel": {
    "kind": "sms",
    "crmLinkId": "<server-resolved canonical CrmClientLink.id>",
    "addressHash": "<HMAC of tenant, Client, CRM source identity and canonical phone>"
  },
  "predecessorLinkId": "<exact latest revoked ClientChannelLink.id>"
}
```

Это дополнение к существующим tenantId/clientId, issuance provenance, tokenHash, issuedAt/expiresAt и outcome fields. **Новых SQL-колонок и моделей не требуется.** Plaintext phone и OTP не сохраняются в evidence; phone используется только в server-side delivery call.

V2 hash должен покрывать полный immutable proof tuple. При consume сервер сверяет текущий authenticated User/tenant, subject HMAC, exact Client, текущую canonical CRM/channel identity и latest revoked predecessor. Новый эпизод и consume outcome создаются одной транзакцией с существующей identity-lock и unique successor boundary. Исходная revoked строка не обновляется.

## Почему нельзя молча использовать V1

Реальная CHECK-схема ClientLinkChallenge разрешает фиксированный набор JSON keys, только policyVersion=1 и initial-only outcome. Сохранение каждого из четырёх новых members отвергается `ClientLinkChallenge_evidence_check`; V2 policy/shape также отвергается. PostgreSQL design proof выполнен на копии действующих CHECK constraints во временной таблице, полностью rollback. Public schema и identity rows не менялись.

Существующие hash/ref поля можно использовать для cryptographic commitments, но они не дают явной reconstructible DB correlation для User, channel и predecessor. Не предлагается перегружать старые string/hash поля упакованным payload или ослаблять guard ради сохранения формального числа полей.

## Граница одобрения

- Сохранить V1 issuance/consumption contract и initial-only guard без изменения поведения.
- Добавить отдельную строгую V2 JSON schema и conditional outcome/lifecycle checks.
- Correlation, issue time и TTL остаются immutable; никакого открытого JSON bag.
- Для V2 outcome: maya_user subject и tenant/Client совпадают с issuance; supersedesLinkId ровно равен сохранённому predecessor; этот predecessor принадлежит тому же Client/tenant/subject, отозван и является последним.
- Старые V1 rows не переписываются, defaults не переключаются, backfill отсутствует.
- OTP verifier и successor-consume остаются закрыты до реализации и успешного DB proof; schema/code approval не разрешает production migration, real OTP, linking владельца или widgets.runtime activation.

## Реализовано независимо от schema

1. Candidate resolver выбирает personal Client по существующей canonical User/Client lineage, проверяет active session/membership, exact latest revoked episode и identity holds. Historical link служит только адресацией кандидата, не authority.
2. Canonical phone берётся из exact provider/externalId записи через существующий CRM registry owner. Caller-selected Client/phone и User.phone fallback не используются.
3. Existing SMS.ru adapter получил строгий Client-verification entry: debug, SMSRU_TEST и отсутствующий provider отказывают до отправки. Ошибки нового entry не раскрывают SMS body/phone/code.
4. Ни новый HTTP endpoint, ни новый challenge/link writer не зарегистрированы. Успешное разрешение кандидата или принятие SMS провайдером не считается verified proof.

SMS.ru implementation в Maya существует. Его production configuration и фактическая доставка здесь не проверялись; реальные OTP не отправлялись. Это не заключение `VERIFIER TRANSPORT MISSING` для всей системы. Строгий entry возвращает такой отказ, если безопасный configured provider для вызова отсутствует.

## После решения

После одобрения четырёх JSON members можно реализовать atomic V2 flow и выполнить happy successor / wrong OTP / replay / expiry / Client substitution / tenant substitution / predecessor changed / predecessor active / non-latest predecessor / immutable revoked episode / exactly one successor / concurrent consume.

Эти двенадцать end-to-end/DB proof cases сейчас **NOT IMPLEMENTED / BLOCKED BY PERSISTENCE DECISION**. Зелёные candidate/transport tests не выдаются за их выполнение.

**RECOMMENDED:** approve the four JSON V2 correlation members above; no new columns, no new model, no V1 weakening.

**STOP:** только persistent V2 issuance/consumption и migration. Unrelated widget evidence work может продолжаться.
