import { Env } from '../types'
import { getItemsForWallet, respond, respondError } from '../utils'
import { Request } from 'itty-router'

export const loadBech32 = async (request: Request, env: Env): Promise<Response> => {
  const bech32Hash = request.params?.bech32Hash
  // Require bech32 hash.
  if (!bech32Hash) {
    return respondError(400, 'Missing bech32 hash.')
  }

  // Optional type and chain ID in query.
  const type = request.query?.type
  const chainId = request.query?.chainId

  return respond(200, {
    items: await getItemsForWallet(
      env,
      bech32Hash,
      type,
      chainId
    ),
  })
}
