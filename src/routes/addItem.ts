import { fromBech32, toHex } from '@cosmjs/encoding'
import {
  AddItemBody,
  EmailTemplate,
  Env,
  InboxItemType,
  InboxItemTypeMethod,
  InboxItemTypeJoinedDaoData,
} from '../types'
import {
  CHAIN_ID_TO_DAO_DAO_SUBDOMAIN,
  itemKey,
  objectMatchesStructure,
  respond,
  respondError,
} from '../utils'
import { getVerifiedEmail, isTypeMethodEnabled } from '../utils/email'
import { sendEmail } from '../utils/ses'

export const addItem = async (
  request: Request,
  env: Env
): Promise<Response> => {
  if (request.headers.get('x-api-key') !== env.INDEXER_WEBHOOK_SECRET) {
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
  if (
    await isTypeMethodEnabled(
      env,
      bech32Hex,
      body.type,
      InboxItemTypeMethod.Website
    )
  ) {
    const id = `${body.type}/${crypto.randomUUID()}`
    await env.INBOX.put(itemKey(bech32Hex, id), JSON.stringify(body.data), {
      metadata: {
        timestamp: new Date().toISOString(),
        chainId: body.chainId,
      },
    })
  }

  // Email notification.
  const email = await getVerifiedEmail(env, bech32Hex)
  if (
    email &&
    (await isTypeMethodEnabled(
      env,
      bech32Hex,
      body.type,
      InboxItemTypeMethod.Email
    ))
  ) {
    switch (body.type) {
      case InboxItemType.JoinedDao:
        // If no chain ID, log error and continue.
        if (!body.chainId) {
          console.error('No chain ID for joined DAO', JSON.stringify(body))
          break
        }

        if (!(body.chainId in CHAIN_ID_TO_DAO_DAO_SUBDOMAIN)) {
          console.error('Invalid chain ID for joined DAO', JSON.stringify(body))
          break
        }

        if (
          objectMatchesStructure<InboxItemTypeJoinedDaoData>(body.data, {
            dao: {},
            name: {},
          })
        ) {
          // Send email. On failure, log error and continue.
          // TODO: Capture email failures and retry.
          await sendEmail(env, email, EmailTemplate.JoinedDao, {
            name: body.data.name,
            url: `https://${
              CHAIN_ID_TO_DAO_DAO_SUBDOMAIN[body.chainId]
            }.daodao.zone/dao/${body.data.dao}`,
          }).catch((err) => {
            console.error(
              'Error sending email',
              email,
              EmailTemplate.JoinedDao,
              JSON.stringify(body.data),
              err
            )
          })
        }

        break
    }
  }

  return respond(200, {
    success: true,
  })
}
