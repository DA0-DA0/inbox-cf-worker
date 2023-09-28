import { Env, PushNotificationPayload } from '../types'
import { pushKey } from './keys'
import {
  PushSubscription,
  VapidKeys,
  PushMessage,
  buildPushPayload,
} from '@block65/webcrypto-web-push'
import { objectMatchesStructure } from './objectMatchesStructure'
import { SUPPORT_EMAIL } from './constants'

export const isPushSubscription = (value: unknown): value is PushSubscription =>
  objectMatchesStructure(value, {
    endpoint: {},
    keys: {
      p256dh: {},
      auth: {},
    },
  })

export const getPushSubscriptionKeys = async (
  { PUSH }: Env,
  bech32Hex: string
): Promise<string[]> => {
  // Paginate all push keys.
  const keys: string[] = []
  let cursor: string | undefined
  while (true) {
    const response = await PUSH.list({
      prefix: pushKey(bech32Hex, ''),
      cursor,
    })

    keys.push(...response.keys.map((k) => k.name))

    if (response.list_complete) {
      break
    }

    cursor = response.cursor
  }

  return keys
}

export const getPushSubscriptions = async (
  env: Env,
  bech32Hex: string
): Promise<PushSubscription[]> => {
  const keys = await getPushSubscriptionKeys(env, bech32Hex)
  const values = (
    await Promise.all(keys.map((key) => env.PUSH.get(key, 'json')))
  ).filter(isPushSubscription)

  return values
}

export const subscribe = (
  { PUSH }: Env,
  bech32Hex: string,
  subscription: PushSubscription
): Promise<void> =>
  PUSH.put(
    pushKey(bech32Hex, subscription.keys.p256dh),
    JSON.stringify(subscription)
  )

export const unsubscribe = (
  { PUSH }: Env,
  bech32Hex: string,
  p256dh: string
): Promise<void> => PUSH.delete(pushKey(bech32Hex, p256dh))

export const unsubscribeAll = async (
  env: Env,
  bech32Hex: string
): Promise<void> => {
  await Promise.all(
    (
      await getPushSubscriptionKeys(env, bech32Hex)
    ).map((key) => env.PUSH.delete(key))
  )
}

export const isSubscribed = async (
  { PUSH }: Env,
  bech32Hex: string,
  p256dh: string
): Promise<boolean> => !!(await PUSH.get(pushKey(bech32Hex, p256dh), 'json'))

export const sendPushNotification = async (
  { WEB_PUSH_PUBLIC_KEY, WEB_PUSH_PRIVATE_KEY }: Env,
  subscription: PushSubscription,
  payload: PushNotificationPayload
): Promise<void> => {
  const vapid: VapidKeys = {
    subject: 'mailto:' + SUPPORT_EMAIL,
    publicKey: WEB_PUSH_PUBLIC_KEY,
    privateKey: WEB_PUSH_PRIVATE_KEY,
  }

  const message: PushMessage = {
    data: JSON.stringify(payload),
  }

  const pushPayload = await buildPushPayload(message, subscription, vapid)

  await fetch(subscription.endpoint, pushPayload)
}
