import { fromBech32, toHex } from '@cosmjs/encoding'
import { Env } from '../types'
import { getItemsForWallet, respond, respondError } from '../utils'
import { Request } from 'itty-router'

export const load = async (request: Request, env: Env): Promise<Response> => {
  const walletAddress = request.params?.walletAddress
  // Require wallet address and type.
  if (!walletAddress) {
    return respondError(400, 'Missing wallet address.')
  }

  // Optional type and chain ID in query.
  const type = request.query?.type
  const chainId = request.query?.chainId

  return respond(200, {
    items: await getItemsForWallet(
      env,
      toHex(fromBech32(walletAddress).data),
      type,
      chainId
    ),
  })
}
