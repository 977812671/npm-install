const exec = require('@actions/exec')
const core = require('@actions/core')
const io = require('@actions/io')
const quote = require('quote')
const os = require('os')
const path = require('path')
const hasha = require('hasha')
const fs = require('fs')
const cache = require('cache/lib/index')

const action = require('../index')
const utils = action.utils

describe('action', () => {
  const cwd = '/path/to/mock/cwd'
  const homedir = '/home/path/for/test/user'

  beforeEach(function() {
    this.exec = sandbox.stub(exec, 'exec').resolves()
    sandbox.stub(os, 'homedir').returns(homedir)
    sandbox.stub(process, 'cwd').returns(cwd)
    sandbox.stub(utils, 'getPlatformAndArch').returns('platform-arch')
  })

  context('finds Yarn', function() {
    const pathToYarn = '/path/to/yarn'
    const yarnFilename = path.join(cwd, 'yarn.lock')
    const yarnCachePath = path.join(homedir, '.cache', 'yarn')
    const cacheKey = 'yarn-platform-arch-hash-from-yarn-lock-file'

    beforeEach(function() {
      sandbox
        .stub(core, 'getInput')
        .withArgs('useLockFile')
        .returns()

      sandbox
        .stub(fs, 'existsSync')
        .withArgs(yarnFilename)
        .returns(true)

      sandbox
        .stub(io, 'which')
        .withArgs('yarn')
        .resolves(pathToYarn)

      sandbox
        .stub(hasha, 'fromFileSync')
        .withArgs(yarnFilename)
        .returns('hash-from-yarn-lock-file')

      const cacheHit = false
      this.restoreCache = sandbox.stub(cache, 'restoreCache').resolves(cacheHit)
      this.saveCache = sandbox.stub(cache, 'saveCache').resolves()
    })

    it('and uses lock file', async function() {
      await action.npmInstallAction()

      expect(this.restoreCache).to.be.calledOnceWithExactly(
        yarnCachePath,
        cacheKey,
        cacheKey
      )
      expect(this.exec).to.be.calledOnceWithExactly(
        quote(pathToYarn),
        ['--frozen-lockfile'],
        { cwd }
      )
      expect(this.saveCache).to.be.calledOnceWithExactly(
        yarnCachePath,
        cacheKey
      )
    })
  })

  context('useLockFile:0', function() {
    const pathToNpm = '/path/to/npm'
    beforeEach(() => {
      sandbox
        .stub(core, 'getInput')
        .withArgs('useLockFile')
        .returns('0')

      sandbox
        .stub(io, 'which')
        .withArgs('npm')
        .resolves(pathToNpm)

      const filename = path.join(cwd, 'package.json')
      sandbox
        .stub(hasha, 'fromFileSync')
        .withArgs(filename)
        .returns('hash-from-package-json')
    })

    it('hits the cache', async function() {
      const cacheHit = true
      const restoreCache = sandbox
        .stub(utils, 'restoreCachedNpm')
        .resolves(cacheHit)
      const saveCache = sandbox.stub(utils, 'saveCachedNpm')
      await action.npmInstallAction()
      // caching based on the file package.json in the current working directory
      expect(restoreCache).to.have.been.calledOnceWithExactly({
        inputPath: path.join(homedir, '.npm'),
        primaryKey: 'npm-platform-arch-hash-from-package-json',
        restoreKeys: 'npm-platform-arch-hash-from-package-json'
      })

      expect(this.exec).to.have.been.calledOnceWithExactly(
        quote(pathToNpm),
        ['install'],
        {
          cwd
        }
      )

      expect(saveCache, 'cache was hit').to.not.have.been.called
    })

    it('saves new cache', async function() {
      const cacheHit = false
      const restoreCache = sandbox
        .stub(utils, 'restoreCachedNpm')
        .resolves(cacheHit)
      const saveCache = sandbox.stub(utils, 'saveCachedNpm')
      await action.npmInstallAction()
      // caching based on the file package.json in the current working directory
      const cacheParams = {
        inputPath: path.join(homedir, '.npm'),
        primaryKey: 'npm-platform-arch-hash-from-package-json',
        restoreKeys: 'npm-platform-arch-hash-from-package-json'
      }
      expect(restoreCache).to.have.been.calledOnceWithExactly(cacheParams)

      expect(this.exec).to.have.been.calledOnceWithExactly(
        quote(pathToNpm),
        ['install'],
        {
          cwd
        }
      )

      expect(
        saveCache,
        'new cache needs to be saved'
      ).to.have.been.calledOnceWithExactly(cacheParams)
    })
  })
})
