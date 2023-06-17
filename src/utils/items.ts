import { Env, LoadedItem } from '../types'
import { itemKey } from './keys'

export const getItemsForWallet = async (
  { INBOX }: Env,
  bech32Hex: string,
  // If passed, will filter items by type.
  type?: string,
  // If passed, will filter items by chain ID.
  chainId?: string
): Promise<LoadedItem[]> => {
  // Get all IDs by paginating list query.
  const ids: string[] = []
  let cursor: string | undefined
  while (true) {
    const response = await INBOX.list({
      // Filter by type if defined.
      prefix: itemKey(bech32Hex, type ? `${type}/` : ''),
      cursor,
    })

    ids.push(...response.keys.map((k) => k.name.split(':').slice(2).join(':')))

    if (response.list_complete) {
      break
    }

    cursor = response.cursor
  }

  // Load items for IDs.
  const items = await Promise.all(
    ids.map(async (id): Promise<LoadedItem> => {
      const { value, metadata } = await INBOX.getWithMetadata(
        itemKey(bech32Hex, id)
      )

      return {
        id,
        timestamp:
          typeof metadata === 'object' &&
          !!metadata &&
          'timestamp' in metadata &&
          typeof metadata.timestamp === 'string'
            ? metadata.timestamp
            : undefined,
        chainId:
          typeof metadata === 'object' &&
          !!metadata &&
          'chainId' in metadata &&
          typeof metadata.chainId === 'string'
            ? metadata.chainId
            : undefined,
        data: value && JSON.parse(value),
      }
    })
  )

  // Filter by chain ID if defined.
  return chainId ? items.filter((item) => item.chainId === chainId) : items
}
