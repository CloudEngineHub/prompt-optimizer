import OpenAI from 'openai'
import { AbstractTextProviderAdapter } from './abstract-adapter'
import type {
  TextProvider,
  TextModel,
  TextModelConfig,
  Message,
  LLMResponse,
  StreamHandlers,
  ToolDefinition,
  ParameterDefinition
} from '../types'

/**
 * OpenAI SDK适配器实现
 * 同时支持OpenAI官方API和OpenAI兼容API（DeepSeek, Zhipu等）
 *
 * 职责：
 * - 封装OpenAI SDK调用逻辑
 * - 处理baseURL规范化（移除'/chat/completions'后缀）
 * - 支持浏览器环境（dangerouslyAllowBrowser）
 * - 支持动态模型获取（models.list() API）
 * - 保留SDK原始错误堆栈
 */
export class OpenAIAdapter extends AbstractTextProviderAdapter {
  // ===== Provider元数据 =====

  /**
   * 获取Provider元数据
   */
  public getProvider(): TextProvider {
    return {
      id: 'openai',
      name: 'OpenAI',
      description: 'OpenAI GPT models and OpenAI-compatible APIs',
      requiresApiKey: true,
      defaultBaseURL: 'https://api.openai.com/v1',
      supportsDynamicModels: true,
      connectionSchema: {
        required: ['apiKey'],
        optional: ['baseURL', 'organization', 'timeout'],
        fieldTypes: {
          apiKey: 'string',
          baseURL: 'string',
          organization: 'string',
          timeout: 'number'
        }
      }
    }
  }

  /**
   * 获取静态模型列表（OpenAI官方模型）
   */
  public getModels(): TextModel[] {
    const providerId = 'openai'

    return [
      // GPT-4o 系列
      {
        id: 'gpt-4o',
        name: 'GPT-4o',
        description: 'Latest GPT-4o model with vision capabilities',
        providerId,
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsReasoning: false,
          maxContextLength: 128000
        },
        parameterDefinitions: this.getParameterDefinitions('gpt-4o'),
        defaultParameterValues: this.getDefaultParameterValues('gpt-4o')
      },
      {
        id: 'gpt-4o-mini',
        name: 'GPT-4o Mini',
        description: 'Affordable and intelligent small model for fast, lightweight tasks',
        providerId,
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsReasoning: false,
          maxContextLength: 128000
        },
        parameterDefinitions: this.getParameterDefinitions('gpt-4o-mini'),
        defaultParameterValues: this.getDefaultParameterValues('gpt-4o-mini')
      },

      // o1 系列（推理模型）
      {
        id: 'o1',
        name: 'o1',
        description: 'Advanced reasoning model for complex tasks',
        providerId,
        capabilities: {
          supportsStreaming: true,
          supportsTools: false,
          supportsReasoning: true,
          maxContextLength: 200000
        },
        parameterDefinitions: this.getParameterDefinitions('o1'),
        defaultParameterValues: this.getDefaultParameterValues('o1')
      },
      {
        id: 'o1-mini',
        name: 'o1 Mini',
        description: 'Faster and cheaper reasoning model for coding, math, and science',
        providerId,
        capabilities: {
          supportsStreaming: true,
          supportsTools: false,
          supportsReasoning: true,
          maxContextLength: 128000
        },
        parameterDefinitions: this.getParameterDefinitions('o1-mini'),
        defaultParameterValues: this.getDefaultParameterValues('o1-mini')
      },

