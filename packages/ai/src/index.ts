export const packageName = '@ideamap/ai';
export { BUILT_IN_PERSONAS, resolveEffectivePersonas } from './personas.js';
export type {
  PersonaAudience,
  PersonaDefinition,
  PersonaId,
  PersonaOverride,
  PersonaTone,
} from './personas.js';
export {
  PROMPT_VARIABLES,
  TONE_PHRASES,
  fill,
  gradeLabel,
  promptVariables,
  readingBand,
} from './prompt.js';
export type { PromptConfig, PromptVariable, ReadingBand } from './prompt.js';
export { entityBackstop, patternBackstop } from './backstop.js';
export type { BackstopContext, BlurResult, IdentifierBackstop } from './backstop.js';
export { Anonymiser } from './anonymise.js';
export type { AnonymiserOptions } from './anonymise.js';
export { ruleRecognizer } from './entities.js';
export type { Entity, EntityKind, EntityRecognizer, SyncEntityRecognizer } from './entities.js';
export { BertNer } from './ner-model.js';
export type { NerLabel, NerSpan } from './ner-model.js';
export { lazyModelRecognizer, modelRecognizer } from './device-recognizer.js';
export type { ModelLoader } from './device-recognizer.js';
export { patternRecognizer } from './entities.js';
