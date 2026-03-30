import { updateSlackMessage, updateDailySummary } from '@/lib/plugins/slack.js'

export async function POST(request) {
  const { reviewDbId } = await request.json()

  if (!reviewDbId) {
    return Response.json({ error: 'reviewDbId is required' }, { status: 400 })
  }

  try {
    await updateSlackMessage(reviewDbId)
    await updateDailySummary(reviewDbId)
    return Response.json({ ok: true })
  } catch (err) {
    console.error('[update-slack] Error:', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
