import {
  Body,
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { AuthenticatedUser } from '../common/authenticated-user.interface';
import { CurrentUser } from '../decorators/current-user.decorator';
import { TenantScoped } from '../decorators/tenant-scoped.decorator';
import { AiCoreService } from './ai-core.service';
import { AiSpeechService, type UploadedSpeechFile } from './ai-speech.service';
import { AiCoreChatDto } from './dto/ai-core-chat.dto';

@ApiTags('ai-core')
@ApiBearerAuth()
@TenantScoped()
@Controller('ai')
export class AiCoreController {
  constructor(
    private readonly aiCore: AiCoreService,
    private readonly aiSpeech: AiSpeechService,
  ) {}

  @Post('chat')
  @ApiOperation({
    summary: 'Run one privacy-safe, role-aware MAYA AI conversation turn',
  })
  chat(@CurrentUser() user: AuthenticatedUser, @Body() dto: AiCoreChatDto) {
    return this.aiCore.chat(user, dto);
  }

  @Post('transcribe')
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { files: 1, fileSize: 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      oneOf: [
        {
          type: 'object',
          required: ['audio'],
          properties: { audio: { type: 'string', format: 'binary' } },
        },
        {
          type: 'object',
          required: ['audioBase64'],
          properties: {
            audioBase64: {
              type: 'string',
              description:
                'WAV PCM16/16kHz as raw base64 or data:audio/wav;base64,... (native CapacitorHttp-safe)',
            },
          },
        },
      ],
    },
  })
  @ApiOperation({
    summary: 'Transcribe one short native voice message without storing audio',
  })
  transcribe(
    @UploadedFile() audio: UploadedSpeechFile | undefined,
    @Body() body?: { audioBase64?: string },
  ) {
    return this.aiSpeech.transcribe(
      audio ?? this.aiSpeech.fromBase64(body?.audioBase64),
    );
  }
}
