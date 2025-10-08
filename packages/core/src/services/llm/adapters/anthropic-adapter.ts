import Anthropic from '@anthropic-ai/sdk'
import { AbstractTextProviderAdapter } from './abstract-adapter'
import type {
  TextProvider,
  TextModel,
  TextModelConfig,
  Message,
  LLMResponse,
  StreamHandlers,
  ParameterDefinition,
  ToolDefinition
} from '../types'

const DEFAULT_MAX_TOKENS = 4096

/**
 * Anthropic 官方 SDK 适配器实现
 * 使用 @anthropic-ai/sdk 包提供官方支持
 *
 * 职责：
 * - 封装Anthropic官方SDK调用逻辑
 * - 处理Claude特定的消息格式和system指令
 * - 提供Claude模型静态列表
 * - 支持真正的SSE流式响应
 * - 支持工具调用
 * - 保留原始错误堆栈
 */
export class AnthropicAdapter extends AbstractTextProviderAdapter {
  // ===== Provider元数据 =====

  /**
   * 获取Provider元数据
   */
  public getProvider(): TextProvider {
    return {
      id: 'anthropic',
      name: 'Anthropic',
      description: 'Anthropic Claude models (Official SDK)',
      requiresApiKey: true,
      defaultBaseURL: 'https://api.anthropic.com',
      supportsDynamicModels: false, // Anthropic不支持动态模型获取
      connectionSchema: {
        required: ['apiKey'],
        optional: ['baseURL'],
        fieldTypes: {
          apiKey: 'string',
          baseURL: 'string',
        }
      }
    }
  }

  /**
   * 获取静态模型列表（Claude系列）
   * 从service.ts的fetchAnthropicModelsInfo迁移 (L1115-1120)
   */
  public getModels(): TextModel[] {
    const providerId = 'anthropic'

    return [
      // Claude 4.0 系列
      {
        id: 'claude-opus-4-20250514',
        name: 'Claude 4.0 Opus',
        description: 'Most powerful Claude model for complex tasks',
        providerId,
        capabilities: {
                    supportsTools: true,
          supportsReasoning: false,
          maxContextLength: 200000
        },
        parameterDefinitions: this.getParameterDefinitions('claude-opus-4-20250514'),
        defaultParameterValues: this.getDefaultParameterValues('claude-opus-4-20250514')
      },
      {
        id: 'claude-sonnet-4-20250514',
        name: 'Claude 4.0 Sonnet',
        description: 'Balanced Claude model for most tasks',
        providerId,
        capabilities: {
                    supportsTools: true,
          supportsReasoning: false,
          maxContextLength: 200000
        },
        parameterDefinitions: this.getParameterDefinitions('claude-sonnet-4-20250514'),
        defaultParameterValues: this.getDefaultParameterValues('claude-sonnet-4-20250514')
      },

      // Claude 3.7/3.5 系列
      {
        id: 'claude-3-7-sonnet-latest',
        name: 'Claude 3.7 Sonnet',
        description: 'Latest Claude 3.7 Sonnet model',
        providerId,
        capabilities: {
                    supportsTools: true,
          supportsReasoning: false,
          maxContextLength: 200000
        },
        parameterDefinitions: this.getParameterDefinitions('claude-3-7-sonnet-latest'),
        defaultParameterValues: this.getDefaultParameterValues('claude-3-7-sonnet-latest')
      },
      {
        id: 'claude-3-5-haiku-latest',
        name: 'Claude 3.5 Haiku',
        description: 'Fast and affordable Claude model',
        providerId,
        capabilities: {
                    supportsTools: true,
          supportsReasoning: false,
          maxContextLength: 200000
        },
        parameterDefinitions: this.getParameterDefinitions('claude-3-5-haiku-latest'),
        defaultParameterValues: this.getDefaultParameterValues('claude-3-5-haiku-latest')
      }
    ]
  }

