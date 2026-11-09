import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import { PrReviewNotificationsView } from './PrReviewNotificationsView'
import { findRegisteredReviewRepo, openReviewPr } from './review-target'
import {
  installReviewNotificationListeners,
  refreshAllIncomingReviews,
  refreshAllOutgoingReviews,
  refreshIncomingReview,
  refreshOutgoingReview,
  getReviewNotifications,
  useReviewNotifications,
  deleteReviewNotification,
  sendReviewRequest
} from './store'

export function PrReviewNotifications(): React.JSX.Element {
  const notifications = useReviewNotifications()
  const repos = useAppStore((state) => state.repos)
  const previousRepos = useRef(repos)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => installReviewNotificationListeners(setError), [])
  useEffect(() => {
    const previous = previousRepos.current
    previousRepos.current = repos
    // Inbox restoration can precede repo loading; retry only newly available projects without the failure throttle.
    const becameAvailable = (note: { repo: Parameters<typeof findRegisteredReviewRepo>[0] }) =>
      !findRegisteredReviewRepo(note.repo, previous) && findRegisteredReviewRepo(note.repo, repos)
    const current = getReviewNotifications()
    for (const note of current.incoming.filter(becameAvailable)) {
      void refreshIncomingReview(note, { force: true })
    }
    for (const note of current.outgoing.filter(becameAvailable)) {
      void refreshOutgoingReview(note, { force: true })
    }
  }, [repos])
  const refresh = useCallback((force = false) => {
    setRefreshing(true)
    void Promise.all([refreshAllIncomingReviews({ force }), refreshAllOutgoingReviews({ force })])
      .catch((reason) => setError(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => setRefreshing(false))
  }, [])
  useEffect(() => {
    const onFocus = (): void => refresh()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])
  return (
    <PrReviewNotificationsView
      notifications={notifications}
      error={error}
      refreshing={refreshing}
      onRefresh={refresh}
      onError={setError}
      onOpen={openReviewPr}
      onDelete={deleteReviewNotification}
      onResend={async (note) => {
        await sendReviewRequest(note)
      }}
      missingProject={(note) => !findRegisteredReviewRepo(note.repo, repos)}
    />
  )
}
