import { expect, test } from './helpers/orca-app'

test.skip(process.platform === 'win32', 'POSIX fresh-startup golden; Windows has its own suite')

test.describe('POSIX fresh startup golden', () => {
  test.use({ dismissOnboarding: false, seedTestRepo: false })

  test('fresh profile reaches the first-run landing normally @posix-profile-index-golden', async ({
    orcaPage
  }) => {
    await expect(orcaPage.getByText('Add a project to get started.')).toBeVisible({
      timeout: 30_000
    })
  })
})