  /**
   * 动态获取模型列表（Anthropic不支持，返回静态列表）
   * @param config 连接配置
   * @returns 静态模型列表
   */
  public async getModelsAsync(_config: TextModelConfig): Promise<TextModel[]> {
    console.log('[AnthropicAdapter] Anthropic does not support dynamic model fetching, returning static list')
    return this.getModels()
  }

  // ===== 参数定义（用于buildDefaultModel） =====

  /**
   * 获取参数定义
   */
  protected getParameterDefinitions(_modelId: string): readonly ParameterDefinition[] {
    return [
      {
        name: 'temperature',
        type: 'number',
        description: 'Sampling temperature (0-1)',
        default: 1,
        min: 0,
        max: 1
      },
      {
        name: 'top_p',
        type: 'number',
        description: 'Nucleus sampling parameter',
        default: 1,
        min: 0,
        max: 1
      },
      {
        name: 'top_k',
        type: 'number',
        description: 'Top-k sampling parameter',
        min: 1
      },
      {
        name: 'max_tokens',
        type: 'number',
        description: 'Maximum tokens to generate',
        default: DEFAULT_MAX_TOKENS,
        min: 1
      },
      {
        name: 'thinking_budget_tokens',
        type: 'number',
        description: 'Extended thinking budget in tokens (requires ≥1024)',
        min: 1024
      }
    ]
  }

  /**
   * 获取默认参数值
   */
  protected getDefaultParameterValues(_modelId: string): Record<string, unknown> {
    return {
      temperature: 1,
      top_p: 1,
      max_tokens: DEFAULT_MAX_TOKENS
    }
  }

  // ===== 核心方法实现 =====

  /**
   * 发送消息（使用官方 SDK）
   */
  protected async doSendMessage(
    messages: Message[],
    config: TextModelConfig
  ): Promise<LLMResponse> {
    const client = this.createClient(config)

    try {
      const requestParams: any = {
        model: config.modelMeta.id,
        max_tokens: (config.paramOverrides?.max_tokens as number) || DEFAULT_MAX_TOKENS,
        messages: this.convertMessages(messages),
        temperature: config.paramOverrides?.temperature as number,
        top_p: config.paramOverrides?.top_p as number,
        top_k: config.paramOverrides?.top_k as number,
        system: this.extractSystemMessage(messages)
      }

      // 添加 Extended Thinking 配置
      const thinkingBudget = config.paramOverrides?.thinking_budget_tokens as number | undefined
      if (thinkingBudget !== undefined && thinkingBudget >= 1024) {
        requestParams.thinking = {
          type: 'enabled',
          budget_tokens: thinkingBudget
        }
      }

      const response = await client.messages.create(requestParams)

      // 提取 thinking 内容
      const reasoning = this.extractThinking(response)

      return {
        content: this.extractContent(response),
        reasoning,
        metadata: {
          model: response.model,
          finishReason: response.stop_reason || undefined,
          tokens: response.usage ? (response.usage.input_tokens || 0) + (response.usage.output_tokens || 0) : undefined
        }
      }
    } catch (error) {
      throw this.handleError(error)
    }
  }

