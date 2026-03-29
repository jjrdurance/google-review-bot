'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase.js'
import { publishReply } from '@/lib/publisher.js'

const TABS = ['pending', 'approved', 'rejected']

function Stars({ rating }) {
  return (
    <span className="text-yellow-400 text-lg" aria-label={`${rating} out of 5 stars`}>
      {'★'.repeat(rating)}
      <span className="text-gray-300">{'★'.repeat(5 - rating)}</span>
    </span>
  )
}

function EmptyState({ status }) {
  const messages = {
    pending: 'No pending reviews. You\'re all caught up!',
    approved: 'No approved reviews yet.',
    rejected: 'No rejected reviews.',
  }
  return (
    <div className="text-center py-16 text-gray-400">
      <div className="text-5xl mb-4">📭</div>
      <p className="text-lg">{messages[status]}</p>
    </div>
  )
}

function ReviewCard({ review, onAction }) {
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState(review.ai_reply)
  const [loading, setLoading] = useState(false)

  async function handleApprove(replyText = null) {
    setLoading(true)
    try {
      if (replyText) {
        await supabase.from('reviews').update({ ai_reply: replyText }).eq('id', review.id)
      }
      await supabase
        .from('reviews')
        .update({ status: 'approved', approved_at: new Date().toISOString() })
        .eq('id', review.id)
      await publishReply(review.id)
      onAction()
    } finally {
      setLoading(false)
    }
  }

  async function handleReject() {
    setLoading(true)
    try {
      await supabase.from('reviews').update({ status: 'rejected' }).eq('id', review.id)
      onAction()
    } finally {
      setLoading(false)
    }
  }

  function handleEdit() {
    setEditText(review.ai_reply)
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
    setEditText(review.ai_reply)
  }

  const timestamp = new Date(review.created_at).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900 text-base">{review.reviewer_name}</p>
          <Stars rating={review.rating} />
        </div>
        <span className="text-xs text-gray-400 mt-1">{timestamp}</span>
      </div>

      {/* Review text */}
      <p className="text-gray-700 text-sm leading-relaxed">"{review.review_text}"</p>

      {/* AI reply */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-2">
          AI-Generated Reply
        </p>
        {editing ? (
          <textarea
            className="w-full text-sm text-gray-800 bg-white border border-blue-300 rounded-lg p-3 resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            rows={5}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
        ) : (
          <p className="text-sm text-gray-800 leading-relaxed">{review.ai_reply}</p>
        )}
      </div>

      {/* Actions */}
      {review.status === 'pending' && (
        <div className="flex flex-wrap gap-2 pt-1">
          {editing ? (
            <>
              <button
                onClick={() => handleApprove(editText)}
                disabled={loading}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                Save &amp; Approve
              </button>
              <button
                onClick={handleCancel}
                disabled={loading}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => handleApprove()}
                disabled={loading}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                ✓ Approve
              </button>
              <button
                onClick={handleEdit}
                disabled={loading}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-yellow-400 hover:bg-yellow-500 text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                ✏ Edit
              </button>
              <button
                onClick={handleReject}
                disabled={loading}
                className="flex-1 sm:flex-none px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                ✕ Reject
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function DashboardPage() {
  const [reviews, setReviews] = useState([])
  const [activeTab, setActiveTab] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchReviews() {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      setError('Failed to load reviews.')
    } else {
      setReviews(data)
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchReviews()
  }, [])

  const counts = TABS.reduce((acc, tab) => {
    acc[tab] = reviews.filter((r) => r.status === tab).length
    return acc
  }, {})

  const filtered = reviews.filter((r) => r.status === activeTab)

  const tabStyles = (tab) =>
    `px-4 py-2 rounded-full text-sm font-medium transition-colors ` +
    (activeTab === tab
      ? 'bg-gray-900 text-white'
      : 'bg-gray-100 text-gray-600 hover:bg-gray-200')

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            GroundLevel AI
          </h1>
          <p className="text-gray-500 mt-1">Review Dashboard</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap mb-6">
          {TABS.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={tabStyles(tab)}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
              {counts[tab] > 0 && (
                <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-semibold ` +
                  (activeTab === tab ? 'bg-white text-gray-900' : 'bg-gray-300 text-gray-700')}>
                  {counts[tab]}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">
            <div className="text-4xl mb-3 animate-pulse">⏳</div>
            <p>Loading reviews...</p>
          </div>
        ) : error ? (
          <div className="text-center py-16 text-red-400">
            <p>{error}</p>
            <button onClick={fetchReviews} className="mt-4 text-sm underline">Try again</button>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState status={activeTab} />
        ) : (
          <div className="flex flex-col gap-4">
            {filtered.map((review) => (
              <ReviewCard key={review.id} review={review} onAction={fetchReviews} />
            ))}
          </div>
        )}

      </div>
    </div>
  )
}
