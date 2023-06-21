import { fromBech32, toHex } from '@cosmjs/encoding'
import {
  AddItemBody,
  EmailTemplate,
  Env,
  InboxItemType,
  InboxItemTypeMethod,
  InboxItemTypeJoinedDaoData,
  InboxItemTypeProposalCreatedData,
} from '../types'
import {
  CHAIN_ID_TO_DAO_DAO_SUBDOMAIN,
  itemKey,
  objectMatchesStructure,
  respond,
  respondError,
  getVerifiedEmail,
  isTypeMethodEnabled,
  sendEmail,
  DEFAULT_EMAIL_SOURCE,
} from '../utils'
import { Request as IttyRequest } from 'itty-router'
import { secp256k1PublicKeyToBech32Hex } from '../crypto'

export const addItem = async (
  request: Request & IttyRequest,
  env: Env
): Promise<Response> => {
  if (request.headers.get('x-api-key') !== env.ADD_SECRET) {
    return respondError(401, 'Invalid API key')
  }

  const body: AddItemBody = await request.json()
  if (
    !objectMatchesStructure(body, {
      type: {},
      data: {},
    })
  ) {
    return respondError(400, 'Invalid request body')
  }

  const bech32Address = request.params?.bech32Address
  const publicKey = request.params?.publicKey

  const bech32Hex = bech32Address
    ? toHex(fromBech32(bech32Address).data)
    : publicKey
    ? secp256k1PublicKeyToBech32Hex(publicKey)
    : null

  if (!bech32Hex) {
    return respondError(400, 'Invalid request query')
  }

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
    let template: EmailTemplate | undefined
    let variables: Record<string, unknown> | undefined

    switch (body.type) {
      case InboxItemType.JoinedDao:
        // If no chain ID, log error and continue.
        if (!body.chainId) {
          console.error('No chain ID', JSON.stringify(body))
          break
        }

        if (!(body.chainId in CHAIN_ID_TO_DAO_DAO_SUBDOMAIN)) {
          console.error('Invalid chain ID', JSON.stringify(body))
          break
        }

        if (
          objectMatchesStructure<InboxItemTypeJoinedDaoData>(
            body.data,
            {
              dao: {},
              name: {},
              imageUrl: {},
            },
            {
              ignoreNullUndefined: true,
            }
          )
        ) {
          template = EmailTemplate.JoinedDao
          variables = {
            name: body.data.name,
            imageUrl: body.data.imageUrl || 'https://daodao.zone/daodao.png',
            url: `https://${
              CHAIN_ID_TO_DAO_DAO_SUBDOMAIN[body.chainId]
            }.daodao.zone/dao/${body.data.dao}`,
          }
        }

        break
      case InboxItemType.ProposalCreated:
        // If no chain ID, log error and continue.
        if (!body.chainId) {
          console.error('No chain ID', JSON.stringify(body))
          break
        }

        if (!(body.chainId in CHAIN_ID_TO_DAO_DAO_SUBDOMAIN)) {
          console.error('Invalid chain ID', JSON.stringify(body))
          break
        }

        if (
          objectMatchesStructure<InboxItemTypeProposalCreatedData>(
            body.data,
            {
              dao: {},
              daoName: {},
              imageUrl: {},
              proposalId: {},
              proposalTitle: {},
            },
            {
              ignoreNullUndefined: true,
            }
          )
        ) {
          template = EmailTemplate.ProposalCreated
          variables = {
            url: `https://${
              CHAIN_ID_TO_DAO_DAO_SUBDOMAIN[body.chainId]
            }.daodao.zone/dao/${body.data.dao}/proposals/${
              body.data.proposalId
            }`,
            daoName: body.data.daoName,
            imageUrl: body.data.imageUrl || 'https://daodao.zone/daodao.png',
            proposalId: body.data.proposalId,
            proposalTitle: body.data.proposalTitle,
          }
        }

        break
    }

    // Send email. On failure, log error and continue.
    // TODO: Capture email failures and retry.
    if (template && variables) {
      await sendEmail(
        env,
        DEFAULT_EMAIL_SOURCE,
        email,
        template,
        variables
      ).catch((err) => {
        console.error(
          'Error sending email',
          email,
          JSON.stringify(body),
          template,
          JSON.stringify(variables),
          err
        )
      })
    }
  }

  return respond(200, {
    success: true,
  })
}
