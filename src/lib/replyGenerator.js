import Groq from 'groq-sdk'

// Lazy-initialize so the client is created after env vars are loaded
let groq
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  return groq
}

const MODEL = 'llama-3.3-70b-versatile'

export async function generateReply({
  reviewerName,
  rating,
  reviewText,
  businessName,
  businessContext = '',
}) {
  const tone =
    rating <= 3
      ? 'empathetic and apologetic — the customer had a poor experience'
      : 'warm and enthusiastic — the customer had a great experience'

  const systemPrompt = `You are a professional review response writer for ${businessName}.${businessContext ? ` ${businessContext}` : ''}

Guidelines:
- Be warm and professional at all times
- Acknowledge specific points mentioned in the review — never give a generic response
- If the rating is 1–3 stars, sincerely apologize for the experience without being defensive or making excuses
- Always thank the reviewer by name
- Keep the reply concise: 2–4 sentences maximum
- Never use cookie-cutter phrases like "We value your feedback" or "We strive for excellence"
- Match tone to the rating: ${tone}
- Write in first-person plural ("we", "our team") on behalf of the business
- Do not repeat the business name more than once`

  const userPrompt = `Write a reply to this Google review:

Reviewer: ${reviewerName}
Rating: ${rating}/5 stars
Review: "${reviewText}"`

  try {
    const completion = await getGroq().chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
    })

    const reply = completion.choices[0].message.content.trim()
    const tokensUsed = completion.usage?.total_tokens ?? null

    return { reply, model: MODEL, tokensUsed }
  } catch (error) {
    const message = error?.message ?? 'Unknown error'
    throw new Error(`Failed to generate reply: ${message}`)
  }
}
