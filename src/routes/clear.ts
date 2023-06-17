import { secp256k1PublicKeyToBech32Hex } from '../crypto'
import { AuthorizedRequest, Env } from '../types'
import { itemKey, respond, respondError } from '../utils'

export const clear = async (
  request: AuthorizedRequest<{ ids: string[] }>,
  env: Env
): Promise<Response> => {
  if (
    !request.parsedBody.data.ids ||
    !Array.isArray(request.parsedBody.data.ids) ||
    request.parsedBody.data.ids.length === 0 ||
    request.parsedBody.data.ids.some((id) => typeof id !== 'string' || !id)
  ) {
    return respondError(400, 'Invalid request body')
  }

  // Derive bech32 hex from public key.
  const bech32Hex = secp256k1PublicKeyToBech32Hex(
    request.parsedBody.data.auth.publicKey
  )

  // Remove from items if exists.
  await Promise.all(
    request.parsedBody.data.ids.map((id) =>
      env.INBOX.delete(itemKey(bech32Hex, id))
    )
  )

  // Return success.
  return respond(200, {
    success: true,
  })
}
