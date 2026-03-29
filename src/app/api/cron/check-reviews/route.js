import { supabase } from '@/lib/supabase.js'
import { pollReviews, getProcessedReviewIds, markReviewProcessed } from '@/lib/reviewPoller.js'
import { generateReply } from '@/lib/replyGenerator.js'
import { dispatchForApproval } from '@/lib/dispatcher.js'

export async function GET(request) {
  // Verify request is from Vercel Cron
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[cron] check-reviews started')

  const { data: businesses, error: bizError } = await supabase
    .from('businesses')
    .select('id, name, notification_channel, slack_channel_id, business_context')

  if (bizError) {
    console.error('[cron] Failed to fetch businesses:', bizError.message)
    return Response.json({ error: 'Failed to fetch businesses' }, { status: 500 })
  }

  console.log(`[cron] Processing ${businesses.length} business(es)`)

  const summary = {
    businessesChecked: 0,
    newReviewsFound: 0,
    repliesGenerated: 0,
    errors: [],
  }

  for (const business of businesses) {
    try {
      console.log(`[cron] [${business.name}] Polling reviews`)

      const [reviews, processedIds] = await Promise.all([
        pollReviews(business.id),
        getProcessedReviewIds(business.id),
      ])

      const processedSet = new Set(processedIds)
      const newReviews = reviews.filter((r) => !processedSet.has(r.id))

      console.log(
        `[cron] [${business.name}] ${reviews.length} review(s) fetched, ${newReviews.length} new`
      )

      summary.businessesChecked++
      summary.newReviewsFound += newReviews.length

      for (const review of newReviews) {
        try {
          console.log(
            `[cron] [${business.name}] Generating reply for review ${review.id} (${review.rating}★)`
          )

          const { reply } = await generateReply({
            reviewerName: review.reviewerName,
            rating: review.rating,
            reviewText: review.reviewText,
            businessName: business.name,
            businessContext: business.business_context ?? '',
          })

          console.log(`[cron] [${business.name}] Dispatching review ${review.id} via ${business.notification_channel}`)

          await dispatchForApproval(
            business.id,
            review,
            reply,
            business.notification_channel ?? 'dashboard'
          )

          await markReviewProcessed(business.id, review.id)

          summary.repliesGenerated++
          console.log(`[cron] [${business.name}] Review ${review.id} processed successfully`)
        } catch (reviewErr) {
          const msg = `Review ${review.id}: ${reviewErr.message}`
          console.error(`[cron] [${business.name}] ${msg}`)
          summary.errors.push({ business: business.name, error: msg })
        }
      }
    } catch (bizErr) {
      const msg = bizErr.message
      console.error(`[cron] [${business.name}] Business-level error: ${msg}`)
      summary.errors.push({ business: business.name, error: msg })
    }
  }

  console.log('[cron] check-reviews complete', summary)

  return Response.json({
    ok: true,
    businessesChecked: summary.businessesChecked,
    newReviewsFound: summary.newReviewsFound,
    repliesGenerated: summary.repliesGenerated,
    errors: summary.errors,
  })
}
