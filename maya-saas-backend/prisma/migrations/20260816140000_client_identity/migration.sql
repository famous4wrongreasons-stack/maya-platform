-- Идентичность клиента внутри Maya.
--
-- До этого её не существовало: внешний id клиента адаптер вычислял и
-- ВЫБРАСЫВАЛ (пять вхождений в коде, ни одного потребителя, ни одного поля в
-- схеме), а единственным ключом сопоставления был телефон. Смена номера рвала
-- историю атрибуции, дубли карточек в CRM были неразрешимы, смена CRM
-- обнуляла связь с прошлым.
--
-- Обе таблицы новые. Ни одна существующая не изменяется. Откат — DROP.

CREATE TABLE "Client" (
    "id"                 TEXT NOT NULL,
    "tenantId"           TEXT NOT NULL,
    "userId"             TEXT,
    "phoneHash"          TEXT,
    "mergedIntoClientId" TEXT,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"          TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- Нужен для составных внешних ключей ниже: и для связи с карточкой провайдера,
-- и для tenant-безопасного слияния.
CREATE UNIQUE INDEX "Client_id_tenantId_key" ON "Client"("id", "tenantId");
-- phoneHash НЕ уникален: семья на один номер — обычное дело.
CREATE INDEX "Client_tenantId_phoneHash_idx" ON "Client"("tenantId", "phoneHash");
CREATE INDEX "Client_tenantId_userId_idx" ON "Client"("tenantId", "userId");

ALTER TABLE "Client" ADD CONSTRAINT "Client_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Слияние: ссылка СОСТАВНАЯ. Одноколоночная позволяла погасить клиента в
-- пользу клиента ЧУЖОГО арендатора — межарендное слияние на уровне базы.
ALTER TABLE "Client" ADD CONSTRAINT "Client_mergedIntoClientId_tenantId_fkey"
    FOREIGN KEY ("mergedIntoClientId", "tenantId") REFERENCES "Client"("id", "tenantId")
    ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Слияние на самого себя — молчаливый цикл, из которого разрешение дубля
-- никогда не выходит.
ALTER TABLE "Client" ADD CONSTRAINT "Client_merge_not_self_check"
    CHECK ("mergedIntoClientId" IS NULL OR "mergedIntoClientId" <> "id");

CREATE TABLE "CrmClientLink" (
    "id"         TEXT NOT NULL,
    "tenantId"   TEXT NOT NULL,
    "clientId"   TEXT NOT NULL,
    "provider"   TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "syncedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unlinkedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmClientLink_pkey" PRIMARY KEY ("id")
);

-- Карточка провайдера принадлежит НЕ БОЛЕЕ ЧЕМ ОДНОМУ клиенту Maya.
CREATE UNIQUE INDEX "CrmClientLink_tenantId_provider_externalId_key"
    ON "CrmClientLink"("tenantId", "provider", "externalId");
-- Обратного ключа на clientId НЕТ намеренно: один клиент владеет сколькими
-- угодно карточками, включая дубли одного провайдера. Дубли в YClients —
-- задокументированный боевой случай.
CREATE INDEX "CrmClientLink_tenantId_clientId_idx" ON "CrmClientLink"("tenantId", "clientId");
CREATE INDEX "CrmClientLink_tenantId_provider_syncedAt_idx"
    ON "CrmClientLink"("tenantId", "provider", "syncedAt");

ALTER TABLE "CrmClientLink" ADD CONSTRAINT "CrmClientLink_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Составной ключ: строка связи не может указывать на клиента другого
-- арендатора. То самое правило миграции strict_tenant_relations.
ALTER TABLE "CrmClientLink" ADD CONSTRAINT "CrmClientLink_clientId_tenantId_fkey"
    FOREIGN KEY ("clientId", "tenantId") REFERENCES "Client"("id", "tenantId")
    ON DELETE CASCADE ON UPDATE CASCADE;
