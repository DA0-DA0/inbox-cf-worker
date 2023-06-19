import {
  CreateTemplateCommand,
  DeleteTemplateCommand,
  ListTemplatesCommand,
  SESClient,
  UpdateTemplateCommand,
} from '@aws-sdk/client-ses'
import { Command } from 'commander'
import dotenv from 'dotenv'

const { parsed: { AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = {} } =
  dotenv.config()

const REGION = 'us-east-1'

const program = new Command()
program.option('-c, --create <template>', 'create a new template from a file')
program.option('-u, --update <template>', 'update a new template from a file')
program.option('-l, --list', 'list all templates')
program.option('-d, --delete <template>', 'delete a template')

program.parse(process.argv)
const options = program.opts()

;(async () => {
  const ses = new SESClient({
    region: REGION,
    credentials: {
      accessKeyId: AWS_ACCESS_KEY_ID,
      secretAccessKey: AWS_SECRET_ACCESS_KEY,
    },
  })

  if (options.create) {
    const template = await import(options.create)
    await ses
      .send(
        new CreateTemplateCommand({
          Template: template,
        })
      )
      .then(() => console.log('Created'))
      .catch(console.error)
  } else if (options.update) {
    const template = await import(options.update)
    await ses
      .send(
        new UpdateTemplateCommand({
          Template: template,
        })
      )
      .then(() => console.log('Updated'))
      .catch(console.error)
  } else if (options.list) {
    let nextToken: string | undefined
    const templates: string[] = []
    while (true) {
      const response = await ses.send(
        new ListTemplatesCommand({
          NextToken: nextToken,
        })
      )

      templates.push(
        ...(response.TemplatesMetadata?.map((t) => t.Name || '').filter(
          Boolean
        ) ?? [])
      )

      nextToken = response.NextToken
      if (!nextToken) {
        break
      }
    }

    console.log(templates)
  } else if (options.delete) {
    await ses
      .send(
        new DeleteTemplateCommand({
          TemplateName: options.delete,
        })
      )
      .then(() => console.log('Deleted'))
      .catch(console.error)
  }
})()
