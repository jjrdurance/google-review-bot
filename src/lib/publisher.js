import { supabase } from './supabase.js'

export async function publishReply(reviewDbId) {
  const { data: review, error: reviewError } = await supabase
    .from('reviews')
    .select('ai_reply, business_id')
    .eq('id', reviewDbId)
    .single()

  if (reviewError) throw new Error(`Failed to fetch review ${reviewDbId}: ${reviewError.message}`)

  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select('name, google_place_id')
    .eq('id', review.business_id)
    .single()

  if (bizError) throw new Error(`Failed to fetch business for review ${reviewDbId}: ${bizError.message}`)

  console.log('[publisher] WOULD POST REPLY')
  console.log(`  Business : ${business.name}`)
  console.log(`  Place ID : ${business.google_place_id}`)
  console.log(`  Review ID: ${reviewDbId}`)
  console.log(`  Reply    : "${review.ai_reply}"`)

  // TODO: replace the log above with a real Google Business Profile API call
  // POST https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews/{reviewId}/reply
  // Body: { comment: review.ai_reply }

  const { error: updateError } = await supabase
    .from('reviews')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', reviewDbId)

  if (updateError) throw new Error(`Failed to update review status: ${updateError.message}`)

  return {
    success: true,
    reviewDbId,
    note: 'simulated - GBP API not yet connected',
  }
}
