import type { TextModel, TextProvider } from '../types'
import { OpenAIAdapter } from './openai-adapter'

interface ModelOverride {
  id: string
  name: string
  description: string
  capabilities?: Partial<TextModel['capabilities']>
  defaultParameterValues?: Record<string, unknown>
}

const SILICONFLOW_STATIC_MODELS: ModelOverride[] = [
  {
    id: 'Qwen/Qwen3-8B',
    name: 'Qwen3-8B',
    description: 'Qwen3-8B model via SiliconFlow',
    capabilities: {
      supportsTools: false,
      maxContextLength: 8192
    }
  }
]

export class SiliconflowAdapter extends OpenAIAdapter {
  public getProvider(): TextProvider {
    return {
      id: 'siliconflow',
      name: 'SiliconFlow',
      description: 'SiliconFlow OpenAI-compatible models',
      requiresApiKey: true,
      defaultBaseURL: 'https://api.siliconflow.cn/v1',
      supportsDynamicModels: true,
      connectionSchema: {
        required: ['apiKey'],
        optional: ['baseURL', 'timeout'],
        fieldTypes: {
          apiKey: 'string',
          baseURL: 'string',
          timeout: 'number'
        }
      }
    }
  }

  public getModels(): TextModel[] {
    return SILICONFLOW_STATIC_MODELS.map((definition) => {
      const baseModel = this.buildDefaultModel(definition.id)

      return {
        ...baseModel,
        name: definition.name,
        description: definition.description,
        capabilities: {
          ...baseModel.capabilities,
          ...(definition.capabilities ?? {})
        },
        defaultParameterValues: definition.defaultParameterValues
          ? {
              ...(baseModel.defaultParameterValues ?? {}),
              ...definition.defaultParameterValues
            }
          : baseModel.defaultParameterValues
      }
    })
  }
}
