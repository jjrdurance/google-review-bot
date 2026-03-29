import { generateReply } from './replyGenerator.js'

const tests = [
  {
    label: 'Test 1 — Positive Review (5 stars)',
    input: {
      reviewerName: 'Sarah M.',
      rating: 5,
      reviewText:
        'Amazing service! The team was incredibly helpful and got everything done faster than expected. Will definitely be back.',
      businessName: 'GroundLevel AI',
    },
  },
  {
    label: 'Test 2 — Negative Review (2 stars)',
    input: {
      reviewerName: 'James T.',
      rating: 2,
      reviewText:
        'Waited 45 minutes past my appointment time. Staff seemed disorganized. The actual service was fine once I got in but I almost left.',
      businessName: 'GroundLevel AI',
    },
  },
]

for (const { label, input } of tests) {
  console.log(`\n${'='.repeat(60)}`)
  console.log(label)
  console.log('='.repeat(60))
  console.log(`Reviewer : ${input.reviewerName}`)
  console.log(`Rating   : ${input.rating}/5 stars`)
  console.log(`Review   : "${input.reviewText}"`)
  console.log()

  try {
    const result = await generateReply(input)
    console.log(`Reply    : ${result.reply}`)
    console.log(`Model    : ${result.model}`)
    console.log(`Tokens   : ${result.tokensUsed}`)
  } catch (err) {
    console.error(`Error    : ${err.message}`)
  }
}
