import { Request as IttyRequest } from 'itty-router'

export interface Env {
  NONCES: KVNamespace
  INBOX: KVNamespace

  EMAILS: Queue<Email>

  // Secrets.
  ADD_SECRET: string
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
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
}

export enum InboxItemTypeMethod {
  Website = 1 << 0,
  Email = 1 << 1,
}

export enum EmailTemplate {
  VerifyEmail = 'inbox-verify',
  JoinedDao = 'inbox-joined_dao',
  ProposalCreated = 'inbox-proposal_created',
}

export type InboxItemTypeJoinedDaoData = {
  dao: string
  name: string
  imageUrl: string | undefined
}

export type InboxItemTypeProposalCreatedData = {
  dao: string
  daoName: string
  imageUrl: string | undefined
  proposalId: string
  proposalTitle: string
}

export type Email = {
  from: string
  to: string
  template: string
  variables: Record<string, string>
}
