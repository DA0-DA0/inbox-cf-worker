import { fromBech32, toHex } from '@cosmjs/encoding'
import { Env } from '../types'
import { respond, respondError } from '../utils'
import { Request } from 'itty-router'
import { verifyEmail } from '../utils/email'

export const verify = async (request: Request, env: Env): Promise<Response> => {
  const walletAddress = request.params?.walletAddress
  const code = request.params?.code
  const email = request.query?.email
  // Require wallet address, code, and email.
  if (!walletAddress) {
    return respondError(400, 'Missing wallet address.')
  }
  if (!code) {
    return respondError(400, 'Missing verification code.')
  }
  if (!email) {
    return respondError(400, 'Missing email.')
  }

  try {
    await verifyEmail(env, toHex(fromBech32(walletAddress).data), code)
  } catch (err) {
    if (err instanceof Error) {
      return respondError(400, err.message)
    }

    console.error('Error verifying email', walletAddress, code, email, err)
    return respondError(500, 'Internal server error.')
  }

  return respond(200, {
    success: true,
  })
}
