import { expect, it } from 'vitest'
import { parseW3AccountResponse } from './w3-account-identity'

it('requires account API identity and exposes only the two permitted fields', () => {
  const body = JSON.stringify({ employeeNumber: '111222', displayName: ['en=Alice', 'cn=张三'], token: 'private' })
  expect(parseW3AccountResponse(200, body)).toEqual({
    state: 'authenticated', identity: { displayName: '张三', employeeNo: '111222' }
  })
  expect(parseW3AccountResponse(421, body)).toEqual({ state: 'unauthenticated' })
  expect(parseW3AccountResponse(200, '{}')).toEqual({ state: 'parse-failed' })
  expect(parseW3AccountResponse(200, JSON.stringify({ uid: 'u1' }))).toEqual({ state: 'authenticated', identity: null })
})
