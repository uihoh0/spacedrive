#!/usr/bin/env node
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { env, exit, platform, umask } from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

import { parse as parseTOML } from 'smol-toml'

import { waitLockUnlock } from './utils/flock.mjs'
import { patchTauri } from './utils/patchTauri.mjs'
import { symlinkSharedLibsLinux } from './utils/shared.mjs'
import spawn from './utils/spawn.mjs'

if (/^(msys|mingw|cygwin)$/i.test(env.OSTYPE ?? '')) {
	console.error(
		'Bash for windows is not supported, please interact with this repo from Powershell or CMD'
	)
	exit(255)
}

// Limit file permissions
umask(0o026)

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const [_, __, ...args] = process.argv

// NOTE: Must point to package root path
const __root = path.resolve(path.join(__dirname, '..'))

// Location for desktop app
const desktopApp = path.join(__root, 'apps', 'desktop')

// Location of the native dependencies
const nativeDeps = path.join(__root, 'apps', '.deps')

// Files to be removed when script finish executing
const __cleanup = /** @type {string[]} */ ([])
const cleanUp = () => Promise.all(__cleanup.map(file => fs.unlink(file).catch(() => {})))
process.on('SIGINT', cleanUp)

// Export environment variables defined in cargo.toml
const cargoConfig = await fs
	.readFile(path.resolve(__root, '.cargo', 'config.toml'), { encoding: 'binary' })
	.then(parseTOML)
if (cargoConfig.env && typeof cargoConfig.env === 'object')
	for (const [name, value] of Object.entries(cargoConfig.env)) if (!env[name]) env[name] = value

// Default command
if (args.length === 0) args.push('build')

const targets = args
	.filter((_, index, args) => {
		if (index === 0) return false
		const previous = args[index - 1]
		return previous === '-t' || previous === '--target'
	})
	.flatMap(target => target.split(','))

const bundles = args
	.filter((_, index, args) => {
		if (index === 0) return false
		const previous = args[index - 1]
		return previous === '-b' || previous === '--bundles'
	})
	.flatMap(target => target.split(','))

let code = 0

if (process.platform === 'linux' && (args[0] === 'dev' || args[0] === 'build'))
	await symlinkSharedLibsLinux(__root, nativeDeps)

try {
	switch (args[0]) {
		case 'dev': {
			__cleanup.push(...(await patchTauri(__root, nativeDeps, targets, args)))

			switch (process.platform) {
				case 'linux':
				case 'darwin':
					void waitLockUnlock(path.join(__root, 'target', 'debug', '.cargo-lock')).then(
						() => setTimeout(1000).then(cleanUp),
						() => {}
					)
					break
			}

			break
		}
		case 'build': {
			if (!env.NODE_OPTIONS || !env.NODE_OPTIONS.includes('--max_old_space_size')) {
				env.NODE_OPTIONS = `--max_old_space_size=4096 ${env.NODE_OPTIONS ?? ''}`
			}

			env.GENERATE_SOURCEMAP = 'false'

			__cleanup.push(...(await patchTauri(__root, nativeDeps, targets, args)))
		}
	}

	await spawn('pnpm', ['exec', 'tauri', ...args], desktopApp)

	if (args[0] === 'build' && bundles.some(bundle => bundle === 'deb' || bundle === 'all')) {
		const linuxTargets = targets.filter(target => target.includes('-linux-'))
		if (linuxTargets.length > 0)
			for (const target of linuxTargets) {
				env.TARGET = target
				await spawn(path.join(__dirname, 'fix-deb.sh'), [], __dirname)
			}
		else if (process.platform === 'linux')
			await spawn(path.join(__dirname, 'fix-deb.sh'), [], __dirname)
	}
} catch (error) {
	console.error(
		`tauri ${args[0]} failed with exit code ${typeof error === 'number' ? error : 1}`
	)

	console.warn(
		`If you got an error related to libav*/FFMpeg or Protoc/Protobuf you may need to re-run \`pnpm prep\``,
		`If you got an error related to missing nasm you need to run ${
			platform === 'win32' ? './scripts/setup.ps1' : './scripts/setup.sh'
		}`
	)

	if (typeof error === 'number') {
		code = error
	} else {
		if (error instanceof Error) console.error(error)
		code = 1
	}
} finally {
	cleanUp()
	exit(code)
}
