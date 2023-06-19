import { SESClient, SendTemplatedEmailCommand } from '@aws-sdk/client-ses'

import { EmailTemplate, Env } from '../types'

const REGION = 'us-east-1'
const SOURCE = 'notify@inbox.daodao.zone'

let ses: SESClient | undefined
const getSes = async ({ AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY }: Env) => {
  if (!ses) {
    ses = new SESClient({
      region: REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    })
  }

  return ses
}

export const sendEmail = async (
  env: Env,
  to: string,
  template: EmailTemplate,
  variables: Record<string, unknown>
) => {
  const ses = await getSes(env)

  const command = new SendTemplatedEmailCommand({
    Source: SOURCE,
    Destination: {
      ToAddresses: [to],
    },
    Template: template,
    TemplateData: JSON.stringify(variables),
  })

  await ses.send(command)
}
