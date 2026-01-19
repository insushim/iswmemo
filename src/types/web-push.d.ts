declare module 'web-push' {
  export interface PushSubscription {
    endpoint: string
    keys: {
      p256dh: string
      auth: string
    }
  }

  export interface SendResult {
    statusCode: number
    body: string
    headers: Record<string, string>
  }

  export interface VapidDetails {
    subject: string
    publicKey: string
    privateKey: string
  }

  export interface RequestOptions {
    vapidDetails?: VapidDetails
    TTL?: number
    headers?: Record<string, string>
    contentEncoding?: string
    proxy?: string
    agent?: unknown
    timeout?: number
  }

  export function setVapidDetails(
    subject: string,
    publicKey: string,
    privateKey: string
  ): void

  export function sendNotification(
    subscription: PushSubscription,
    payload?: string | Buffer | null,
    options?: RequestOptions
  ): Promise<SendResult>

  export function generateVAPIDKeys(): {
    publicKey: string
    privateKey: string
  }
}
