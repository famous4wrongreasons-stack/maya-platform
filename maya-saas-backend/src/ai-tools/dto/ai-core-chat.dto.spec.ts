import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AiCoreChatDto } from './ai-core-chat.dto';

function buildDto(audience: unknown) {
  return plainToInstance(AiCoreChatDto, {
    surface: 'native',
    audience,
    requestId: 'native-chat-contract-1',
    messages: [{ role: 'user', content: 'Здравствуйте' }],
  });
}

describe('AiCoreChatDto', () => {
  it.each(['client', 'staff', 'owner'] as const)(
    'accepts the native UI audience hint %s',
    async (audience) => {
      await expect(
        validate(buildDto(audience), {
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      ).resolves.toHaveLength(0);
    },
  );

  it('rejects an unsupported audience value', async () => {
    const errors = await validate(buildDto('superadmin'), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'audience' }),
      ]),
    );
  });
});
