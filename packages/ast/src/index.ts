export { parsePointer, isPlainObject, mergePreservingExisting, appendUnique } from './pointer.js'
export { patchJson, getJsonValue, detectIndent } from './json.js'
export type { JsonPatch, JsonPatchStrategy, PatchResult } from './json.js'
export { patchYaml, getYamlValue, parseYamlToJson, stringifyYaml } from './yaml.js'
export type { YamlPatch, YamlPatchStrategy } from './yaml.js'
export {
  ensureBlock,
  readBlock,
  commentLine,
  managedHeader,
  parseManagedHeader,
  BEGIN_TOKEN,
  END_TOKEN,
} from './blocks.js'
export type { CommentStyle, EnsureBlockResult } from './blocks.js'
