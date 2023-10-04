import { Buffer } from 'buffer'

import { Env } from '../types'

export const triggerEvent = async (
  {
    PUSHER_HOST,
    PUSHER_PORT,
    PUSHER_APP_ID,
    PUSHER_APP_KEY,
    PUSHER_SECRET,
  }: Env,
  channel: string,
  event: string,
  data: any
): Promise<void> => {
  if (
    !PUSHER_HOST ||
    !PUSHER_PORT ||
    !PUSHER_APP_ID ||
    !PUSHER_APP_KEY ||
    !PUSHER_SECRET
  ) {
    return
  }

  const method = 'POST'
  const path = `/apps/${PUSHER_APP_ID}/events`
  const body = JSON.stringify({
    name: event,
    data: JSON.stringify(data),
    channels: [channel],
  })
  const signedQueryString = await createSignedQueryString(
    PUSHER_APP_KEY,
    PUSHER_SECRET,
    {
      method,
      path,
      body,
    }
  )

  const response = await fetch(
    `https://${PUSHER_HOST}:${PUSHER_PORT}${path}?${signedQueryString}`,
    {
      method,
      body,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  )
}

const createSignedQueryString = async (
  key: string,
  secret: string,
  request: any
): Promise<string> => {
  const timestamp = (Date.now() / 1000) | 0

  const params: any = {
    auth_key: key,
    auth_timestamp: timestamp,
    auth_version: '1.0',
  }

  if (request.body) {
    params.body_md5 = Buffer.from(
      await crypto.subtle.digest(
        {
          name: 'MD5',
        },
        new TextEncoder().encode(request.body)
      )
    ).toString('hex')
  }

  if (request.params) {
    for (const key in request.params) {
      params[key] = request.params[key]
    }
  }

  const method = request.method.toUpperCase()
  const sortedKeyVal = toOrderedArray(params)
  let queryString = sortedKeyVal.join('&')

  const signData = [method, request.path, queryString].join('\n')
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {
      name: 'HMAC',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  )
  const signature = Buffer.from(
    await crypto.subtle.sign(
      {
        name: 'HMAC',
      },
      cryptoKey,
      new TextEncoder().encode(signData)
    )
  ).toString('hex')
  queryString += '&auth_signature=' + signature

  return queryString
}

const toOrderedArray = (map: any): string[] =>
  Object.keys(map)
    .map((key) => [key, map[key]])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map((pair) => pair[0] + '=' + pair[1])
