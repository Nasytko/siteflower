import { Injectable, Logger } from '@nestjs/common';
import type { IntegrationFailureCategory } from '@bouquet-one/contracts';
import { ConfigService } from '@nestjs/config';
import type { AppEnv } from '../config/env.validation';

export type TelegramSendResult =
  | { ok: true; messageId: string; latencyMs: number }
  | {
      ok: false;
      category: IntegrationFailureCategory;
      message: string;
      latencyMs: number | null;
      skipped?: boolean;
    };

/**
 * Telegram Bot API sender. Token never logged.
 * Independent of ERP HMAC — failures do not affect order persistence.
 */
@Injectable()
export class TelegramClient {
  private readonly logger = new Logger(TelegramClient.name);

  constructor(private readonly config: ConfigService<AppEnv, true>) {}

  get enabled(): boolean {
    const flag = this.config.get('TELEGRAM_NOTIFY_ENABLED', { infer: true });
    if (flag === false) return false;
    return Boolean(this.botToken && this.chatId);
  }

  get configured(): boolean {
    return Boolean(this.botToken && this.chatId);
  }

  private get botToken(): string | undefined {
    return this.config.get('TELEGRAM_BOT_TOKEN', { infer: true })?.trim() || undefined;
  }

  private get chatId(): string | undefined {
    return this.config.get('TELEGRAM_CHAT_ID', { infer: true })?.trim() || undefined;
  }

  async sendMessage(text: string): Promise<TelegramSendResult> {
    if (!this.enabled) {
      return {
        ok: false,
        category: 'CONFIGURATION_ERROR',
        message: 'Telegram notify disabled or not configured',
        latencyMs: null,
        skipped: true,
      };
    }

    const token = this.botToken!;
    const chatId = this.chatId!;
    const started = Date.now();
    const url = `https://api.telegram.org/bot${token}/sendMessage`;

    try {
      const controller = new AbortController();
      const timeoutMs = this.config.get('TELEGRAM_TIMEOUT_MS', { infer: true }) ?? 8000;
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            disable_web_page_preview: true,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const latencyMs = Date.now() - started;
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        result?: { message_id?: number };
        description?: string;
        error_code?: number;
      } | null;

      if (!response.ok || !body?.ok) {
        const desc = body?.description ?? `HTTP ${response.status}`;
        // Never include token in logs
        this.logger.warn(`Telegram send failed: ${desc.slice(0, 200)}`);
        const category: IntegrationFailureCategory =
          response.status === 429
            ? 'RATE_LIMITED'
            : response.status >= 500
              ? 'REMOTE_5XX'
              : response.status === 401 || response.status === 403
                ? 'AUTH_FAILED'
                : 'REMOTE_4XX';
        return { ok: false, category, message: desc.slice(0, 400), latencyMs };
      }

      const messageId = String(body.result?.message_id ?? 'ok');
      return { ok: true, messageId, latencyMs };
    } catch (err) {
      const latencyMs = Date.now() - started;
      const aborted = err instanceof Error && err.name === 'AbortError';
      return {
        ok: false,
        category: aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: aborted ? 'Telegram request timed out' : 'Telegram network error',
        latencyMs,
      };
    }
  }
}
