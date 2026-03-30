import { supabase } from './supabase.js'
import { pollReviews } from './reviewPoller.js'
import { generateReply } from './replyGenerator.js'
import { dispatchForApproval } from './dispatcher.js'

console.log('Looking up Atlanta Coffee Co...')

const { data: existing } = await supabase
  .from('businesses')
  .select()
  .eq('name', 'Atlanta Coffee Co')
  .eq('notification_channel', 'slack')
  .order('id', { ascending: true })
  .limit(1)
  .single()

let business = existing

if (!business) {
  const { data: created, error: bizError } = await supabase
    .from('businesses')
    .insert({
      name: 'Atlanta Coffee Co',
      notification_channel: 'slack',
      slack_channel_id: 'C0APE2V8GUB',
      business_context: 'A cozy neighborhood coffee shop in Atlanta known for friendly service',
    })
    .select()
    .single()

  if (bizError) {
    console.error('Failed to insert business:', bizError.message)
    process.exit(1)
  }
  business = created
  console.log(`Business created — id: ${business.id}\n`)
} else {
  console.log(`Reusing existing business — id: ${business.id}\n`)
}

console.log('Polling mock reviews...')
const reviews = await pollReviews(business.id)
console.log(`Got ${reviews.length} mock review(s)\n`)

for (const review of reviews) {
  console.log('─'.repeat(60))
  console.log(`Reviewer : ${review.reviewerName}`)
  console.log(`Rating   : ${review.rating}/5`)
  console.log(`Review   : "${review.reviewText}"`)

  console.log('Generating AI reply...')
  const { reply, tokensUsed } = await generateReply({
    reviewerName: review.reviewerName,
    rating: review.rating,
    reviewText: review.reviewText,
    businessName: business.name,
    businessContext: business.business_context,
  })

  console.log(`Reply    : ${reply}`)
  console.log(`Tokens   : ${tokensUsed}`)

  console.log('Dispatching to Slack...')
  const reviewDbId = await dispatchForApproval(business.id, review, reply, 'slack')
  console.log(`DB record id: ${reviewDbId}`)
}

console.log('\nDone. Check Slack for the approval message(s).')
