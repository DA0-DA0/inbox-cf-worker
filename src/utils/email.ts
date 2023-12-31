import { Email, EmailMetadata, EmailTemplate, Env } from '../types'
import { DEFAULT_EMAIL_SOURCE } from './constants'
import { emailKey } from './keys'
import { objectMatchesStructure } from './objectMatchesStructure'

// 3 days.
const EXPIRATION_MS = 3 * 24 * 60 * 60 * 1000

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

  // Send verification email.
  await sendEmail(env, DEFAULT_EMAIL_SOURCE, email, EmailTemplate.VerifyEmail, {
    url: `https://daodao.zone/inbox/verify?code=${verificationCode}`,
    expirationTime: EXPIRATION_MS / 1000 / 60 / 60 / 24 + ' days',
  })
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

  // Check if verification code expired.
  if (metadata.verificationSentAt + EXPIRATION_MS < Date.now()) {
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

export const getVerifiedEmail = async (
  { INBOX }: Env,
  bech32Hex: string
): Promise<string | null> => {
  const { value: email, metadata } = await INBOX.getWithMetadata<EmailMetadata>(
    emailKey(bech32Hex)
  )

  // No email or not verified.
  if (!email || !verifyEmailMetadata(metadata) || !metadata.verifiedAt) {
    return null
  }

  return email
}

export const sendEmail = async (
  { EMAILS }: Env,
  from: string,
  to: string,
  template: EmailTemplate,
  variables: Record<string, unknown>
) => {
  const email: Email = {
    from,
    to,
    template,
    variables: {
      ...variables,
      manageNotificationsUrl: 'https://daodao.zone/inbox/settings',
    },
  }

  await EMAILS.send(email)
}
