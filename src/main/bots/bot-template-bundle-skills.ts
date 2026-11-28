// A template's bundle skills: whole skill folders (SKILL.md plus its references) unpacked from the
// BW skill package archive into the new bot's home, verified by the archive's own digests. The
// archive is generated from standard/skills/<topic>, the same single source the acceptance screen
// installs from, so the workflow rules stay maintained in one place.
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import type { Bot } from '../../shared/bot-types'
import { BOT_OWN_SKILLS_FOLDER } from '../../shared/bots/bot-package'
import type { WorkbenchSkillTopic } from '../../shared/workbench/skill-assets'
import bundle from '../../shared/workbench/skill-package.json'
import { extractSkillBundleArchive } from '../skills/bundle-archive/skill-bundle-extraction'
import { botHomeFolder, type BotHomeFilesystem } from './bot-home'

export async function installBundleSkills(
  filesystem: BotHomeFilesystem,
  botsRoot: () => string,
  bot: Bot,
  topics: readonly WorkbenchSkillTopic[]
): Promise<void> {
  if (topics.length === 0) {
    return
  }
  const work = await mkdtemp(join(tmpdir(), 'bw-bot-skill-'))
  try {
    const archivePath = join(work, 'workbench.tar.gz')
    await writeFile(archivePath, Buffer.from(bundle.archiveBase64, 'base64'))
    const extracted = await extractSkillBundleArchive({
      archivePath,
      destinationDirectory: join(work, 'extracted'),
      expectedArchiveSha256: bundle.package.archiveSha256,
      expectedBundleDigest: bundle.package.bundleDigest,
      expectedPackageId: bundle.package.packageId,
      expectedVersionId: bundle.package.versionId
    })
    const home = botHomeFolder(bot, botsRoot())
    for (const topic of topics) {
      const skill = extracted.manifest.skills.find((entry) => entry.name === topic)
      if (!skill) {
        throw new Error(`The BW skill package has no skill "${topic}".`)
      }
      for (const file of skill.files) {
        const bytes = await readFile(
          join(extracted.skillsDirectory, topic, ...file.path.split('/'))
        )
        const target = join(home, BOT_OWN_SKILLS_FOLDER, topic, ...file.path.split('/'))
        await filesystem.makeDirectory(dirname(target))
        await filesystem.writeBytes(target, bytes)
      }
    }
  } finally {
    await rm(work, { recursive: true, force: true })
  }
}
