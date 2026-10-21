import 'reflect-metadata';
import {
  PATH_METADATA,
  METHOD_METADATA,
  HEADERS_METADATA,
} from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ClientConsentReadController } from './client-consent-read.controller';
import {
  OWN_CONSENT_READ,
  ClientConsentReadService,
} from './client-consent-read.service';

test('registered own GET has no subject selector and uses only server session evidence', () => {
  const owner = { readOwn: jest.fn(), qualifyExport: jest.fn() };
  const controller = new ClientConsentReadController(
    owner as unknown as ClientConsentReadService,
  );
  expect(Reflect.getMetadata(PATH_METADATA, ClientConsentReadController)).toBe(
    'privacy/consents',
  );
  expect(
    Reflect.getMetadata(
      METHOD_METADATA,
      Object.getOwnPropertyDescriptor(
        ClientConsentReadController.prototype,
        'read',
      )!.value as object,
    ),
  ).toBe(RequestMethod.GET);
  expect(
    Reflect.getMetadata(
      HEADERS_METADATA,
      Object.getOwnPropertyDescriptor(
        ClientConsentReadController.prototype,
        'read',
      )!.value as object,
    ),
  ).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
  expect(OWN_CONSENT_READ.route).toBe('GET /privacy/consents');
  void controller.read('Bearer synthetic', {});
  expect(owner.readOwn).toHaveBeenCalledWith(
    JSON.stringify({ type: 'maya_jwt', credential: 'synthetic' }),
  );
  for (const key of ['tenantId', 'clientId', 'role', 'range', 'source'])
    expect(() =>
      controller.read('Bearer synthetic', { [key]: 'forged' }),
    ).toThrow();
  for (const bad of [undefined, 'Bearer ', 'Basic forged'])
    expect(() => controller.read(bad, {})).toThrow();
  expect(owner.readOwn).toHaveBeenCalledTimes(1);
});

test('export route registers only qualification; no binary, download, consent mutation or generic tool dispatch', () => {
  const owner = { readOwn: jest.fn(), qualifyExport: jest.fn() };
  const controller = new ClientConsentReadController(
    owner as unknown as ClientConsentReadService,
  );
  expect(
    Reflect.getMetadata(
      PATH_METADATA,
      Object.getOwnPropertyDescriptor(
        ClientConsentReadController.prototype,
        'qualify',
      )!.value as object,
    ),
  ).toBe('export/qualification');
  expect(
    Reflect.getMetadata(
      METHOD_METADATA,
      Object.getOwnPropertyDescriptor(
        ClientConsentReadController.prototype,
        'qualify',
      )!.value as object,
    ),
  ).toBe(RequestMethod.POST);
  const range = {
    from: '2000-01-01T00:00:00.000Z',
    to: '2026-10-22T00:00:00.000Z',
  };
  void controller.qualify('Bearer synthetic', range);
  expect(owner.qualifyExport).toHaveBeenCalledWith(
    JSON.stringify({ type: 'maya_jwt', credential: 'synthetic' }),
    range,
  );
});
