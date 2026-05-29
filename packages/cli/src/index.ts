import { Command } from 'commander'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { scaffold } from './scaffold.js'
import { CLI_VERSION } from './version.js'

const program = new Command()

program
  .name('create-agntcms-app')
  .description('Scaffold a new agntcms project from the canonical template')
  .version(CLI_VERSION)
  .argument('[dir]', 'Target directory for the new project')
  .option(
    '--local',
    'Link to local monorepo packages via file: protocol (dev only)',
  )
  .action(async (dir: string | undefined, opts: { local?: boolean }) => {
    let targetDir = dir?.trim()

    if (!targetDir) {
      const rl = readline.createInterface({ input, output })
      try {
        targetDir = (
          await rl.question('Project directory name: ')
        ).trim()
      } finally {
        rl.close()
      }
    }

    if (!targetDir) {
      console.error('Error: a target directory is required.')
      process.exit(1)
    }

    try {
      await scaffold(targetDir, { local: opts.local ?? false })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`\nError: ${message}\n`)
      process.exit(1)
    }
  })

program.parse()
