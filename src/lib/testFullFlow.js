import { supabase } from './supabase.js'
import { pollReviews } from './reviewPoller.js'
import { generateReply } from './replyGenerator.js'
import { dispatchForApproval } from './dispatcher.js'

// ── 1. Insert test business ──────────────────────────────────────────────────

console.log('Inserting test business...')

const { data: business, error: bizError } = await supabase
  .from('businesses')
  .insert({
    name: 'Test Business',
    notification_channel: 'dashboard',
    business_context: 'A friendly local coffee shop in Atlanta',
  })
  .select()
  .single()

if (bizError) {
  console.error('Failed to insert business:', bizError.message)
  process.exit(1)
}

console.log(`Business created — id: ${business.id}\n`)

// ── 2. Run the full flow ─────────────────────────────────────────────────────

console.log('Polling mock reviews...')
const reviews = await pollReviews(business.id)
console.log(`Got ${reviews.length} mock review(s)\n`)

for (const review of reviews) {
  console.log('─'.repeat(60))
  console.log(`Review`)
  console.log(`  id          : ${review.id}`)
  console.log(`  reviewer    : ${review.reviewerName}`)
  console.log(`  rating      : ${review.rating}/5`)
  console.log(`  text        : "${review.reviewText}"`)

  console.log('\nGenerating AI reply...')
  const { reply, model, tokensUsed } = await generateReply({
    reviewerName: review.reviewerName,
    rating: review.rating,
    reviewText: review.reviewText,
    businessName: business.name,
    businessContext: business.business_context,
  })

  console.log(`  reply       : ${reply}`)
  console.log(`  model       : ${model}`)
  console.log(`  tokens used : ${tokensUsed}`)

  console.log('\nDispatching for approval (dashboard)...')
  const reviewDbId = await dispatchForApproval(business.id, review, reply, 'dashboard')
  console.log(`  db record id: ${reviewDbId}`)
}

// ── 3. Confirm records in Supabase ───────────────────────────────────────────

console.log('\n' + '='.repeat(60))
console.log('Pending reviews in Supabase:')
console.log('='.repeat(60))

const { data: pendingReviews, error: fetchError } = await supabase
  .from('reviews')
  .select('id, reviewer_name, rating, status, ai_reply, created_at')
  .eq('business_id', business.id)
  .eq('status', 'pending')
  .order('created_at', { ascending: true })

if (fetchError) {
  console.error('Failed to fetch pending reviews:', fetchError.message)
  process.exit(1)
}

if (pendingReviews.length === 0) {
  console.log('No pending reviews found.')
} else {
  for (const r of pendingReviews) {
    console.log(`\n  id         : ${r.id}`)
    console.log(`  reviewer   : ${r.reviewer_name}`)
    console.log(`  rating     : ${r.rating}/5`)
    console.log(`  status     : ${r.status}`)
    console.log(`  ai_reply   : ${r.ai_reply}`)
    console.log(`  created_at : ${r.created_at}`)
  }
}

console.log('\nDone.')
