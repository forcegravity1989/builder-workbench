import type { Session } from 'electron'

import { getProxySessionApplicationReadiness } from '../network/proxy-settings'
import type { CertificateTrustGrant } from './browser-certificate-challenge'
import { answerBrowserSessionBeforeRequest } from './browser-session-request-decisions'
import { reportBrowserSessionWebRequest } from './browser-session-web-request-observer'

type CertificateIdentity = Pick<
  CertificateTrustGrant,
  'secureEndpoint' | 'leafCertificateSha256' | 'error'
>

function certificateIdentitiesMatch(
  left: CertificateIdentity | undefined,
  right: CertificateIdentity
): boolean {
  return Boolean(
    left &&
    left.secureEndpoint === right.secureEndpoint &&
    left.leafCertificateSha256 === right.leafCertificateSha256 &&
    left.error === right.error
  )
}

export class BrowserCertificateRequestGuard {
  private readonly guardedSessions = new Set<Session>()
  private readonly acceptedIdentityBySession = new Map<Session, Map<string, CertificateIdentity>>()

  installSession(session: Session): void {
    if (this.guardedSessions.has(session)) {
      return
    }
    // Approved endpoint and certificate identity persist for this browser session, including SSO returns.
    session.webRequest.onBeforeRequest((details, callback) => {
      reportBrowserSessionWebRequest(session, 'onBeforeRequest', details)
      const readiness = getProxySessionApplicationReadiness(session)
      const answer = (ready: boolean): void => {
        if (!ready) {
          callback({ cancel: true })
        } else {
          answerBrowserSessionBeforeRequest(session, details, callback)
        }
      }
      if (typeof readiness === 'boolean') {
        answer(readiness)
      } else {
        void readiness.then(answer)
      }
    })
    this.guardedSessions.add(session)
  }

  removeSession(session: Session): void {
    if (!this.guardedSessions.delete(session)) {
      return
    }
    session.webRequest.onBeforeRequest(null)
    this.acceptedIdentityBySession.delete(session)
  }

  canOfferCertificate(session: Session, identity: CertificateIdentity): boolean {
    if (!this.guardedSessions.has(session)) {
      return false
    }
    const accepted = this.acceptedIdentityBySession.get(session)?.get(identity.secureEndpoint)
    // Cached TLS decisions hide later certificates; pin one identity per endpoint in this session.
    return !accepted || certificateIdentitiesMatch(accepted, identity)
  }

  grant(session: Session, grant: CertificateTrustGrant): boolean {
    if (!this.guardedSessions.has(session)) {
      return false
    }
    let acceptedByEndpoint = this.acceptedIdentityBySession.get(session)
    const accepted = acceptedByEndpoint?.get(grant.secureEndpoint)
    // Reject conflicting pending identities before proceed can report success.
    if (accepted && !certificateIdentitiesMatch(accepted, grant)) {
      return false
    }
    // Why: approval is a session-scoped exception, matching Chrome's SSL
    // exception model — every guest in this session may reach the pinned
    // endpoint + leaf without a fresh prompt, including navigations that
    // return from an SSO round-trip through other hosts. Pin the identity at
    // grant time so a concurrent sibling proceed cannot race in a second leaf.
    if (!acceptedByEndpoint) {
      acceptedByEndpoint = new Map()
      this.acceptedIdentityBySession.set(session, acceptedByEndpoint)
    }
    acceptedByEndpoint.set(grant.secureEndpoint, {
      secureEndpoint: grant.secureEndpoint,
      leafCertificateSha256: grant.leafCertificateSha256,
      error: grant.error
    })
    return true
  }

  shouldTrustCertificate(session: Session, identity: CertificateIdentity): boolean {
    if (!this.guardedSessions.has(session)) {
      return false
    }
    const accepted = this.acceptedIdentityBySession.get(session)?.get(identity.secureEndpoint)
    return certificateIdentitiesMatch(accepted, identity)
  }
}
