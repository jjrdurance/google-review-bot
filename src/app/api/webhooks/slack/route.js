import crypto from 'crypto'
import { WebClient } from '@slack/web-api'
import { supabase } from '@/lib/supabase.js'
import { publishReply } from '@/lib/publisher.js'
import { updateSlackMessage, updateDailySummary } from '@/lib/plugins/slack.js'

const slack = new WebClient(process.env.SLACK_BOT_TOKEN)

// ---------------------------------------------------------------------------
// Slack request verification (HMAC-SHA256)
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

// Fallback for error messages that can't use chat.update (no ts available)
async function postEphemeralError(responseUrl, message) {
  await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ replace_original: false, text: `⚠️ ${message}` }),
  })
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------
async function handleApprove(reviewDbId) {
  const { error } = await supabase
    .from('reviews')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', reviewDbId)

  if (error) throw new Error(`Supabase update failed: ${error.message}`)

  await publishReply(reviewDbId)
  await updateSlackMessage(reviewDbId)
  await updateDailySummary(reviewDbId)
}

async function handleReject(reviewDbId) {
  const { error } = await supabase
    .from('reviews')
    .update({ status: 'rejected' })
    .eq('id', reviewDbId)

  if (error) throw new Error(`Supabase update failed: ${error.message}`)

  await updateSlackMessage(reviewDbId)
  await updateDailySummary(reviewDbId)
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
  await updateSlackMessage(reviewDbId)
  await updateDailySummary(reviewDbId)
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

  const params = new URLSearchParams(rawBody)
  const payload = JSON.parse(params.get('payload'))

  const responseUrl = payload.response_url
  const triggerId = payload.trigger_id

  if (payload.type === 'block_actions') {
    const action = payload.actions?.[0]
    const reviewDbId = action?.value

    setImmediate(async () => {
      try {
        if (action.action_id === 'approve_reply') {
          await handleApprove(reviewDbId)
        } else if (action.action_id === 'reject_reply') {
          await handleReject(reviewDbId)
        } else if (action.action_id === 'edit_reply') {
          await handleEdit(reviewDbId, triggerId)
        }
      } catch (err) {
        console.error('[slack webhook] Action handler error:', err.message)
        if (responseUrl) await postEphemeralError(responseUrl, err.message)
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
