# inbox-cf-worker

A [Cloudflare Worker](https://workers.cloudflare.com/) that manages a wallet's
inbox on DAO DAO.

Used template for [Cosmos wallet
authentication](https://github.com/NoahSaso/cloudflare-worker-cosmos-auth) to
authenticate requests via a [Cosmos](https://cosmos.network) wallet signature.

## Development

### Run locally

```sh
npm run dev
# OR
wrangler dev --local --persist
```

### Configuration

1. Copy `wrangler.toml.example` to `wrangler.toml`.

2. Create KV namespaces for production and development:

```sh
npx wrangler kv:namespace create NONCES
npx wrangler kv:namespace create NONCES --preview

npx wrangler kv:namespace create INBOX
npx wrangler kv:namespace create INBOX --preview

npx wrangler kv:namespace create PUSH
npx wrangler kv:namespace create PUSH --preview
```

3. Update the binding IDs in `wrangler.toml`:

```toml
kv-namespaces = [
  { binding = "NONCES", id = "<INSERT NONCES_ID>", preview_id = "<INSERT NONCES_PREVIEW_ID>" },
  { binding = "INBOX", id = "<INSERT INBOX_ID>", preview_id = "<INSERT INBOX_PREVIEW_ID>" },
  { binding = "PUSH", id = "<INSERT PUSH_ID>", preview_id = "<INSERT PUSH_PREVIEW_ID>" },
]
```

4. Setup email queue binding in `wrangler.toml`:

```toml

```

5. Configure secrets:

```sh
echo <VALUE> | npx wrangler secret put ADD_SECRET
echo <VALUE> | npx wrangler secret put WEB_PUSH_PUBLIC_KEY
echo <VALUE> | npx wrangler secret put WEB_PUSH_PRIVATE_KEY
echo <VALUE> | npx wrangler secret put PUSHER_HOST
echo <VALUE> | npx wrangler secret put PUSHER_PORT
echo <VALUE> | npx wrangler secret put PUSHER_APP_ID
echo <VALUE> | npx wrangler secret put PUSHER_APP_KEY
echo <VALUE> | npx wrangler secret put PUSHER_SECRET
```

## Deploy

```sh
wrangler publish
# OR
npm run deploy
```
