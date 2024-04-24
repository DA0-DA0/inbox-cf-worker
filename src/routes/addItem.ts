import { fromBech32, toHex } from '@cosmjs/encoding'
import { Request as IttyRequest } from 'itty-router'

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
  InboxItemTypePendingProposalCreatedData,
  InboxItemTypePendingProposalRejectedData,
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
  triggerEvent,
} from '../utils'
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

    // Notify WebSocket.
    await triggerEvent(env, `inbox_${bech32Hex}`, 'add', {
      type: 'add',
      data: {
        id,
      },
    })
  }

  // Get all bech32 hashes for the profile so we can send notifications to all
  // emails and push subscribers configured by the profile's wallets.
  let bech32Hashes = [bech32Hex]
  try {
    const profile: {
      chains: Record<
        string,
        {
          publicKey: string
        }
      >
    } = await (
      await fetch(`https://pfpk.daodao.zone/bech32/${bech32Hex}`)
    ).json()

    // If profile loaded and has chains, get unique bech32 hashes.
    if (
      objectMatchesStructure(profile, {
        chains: {},
      }) &&
      Array.isArray(profile.chains) &&
      Object.values(profile.chains).length > 0
    ) {
      // Get unique bech32 hashes.
      bech32Hashes = Array.from(
        new Set(
          Object.values(profile.chains).map(({ publicKey }) =>
            secp256k1PublicKeyToBech32Hex(publicKey)
          )
        )
      )
    }
  } catch (err) {
    console.log(`Failed to load profile for ${bech32Hex}.`, err)
  }

  // Collect recipients for all bech32 hashes.
  const recipients = await Promise.all(
    bech32Hashes.map(async (bech32Hash) => {
      const email = await getVerifiedEmail(env, bech32Hash)
      const isEmailAllowed = email
        ? await isTypeMethodEnabled(
            env,
            bech32Hash,
            body.type,
            InboxItemTypeMethod.Email
          )
        : false

      const pushSubscriptions = await getPushSubscriptions(env, bech32Hash)
      const isPushAllowed =
        pushSubscriptions.length > 0
          ? await isTypeMethodEnabled(
              env,
              bech32Hash,
              body.type,
              InboxItemTypeMethod.Push
            )
          : false

      return {
        bech32Hash,
        email: isEmailAllowed ? email : null,
        pushSubscriptions: isPushAllowed ? pushSubscriptions : [],
      }
    })
  )

  const emails = recipients.flatMap(({ bech32Hash, email }) =>
    email
      ? [
          {
            bech32Hash,
            email,
          },
        ]
      : []
  )
  const pushSubscriptions = recipients.flatMap(
    ({ bech32Hash, pushSubscriptions }) =>
      pushSubscriptions.length > 0
        ? {
            bech32Hash,
            pushSubscriptions,
          }
        : []
  )

  if (emails.length > 0) {
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
          template = EmailTemplate.Proposal
          variables = {
            subject: `${body.data.fromApprover ? 'Approval ' : ''}Proposal ${
              body.data.proposalId
            }: ${body.data.proposalTitle}`,
            url: `https://daodao.zone/dao/${body.data.dao}/proposals/${body.data.proposalId}`,
            daoName: body.data.daoName,
            imageUrl: body.data.imageUrl || 'https://daodao.zone/daodao.png',
            preview: `A new ${
              body.data.fromApprover ? 'approval ' : ''
            }proposal is open for voting in ${body.data.daoName}.`,
            title: `New ${body.data.fromApprover ? 'Approval ' : ''}Proposal`,
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

          template = EmailTemplate.Proposal
          variables = {
            subject: `${body.data.fromApprover ? 'Approval ' : ''}Proposal ${
              body.data.proposalId
            } Passed and ${status}: ${body.data.proposalTitle}`,
            url: `https://daodao.zone/dao/${body.data.dao}/proposals/${body.data.proposalId}`,
            daoName: body.data.daoName,
            imageUrl: body.data.imageUrl || 'https://daodao.zone/daodao.png',
            preview: `A proposal was passed and ${status.toLowerCase()} in ${
              body.data.daoName
            }.`,
            title: `${
              body.data.fromApprover ? 'Approval ' : ''
            }Proposal Passed and ${status}`,
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
          template = EmailTemplate.Proposal
          variables = {
            subject: `${body.data.fromApprover ? 'Approval ' : ''}Proposal ${
              body.data.proposalId
            } Rejected and Closed: ${body.data.proposalTitle}`,
            url: `https://daodao.zone/dao/${body.data.dao}/proposals/${body.data.proposalId}`,
            daoName: body.data.daoName,
            imageUrl: body.data.imageUrl || 'https://daodao.zone/daodao.png',
            preview: `A proposal was rejected and closed in ${body.data.daoName}.`,
            title: `${
              body.data.fromApprover ? 'Approval ' : ''
            }Proposal Rejected and Closed`,
          }
        }

        break
      case InboxItemType.PendingProposalCreated:
        if (
          objectMatchesStructure<InboxItemTypePendingProposalCreatedData>(
            body.data,
            {
              chainId: {},
              dao: {},
              daoName: {},
              proposalId: {},
              proposalTitle: {},
            }
          )
        ) {
          template = EmailTemplate.Proposal
          variables = {
            subject: `Pending Proposal ${body.data.proposalId}: ${body.data.proposalTitle}`,
            url: `https://daodao.zone/dao/${body.data.dao}/proposals/${body.data.proposalId}`,
            daoName: body.data.daoName,
            imageUrl: body.data.imageUrl || 'https://daodao.zone/daodao.png',
            preview: `A new pending proposal is waiting to be approved in ${body.data.daoName}.`,
            title: 'New Pending Proposal',
          }
        }

        break
      case InboxItemType.PendingProposalRejected:
        if (
          objectMatchesStructure<InboxItemTypePendingProposalRejectedData>(
            body.data,
            {
              chainId: {},
              dao: {},
              daoName: {},
              proposalId: {},
              proposalTitle: {},
            }
          )
        ) {
          template = EmailTemplate.Proposal
          variables = {
            subject: `Pending Proposal ${body.data.proposalId} Rejected: ${body.data.proposalTitle}`,
            url: `https://daodao.zone/dao/${body.data.dao}/proposals/${body.data.proposalId}`,
            daoName: body.data.daoName,
            imageUrl: body.data.imageUrl || 'https://daodao.zone/daodao.png',
            preview: `A pending proposal was rejected in ${body.data.daoName}.`,
            title: 'Pending Proposal Rejected',
          }
        }

        break
    }

    // Send email. On failure, log error and continue.
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

      // TODO: Capture push failures and retry.
      await Promise.allSettled(
        emails.map(({ bech32Hash, email }) =>
          sendEmail(
            env,
            DEFAULT_EMAIL_SOURCE,
            email,
            template,
            variables
          ).catch((err) => {
            console.error(
              'Error sending email',
              bech32Hash,
              JSON.stringify(body),
              template,
              JSON.stringify(variables),
              err
            )
          })
        )
      )
    }
  }

  // Push notification.
  if (pushSubscriptions.length > 0) {
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
      case InboxItemType.PendingProposalCreated:
        if (
          objectMatchesStructure<InboxItemTypePendingProposalCreatedData>(
            body.data,
            {
              chainId: {},
              dao: {},
              daoName: {},
              proposalId: {},
              proposalTitle: {},
            }
          )
        ) {
          payload = {
            title: body.data.daoName,
            message: `New Pending Proposal: ${body.data.proposalTitle}`,
            imageUrl: body.data.imageUrl,
            deepLink: {
              type: 'proposal',
              coreAddress: body.data.dao,
              proposalId: body.data.proposalId,
            },
          }
        }

        break
      case InboxItemType.PendingProposalRejected:
        if (
          objectMatchesStructure<InboxItemTypePendingProposalRejectedData>(
            body.data,
            {
              chainId: {},
              dao: {},
              daoName: {},
              proposalId: {},
              proposalTitle: {},
            }
          )
        ) {
          payload = {
            title: body.data.daoName,
            message: `Pending Proposal Rejected: ${body.data.proposalTitle}`,
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

    // Send push notifications. On failure, log error and continue.
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
        pushSubscriptions.flatMap(({ bech32Hash, pushSubscriptions }) =>
          pushSubscriptions.map((subscription) =>
            sendPushNotification(env, subscription, payload).catch((err) => {
              console.error(
                'Error sending push notification',
                bech32Hash,
                JSON.stringify(body),
                JSON.stringify(payload),
                err
              )
            })
          )
        )
      )
    }
  }

  return respond(200, {
    success: true,
  })
}
