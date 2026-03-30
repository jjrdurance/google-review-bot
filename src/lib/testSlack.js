import { sendForApproval } from './plugins/slack.js'

const review = {
  reviewerName: 'Sarah M.',
  rating: 5,
  reviewText: 'Amazing service! The team went above and beyond. Highly recommend to anyone looking for quality work.',
}

const aiReply = 'Thank you so much, Sarah! We truly appreciate the kind words — our team takes a lot of pride in going the extra mile. We look forward to working with you again!'

const reviewDbId = '1'
const slackChannelId = 'C0APE2V8GUB'

console.log('Sending test review notification to Slack...')

try {
  await sendForApproval(review, aiReply, reviewDbId, slackChannelId)
  console.log('Message sent successfully.')
} catch (err) {
  console.error('Failed to send Slack message:', err.message)
}
