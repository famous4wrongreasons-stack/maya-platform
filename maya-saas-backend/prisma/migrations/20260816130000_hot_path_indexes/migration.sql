-- Индексы под горячие пути. Только добавление, откат — DROP INDEX.
--
-- Размеры сняты на проде перед миграцией: Appointment 18 строк / 184 kB,
-- AuditLog 100 строк / 512 kB, User 112 kB. На таких объёмах обычный
-- CREATE INDEX отрабатывает мгновенно, поэтому CONCURRENTLY не нужен (и не
-- может быть использован: Prisma оборачивает файл миграции в транзакцию).

-- Вход по почте ищет пользователя ПО ВСЕМ арендаторам (users.service.ts:125),
-- поэтому User_tenantId_email_key с ведущим tenantId для него непригоден:
-- каждая попытка входа сканировала общую таблицу целиком.
CREATE INDEX "User_email_idx" ON "User" ("email");
CREATE INDEX "User_phone_idx" ON "User" ("phone");

-- Показ недели календаря без фильтра по мастеру: составной
-- (tenantId, staffExternalId, startAt) неприменим, GiST построен по
-- blockedStartAt/blockedEndAt. Оставался только индекс по арендатору, то есть
-- все записи салона за всю историю на каждое открытие сетки.
CREATE INDEX "Appointment_tenantId_startAt_idx" ON "Appointment" ("tenantId", "startAt");

-- Журнал аудита читается по времени, а не целиком.
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog" ("tenantId", "createdAt");
