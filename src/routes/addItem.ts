import { fromBech32, toHex } from '@cosmjs/encoding'
import { AddItemBody, Env } from '../types'
import {
  itemKey,
  objectMatchesStructure,
  respond,
  respondError,
} from '../utils'

export const addItem = async (
  request: Request,
  { INBOX, INDEXER_WEBHOOK_SECRET }: Env
): Promise<Response> => {
  if (request.headers.get('x-api-key') !== INDEXER_WEBHOOK_SECRET) {
    return respondError(401, 'Invalid API key')
  }

  const body: AddItemBody = await request.json()
  if (
    !objectMatchesStructure(body, {
      walletAddress: {},
      type: {},
      data: {},
    })
  ) {
    return respondError(400, 'Invalid request body')
  }

  const bech32Hex = toHex(fromBech32(body.walletAddress).data)

  // Add to inbox.
  await INBOX.put(
    itemKey(bech32Hex, `${body.type}/${crypto.randomUUID()}`),
    JSON.stringify(body.data),
    {
      metadata: {
        timestamp: new Date().toISOString(),
        chainId: body.chainId,
      },
    }
  )

  return respond(200, {
    success: true,
  })
}
