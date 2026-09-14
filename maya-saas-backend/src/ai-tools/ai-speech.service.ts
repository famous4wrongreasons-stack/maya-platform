import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const MAX_AUDIO_BYTES = 1024 * 1024;
const SPEECH_SAMPLE_RATE = 16_000;
const DEFAULT_TIMEOUT_MS = 20_000;

export interface UploadedSpeechFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

type YandexSpeechResponse = {
  result?: string;
};

@Injectable()
export class AiSpeechService {
  private readonly logger = new Logger(AiSpeechService.name);

  constructor(private readonly configService: ConfigService) {}

  fromBase64(raw: string | undefined): UploadedSpeechFile | undefined {
    if (!raw || typeof raw !== 'string') {
      return undefined;
    }
    const trimmed = raw.trim();
    const comma = trimmed.indexOf(',');
    const payload =
      /^data:/i.test(trimmed) && comma >= 0
        ? trimmed.slice(comma + 1)
        : trimmed;
    if (!payload || payload.length > MAX_AUDIO_BYTES * 2) {
      throw this.invalidAudio('Голосовая запись пуста или слишком длинная.');
    }
    let buffer: Buffer;
    try {
      buffer = Buffer.from(payload, 'base64');
    } catch {
      throw this.invalidAudio('Неподдерживаемый формат голосовой записи.');
    }
    if (!buffer.length) {
      throw this.invalidAudio('Голосовая запись пуста.');
    }
    return {
      buffer,
      mimetype: 'audio/wav',
      originalname: 'maya.wav',
      size: buffer.length,
    };
  }

  async transcribe(file: UploadedSpeechFile | undefined) {
    const pcm = this.extractPcm(file);
    const startedAt = Date.now();
    const apiKey = this.configService
      .get<string>('YANDEX_SPEECHKIT_API_KEY')
      ?.trim();

    if (!apiKey) {
      throw this.providerUnavailable();
    }

    let response: Response;
    try {
      response = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          Authorization: `Api-Key ${apiKey}`,
          'Content-Type': 'application/octet-stream',
        },
        body: new Uint8Array(pcm),
        signal: AbortSignal.timeout(this.timeoutMs()),
      });
    } catch {
      this.logger.warn(
        `Speech provider request failed after ${Date.now() - startedAt} ms (${pcm.length} audio bytes)`,
      );
      throw this.providerUnavailable();
    }

    if (!response.ok) {
      this.logger.warn(
        `Speech provider returned HTTP ${response.status} after ${Date.now() - startedAt} ms (${pcm.length} audio bytes)`,
      );
      throw this.providerUnavailable();
    }

    let payload: YandexSpeechResponse;
    try {
      payload = (await response.json()) as YandexSpeechResponse;
    } catch {
      this.logger.warn(
        `Speech provider returned invalid JSON after ${Date.now() - startedAt} ms (${pcm.length} audio bytes)`,
      );
      throw this.providerUnavailable();
    }

    const transcript = String(payload.result ?? '').trim();
    if (!transcript) {
      this.logger.warn(
        `Speech provider returned an empty transcript after ${Date.now() - startedAt} ms (${pcm.length} audio bytes)`,
      );
      throw new BadRequestException({
        message: 'Не удалось расслышать голос. Повторите ещё раз.',
        error: { code: 'speech_not_recognized' },
      });
    }

    this.logger.log(
      `Speech transcription completed in ${Date.now() - startedAt} ms (${pcm.length} audio bytes)`,
    );
    return { transcript };
  }

  private extractPcm(file: UploadedSpeechFile | undefined): Buffer {
    if (!file?.buffer?.length) {
      throw this.invalidAudio('Голосовая запись пуста.');
    }
    if (file.buffer.length > MAX_AUDIO_BYTES || file.size > MAX_AUDIO_BYTES) {
      throw this.invalidAudio('Голосовая запись слишком длинная.');
    }

    const wav = file.buffer;
    if (
      wav.length < 44 ||
      wav.toString('ascii', 0, 4) !== 'RIFF' ||
      wav.toString('ascii', 8, 12) !== 'WAVE'
    ) {
      throw this.invalidAudio('Неподдерживаемый формат голосовой записи.');
    }

    let audioFormat = 0;
    let channels = 0;
    let sampleRate = 0;
    let bitsPerSample = 0;
    let pcm: Buffer | null = null;
    let offset = 12;

    while (offset + 8 <= wav.length) {
      const chunkId = wav.toString('ascii', offset, offset + 4);
      const chunkLength = wav.readUInt32LE(offset + 4);
      const chunkStart = offset + 8;
      const chunkEnd = chunkStart + chunkLength;
      if (chunkEnd > wav.length) {
        throw this.invalidAudio('Голосовая запись повреждена.');
      }

      if (chunkId === 'fmt ') {
        if (chunkLength < 16) {
          throw this.invalidAudio('Голосовая запись повреждена.');
        }
        audioFormat = wav.readUInt16LE(chunkStart);
        channels = wav.readUInt16LE(chunkStart + 2);
        sampleRate = wav.readUInt32LE(chunkStart + 4);
        bitsPerSample = wav.readUInt16LE(chunkStart + 14);
      } else if (chunkId === 'data') {
        pcm = wav.subarray(chunkStart, chunkEnd);
      }

      offset = chunkEnd + (chunkLength % 2);
    }

    if (
      audioFormat !== 1 ||
      channels !== 1 ||
      sampleRate !== SPEECH_SAMPLE_RATE ||
      bitsPerSample !== 16 ||
      !pcm?.length
    ) {
      throw this.invalidAudio('Нужна запись WAV: 16 кГц, mono, PCM16.');
    }

    return pcm;
  }

  private endpoint(): string {
    const query = new URLSearchParams({
      lang: 'ru-RU',
      format: 'lpcm',
      sampleRateHertz: String(SPEECH_SAMPLE_RATE),
      topic: 'general',
      profanityFilter: 'false',
    });
    return `https://stt.api.cloud.yandex.net/speech/v1/stt:recognize?${query.toString()}`;
  }

  private timeoutMs(): number {
    const configured = Number(
      this.configService.get<string>('AI_SPEECH_TIMEOUT_MS'),
    );
    return Number.isFinite(configured) && configured >= 1_000
      ? Math.min(configured, 60_000)
      : DEFAULT_TIMEOUT_MS;
  }

  private invalidAudio(message: string): BadRequestException {
    return new BadRequestException({
      message,
      error: { code: 'invalid_speech_audio' },
    });
  }

  private providerUnavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      message: 'Распознавание голоса временно недоступно.',
      error: { code: 'speech_provider_unavailable' },
    });
  }
}