      // GPT-4 Turbo
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        description: 'Latest GPT-4 Turbo model with vision capabilities',
        providerId,
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsReasoning: false,
          maxContextLength: 128000
        },
        parameterDefinitions: this.getParameterDefinitions('gpt-4-turbo'),
        defaultParameterValues: this.getDefaultParameterValues('gpt-4-turbo')
      },

      // GPT-3.5 Turbo
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        description: 'Fast and affordable model for simple tasks',
        providerId,
        capabilities: {
          supportsStreaming: true,
          supportsTools: true,
          supportsReasoning: false,
          maxContextLength: 16385
        },
        parameterDefinitions: this.getParameterDefinitions('gpt-3.5-turbo'),
        defaultParameterValues: this.getDefaultParameterValues('gpt-3.5-turbo')
      }
    ]
  }

  /**
   * 动态获取模型列表（调用OpenAI models.list() API）
   * @param config 连接配置
   * @returns 动态获取的模型列表
   */
  public async getModelsAsync(config: TextModelConfig): Promise<TextModel[]> {
    // 验证baseURL以/v1结尾
    const baseURL = config.connectionConfig.baseURL || this.getProvider().defaultBaseURL
    if (!/\/v1$/.test(baseURL)) {
      throw new Error(
        `MISSING_V1_SUFFIX: baseURL should end with "/v1" for OpenAI-compatible APIs. Current: ${baseURL}`
      )
    }

    const openai = this.createOpenAIInstance(config, false)

    try {
      const response = await openai.models.list()
      console.log('[OpenAIAdapter] API returned models:', response)

      // 检查返回格式
      if (response && response.data && Array.isArray(response.data)) {
        const models = response.data
          .map((model) => {
            // 使用buildDefaultModel为每个模型ID创建TextModel对象
            return this.buildDefaultModel(model.id)
          })
          .sort((a, b) => a.id.localeCompare(b.id))

        if (models.length === 0) {
          throw new Error('EMPTY_MODEL_LIST: API returned empty model list')
        }

        return models
      }

      throw new Error('INVALID_RESPONSE: Unexpected API response format')
    } catch (error: any) {
      console.error('[OpenAIAdapter] Failed to fetch models:', error)

      // 连接错误处理（包括跨域检测）
      if (error.message && (error.message.includes('Failed to fetch') ||
          error.message.includes('Connection error'))) {
        const isCrossOriginError = this.detectCrossOriginError(error, baseURL)

        if (isCrossOriginError) {
          throw new Error(`CROSS_ORIGIN_CONNECTION_FAILED: ${error.message}`)
        } else {
          throw new Error(`CONNECTION_FAILED: ${error.message}`)
        }
      }

      // API返回的错误信息
      if (error.response?.data) {
        throw new Error(`API_ERROR: ${JSON.stringify(error.response.data)}`)
      }

      // 其他错误,保持原始信息
      throw new Error(`UNKNOWN_ERROR: ${error.message || 'Unknown error'}`)
    }
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
        description: 'Sampling temperature (0-2)',
        default: 1,
        min: 0,
        max: 2
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
        name: 'max_tokens',
        type: 'number',
        description: 'Maximum tokens to generate',
        min: 1
      },
      {
        name: 'presence_penalty',
        type: 'number',
        description: 'Presence penalty (-2 to 2)',
        default: 0,
        min: -2,
        max: 2
      },
      {
        name: 'frequency_penalty',
        type: 'number',
        description: 'Frequency penalty (-2 to 2)',
        default: 0,
        min: -2,
        max: 2
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
      presence_penalty: 0,
      frequency_penalty: 0
    }
  }

  // ===== 错误检测辅助方法 =====

  /**
   * 检测是否为跨域错误
   * 从 service.ts.backup 迁移的逻辑 (L1048-1094)
   *
   * 功能说明:
   * - 区分跨域错误(CORS)和普通网络错误
   * - 只在浏览器环境中进行检测
   * - 通过URL origin对比和错误特征识别
   *
   * @param error 捕获的错误对象
   * @param baseURL API的baseURL
   * @returns true表示是跨域错误,false表示其他错误
   */
  private detectCrossOriginError(error: any, baseURL: string): boolean {
    // 非浏览器环境不存在跨域问题
    if (typeof window === 'undefined') {
      return false
    }

    try {
      const apiUrl = new URL(baseURL)
      const currentUrl = new URL(window.location.href)

      const errorString = error.toString()

      // 只有在不同origin且没有明显的DNS/连接错误时才认为是跨域
      const isDifferentOrigin = apiUrl.origin !== currentUrl.origin
      const hasNetworkError =
        errorString.includes('ERR_NAME_NOT_RESOLVED') ||
        errorString.includes('ERR_CONNECTION_REFUSED') ||
        errorString.includes('ERR_NETWORK_CHANGED') ||
        errorString.includes('ERR_INTERNET_DISCONNECTED') ||
        errorString.includes('ERR_EMPTY_RESPONSE')

      return isDifferentOrigin && !hasNetworkError
    } catch (urlError) {
      // URL解析失败,当作普通连接错误处理
      console.warn('[OpenAIAdapter] Failed to parse URL for CORS detection:', urlError)
      return false
    }
  }

  // ===== SDK实例创建（从service.ts迁移） =====

  /**
   * 创建OpenAI SDK实例
   * 从service.ts的getOpenAIInstance方法迁移
   *
   * @param config 模型配置
   * @param isStream 是否为流式请求
   * @returns OpenAI SDK实例
   */
  private createOpenAIInstance(config: TextModelConfig, isStream: boolean = false): OpenAI {
    const apiKey = config.connectionConfig.apiKey || ''

    // 处理baseURL，如果以'/chat/completions'结尾则去掉
    let processedBaseURL = config.connectionConfig.baseURL || this.getProvider().defaultBaseURL
    if (processedBaseURL?.endsWith('/chat/completions')) {
      processedBaseURL = processedBaseURL.slice(0, -'/chat/completions'.length)
    }

    // 创建OpenAI实例配置
    const defaultTimeout = isStream ? 90000 : 60000
    const timeout =
      config.paramOverrides?.timeout !== undefined
        ? (config.paramOverrides.timeout as number)
        : defaultTimeout

    const sdkConfig: any = {
      apiKey: apiKey,
      baseURL: processedBaseURL,
      timeout: timeout,
      maxRetries: isStream ? 2 : 3
    }

    // 浏览器环境检测
    if (typeof window !== 'undefined') {
      sdkConfig.dangerouslyAllowBrowser = true
      console.log('[OpenAIAdapter] Browser environment detected. Setting dangerouslyAllowBrowser=true.')
    }

    const instance = new OpenAI(sdkConfig)

    return instance
  }

  // ===== 核心方法实现 =====

  /**
   * 发送消息（结构化格式）
   * 从service.ts的sendOpenAIMessageStructured迁移 (L126-186)
   *
   * @param messages 消息数组
   * @param config 模型配置
   * @returns LLM响应
   * @throws SDK原始错误（保留完整堆栈）
   */
  protected async doSendMessage(messages: Message[], config: TextModelConfig): Promise<LLMResponse> {
    const openai = this.createOpenAIInstance(config, false)

    // 格式化消息
    const formattedMessages = messages.map((msg) => ({
      role: msg.role,
      content: msg.content
    }))

    // 从paramOverrides提取参数，排除特殊字段
    const {
      timeout, // 已在createOpenAIInstance中处理
      model: _paramModel, // 避免覆盖主model
      messages: _paramMessages, // 避免覆盖主messages
      ...restParams
    } = (config.paramOverrides || {}) as any

    const completionConfig: any = {
      model: config.modelMeta.id,
      messages: formattedMessages,
      ...restParams // 展开其他参数
    }

    try {
      const response = await openai.chat.completions.create(completionConfig)

      // 处理响应中的 reasoning_content 和普通 content
      const choice = response.choices[0]
      if (!choice?.message) {
        throw new Error('未收到有效的响应')
      }

      let content = choice.message.content || ''
      let reasoning = ''

      // 处理推理内容（如果存在）
      // SiliconFlow 等提供商在 choice.message 中并列提供 reasoning_content 字段
      if ((choice.message as any).reasoning_content) {
        reasoning = (choice.message as any).reasoning_content
      } else {
        // 检测并分离content中的think标签
        const processed = this.processThinkTags(content)
        content = processed.content
        reasoning = processed.reasoning || ''
      }

      const result: LLMResponse = {
        content: content,
        reasoning: reasoning || undefined,
        metadata: {
          model: config.modelMeta.id,
          finishReason: choice.finish_reason || undefined
        }
      }

      return result
    } catch (error) {
      console.error('[OpenAIAdapter] API call failed:', error)
      throw error // 保留原始错误堆栈，不包装
    }
  }

  /**
   * 发送流式消息
   * 从service.ts的streamOpenAIMessage迁移 (L504-585)
   *
   * @param messages 消息数组
   * @param config 模型配置
   * @param callbacks 流式响应回调
   * @throws SDK原始错误（保留完整堆栈）
   */
  protected async doSendMessageStream(
    messages: Message[],
    config: TextModelConfig,
    callbacks: StreamHandlers
  ): Promise<void> {
    try {
      // 获取流式OpenAI实例
      const openai = this.createOpenAIInstance(config, true)

      const formattedMessages = messages.map((msg) => ({
        role: msg.role,
        content: msg.content
      }))

      console.log('[OpenAIAdapter] Creating stream request...')
      const {
        timeout, // 已在createOpenAIInstance中处理
        model: _paramModel, // 避免覆盖主model
        messages: _paramMessages, // 避免覆盖主messages
        stream: _paramStream, // 避免覆盖stream标志
        ...restParams
      } = (config.paramOverrides || {}) as any

      const completionConfig: any = {
        model: config.modelMeta.id,
        messages: formattedMessages,
        stream: true, // 流式标志
        ...restParams // 用户自定义参数
      }

      // 直接使用流式响应
      const stream = await openai.chat.completions.create(completionConfig)

      console.log('[OpenAIAdapter] Stream response received')

      // 累积内容
      let accumulatedReasoning = ''
      let accumulatedContent = ''

      // think标签状态跟踪
      const thinkState = { isInThinkMode: false, buffer: '' }

      for await (const chunk of stream as any) {
        // 处理推理内容（SiliconFlow 等提供商在 delta 中提供 reasoning_content）
        const reasoningContent = chunk.choices[0]?.delta?.reasoning_content || ''
        if (reasoningContent) {
          accumulatedReasoning += reasoningContent

          // 如果有推理回调，发送推理内容
          if (callbacks.onReasoningToken) {
            callbacks.onReasoningToken(reasoningContent)
          }
        }

        // 处理主要内容
        const content = chunk.choices[0]?.delta?.content || ''
        if (content) {
          accumulatedContent += content

          // 使用流式think标签处理
          this.processStreamContentWithThinkTags(content, callbacks, thinkState)
        }
      }

      console.log('[OpenAIAdapter] Stream completed')

      // 构建完整响应
      const response: LLMResponse = {
        content: accumulatedContent,
        reasoning: accumulatedReasoning || undefined,
        metadata: {
          model: config.modelMeta.id
        }
      }

      callbacks.onComplete(response)
    } catch (error) {
      console.error('[OpenAIAdapter] Stream error:', error)
      callbacks.onError(error instanceof Error ? error : new Error(String(error)))
      throw error // 保留原始错误堆栈
    }
  }

  /**
   * 发送支持工具调用的流式消息
   * 从service.ts的streamOpenAIMessageWithTools迁移 (L591-702)
   *
   * @param messages 消息数组
   * @param config 模型配置
   * @param tools 工具定义数组
   * @param callbacks 流式响应回调
   * @throws SDK原始错误（保留完整堆栈）
   */
  public async sendMessageStreamWithTools(
    messages: Message[],
    config: TextModelConfig,
    tools: ToolDefinition[],
    callbacks: StreamHandlers
  ): Promise<void> {
    try {
      // 获取流式OpenAI实例
      const openai = this.createOpenAIInstance(config, true)

      const formattedMessages = messages.map((msg) => ({
        role: msg.role,
        content: msg.content
      }))

      console.log('[OpenAIAdapter] Creating stream request with tools...')
      const {
        timeout,
        model: _paramModel,
        messages: _paramMessages,
        stream: _paramStream,
        tools: _paramTools,
        ...restParams
      } = (config.paramOverrides || {}) as any

      const completionConfig: any = {
        model: config.modelMeta.id,
        messages: formattedMessages,
        tools: tools,
        tool_choice: 'auto',
        stream: true,
        ...restParams
      }

      const stream = await openai.chat.completions.create(completionConfig)
      console.log('[OpenAIAdapter] Stream response with tools received')

      let accumulatedReasoning = ''
      let accumulatedContent = ''
      const toolCalls: any[] = []
      const thinkState = { isInThinkMode: false, buffer: '' }

      for await (const chunk of stream as any) {
        // 处理推理内容
        const reasoningContent = chunk.choices[0]?.delta?.reasoning_content || ''
        if (reasoningContent) {
          accumulatedReasoning += reasoningContent
          if (callbacks.onReasoningToken) {
            callbacks.onReasoningToken(reasoningContent)
          }
        }

        // 处理工具调用
        const toolCallDeltas = chunk.choices[0]?.delta?.tool_calls
        if (toolCallDeltas) {
          for (const toolCallDelta of toolCallDeltas) {
            if (toolCallDelta.index !== undefined) {
              while (toolCalls.length <= toolCallDelta.index) {
                toolCalls.push({
                  id: '',
                  type: 'function' as const,
                  function: { name: '', arguments: '' }
                })
              }

              const currentToolCall = toolCalls[toolCallDelta.index]

              if (toolCallDelta.id) currentToolCall.id = toolCallDelta.id
              if (toolCallDelta.type) currentToolCall.type = toolCallDelta.type
              if (toolCallDelta.function) {
                if (toolCallDelta.function.name) {
                  currentToolCall.function.name += toolCallDelta.function.name
                }
                if (toolCallDelta.function.arguments) {
                  currentToolCall.function.arguments += toolCallDelta.function.arguments
                }

                // 当工具调用完整时，通知回调
                if (
                  currentToolCall.id &&
                  currentToolCall.function.name &&
                  toolCallDelta.function.arguments &&
                  callbacks.onToolCall
                ) {
                  try {
                    JSON.parse(currentToolCall.function.arguments)
                    callbacks.onToolCall(currentToolCall)
                  } catch {
                    // JSON 还不完整
                  }
                }
              }
            }
          }
        }

        // 处理主要内容
        const content = chunk.choices[0]?.delta?.content || ''
        if (content) {
          accumulatedContent += content
          this.processStreamContentWithThinkTags(content, callbacks, thinkState)
        }
      }

      console.log('[OpenAIAdapter] Stream with tools completed, tool calls:', toolCalls.length)

      const response: LLMResponse = {
        content: accumulatedContent,
        reasoning: accumulatedReasoning || undefined,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        metadata: { model: config.modelMeta.id }
      }

      callbacks.onComplete(response)
    } catch (error) {
      console.error('[OpenAIAdapter] Stream with tools error:', error)
      callbacks.onError(error instanceof Error ? error : new Error(String(error)))
      throw error // 保留原始错误堆栈
    }
  }
}

