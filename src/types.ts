import { Request as IttyRequest } from 'itty-router'

export interface Env {
  NONCES: KVNamespace
  INBOX: KVNamespace
  PUSH: KVNamespace

  EMAILS: Queue<Email>

  // Secrets.
  ADD_SECRET: string
  WEB_PUSH_PUBLIC_KEY: string
  WEB_PUSH_PRIVATE_KEY: string
  PUSHER_HOST: string
  PUSHER_PORT: string
  PUSHER_APP_ID: string
  PUSHER_APP_KEY: string
  PUSHER_SECRET: string
}

export interface Auth {
  type: string
  nonce: number
  chainId: string
  chainFeeDenom: string
  chainBech32Prefix: string
  publicKey: string
}

export type RequestBody<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Data extends Record<string, unknown> = Record<string, any>
> = {
  data: {
    auth: Auth
  } & Data
  signature: string
}

export type AuthorizedRequest<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Data extends Record<string, any> = Record<string, any>
> = Request &
  IttyRequest & {
    parsedBody: RequestBody<Data>
  }

export type AddItemBody = {
  chainId?: string
  type: string
  data: unknown
}

export type LoadedItem = {
  id: string
  timestamp: string | undefined
  chainId: string | undefined
  data: unknown
}

export type EmailMetadata = {
  verificationCode: string | null
  verificationSentAt: number
  verifiedAt: number | null
}

export enum InboxItemType {
  JoinedDao = 'joined_dao',
  ProposalCreated = 'proposal_created',
  ProposalExecuted = 'proposal_executed',
  ProposalClosed = 'proposal_closed',
  PendingProposalCreated = 'pending_proposal_created',
}

export enum InboxItemTypeMethod {
  Website = 1 << 0,
  Email = 1 << 1,
  Push = 1 << 2,
}

export enum EmailTemplate {
  VerifyEmail = 'inbox-verify',
  JoinedDao = 'inbox-joined_dao',
  Proposal = 'inbox-proposal',
}

export type InboxItemTypeJoinedDaoData = {
  chainId: string
  dao: string
  name: string
  imageUrl: string | undefined
}

export type InboxItemTypeProposalCreatedData = {
  chainId: string
  dao: string
  daoName: string
  imageUrl: string | undefined
  proposalId: string
  proposalTitle: string
  fromApprover?: boolean
}

export type InboxItemTypeProposalExecutedData =
  InboxItemTypeProposalCreatedData & {
    failed: boolean
    // Winning option for a multiple choice proposal.
    winningOption?: string
  }

export type InboxItemTypeProposalClosedData = InboxItemTypeProposalCreatedData

export type InboxItemTypePendingProposalCreatedData = 
  Omit<InboxItemTypeProposalCreatedData, 'fromApprover'>

export type Email = {
  from: string
  to: string
  template: string
  variables: Record<string, string>
}

export type PushNotificationPayload = {
  title: string
  message: string
  imageUrl: string | undefined
  deepLink:
    | {
        type: 'dao'
        coreAddress: string
      }
    | {
        type: 'proposal'
        coreAddress: string
        proposalId: string
      }
}
