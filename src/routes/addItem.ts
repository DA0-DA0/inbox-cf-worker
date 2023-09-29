import { fromBech32, toHex } from '@cosmjs/encoding'
import {
  AddItemBody,
  EmailTemplate,
  Env,
  InboxItemType,
  InboxItemTypeMethod,
  InboxItemTypeJoinedDaoData,
  InboxItemTypeProposalCreatedData,
  PushNotificationPayload,
  InboxItemTypeProposalExecutedData,
  InboxItemTypeProposalClosedData,
} from '../types'
import {
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
import { getPushSubscriptions, sendPushNotification } from '../utils/push'

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
        if (
          objectMatchesStructure<InboxItemTypeJoinedDaoData>(body.data, {
            chainId: {},
            dao: {},
            name: {},
          })
        ) {
          template = EmailTemplate.JoinedDao
          variables = {
            name: body.data.name,
            imageUrl: body.data.imageUrl || 'https://daodao.zone/daodao.png',
            url: `https://daodao.zone/dao/${body.data.dao}`,
          }
        }

        break
      case InboxItemType.ProposalCreated:
        if (
          objectMatchesStructure<InboxItemTypeProposalCreatedData>(body.data, {
            chainId: {},
            dao: {},
            daoName: {},
            proposalId: {},
            proposalTitle: {},
          })
        ) {
          template = EmailTemplate.ProposalCreated
          variables = {
            url: `https://daodao.zone/dao/${body.data.dao}/proposals/${body.data.proposalId}`,
            daoName: body.data.daoName,
            imageUrl: body.data.imageUrl || 'https://daodao.zone/daodao.png',
            proposalId: body.data.proposalId,
            proposalTitle: body.data.proposalTitle,
          }
        }

        break
      case InboxItemType.ProposalExecuted:
        if (
          objectMatchesStructure<InboxItemTypeProposalExecutedData>(body.data, {
            chainId: {},
            dao: {},
            daoName: {},
            proposalId: {},
            proposalTitle: {},
            failed: {},
          })
        ) {
          const status = body.data.failed ? 'Execution Failed' : 'Executed'

          template = EmailTemplate.ProposalExecuted
          variables = {
            url: `https://daodao.zone/dao/${body.data.dao}/proposals/${body.data.proposalId}`,
            daoName: body.data.daoName,
            imageUrl: body.data.imageUrl || 'https://daodao.zone/daodao.png',
            proposalId: body.data.proposalId,
            proposalTitle: body.data.proposalTitle,
            status,
            statusLowerCase: status.toLowerCase(),
          }
        }

        break
      case InboxItemType.ProposalClosed:
        if (
          objectMatchesStructure<InboxItemTypeProposalClosedData>(body.data, {
            chainId: {},
            dao: {},
            daoName: {},
            proposalId: {},
            proposalTitle: {},
          })
        ) {
          template = EmailTemplate.ProposalClosed
          variables = {
            url: `https://daodao.zone/dao/${body.data.dao}/proposals/${body.data.proposalId}`,
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
      // Transform image URL from IPFS if necessary.
      if (
        typeof variables.imageUrl === 'string' &&
        variables.imageUrl.startsWith('ipfs://')
      ) {
        variables.imageUrl = variables.imageUrl.replace(
          'ipfs://',
          'https://nftstorage.link/ipfs/'
        )
      }

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

  // Push notification.
  const pushSubscriptions = await getPushSubscriptions(env, bech32Hex)
  if (
    pushSubscriptions.length > 0 &&
    (await isTypeMethodEnabled(
      env,
      bech32Hex,
      body.type,
      InboxItemTypeMethod.Push
    ))
  ) {
    let payload: PushNotificationPayload | undefined

    switch (body.type) {
      case InboxItemType.JoinedDao:
        if (
          objectMatchesStructure<InboxItemTypeJoinedDaoData>(body.data, {
            chainId: {},
            dao: {},
            name: {},
          })
        ) {
          payload = {
            title: body.data.name,
            message: `You've been added to ${body.data.name}. Follow it to receive notifications.`,
            imageUrl: body.data.imageUrl,
            deepLink: {
              type: 'dao',
              coreAddress: body.data.dao,
            },
          }
        }

        break
      case InboxItemType.ProposalCreated:
        if (
          objectMatchesStructure<InboxItemTypeProposalCreatedData>(body.data, {
            chainId: {},
            dao: {},
            daoName: {},
            proposalId: {},
            proposalTitle: {},
          })
        ) {
          payload = {
            title: body.data.daoName,
            message: `New Proposal: ${body.data.proposalTitle}`,
            imageUrl: body.data.imageUrl,
            deepLink: {
              type: 'proposal',
              coreAddress: body.data.dao,
              proposalId: body.data.proposalId,
            },
          }
        }

        break
      case InboxItemType.ProposalExecuted:
        if (
          objectMatchesStructure<InboxItemTypeProposalExecutedData>(body.data, {
            chainId: {},
            dao: {},
            daoName: {},
            proposalId: {},
            proposalTitle: {},
            failed: {},
          })
        ) {
          payload = {
            title: body.data.daoName,
            message:
              `Proposal Passed and ${
                body.data.failed ? 'Execution Failed' : 'Executed'
              }: ${body.data.proposalTitle}` +
              // Add winning option if present.
              (body.data.winningOption
                ? ` (outcome: ${body.data.winningOption})`
                : ''),
            imageUrl: body.data.imageUrl,
            deepLink: {
              type: 'proposal',
              coreAddress: body.data.dao,
              proposalId: body.data.proposalId,
            },
          }
        }

        break
      case InboxItemType.ProposalClosed:
        if (
          objectMatchesStructure<InboxItemTypeProposalClosedData>(body.data, {
            chainId: {},
            dao: {},
            daoName: {},
            proposalId: {},
            proposalTitle: {},
          })
        ) {
          payload = {
            title: body.data.daoName,
            message: `Proposal Rejected and Closed: ${body.data.proposalTitle}`,
            imageUrl: body.data.imageUrl,
            deepLink: {
              type: 'proposal',
              coreAddress: body.data.dao,
              proposalId: body.data.proposalId,
            },
          }
        }

        break
    }

    // Send email. On failure, log error and continue.
    // TODO: Capture push failures and retry.
    // TODO: Remove expired or failed subscriptions.
    if (payload) {
      // Transform image URL from IPFS if necessary.
      if (
        typeof payload.imageUrl === 'string' &&
        payload.imageUrl.startsWith('ipfs://')
      ) {
        payload.imageUrl = payload.imageUrl.replace(
          'ipfs://',
          'https://nftstorage.link/ipfs/'
        )
      }

      await Promise.allSettled(
        pushSubscriptions.map(
          (subscription) =>
            payload &&
            sendPushNotification(env, subscription, payload).catch((err) => {
              console.error(
                'Error sending push notification',
                bech32Hex,
                JSON.stringify(body),
                JSON.stringify(payload),
                err
              )
            })
        )
      )
    }
  }

  return respond(200, {
    success: true,
  })
}
