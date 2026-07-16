# Architecture Decision Records

## Цель

Фиксировать ключевые архитектурные решения Maya OS, чтобы команда понимала не
только "что делаем", но и почему не выбрали другие пути.

## ADR Index

- [ADR 0001 - Maya OS Platform Core](0001-platform-core.md)
- [ADR 0002 - AI Tools And Human Approval](0002-ai-tools-and-approval.md)
- [ADR 0003 - Universal Domain Model](0003-universal-domain-model.md)

## Правило

Новый ADR нужен, когда решение влияет на:

- tenant isolation;
- security/privacy;
- AI tool execution;
- data model;
- platform/runtime boundary;
- billing or marketplace;
- migration/cutover strategy.
