// Key that stores an inbox item.
export const itemKey = (bech32Hex: string, id: string) =>
  `ITEM:${bech32Hex}:${id}`

// Key that stores a wallet's email.
export const emailKey = (bech32Hex: string) => `EMAIL:${bech32Hex}`

// Key that stores whether a type is enabled.
export const typeEnabledKey = (bech32Hex: string, type: string) =>
  `TYPE:${bech32Hex}:${type}`

// Key that stores a wallet's push keys.
export const pushKey = (
  bech32Hex: string,
  // Public key of subscription.
  p256dh: string
) => `PUSH:${bech32Hex}:${p256dh}`
