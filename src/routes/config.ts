import { secp256k1PublicKeyToBech32Hex } from '../crypto'
import { AuthorizedRequest, EmailMetadata, Env } from '../types'
import {
  emailKey,
  getTypeConfigForWallet,
  respond,
  typeEnabledKey,
} from '../utils'
import { clearEmail, setEmail, verifyEmailMetadata } from '../utils/email'

export type ConfigBody = {
  // Update email. If empty or null, remove email.
  email?: string | null
  // Update notification settings per-type.
  types?: Record<string, boolean>
}

export const config = async (
  request: AuthorizedRequest<ConfigBody>,
  env: Env
): Promise<Response> => {
  // Derive bech32 hex from public key.
  const bech32Hex = secp256k1PublicKeyToBech32Hex(
    request.parsedBody.data.auth.publicKey
  )

  // Update email if present.
  const newEmail = request.parsedBody.data.email
  if (typeof newEmail === 'string' || newEmail === null) {
    if (newEmail) {
      await setEmail(env, bech32Hex, newEmail)
    } else {
      await clearEmail(env, bech32Hex)
    }
  }

  // Update notification settings if present.
  const types = request.parsedBody.data.types
  if (typeof types === 'object') {
    await Promise.all(
      Object.entries(types).map(([type, enabled]) =>
        env.INBOX.put(typeEnabledKey(bech32Hex, type), enabled ? '1' : '0')
      )
    )
  }

  // Get email.
  const { value: email, metadata } =
    await env.INBOX.getWithMetadata<EmailMetadata>(emailKey(bech32Hex))

  if (!verifyEmailMetadata(metadata)) {
    throw new Error(
      'Invalid email metadata. Try again in a few minutes or contact us.'
    )
  }

  const verified = metadata.verifiedAt !== null

  // Resend verification email. If just set email, verification email already
  // sent in `setEmail`.
  if (!newEmail && email && !verified && request.query?.resend) {
    await setEmail(env, bech32Hex, email)
  }

  // Get notification settings.
  const config = await getTypeConfigForWallet(env, bech32Hex)

  // Return success.
  return respond(200, {
    email,
    verified,
    config,
  })
}
