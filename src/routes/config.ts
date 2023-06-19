import { secp256k1PublicKeyToBech32Hex } from '../crypto'
import { AuthorizedRequest, EmailMetadata, Env } from '../types'
import {
  emailKey,
  getTypeConfigForWallet,
  respond,
  respondError,
  typeEnabledKey,
} from '../utils'
import {
  clearEmail,
  setEmail,
  verifyEmail,
  verifyEmailMetadata,
} from '../utils/email'

type ConfigBody = {
  // Update email. If empty or null, remove email.
  email?: string | null
  // Update notification settings per-type.
  types?: Record<string, number>
  // If present, verify email.
  verify?: string
  // If present, resend verification email.
  resend?: boolean
}

type ConfigResponse = {
  email: string | null
  verified: boolean
  types: Record<string, number | null>
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
      Object.entries(types).map(([type, config]) =>
        env.INBOX.put(typeEnabledKey(bech32Hex, type), `${config}`)
      )
    )
  }

  // Verify email if present.
  const verificationCode = request.parsedBody.data.verify
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
  }

  // Return success.
  return respond(200, response)
}
