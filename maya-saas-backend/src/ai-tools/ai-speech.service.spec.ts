import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AiSpeechService, type UploadedSpeechFile } from './ai-speech.service';

describe('AiSpeechService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends only PCM payload to SpeechKit and returns the transcript', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({ result: 'Привет, MAYA' }),
    } as unknown as Response);
    const service = createService({
      YANDEX_SPEECHKIT_API_KEY: 'server-only-speech-key',
      AI_SPEECH_TIMEOUT_MS: '5000',
    });
    const file = wavFile(Buffer.from([1, 2, 3, 4]));

    await expect(service.transcribe(file)).resolves.toEqual({
      transcript: 'Привет, MAYA',
    });

    const [url, request] = fetchMock.mock.calls[0] ?? [];
    const requestUrl =
      typeof url === 'string' ? url : url instanceof URL ? url.href : '';
    expect(requestUrl).toContain('stt.api.cloud.yandex.net');
    expect(requestUrl).toContain('sampleRateHertz=16000');
    expect((request?.headers as Record<string, string>).Authorization).toBe(
      'Api-Key server-only-speech-key',
    );
    expect(request?.body).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('rejects malformed audio before contacting the provider', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    const service = createService({
      YANDEX_SPEECHKIT_API_KEY: 'server-only-speech-key',
    });

    await expect(
      service.transcribe({
        buffer: Buffer.from('not-a-wave'),
        mimetype: 'audio/wav',
        originalname: 'broken.wav',
        size: 10,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function createService(values: Record<string, string>) {
  const config = new ConfigService(values);
  return new AiSpeechService(config);
}

function wavFile(pcm: Buffer): UploadedSpeechFile {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16_000, 24);
  header.writeUInt32LE(32_000, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  const buffer = Buffer.concat([header, pcm]);
  return {
    buffer,
    mimetype: 'audio/wav',
    originalname: 'maya.wav',
    size: buffer.length,
  };
}
