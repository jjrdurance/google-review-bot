import { WebClient } from '@slack/web-api'
import { supabase } from '../supabase.js'

const slack = new WebClient(process.env.SLACK_BOT_TOKEN)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function starsLabel(rating) {
  return '⭐'.repeat(rating) + '☆'.repeat(5 - rating) + ` (${rating}/5)`
}

function formatActionTimestamp() {
  return new Date().toLocaleString('en-US', {
    month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    timeZone: 'UTC',
  }) + ' UTC'
}

function formatDateLabel(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function buildSummaryText(summary, dateLabel) {
  const { total_reviews, approved_count, rejected_count } = summary
  const handled = approved_count + rejected_count
  const allDone = handled === total_reviews && total_reviews > 0
  if (allDone) {
    return `✅ Reviews for ${dateLabel} — All ${total_reviews} handled (${approved_count} approved, ${rejected_count} rejected)`
  }
  const detail = handled > 0 ? ` (${approved_count} approved, ${rejected_count} rejected)` : ''
  return `📋 Reviews for ${dateLabel} — ${handled} of ${total_reviews} handled${detail}`
}

function buildDecidedBlocks(review, businessName, actionText) {
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `📬 Review — ${businessName}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Reviewer:*\n${review.reviewer_name}` },
        { type: 'mrkdwn', text: `*Rating:*\n${starsLabel(review.rating)}` },
      ],
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Review:*\n_"${review.review_text}"_` },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Reply:*\n${review.ai_reply}` },
    },
    { type: 'divider' },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: actionText }],
    },
  ]
}

// ---------------------------------------------------------------------------
// Send new review for approval
// ---------------------------------------------------------------------------

export async function sendForApproval(review, aiReply, reviewDbId, slackChannelId) {
  reviewDbId = String(reviewDbId)
  const result = await slack.chat.postMessage({
    channel: slackChannelId,
    text: `New ${review.rating}-star review from ${review.reviewerName} — approval needed`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📬 New Review — Approval Needed' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Reviewer:*\n${review.reviewerName}` },
          { type: 'mrkdwn', text: `*Rating:*\n${starsLabel(review.rating)}` },
        ],
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Review:*\n_"${review.reviewText}"_` },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*AI-Generated Reply:*\n${aiReply}` },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Approve' },
            style: 'primary',
            action_id: 'approve_reply',
            value: reviewDbId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '✏️ Edit' },
            action_id: 'edit_reply',
            value: reviewDbId,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '❌ Reject' },
            style: 'danger',
            action_id: 'reject_reply',
            value: reviewDbId,
          },
        ],
      },
    ],
  })

  return { ts: result.ts, channel: result.channel }
}

// ---------------------------------------------------------------------------
// Update a review card after approve/reject (replaces buttons with status)
// ---------------------------------------------------------------------------

export async function updateSlackMessage(reviewDbId) {
  const { data: review, error: reviewErr } = await supabase
    .from('reviews')
    .select('reviewer_name, rating, review_text, ai_reply, status, slack_message_ts, slack_channel_id, business_id')
    .eq('id', reviewDbId)
    .single()

  if (reviewErr) throw new Error(`Failed to fetch review: ${reviewErr.message}`)
  if (!review.slack_message_ts || !review.slack_channel_id) return

  const { data: business } = await supabase
    .from('businesses')
    .select('name')
    .eq('id', review.business_id)
    .single()

  const businessName = business?.name ?? 'Your Business'
  const ts = formatActionTimestamp()
  const isApproved = review.status === 'posted'

  const actionText = isApproved
    ? `✅ Reply to ${review.reviewer_name} approved and posted · ${ts}`
    : `❌ Reply to ${review.reviewer_name} was rejected · ${ts}`

  await slack.chat.update({
    channel: review.slack_channel_id,
    ts: review.slack_message_ts,
    text: actionText,
    blocks: buildDecidedBlocks(review, businessName, actionText),
  })
}

// ---------------------------------------------------------------------------
// Daily summary
// ---------------------------------------------------------------------------

export async function ensureDailySummary(businessId, slackChannelId, businessName) {
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = nextDay(today)

  // Count actionable reviews for this business today (exclude failures)
  const { count } = await supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .neq('status', 'notification_failed')
    .gte('created_at', `${today}T00:00:00Z`)
    .lt('created_at', `${tomorrow}T00:00:00Z`)

  const totalReviews = count ?? 0
  const dateLabel = formatDateLabel(today)

  const { data: existing } = await supabase
    .from('daily_summaries')
    .select('*')
    .eq('business_id', businessId)
    .eq('summary_date', today)
    .maybeSingle()

  if (!existing) {
    const summaryText = buildSummaryText(
      { total_reviews: totalReviews, approved_count: 0, rejected_count: 0 },
      dateLabel
    )
    const result = await slack.chat.postMessage({
      channel: slackChannelId,
      text: summaryText,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: summaryText } }],
    })
    await supabase.from('daily_summaries').insert({
      business_id: businessId,
      slack_channel_id: slackChannelId,
      slack_message_ts: result.ts,
      summary_date: today,
      total_reviews: totalReviews,
      approved_count: 0,
      rejected_count: 0,
    })
  } else {
    const updated = { ...existing, total_reviews: totalReviews }
    const summaryText = buildSummaryText(updated, dateLabel)
    await supabase
      .from('daily_summaries')
      .update({ total_reviews: totalReviews })
      .eq('id', existing.id)
    await slack.chat.update({
      channel: existing.slack_channel_id,
      ts: existing.slack_message_ts,
      text: summaryText,
      blocks: [{ type: 'section', text: { type: 'mrkdwn', text: summaryText } }],
    })
  }
}

export async function updateDailySummary(reviewDbId) {
  const { data: review } = await supabase
    .from('reviews')
    .select('business_id, created_at')
    .eq('id', reviewDbId)
    .single()

  if (!review) return

  const summaryDate = review.created_at.slice(0, 10)

  const { data: summary } = await supabase
    .from('daily_summaries')
    .select('*')
    .eq('business_id', review.business_id)
    .eq('summary_date', summaryDate)
    .maybeSingle()

  if (!summary) return

  const { data: dayReviews } = await supabase
    .from('reviews')
    .select('status')
    .eq('business_id', review.business_id)
    .gte('created_at', `${summaryDate}T00:00:00Z`)
    .lt('created_at', `${nextDay(summaryDate)}T00:00:00Z`)

  const approvedCount = dayReviews.filter((r) => r.status === 'posted').length
  const rejectedCount = dayReviews.filter((r) => r.status === 'rejected').length

  await supabase
    .from('daily_summaries')
    .update({ approved_count: approvedCount, rejected_count: rejectedCount })
    .eq('id', summary.id)

  const dateLabel = formatDateLabel(summaryDate)
  const updated = { ...summary, approved_count: approvedCount, rejected_count: rejectedCount }
  const summaryText = buildSummaryText(updated, dateLabel)

  await slack.chat.update({
    channel: summary.slack_channel_id,
    ts: summary.slack_message_ts,
    text: summaryText,
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: summaryText } }],
  })
}
