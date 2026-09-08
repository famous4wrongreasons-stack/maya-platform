import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'node:child_process';
import { dirname, isAbsolute } from 'node:path';

type PdfDownload = {
  ok: true;
  filename: string;
  content_type: 'application/pdf';
  data_base64: string;
  business_mutations: 0;
  messages: 0;
};

/** Read-only formatting via the existing local ReportLab runtime. No storage, DB or transport owner. */
@Injectable()
export class OwnerReportDownloadService {
  constructor(private readonly config: ConfigService) {}

  snapshot(snapshot: {
    periodLocalDate: string;
    timezone: string;
    content: { title: string; bodyText: string };
  }): Promise<PdfDownload> {
    return this.render('--render-stdin', {
      periodLocalDate: snapshot.periodLocalDate,
      timezone: snapshot.timezone,
      content: {
        title: snapshot.content.title,
        bodyText: snapshot.content.bodyText,
      },
    });
  }
  staticHelp(): Promise<PdfDownload> {
    return this.render('--static-help');
  }

  private render(
    mode: '--render-stdin' | '--static-help',
    input?: unknown,
  ): Promise<PdfDownload> {
    const python = this.config.get<string>('OWNER_REPORT_PDF_PYTHON');
    const renderer = this.config.get<string>('OWNER_REPORT_PDF_RENDERER');
    if (!python || !renderer || !isAbsolute(python) || !isAbsolute(renderer))
      throw new ServiceUnavailableException(
        'canonical_report_renderer_unavailable',
      );
    return new Promise((resolve, reject) => {
      // Fixed operator configuration; no shell and no caller-controlled path/arguments.
      const child = spawn(python, ['-B', renderer, mode], {
        cwd: dirname(renderer),
        stdio: ['pipe', 'pipe', 'ignore'],
        env: {
          PATH: '/usr/local/bin:/usr/bin:/bin',
          LANG: 'C.UTF-8',
          PYTHONDONTWRITEBYTECODE: '1',
        },
      });
      let output = '',
        overflow = false,
        settled = false;
      const fail = () => {
        if (!settled) {
          settled = true;
          reject(
            new ServiceUnavailableException(
              'canonical_report_download_unavailable',
            ),
          );
        }
      };
      const timer = setTimeout(() => {
        overflow = true;
        child.kill('SIGKILL');
      }, 6000);
      child.stdin.on('error', () => {
        child.kill('SIGKILL');
      });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (data: string) => {
        output += data;
        if (Buffer.byteLength(output, 'utf8') > 2 * 1024 * 1024) {
          overflow = true;
          child.kill('SIGKILL');
        }
      });
      child.once('error', () => {
        clearTimeout(timer);
        fail();
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (settled) return;
        if (code !== 0 || overflow) {
          fail();
          return;
        }
        try {
          const result = JSON.parse(output) as PdfDownload;
          if (
            result.ok !== true ||
            result.content_type !== 'application/pdf' ||
            result.business_mutations !== 0 ||
            result.messages !== 0 ||
            typeof result.filename !== 'string' ||
            !/^maya-[A-Za-z0-9-]+\.pdf$/.test(result.filename) ||
            typeof result.data_base64 !== 'string' ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(result.data_base64) ||
            Buffer.from(result.data_base64, 'base64')
              .subarray(0, 5)
              .toString() !== '%PDF-'
          )
            throw new Error('invalid renderer result');
          settled = true;
          resolve(result);
        } catch {
          fail();
        }
      });
      child.stdin.end(input === undefined ? '' : JSON.stringify(input));
    });
  }
}
