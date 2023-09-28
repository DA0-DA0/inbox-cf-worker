import { Env, InboxItemTypeMethod, InboxItemType } from '../types'
import { typeEnabledKey } from './keys'

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
  const allowedMethods =
    type in TYPE_ALLOWED_METHODS
      ? TYPE_ALLOWED_METHODS[type as InboxItemType]
      : []
  if (!allowedMethods.includes(method)) {
    return false
  }

  const config = await getTypeConfig(env, bech32Hex, type)
  // Default to disabled.
  if (config === null || isNaN(config)) {
    return false
  }

  return (Number(config) & method) === method
}

// Allowed methods per type.
export const TYPE_ALLOWED_METHODS: Record<
  InboxItemType,
  InboxItemTypeMethod[]
> = {
  [InboxItemType.JoinedDao]: [
    InboxItemTypeMethod.Website,
    InboxItemTypeMethod.Email,
    InboxItemTypeMethod.Push,
  ],
  [InboxItemType.ProposalCreated]: [
    InboxItemTypeMethod.Email,
    InboxItemTypeMethod.Push,
  ],
  [InboxItemType.ProposalExecuted]: [
    InboxItemTypeMethod.Email,
    InboxItemTypeMethod.Push,
  ],
  [InboxItemType.ProposalClosed]: [
    InboxItemTypeMethod.Email,
    InboxItemTypeMethod.Push,
  ],
}
