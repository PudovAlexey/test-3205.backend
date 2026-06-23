import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { request } from 'undici';
import {
  UrlChecker,
  UrlCheckResult,
} from '../../domain/jobs/ports/url-checker.port';

/**
 * undici-based adapter for the {@link UrlChecker} port.
 */
@Injectable()
export class UndiciUrlChecker extends UrlChecker {
  private readonly headTimeoutMs: number;

  constructor(config?: ConfigService) {
    super();
    // Configurable so tests can override (defaults to 10s).
    this.headTimeoutMs = config?.get<number>('headTimeoutMs') ?? 10000;
  }

  async head(url: string, signal: AbortSignal): Promise<UrlCheckResult> {
    try {
      const res = await request(url, {
        method: 'HEAD',
        signal,
        headersTimeout: this.headTimeoutMs,
        bodyTimeout: this.headTimeoutMs,
        maxRedirections: 5,
      });

      // A HEAD response normally has no body, but drain defensively so the
      // underlying socket can be reused / released.
      try {
        await res.body?.dump?.();
      } catch {
        // ignore drain errors
      }

      return { httpStatus: res.statusCode, error: null, aborted: false };
    } catch (err: any) {
      if (err?.name === 'AbortError' || signal.aborted) {
        return { httpStatus: null, error: 'aborted', aborted: true };
      }

      const code: string = String(err?.code ?? '');
      if (code.toUpperCase().includes('TIMEOUT')) {
        return { httpStatus: null, error: 'timeout', aborted: false };
      }

      return {
        httpStatus: null,
        error: String(err?.code ?? err?.message ?? 'request failed'),
        aborted: false,
      };
    }
  }
}
