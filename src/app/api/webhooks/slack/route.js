import crypto from 'crypto'
import { WebClient } from '@slack/web-api'
import { supabase } from '@/lib/supabase.js'
import { publishReply } from '@/lib/publisher.js'

const slack = new WebClient(process.env.SLACK_BOT_TOKEN)

// ---------------------------------------------------------------------------
// Slack request verification (HMAC-SHA256)
// https://api.slack.com/authentication/verifying-requests-from-slack
// ---------------------------------------------------------------------------
async function verifySlackRequest(request, rawBody) {
  const timestamp = request.headers.get('x-slack-request-timestamp')
  const slackSignature = request.headers.get('x-slack-signature')

  if (!timestamp || !slackSignature) return false

  // Reject requests older than 5 minutes to prevent replay attacks
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false

  const sigBase = `v0:${timestamp}:${rawBody}`
  const hmac = crypto.createHmac('sha256', process.env.SLACK_SIGNING_SECRET)
  hmac.update(sigBase)
  const computed = `v0=${hmac.digest('hex')}`

  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(slackSignature))
}

// ---------------------------------------------------------------------------
// Helpers to update the original Slack message after an action
// ---------------------------------------------------------------------------
async function replaceMessage(responseUrl, text) {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      replace_original: true,
      text,
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text },
        },
      ],
    }),
  })
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------
async function handleApprove(reviewDbId, responseUrl) {
  const { error } = await supabase
    .from('reviews')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', reviewDbId)

  if (error) throw new Error(`Supabase update failed: ${error.message}`)

  await publishReply(reviewDbId)
  await replaceMessage(responseUrl, '✅ Reply approved and posted to Google.')
}

async function handleReject(reviewDbId, responseUrl) {
  const { error } = await supabase
    .from('reviews')
    .update({ status: 'rejected' })
    .eq('id', reviewDbId)

  if (error) throw new Error(`Supabase update failed: ${error.message}`)

  await replaceMessage(responseUrl, '❌ Reply rejected.')
}

async function handleEdit(reviewDbId, triggerId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('ai_reply')
    .eq('id', reviewDbId)
    .single()

  if (error) throw new Error(`Supabase fetch failed: ${error.message}`)

  await slack.views.open({
    trigger_id: triggerId,
    view: {
      type: 'modal',
      callback_id: 'edit_reply_modal',
      private_metadata: reviewDbId,
      title: { type: 'plain_text', text: 'Edit Reply' },
      submit: { type: 'plain_text', text: 'Save & Approve' },
      close: { type: 'plain_text', text: 'Cancel' },
      blocks: [
        {
          type: 'input',
          block_id: 'reply_block',
          label: { type: 'plain_text', text: 'Reply text' },
          element: {
            type: 'plain_text_input',
            action_id: 'reply_input',
            multiline: true,
            initial_value: data.ai_reply,
          },
        },
      ],
    },
  })
}

async function handleModalSubmit(payload) {
  const reviewDbId = payload.view.private_metadata
  const editedReply = payload.view.state.values.reply_block.reply_input.value

  const { error } = await supabase
    .from('reviews')
    .update({
      ai_reply: editedReply,
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .eq('id', reviewDbId)

  if (error) throw new Error(`Supabase update failed: ${error.message}`)

  await publishReply(reviewDbId)
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------
export async function POST(request) {
  const rawBody = await request.text()

  const valid = await verifySlackRequest(request, rawBody)
  if (!valid) {
    return new Response('Unauthorized', { status: 401 })
  }

  // Slack sends URL-encoded body with a "payload" field containing JSON
  const params = new URLSearchParams(rawBody)
  const payload = JSON.parse(params.get('payload'))

  // Respond to Slack immediately — must reply within 3 seconds
  // All async work runs after this response is returned
  const responseUrl = payload.response_url
  const triggerId = payload.trigger_id

  if (payload.type === 'block_actions') {
    const action = payload.actions?.[0]
    const reviewDbId = action?.value

    setImmediate(async () => {
      try {
        if (action.action_id === 'approve_reply') {
          await handleApprove(reviewDbId, responseUrl)
        } else if (action.action_id === 'reject_reply') {
          await handleReject(reviewDbId, responseUrl)
        } else if (action.action_id === 'edit_reply') {
          await handleEdit(reviewDbId, triggerId)
        }
      } catch (err) {
        console.error('[slack webhook] Action handler error:', err.message)
        if (responseUrl) await replaceMessage(responseUrl, `⚠️ Something went wrong: ${err.message}`)
      }
    })
  }

  if (payload.type === 'view_submission' && payload.view.callback_id === 'edit_reply_modal') {
    setImmediate(async () => {
      try {
        await handleModalSubmit(payload)
      } catch (err) {
        console.error('[slack webhook] Modal submit error:', err.message)
      }
    })
  }

  return new Response('', { status: 200 })
}
