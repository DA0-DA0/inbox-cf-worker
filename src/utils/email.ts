import {
  EmailMetadata,
  EmailTemplate,
  Env,
  InboxItemType,
  InboxItemTypeMethod,
} from '../types'
import { emailKey, typeEnabledKey } from './keys'
import { objectMatchesStructure } from './objectMatchesStructure'
import { sendEmail } from './ses'

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
  await sendEmail(env, email, EmailTemplate.VerifyEmail, {
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

export const getTypeConfig = async (
  { INBOX }: Env,
  bech32Hex: string,
  type: string
): Promise<number | null> => {
  const config = await INBOX.get(typeEnabledKey(bech32Hex, type))
  if (!config) {
    return null
  }

  return Number(config)
}

export const isTypeMethodEnabled = async (
  env: Env,
  bech32Hex: string,
  type: string,
  method: InboxItemTypeMethod
): Promise<boolean> => {
  // Check if method is allowed for type.
  const allowedMethods = TYPE_ALLOWED_METHODS[type]
  if (allowedMethods && !allowedMethods.includes(method)) {
    return false
  }

  const config = await getTypeConfig(env, bech32Hex, type)
  // Default to enabled.
  if (config === null || isNaN(config)) {
    return true
  }

  return (Number(config) & method) === method
}

// If defined, only the listed methods are allowed for the given type.
// Otherwise, all methods are allowed.
const TYPE_ALLOWED_METHODS: Record<string, InboxItemTypeMethod[] | undefined> =
  {
    [InboxItemType.ProposalCreated]: [InboxItemTypeMethod.Email],
  }