  /**
   * 发送流式消息（真正的 SSE 流）
   */
  protected async doSendMessageStream(
    messages: Message[],
    config: TextModelConfig,
    callbacks: StreamHandlers
  ): Promise<void> {
    const client = this.createClient(config)
    const thinkState = { isInThinkMode: false, buffer: '' }

    try {
      const requestParams: any = {
        model: config.modelMeta.id,
        max_tokens: (config.paramOverrides?.max_tokens as number) || DEFAULT_MAX_TOKENS,
        messages: this.convertMessages(messages),
        temperature: config.paramOverrides?.temperature as number,
        top_p: config.paramOverrides?.top_p as number,
        system: this.extractSystemMessage(messages)
      }

      // 添加 Extended Thinking 配置
      const thinkingBudget = config.paramOverrides?.thinking_budget_tokens as number | undefined
      if (thinkingBudget !== undefined && thinkingBudget >= 1024) {
        requestParams.thinking = {
          type: 'enabled',
          budget_tokens: thinkingBudget
        }
      }

      const stream = await client.messages.stream(requestParams)

      let accumulatedReasoning = ''

      // 监听原生 thinking 事件（Extended Thinking）
      ;(stream as any).on('thinking', (thinkingDelta: string) => {
        accumulatedReasoning += thinkingDelta
        if (callbacks.onReasoningToken) {
          callbacks.onReasoningToken(thinkingDelta)
        }
      })

      // 监听文本内容事件（同时支持 <think> 标签）
      ;(stream as any).on('text', (text: string) => {
        this.processStreamContentWithThinkTags(text, callbacks, thinkState)
      })

      // 监听最终消息
      ;(stream as any).on('message', (message: any) => {
        const response: LLMResponse = {
          content: this.extractContent(message),
          reasoning: accumulatedReasoning || undefined,
          metadata: {
            model: message.model,
            finishReason: message.stop_reason || undefined,
            tokens: message.usage ? (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0) : undefined
          }
        }
        callbacks.onComplete(response)
      })

      ;(stream as any).on('error', (error: any) => {
        callbacks.onError(error)
      })

      // 等待流完成
      await stream.finalMessage()
    } catch (error) {
      callbacks.onError(this.handleError(error))
      throw error
    }
  }

  /**
   * 发送带工具调用的流式消息
   * 使用标准的 messages.stream API，手动处理工具调用
   */
  public async sendMessageStreamWithTools(
    messages: Message[],
    config: TextModelConfig,
    tools: ToolDefinition[],
    callbacks: StreamHandlers
  ): Promise<void> {
    const client = this.createClient(config)
    const thinkState = { isInThinkMode: false, buffer: '' }

    try {
      const requestParams: any = {
        model: config.modelMeta.id,
        max_tokens: (config.paramOverrides?.max_tokens as number) || DEFAULT_MAX_TOKENS,
        messages: this.convertMessages(messages),
        tools: this.convertTools(tools),
        temperature: config.paramOverrides?.temperature as number,
        top_p: config.paramOverrides?.top_p as number,
        system: this.extractSystemMessage(messages)
      }

      // 添加 Extended Thinking 配置
      const thinkingBudget = config.paramOverrides?.thinking_budget_tokens as number | undefined
      if (thinkingBudget !== undefined && thinkingBudget >= 1024) {
        requestParams.thinking = {
          type: 'enabled',
          budget_tokens: thinkingBudget
        }
      }

      const stream = await client.messages.stream(requestParams)

      let accumulatedContent = ''
      let accumulatedReasoning = ''
      const toolCalls: any[] = []
      let currentToolCallIndex = -1

      // 监听原生 thinking 事件（Extended Thinking）
      ;(stream as any).on('thinking', (thinkingDelta: string) => {
        accumulatedReasoning += thinkingDelta
        if (callbacks.onReasoningToken) {
          callbacks.onReasoningToken(thinkingDelta)
        }
      })

      // 监听内容块开始事件
      ;(stream as any).on('contentBlockStart', (event: any) => {
        if (event.contentBlock?.type === 'tool_use') {
          currentToolCallIndex++
          toolCalls.push({
            id: event.contentBlock.id,
            type: 'function' as const,
            function: {
              name: event.contentBlock.name,
              arguments: ''
            }
          })
        }
      })

      // 监听内容块增量事件
      ;(stream as any).on('contentBlockDelta', (event: any) => {
        if (event.delta?.type === 'text_delta') {
          // 处理文本内容
          const text = event.delta.text || ''
          accumulatedContent += text
          this.processStreamContentWithThinkTags(text, callbacks, thinkState)
        } else if (event.delta?.type === 'input_json_delta') {
          // 处理工具调用参数增量
          if (currentToolCallIndex >= 0 && toolCalls[currentToolCallIndex]) {
            toolCalls[currentToolCallIndex].function.arguments += event.delta.partial_json || ''

            // 尝试解析完整的 JSON，如果成功则触发回调
            try {
              JSON.parse(toolCalls[currentToolCallIndex].function.arguments)
              if (callbacks.onToolCall) {
                callbacks.onToolCall(toolCalls[currentToolCallIndex])
              }
            } catch {
              // JSON 还不完整，继续累积
            }
          }
        }
      })

      // 监听最终消息
      ;(stream as any).on('message', (message: any) => {
        const response: LLMResponse = {
          content: accumulatedContent,
          reasoning: accumulatedReasoning || undefined,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          metadata: {
            model: message.model,
            finishReason: message.stop_reason || undefined,
            tokens: message.usage ? (message.usage.input_tokens || 0) + (message.usage.output_tokens || 0) : undefined
          }
        }
        callbacks.onComplete(response)
      })

      ;(stream as any).on('error', (error: any) => {
        callbacks.onError(error)
      })

      // 等待流完成
      await stream.finalMessage()
    } catch (error) {
      callbacks.onError(this.handleError(error))
      throw error
    }
  }

