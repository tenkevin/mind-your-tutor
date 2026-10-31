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
export { patternBackstop } from './backstop.js';
export type { BackstopContext, BlurResult, IdentifierBackstop } from './backstop.js';
export { DRAFT_PERSONA, draftPrompt, type DraftMaterialInput } from './drafts.js';
