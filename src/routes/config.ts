import { secp256k1PublicKeyToBech32Hex } from '../crypto'
import {
  AuthorizedRequest,
  EmailMetadata,
  Env,
  InboxItemType,
  InboxItemTypeMethod,
} from '../types'
import {
  TYPE_ALLOWED_METHODS,
  emailKey,
  getPushSubscriptionKeys,
  getTypeConfigForWallet,
  isSubscribed,
  respond,
  respondError,
  subscribe,
  typeEnabledKey,
  unsubscribe,
  unsubscribeAll,
} from '../utils'
import {
  clearEmail,
  setEmail,
  verifyEmail,
  verifyEmailMetadata,
} from '../utils/email'

import { PushSubscription } from '@block65/webcrypto-web-push'

type ConfigBody = {
  // Update email. If empty or null, remove email.
  email?: string | null
  // Update notification settings per-type.
  types?: Record<string, number>
  // If present, verify email.
  verify?: string
  // If present, resend verification email.
  resend?: boolean
  // If present, update push settings.
  push?:
    | {
        // Add subscription.
        type: 'subscribe'
        subscription: PushSubscription
      }
    | {
        // Check if subscribed or unsubscribe.
        type: 'check' | 'unsubscribe'
        p256dh: string
      }
    | {
        // Unsubscribe all subscriptions.
        type: 'unsubscribe_all'
      }
}

type ConfigResponse = {
  email: string | null
  verified: boolean
  types: Record<string, number | null>
  // Number of registered push subscriptions.
  pushSubscriptions: number
  // If `push` is defined in the body, returns whether or not the push is now
  // subscribed.
  pushSubscribed?: boolean
  // Allowed methods per type.
  typeAllowedMethods: Record<InboxItemType, InboxItemTypeMethod[]>
}

export const config = async (
  request: AuthorizedRequest<ConfigBody>,
  env: Env
): Promise<Response> => {
  // Derive bech32 hex from public key.
  const bech32Hex = secp256k1PublicKeyToBech32Hex(
    request.parsedBody.data.auth.publicKey
  )

  const {
    email: newEmail,
    types,
    verify: verificationCode,
    push,
  } = request.parsedBody.data

  // Update email if present.
  if (typeof newEmail === 'string' || newEmail === null) {
    if (newEmail) {
      await setEmail(env, bech32Hex, newEmail)
    } else {
      await clearEmail(env, bech32Hex)
    }
  }

  // Update notification settings if present.
  if (typeof types === 'object') {
    await Promise.all(
      Object.entries(types).map(([type, config]) =>
        env.INBOX.put(typeEnabledKey(bech32Hex, type), `${config}`)
      )
    )
  }

  // Verify email if present.
  if (typeof verificationCode === 'string' && verificationCode.length > 0) {
    try {
      await verifyEmail(env, bech32Hex, verificationCode)
    } catch (err) {
      if (err instanceof Error) {
        return respondError(400, err.message)
      }

      console.error(
        'Error verifying email',
        request.parsedBody.data.auth.publicKey,
        verificationCode,
        err
      )
      return respondError(500, 'Internal server error.')
    }
  }

  let pushSubscribed: boolean | undefined
  // Count push subscriptions.
  let pushSubscriptions = (await getPushSubscriptionKeys(env, bech32Hex)).length

  if (push) {
    switch (push.type) {
      case 'subscribe':
        await subscribe(env, bech32Hex, push.subscription)
        pushSubscribed = true
        pushSubscriptions++
        break
      case 'check':
        pushSubscribed = await isSubscribed(env, bech32Hex, push.p256dh)
        break
      case 'unsubscribe':
        await unsubscribe(env, bech32Hex, push.p256dh)
        pushSubscribed = false
        pushSubscriptions--
        break
      case 'unsubscribe_all':
        await unsubscribeAll(env, bech32Hex)
        pushSubscribed = false
        pushSubscriptions = 0
        break
    }
  }

  // Get email.
  const { value: email, metadata } =
    await env.INBOX.getWithMetadata<EmailMetadata>(emailKey(bech32Hex))

  if (email && !verifyEmailMetadata(metadata)) {
    throw new Error(
      'Invalid email metadata. Try again in a few minutes or contact us.'
    )
  }

  const verified = verifyEmailMetadata(metadata) && metadata.verifiedAt !== null

  // Resend verification email. If just set email, verification email already
  // sent in `setEmail`.
  if (!newEmail && email && !verified && request.parsedBody.data.resend) {
    await setEmail(env, bech32Hex, email)
  }

  // Get notification settings.
  const typesConfig = await getTypeConfigForWallet(env, bech32Hex)

  const response: ConfigResponse = {
    email,
    verified,
    types: typesConfig,
    pushSubscriptions,
    pushSubscribed,
    typeAllowedMethods: TYPE_ALLOWED_METHODS,
  }

  // Return success.
  return respond(200, response)
}
