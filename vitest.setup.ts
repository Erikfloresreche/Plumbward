/**
 * Aislamiento de git para todas las pruebas.
 *
 * Las pruebas crean repositorios reales, y cualquier variable `GIT_*` heredada
 * del proceso los contamina: `GIT_DIR` o `GIT_WORK_TREE` —por ejemplo, desde un
 * hook de git que ejecute las pruebas— hacían que cada `git` apuntara al
 * repositorio del hook, y llegaron a sobrescribir su `user.name`.
 * `GIT_CONFIG_COUNT` y compañía inyectan configuración: `git -c` las exporta a
 * los hooks, y una firma de commits con un `gpg` que falla tumbaba los tests.
 *
 * Por eso se borran **todas**, y después se fijan las dos que aíslan de la
 * configuración global y de la del sistema. Se hace aquí y no en `test.env` de
 * vitest.config.ts porque `test.env` sólo puede poner variables, no quitarlas.
 */
for (const name of Object.keys(process.env)) {
  if (name.startsWith('GIT_')) delete process.env[name]
}
process.env['GIT_CONFIG_GLOBAL'] = '/dev/null'
process.env['GIT_CONFIG_NOSYSTEM'] = '1'
