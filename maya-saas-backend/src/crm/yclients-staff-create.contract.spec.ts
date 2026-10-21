import {
  staffCreateProposal,
  staffCreatePrepared,
  staffCreateReceipt,
  staffCreatePermissions,
  bindStaffCreateTurn,
} from './yclients-staff-create.contract';

describe('finite staff quick-create contract', () => {
  const proposal = { name: 'Тестовый мастер', specialization: 'Парикмахер' };
  it('retains exact bounded labels and explicit null account/position binding', () => {
    expect(staffCreateProposal(proposal)).toEqual(proposal);
    const result = staffCreatePrepared({
      ...proposal,
      company_id: '123',
      integration_revision: 'a'.repeat(64),
      permission_revision: 'b'.repeat(64),
      origin: 'YC-ST1-CHAT-1',
    });
    expect(result).toMatchObject(proposal);
  });
  it.each([
    'phone_number',
    'position_id',
    'user_id',
    'api_id',
    'fired',
    'hidden',
    'company_id',
    'url',
    'method',
  ])('refuses caller-authored %s', (key) => {
    expect(() => staffCreateProposal({ ...proposal, [key]: null })).toThrow();
  });
  it.each(['', ' x ', 'x\ny', 'x\u202ey', 'x'.repeat(241)])(
    'refuses ambiguous/unbounded label %j',
    (name) => {
      expect(() => staffCreateProposal({ ...proposal, name })).toThrow();
    },
  );
  it('does not turn missing permission, truthy strings, or price rights into staff authority', () => {
    expect(
      staffCreatePermissions({
        settings: { settings_master_access: true, master_create: true },
      }),
    ).toMatch(/^[a-f0-9]{64}$/);
    for (const settings of [
      {},
      { settings_master_access: true, master_create: 'true' },
      { settings_services_edit_price_access: true },
    ]) {
      expect(() => staffCreatePermissions({ settings })).toThrow();
    }
  });
  it('qualifies only exact native identity and proposal receipt', () => {
    const raw = { id: 201, company_id: 123, ...proposal, position: null };
    expect(staffCreateReceipt(raw, '123', proposal)).toEqual({
      staff_id: '201',
      company_id: '123',
      ...proposal,
      verified: true,
      source: 'yclients',
    });
    for (const change of [
      { company_id: 456 },
      { id: 0 },
      { name: 'Other' },
      { specialization: 'Other' },
      { position: { id: 7 } },
      { user_id: 88 },
    ]) {
      expect(() =>
        staffCreateReceipt({ ...raw, ...change }, '123', proposal),
      ).toThrow();
    }
  });
  it('binds only literal finite chat origin; negation, extra operation and model substitution cannot author input', () => {
    expect(
      bindStaffCreateTurn(
        'Создай сотрудника «Тестовый мастер» со специализацией «Парикмахер»',
      ),
    ).toEqual(proposal);
    for (const text of [
      'Не создай сотрудника «Тестовый мастер» со специализацией «Парикмахер»',
      'Создай сотрудника «Тестовый мастер» со специализацией «Парикмахер» и запиши клиента',
      'Создай сотрудника',
      'Создай сотрудников «А» и «Б»',
    ])
      expect(bindStaffCreateTurn(text)).toBeNull();
  });
});
