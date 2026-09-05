import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webPush from 'web-push';
import type { ClientWebPushSubscription } from '../crm/client-web-push.policy';

export type WebPushTransportOutcome =
  | 'SUCCEEDED'
  | 'DETERMINISTIC_FAILED'
  | 'PERMANENT_ENDPOINT_INVALID'
  | 'UNKNOWN';

/** Only this Communication Delivery adapter may perform Web Push I/O.
 * No redirects, arbitrary hosts, raw response/credential logging or retry. */
@Injectable()
export class CommunicationWebPushTransport {
  constructor(private readonly config: ConfigService) {}

  ready() {
    return Boolean(
      this.config.get<string>('WEBPUSH_VAPID_PRIVATE_KEY') &&
      this.config.get<string>('WEBPUSH_VAPID_PUBLIC_KEY') &&
      this.config.get<string>('WEBPUSH_VAPID_SUBJECT'),
    );
  }

  async send(
    subscription: ClientWebPushSubscription,
    payload: string,
    expiresAt: Date,
  ): Promise<WebPushTransportOutcome> {
    if (!this.accepts(subscription)) return 'DETERMINISTIC_FAILED';
    if (!this.ready()) return 'DETERMINISTIC_FAILED';
    const ttl = Math.floor((expiresAt.getTime() - Date.now()) / 1000);
    if (ttl <= 0) return 'DETERMINISTIC_FAILED';
    try {
      const result = await webPush.sendNotification(subscription, payload, {
        vapidDetails: {
          subject: this.config.getOrThrow<string>('WEBPUSH_VAPID_SUBJECT'),
          publicKey: this.config.getOrThrow<string>('WEBPUSH_VAPID_PUBLIC_KEY'),
          privateKey: this.config.getOrThrow<string>(
            'WEBPUSH_VAPID_PRIVATE_KEY',
          ),
        },
        TTL: ttl,
        timeout: 5000,
        contentEncoding: 'aes128gcm',
      });
      // Provider acceptance is terminal transport acceptance, not proof that
      // the person/device saw the notification.
      return result.statusCode >= 200 && result.statusCode < 300
        ? 'SUCCEEDED'
        : 'UNKNOWN';
    } catch (error: unknown) {
      const status =
        error && typeof error === 'object' && 'statusCode' in error
          ? Number(error.statusCode)
          : 0;
      // RFC 8030 section 7.3: expired subscription on the SEND operation.
      if (status === 404) return 'PERMANENT_ENDPOINT_INVALID';
      if (status >= 300 && status < 500) return 'DETERMINISTIC_FAILED';
      return 'UNKNOWN';
    }
  }

  accepts(subscription: ClientWebPushSubscription): boolean {
    try {
      const destination = new URL(subscription.endpoint);
      return (
        [
          'fcm.googleapis.com',
          'updates.push.services.mozilla.com',
          'web.push.apple.com',
        ].includes(destination.hostname) &&
        destination.protocol === 'https:' &&
        !destination.port &&
        !destination.username &&
        !destination.password
      );
    } catch {
      return false;
    }
  }
}
