/**
 * Git isolation for every test.
 *
 * The tests create real repositories, and any `GIT_*` variable inherited from
 * the process pollutes them: `GIT_DIR` or `GIT_WORK_TREE` —for example, from a
 * git hook that runs the tests— made every `git` point at the hook's
 * repository, and once overwrote its `user.name`. `GIT_CONFIG_COUNT` and
 * friends inject configuration: `git -c` exports them to hooks, and commit
 * signing with a failing `gpg` brought the tests down.
 *
 * That is why **all** of them are deleted, and then the two that isolate from
 * the global and the system configuration are set. It is done here and not in
 * `test.env` of vitest.config.ts because `test.env` can only set variables,
 * not remove them.
 */
for (const name of Object.keys(process.env)) {
  if (name.startsWith('GIT_')) delete process.env[name]
}
process.env['GIT_CONFIG_GLOBAL'] = '/dev/null'
process.env['GIT_CONFIG_NOSYSTEM'] = '1'
