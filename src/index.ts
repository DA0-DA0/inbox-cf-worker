import { createCors } from 'itty-cors'
import { Router } from 'itty-router'

import { Env } from './types'
import { authMiddleware } from './auth'
import { handleNonce } from './routes/nonce'
import { respondError } from './utils'
import { addItem } from './routes/addItem'
import { clear } from './routes/clear'
import { load } from './routes/load'
import { config } from './routes/config'
import { verify } from './routes/verify'

// Create CORS handlers.
const { preflight, corsify } = createCors({
  methods: ['GET', 'POST'],
  origins: ['*'],
  maxAge: 3600,
  headers: {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  },
})

const router = Router()

// Handle CORS preflight.
router.all('*', preflight)

//! Unauthenticated routes.

// Add item to inbox. Indexer webhook.
router.post('/add', addItem)

// Get nonce for publicKey.
router.get('/nonce/:publicKey', handleNonce)

// Load items from inbox.
router.get('/load/:walletAddress', load)

// Verify email. Takes query param `email`.
router.get('/verify/:walletAddress/:code', verify)

//! Authenticated routes.

// Clear items in inbox.
router.post('/clear', authMiddleware, clear)

// Update email and notification config for a wallet, and respond with
// everything. Takes query param `resend` to resend the verification email.
router.post('/config', authMiddleware, config)

//! 404
router.all('*', () => respondError(404, 'Not found'))

//! Entrypoint.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return router
      .handle(request, env)
      .catch((err) => {
        console.error('Error handling request', request.url, err)
        return respondError(
          500,
          `Internal server error. ${
            err instanceof Error ? err.message : `${JSON.stringify(err)}`
          }`
        )
      })
      .then(corsify)
  },
}