  // ===== 内部辅助方法 =====

  /**
   * 创建配置好的客户端实例
   */
  private createClient(config: TextModelConfig): Anthropic {
    const options: any = {
      apiKey: config.connectionConfig?.apiKey || '',
      dangerouslyAllowBrowser: true // 根据实际环境配置
    }

    if (config.connectionConfig?.baseURL) {
      // 规范化 baseURL：移除末尾的 /v1 后缀（SDK 会自动添加）
      let baseURL = config.connectionConfig.baseURL
      if (baseURL.endsWith('/v1')) {
        baseURL = baseURL.slice(0, -3)
      }
      options.baseURL = baseURL
    }

    if (config.connectionConfig?.timeout) {
      options.timeout = config.connectionConfig.timeout
    }

    return new Anthropic(options)
  }

  /**
   * 转换消息格式
   */
  private convertMessages(messages: Message[]) {
    return messages
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content
      }))
  }

  /**
   * 提取系统消息
   */
  private extractSystemMessage(messages: Message[]): string | undefined {
    const systemMessages = messages.filter(msg => msg.role === 'system')
    return systemMessages.length > 0
      ? systemMessages.map(msg => msg.content).join('\n')
      : undefined
  }

  /**
   * 提取响应内容
   */
  private extractContent(response: any): string {
    if (!response.content || response.content.length === 0) {
      return ''
    }

    return response.content
      .filter((block: any) => block.type === 'text')
      .map((block: any) => block.text)
      .join('')
  }

  /**
   * 转换工具定义
   */
  private convertTools(tools: ToolDefinition[]) {
    return tools.map(tool => ({
      name: tool.function.name,
      description: tool.function.description || '',
      input_schema: {
        type: 'object' as const,
        properties: (tool.function.parameters as any)?.properties || {},
        required: (tool.function.parameters as any)?.required || []
      }
    }))
  }

  /**
   * 提取 thinking 内容（Extended Thinking）
   */
  private extractThinking(response: any): string | undefined {
    if (!response.content || response.content.length === 0) {
      return undefined
    }

    const thinkingBlocks = response.content.filter(
      (block: any) => block.type === 'thinking'
    )

    if (thinkingBlocks.length === 0) {
      return undefined
    }

    return thinkingBlocks
      .map((block: any) => block.thinking)
      .join('\n')
  }

  /**
   * 错误处理
   */
  private handleError(error: any): Error {
    if (error.status) {
      return new Error(`Anthropic API error (${error.status}): ${error.message}`)
    }
    return error instanceof Error ? error : new Error(String(error))
  }
}
