import { supabase } from './supabase.js'

const MOCK_REVIEWS = [
  {
    id: 'mock_001',
    reviewerName: 'Sarah M.',
    rating: 5,
    reviewText:
      'Amazing service! The team was incredibly helpful and got everything done faster than expected. Will definitely be back.',
    publishedAt: new Date().toISOString(),
    source: 'mock',
  },
  {
    id: 'mock_002',
    reviewerName: 'James T.',
    rating: 2,
    reviewText:
      'Waited 45 minutes past my appointment time. Staff seemed disorganized. The actual service was fine once I got in but I almost left.',
    publishedAt: new Date().toISOString(),
    source: 'mock',
  },
  {
    id: 'mock_003',
    reviewerName: 'Priya K.',
    rating: 5,
    reviewText:
      "Best experience I've had in a long time. Everyone was so friendly and professional. Highly recommend to anyone looking for quality service.",
    publishedAt: new Date().toISOString(),
    source: 'mock',
  },
  {
    id: 'mock_004',
    reviewerName: 'Derek N.',
    rating: 1,
    reviewText:
      "Really disappointed. I was quoted one price and charged another. When I asked about it, nobody could explain the difference. Won't be returning.",
    publishedAt: new Date().toISOString(),
    source: 'mock',
  },
  {
    id: 'mock_005',
    reviewerName: 'Olivia R.',
    rating: 4,
    reviewText:
      'Really solid overall. The service was great and the staff were attentive. Only minor gripe is parking was a bit tricky to find.',
    publishedAt: new Date().toISOString(),
    source: 'mock',
  },
  {
    id: 'mock_006',
    reviewerName: 'Marcus L.',
    rating: 3,
    reviewText:
      "It was okay. Not bad, not great. The job got done but I didn't feel like a valued customer. Might try somewhere else next time.",
    publishedAt: new Date().toISOString(),
    source: 'mock',
  },
]

function pickMockReviews() {
  const shuffled = [...MOCK_REVIEWS].sort(() => Math.random() - 0.5)
  const count = Math.random() < 0.5 ? 1 : 2
  return shuffled.slice(0, count).map((r) => ({
    ...r,
    id: `${r.id}_${Date.now()}`,
    publishedAt: new Date().toISOString(),
  }))
}

export async function pollReviews(businessId) {
  const source = process.env.REVIEW_SOURCE ?? 'mock'

  if (source === 'mock') {
    return pickMockReviews()
  }

  if (source === 'google_places') {
    // TODO: fetch reviews from Google Places API using businessId
    // Will require GOOGLE_PLACES_API_KEY env var and the place ID for the business
    throw new Error('Google Places polling not yet implemented')
  }

  throw new Error(`Unknown REVIEW_SOURCE: "${source}". Use "mock" or "google_places".`)
}

export async function getProcessedReviewIds(businessId) {
  const { data, error } = await supabase
    .from('processed_reviews')
    .select('review_id')
    .eq('business_id', businessId)

  if (error) throw new Error(`Failed to fetch processed review IDs: ${error.message}`)

  return data.map((row) => row.review_id)
}

export async function markReviewProcessed(businessId, reviewId) {
  const { error } = await supabase
    .from('processed_reviews')
    .insert({ business_id: businessId, review_id: reviewId, processed_at: new Date().toISOString() })

  if (error) throw new Error(`Failed to mark review as processed: ${error.message}`)
}
