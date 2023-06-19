import { EmailMetadata, Env } from '../types'
import { emailKey } from './keys'
import { objectMatchesStructure } from './objectMatchesStructure'

// Sets email and sends verification email. If already set, sends a new code,
// invalidating the old one.
export const setEmail = async (
  env: Env,
  bech32Hex: string,
  email: string
): Promise<void> => {
  const verificationCode = crypto.randomUUID()
  const verificationSentAt = Date.now()
  const metadata: EmailMetadata = {
    verificationCode,
    verificationSentAt,
    // Not yet verified.
    verifiedAt: null,
  }

  await env.INBOX.put(emailKey(bech32Hex), email, {
    metadata,
  })

  // TODO: Send verification email.
}

export const clearEmail = async (
  env: Env,
  bech32Hex: string
): Promise<void> => {
  await env.INBOX.delete(emailKey(bech32Hex))
}

export const verifyEmail = async (
  env: Env,
  bech32Hex: string,
  verificationCode: string
): Promise<void> => {
  const { value: email, metadata } =
    await env.INBOX.getWithMetadata<EmailMetadata>(emailKey(bech32Hex))

  if (!email) {
    throw new Error(
      'Email not found. Try again in a few minutes or contact us.'
    )
  }

  if (!verifyEmailMetadata(metadata)) {
    throw new Error(
      'Invalid email metadata. Try again in a few minutes or contact us.'
    )
  }

  if (metadata.verificationCode !== verificationCode) {
    throw new Error('Invalid verification code.')
  }

  // Check if verification code expired, 3 days.
  if (metadata.verificationSentAt + 3 * 24 * 60 * 60 * 1000 < Date.now()) {
    throw new Error('Verification code expired.')
  }

  // Mark email as verified.
  metadata.verificationCode = null
  metadata.verifiedAt = Date.now()

  await env.INBOX.put(emailKey(bech32Hex), email, {
    metadata,
  })
}

export const verifyEmailMetadata = (
  metadata: unknown
): metadata is EmailMetadata =>
  objectMatchesStructure(
    metadata,
    {
      verificationCode: {},
      verificationSentAt: {},
      verifiedAt: {},
    },
    {
      ignoreNullUndefined: true,
    }
  )
