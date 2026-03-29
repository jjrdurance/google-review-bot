import { supabase } from './supabase.js'
import { sendForApproval as slackSendForApproval } from './plugins/slack.js'
import { sendForApproval as emailSendForApproval } from './plugins/email.js'
import { sendForApproval as smsSendForApproval } from './plugins/sms.js'
import { sendForApproval as dashboardSendForApproval } from './plugins/dashboard.js'

const CHANNEL_PLUGINS = {
  slack: slackSendForApproval,
  email: emailSendForApproval,
  sms: smsSendForApproval,
  dashboard: dashboardSendForApproval,
}

export async function dispatchForApproval(businessId, review, aiReply, notificationChannel) {
  // Save review + AI reply to Supabase with status "pending"
  const { data, error: insertError } = await supabase
    .from('reviews')
    .insert({
      business_id: businessId,
      reviewer_name: review.reviewerName,
      rating: review.rating,
      review_text: review.reviewText,
      published_at: review.publishedAt,
      source: review.source,
      external_review_id: review.id,
      ai_reply: aiReply,
      status: 'pending',
    })
    .select('id')
    .single()

  if (insertError) throw new Error(`Failed to save review to database: ${insertError.message}`)

  const reviewDbId = data.id

  // Resolve plugin — fall back to dashboard for unrecognized channels
  const plugin = CHANNEL_PLUGINS[notificationChannel] ?? dashboardSendForApproval

  try {
    await plugin(review, aiReply, reviewDbId)
  } catch (err) {
    await supabase
      .from('reviews')
      .update({ status: 'notification_failed' })
      .eq('id', reviewDbId)

    throw new Error(
      `Review saved (id: ${reviewDbId}) but notification failed: ${err.message}`
    )
  }

  return reviewDbId
}
