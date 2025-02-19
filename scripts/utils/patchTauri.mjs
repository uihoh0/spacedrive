import { exec as _exec } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { env } from 'node:process'
import { promisify } from 'node:util'

import * as semver from 'semver'

import { linuxLibs, windowsDLLs } from './shared.mjs'

const exec = promisify(_exec)
const __debug = env.NODE_ENV === 'debug'

/**
 * @param {string} nativeDeps
 * @returns {Promise<string?>}
 */
export async function tauriUpdaterKey(nativeDeps) {
	if (env.TAURI_SIGNING_PRIVATE_KEY) return null

	// pnpm exec tauri signer generate -w
	const privateKeyPath = path.join(nativeDeps, 'tauri.key')
	const publicKeyPath = path.join(nativeDeps, 'tauri.key.pub')
	const readKeys = () =>
		Promise.all([
			fs.readFile(publicKeyPath, { encoding: 'utf-8' }),
			fs.readFile(privateKeyPath, { encoding: 'utf-8' }),
		])

	let privateKey, publicKey
	try {
		;[publicKey, privateKey] = await readKeys()
		if (!(publicKey && privateKey)) throw new Error('Empty keys')
	} catch (err) {
		if (__debug) {
			console.warn('Failed to read tauri updater keys')
			console.error(err)
		}

		const quote = os.type() === 'Windows_NT' ? '"' : "'"
		await exec(`pnpm exec tauri signer generate --ci -w ${quote}${privateKeyPath}${quote}`)
		;[publicKey, privateKey] = await readKeys()
		if (!(publicKey && privateKey)) throw new Error('Empty keys')
	}

	env.TAURI_SIGNING_PRIVATE_KEY = privateKey
	env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
	return publicKey
}

/**
 * @param {string} root
 * @param {string} nativeDeps
 * @param {string[]} targets
 * @param {string[]} args
 * @returns {Promise<string[]>}
 */
export async function patchTauri(root, nativeDeps, targets, args) {
	if (args.findIndex(e => e === '-c' || e === '--config') !== -1) {
		throw new Error('Custom tauri build config is not supported.')
	}

	const osType = os.type()
	const tauriPatch = {
		build: {
			features: /** @type {string[]} */ ([]),
		},
		bundle: {
			macOS: { minimumSystemVersion: '' },
			resources: {},
		},
		plugins: {
			updater: /** @type {{ pubkey?: string }} */ ({}),
		},
	}

	if (osType === 'Linux') {
		tauriPatch.bundle.resources = await linuxLibs(nativeDeps)
	} else if (osType === 'Windows_NT') {
		tauriPatch.bundle.resources = {
			...(await windowsDLLs(nativeDeps)),
			[path.join(nativeDeps, 'models', 'yolov8s.onnx')]: './models/yolov8s.onnx',
		}
	}

	// Location for desktop app tauri code
	const tauriRoot = path.join(root, 'apps', 'desktop', 'src-tauri')
	const tauriConfig = await fs
		.readFile(path.join(tauriRoot, 'tauri.conf.json'), 'utf-8')
		.then(JSON.parse)

	switch (args[0]) {
		case 'dev':
			tauriPatch.build.features.push('devtools')
			break
		case 'build': {
			if (tauriConfig?.bundle?.createUpdaterArtifacts !== false) {
				const pubKey = await tauriUpdaterKey(nativeDeps)
				if (pubKey != null) tauriPatch.plugins.updater.pubkey = pubKey
			}
			break
		}
	}

	if (osType === 'Darwin') {
		// arm64 support was added in macOS 11.0
		const macOSArm64MinimumVersion = '11.0'

		let macOSMinimumVersion = tauriConfig?.bundle?.macOS?.minimumSystemVersion

		if (
			(targets.includes('aarch64-apple-darwin') ||
				(targets.length === 0 && process.arch === 'arm64')) &&
			(macOSMinimumVersion == null ||
				semver.lt(
					/** @type {import('semver').SemVer} */ (semver.coerce(macOSMinimumVersion)),
					/** @type {import('semver').SemVer} */ (
						semver.coerce(macOSArm64MinimumVersion)
					)
				))
		) {
			macOSMinimumVersion = macOSArm64MinimumVersion
			console.log(
				`aarch64-apple-darwin target detected, setting minimum system version to ${macOSMinimumVersion}`
			)
		}

		if (macOSMinimumVersion) {
			env.MACOSX_DEPLOYMENT_TARGET = macOSMinimumVersion
			tauriPatch.bundle.macOS.minimumSystemVersion = macOSMinimumVersion
		} else {
			throw new Error('No minimum macOS version detected, please review tauri.conf.json')
		}
	}

	const tauriPatchConf = path.join(tauriRoot, 'tauri.conf.patch.json')
	await fs.writeFile(tauriPatchConf, JSON.stringify(tauriPatch, null, 2))

	// Modify args to load patched tauri config
	args.splice(1, 0, '-c', tauriPatchConf)

	// Files to be removed
	return [tauriPatchConf]
}
