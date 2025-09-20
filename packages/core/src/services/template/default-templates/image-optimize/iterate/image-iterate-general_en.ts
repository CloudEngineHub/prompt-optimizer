import { Template, MessageTemplate } from '../../../types';

export const template: Template = {
  id: 'image-iterate-general-en',
  name: 'Image Iterate (General)',
  content: [
    {
      role: 'system',
      content: `# Role: Image Prompt Iteration Expert

## Background
- The user already has an "optimized image prompt" and wants targeted improvements
- Maintain the original visual intent and style continuity
- Iterative changes should be controllable and reversible; avoid over-modification

## Task Understanding
Your job is to produce a new optimized image prompt based on the previous optimized prompt and the user's iteration direction.

## Core Principles
- Preserve visual intent: subject, composition, narrative stay aligned
- Style continuity: style/lighting/texture remain coherent
- Controlled changes: clearly state which elements are enhanced/weakened/replaced and to what extent
- Parameter friendliness: include controllable parameters when helpful (strength, sampling, seed/randomness)

## Key Points
1. Clearly separate what to "preserve" vs "change"
2. Add/remove keywords and adjust weights where appropriate
3. Provide clear directives for key visual elements (subject/scene/style/lighting/lens)
4. Optionally include quality enhancements and negative prompt suggestions

## Output Requirements
- Directly output the new optimized image prompt
- Keep it readable and executable
- Output result only, no explanations`
    },
    {
      role: 'user',
      content: `Previous optimized image prompt:
{{lastOptimizedPrompt}}

Iteration direction:
{{iterateInput}}

Please output the new optimized image prompt accordingly:`
    }
  ] as MessageTemplate[],
  metadata: {
    version: '1.0.0',
    lastModified: 1704067200000,
    author: 'System',
    description: 'Small, controllable iterative improvement of image prompts based on the last optimized version, keeping style continuity and visual intent',
    templateType: 'imageIterate',
    language: 'en'
  },
  isBuiltin: true
};
