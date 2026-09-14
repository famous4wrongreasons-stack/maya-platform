import type { CrmAdapterConfig } from '../crm-adapter.interface';
import { ScaffoldedCrmAdapter } from './scaffolded-crm.adapter';

/**
 * Каркас провайдера Whitelines: объявлен, но не реализован.
 *
 * 🔴 Тело жило копией на 104 строки в каждом из трёх каркасов. Одинаковый код
 * в трёх местах расходится поодиночке — так один из них и стал единственным,
 * кто на `getClientAppointments` возвращал пустой массив вместо отказа.
 *
 * Поведение сохранено дословно, кроме этой единственной лжи: теперь любая
 * необъявленная обязательная возможность отвечает явным
 * `CrmUnsupportedCapabilityError`, а `testConnection` по-прежнему честно
 * отдаёт `ok: false` с прежним текстом.
 */
export class WhitelinesCRMAdapter extends ScaffoldedCrmAdapter {
  constructor(config: CrmAdapterConfig) {
    super(config, 'Whitelines');
  }
}
