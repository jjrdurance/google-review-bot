import { WebClient } from '@slack/web-api'

const slack = new WebClient(process.env.SLACK_BOT_TOKEN)

function starsLabel(rating) {
  return '⭐'.repeat(rating) + '☆'.repeat(5 - rating) + ` (${rating}/5)`
}

export async function sendForApproval(review, aiReply, reviewDbId, slackChannelId) {
  await slack.chat.postMessage({
    channel: slackChannelId,
    text: `New ${review.rating}-star review from ${review.reviewerName} — approval needed`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📬 New Review — Approval Needed',
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Reviewer:*\n${review.reviewerName}`,
          },
          {
            type: 'mrkdwn',
            text: `*Rating:*\n${starsLabel(review.rating)}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Review:*\n_"${review.reviewText}"_`,
        },
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*AI-Generated Reply:*\n${aiReply}`,
        },
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
}
