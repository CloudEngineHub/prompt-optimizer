import { ref, computed, inject, watch } from 'vue'

import { useI18n } from 'vue-i18n'
import { useToast } from './useToast'
import {
  type ModelOption,
  type TextModel,
  type TextModelConfig,
  type TextProvider
} from '@prompt-optimizer/core'
import { useModelAdvancedParameters } from './useModelAdvancedParameters'
import type { AppServices } from '../types/services'

type TextConnectionValue = string | number | boolean | undefined
interface TextConnectionConfig {
  [key: string]: TextConnectionValue
}

interface TextModelForm {
  id: string
  originalId?: string
  name: string
  enabled: boolean
  providerId: string
  modelId: string
  connectionConfig: TextConnectionConfig
  paramOverrides: Record<string, unknown>
  displayMaskedKey: boolean
  originalApiKey?: string
  defaultModel?: string
}

interface SetProviderOptions {
  autoSelectFirstModel?: boolean
  resetOverrides?: boolean
}

const DEFAULT_TEXT_MODEL_IDS = ['openai', 'gemini', 'deepseek', 'zhipu', 'siliconflow', 'custom'] as const

export function useTextModelManager() {
  const { t } = useI18n()
  const toast = useToast()

  const services = inject<AppServices>('services')
  if (!services) {
    throw new Error('Services not provided!')
  }

  const modelManager = services.value.modelManager
  const llmService = services.value.llmService
  const textAdapterRegistry = services.value.textAdapterRegistry

  const models = ref<TextModelConfig[]>([])
  const loadingModels = ref(false)
  const testingConnections = ref<Record<string, boolean>>({})

  const providers = ref<TextProvider[]>([])
  const providersLoaded = ref(false)
  const isLoadingProviders = ref(false)

  const form = ref<TextModelForm>({
    id: '',
    name: '',
    enabled: true,
    providerId: '',
    modelId: '',
    connectionConfig: {},
    paramOverrides: {},
    displayMaskedKey: false
  })

  const editingModelId = ref<string | null>(null)
  const editingModelMeta = ref<TextModel | null>(null)
  const formReady = ref(false)
  const isSaving = ref(false)
  const isTestingFormConnection = ref(false)
  const formConnectionStatus = ref<{
    type: 'success' | 'error' | 'warning' | 'info'
    message: string
  } | null>(null)

  const modelOptions = ref<ModelOption[]>([])
  const isLoadingModelOptions = ref(false)
  const currentProviderType = computed(() => form.value.providerId || 'custom')

  const providerOptions = computed(() =>
    providers.value.map(provider => ({
      label: provider.name,
      value: provider.id,
      disabled: false
    }))
  )

  const selectedProvider = computed(() => {
    if (!form.value.providerId) return null
    return providers.value.find(p => p.id === form.value.providerId) || null
  })

  // 简化后的接口:直接传入必要的参数
  const advancedParameters = useModelAdvancedParameters({
    mode: 'text',
    registry: computed(() => textAdapterRegistry),
    providerId: computed(() => form.value.providerId || ''),
    modelId: computed(() => form.value.modelId || ''),
    savedModelMeta: computed(() => editingModelMeta.value || undefined),
    getParamOverrides: () => form.value.paramOverrides ?? {},
    setParamOverrides: value => {
      form.value.paramOverrides = { ...value }
    }
  })

  const {
    currentParameterDefinitions,
    availableParameterCount,
    updateParamOverrides
  } = advancedParameters

  const connectionFields = computed(() => {
    if (!selectedProvider.value?.connectionSchema) return []

    const schema = selectedProvider.value.connectionSchema
    const fields: Array<{ name: string; required: boolean; type: string; placeholder?: string }> = []

    for (const fieldName of schema.required) {
      fields.push({
        name: fieldName,
        required: true,
        type: schema.fieldTypes[fieldName] || 'string',
        placeholder: fieldName === 'baseURL' ? selectedProvider.value.defaultBaseURL : ''
      })
    }

    for (const fieldName of schema.optional) {
      fields.push({
        name: fieldName,
        required: false,
        type: schema.fieldTypes[fieldName] || 'string',
        placeholder: fieldName === 'baseURL' ? selectedProvider.value.defaultBaseURL : ''
      })
    }

    return fields
  })

  const isConnectionConfigured = computed(() => {
    if (!selectedProvider.value?.connectionSchema) return true

    const schema = selectedProvider.value.connectionSchema
    const config = form.value.connectionConfig || {}

    return schema.required.every(field => !!config[field])
  })

  const canTestFormConnection = computed(() => {
    // 必须在编辑模式下
    if (!editingModelId.value) return false
    // 测试期间禁用
    if (isTestingFormConnection.value) return false
    // 必须有必需的连接配置
    if (!isConnectionConfigured.value) return false
    // 必须有模型名称
    if (!form.value.name?.trim()) return false

    return true
  })
  const canRefreshModelOptions = computed(() => {
    return selectedProvider.value?.supportsDynamicModels && isConnectionConfigured.value && !isLoadingModelOptions.value
  })

  const modalTitle = computed(() => (editingModelId.value ? t('modelManager.editModel') : t('modelManager.addModel')))

  const isDefaultModel = (id: string) => {
    return DEFAULT_TEXT_MODEL_IDS.includes(id as typeof DEFAULT_TEXT_MODEL_IDS[number])
  }

  const resetFormState = () => {
    form.value = {
      id: '',
      name: '',
      enabled: true,
      providerId: '',
      modelId: '',
      connectionConfig: {},
      paramOverrides: {},
      displayMaskedKey: false
    }
    editingModelId.value = null
    editingModelMeta.value = null
    formReady.value = false
    modelOptions.value = []
    formConnectionStatus.value = null
  }

  const ensureProvidersLoaded = async () => {
    if (providersLoaded.value) return
    isLoadingProviders.value = true
    try {
      providers.value = textAdapterRegistry?.getAllProviders?.() || []
      providersLoaded.value = true
    } catch (error) {
      console.error('加载文本模型提供商失败:', error)
      toast.error(t('modelManager.loadFailed'))
      providers.value = []
    } finally {
      isLoadingProviders.value = false
    }
  }

  const loadStaticModelsForProvider = (providerId: string) => {
    if (!providerId || !textAdapterRegistry) {
      modelOptions.value = []
      return
    }
    try {
      const staticModels = textAdapterRegistry.getStaticModels(providerId)
      modelOptions.value = staticModels.map((model: TextModel) => ({
        value: model.id,
        label: model.name || model.id
      }))
    } catch (error) {
      console.error('加载 Provider 模型失败:', error)
      modelOptions.value = []
    }
  }

  const loadModels = async () => {
    loadingModels.value = true
    try {
      const all = await modelManager.getAllModels()
      models.value = all
        .map((model: TextModelConfig) => ({ ...model }))
        .sort((a: TextModelConfig, b: TextModelConfig) => {
          if (a.enabled !== b.enabled) {
            return a.enabled ? -1 : 1
          }
          const aDefault = isDefaultModel(a.id)
          const bDefault = isDefaultModel(b.id)
          if (aDefault !== bDefault) {
            return aDefault ? -1 : 1
          }
          return a.name.localeCompare(b.name)
        })
    } catch (error) {
      console.error('加载模型失败:', error)
      toast.error(t('modelManager.loadFailed'))
    } finally {
      loadingModels.value = false
    }
  }

  const testConfigConnection = async (id: string) => {
    if (!id || testingConnections.value[id]) return
    testingConnections.value[id] = true
    try {
      const model = await modelManager.getModel(id)
      if (!model) {
        throw new Error(t('modelManager.noModelsAvailable'))
      }
      await llmService.testConnection(id)
      toast.success(t('modelManager.testSuccess', { provider: model.name }))
    } catch (error) {
      console.error('连接测试失败:', error)
      const model = await modelManager.getModel(id)
      const modelName = model?.name || id
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast.error(t('modelManager.testFailed', {
        provider: modelName,
        error: errorMessage
      }))
    } finally {
      delete testingConnections.value[id]
    }
  }

  const enableModel = async (id: string) => {
    try {
      const model = await modelManager.getModel(id)
      if (!model) throw new Error(t('modelManager.noModelsAvailable'))
      await modelManager.enableModel(id)
      await loadModels()
      toast.success(t('modelManager.enableSuccess'))
    } catch (error) {
      console.error('启用模型失败:', error)
      toast.error(t('modelManager.enableFailed', { error: error.message }))
    }
  }

  const disableModel = async (id: string) => {
    try {
      const model = await modelManager.getModel(id)
      if (!model) throw new Error(t('modelManager.noModelsAvailable'))
      await modelManager.disableModel(id)
      await loadModels()
      toast.success(t('modelManager.disableSuccess'))
    } catch (error) {
      console.error('禁用模型失败:', error)
      toast.error(t('modelManager.disableFailed', { error: error.message }))
    }
  }

  const deleteModel = async (id: string) => {
    try {
      await modelManager.deleteModel(id)
      await loadModels()
      toast.success(t('modelManager.deleteSuccess'))
    } catch (error) {
      console.error('删除模型失败:', error)
      toast.error(t('modelManager.deleteFailed', { error: error.message }))
    }
  }

  const maskApiKey = (value: string) => {
    const keyLength = value.length
    if (keyLength <= 8) return '*'.repeat(keyLength)
    const visiblePart = 4
    const prefix = value.substring(0, visiblePart)
    const suffix = value.substring(keyLength - visiblePart)
    const maskedLength = keyLength - visiblePart * 2
    return `${prefix}${'*'.repeat(maskedLength)}${suffix}`
  }

  const setProvider = (providerId: string, options: SetProviderOptions = {}) => {
    const {
      autoSelectFirstModel = true,
      resetOverrides = true
    } = options

    form.value.providerId = providerId
    formConnectionStatus.value = null
    if (resetOverrides) {
      form.value.paramOverrides = {}
    }

    if (!providerId) {
      form.value.connectionConfig = {}
      modelOptions.value = []
      return
    }

    loadStaticModelsForProvider(providerId)

    const providerMeta = providers.value.find(p => p.id === providerId)
    if (providerMeta?.defaultBaseURL) {
      form.value.connectionConfig = {
        baseURL: form.value.connectionConfig.baseURL || providerMeta.defaultBaseURL,
        ...form.value.connectionConfig
      }
    }

    if (autoSelectFirstModel && modelOptions.value.length > 0) {
      form.value.modelId = modelOptions.value[0].value
      form.value.defaultModel = modelOptions.value[0].value
    }
  }

  const prepareForCreate = async () => {
    resetFormState()
    await ensureProvidersLoaded()
    formReady.value = false

    if (providers.value.length > 0) {
      setProvider(providers.value[0].id, {
        autoSelectFirstModel: true,
        resetOverrides: true
      })
    }

    formReady.value = true
  }

  const prepareForEdit = async (id: string, forceReload = true) => {
    // 如果已经在编辑同一个模型且不强制重新加载，则跳过
  if (!forceReload && editingModelId.value === id && formReady.value) {
    return
  }

  resetFormState()
    editingModelId.value = id
    await ensureProvidersLoaded()
    formReady.value = false

    try {
      const model = await modelManager.getModel(id)
      if (!model) {
        throw new Error(t('modelManager.noModelsAvailable'))
      }

      const connectionConfig: TextConnectionConfig = { ...(model.connectionConfig ?? {}) }
      const rawApiKey = connectionConfig.apiKey ?? ''
      if (rawApiKey) {
        connectionConfig.apiKey = maskApiKey(String(rawApiKey))
      }

      form.value = {
        id: model.id,
        originalId: model.id,
        name: model.name,
        enabled: model.enabled,
        providerId: model.providerMeta?.id ?? 'custom',
        modelId: model.modelMeta?.id ?? '',
        connectionConfig,
        paramOverrides: model.paramOverrides ? JSON.parse(JSON.stringify(model.paramOverrides)) : {},
        displayMaskedKey: !!rawApiKey,
        originalApiKey: String(rawApiKey) || undefined,
        defaultModel: String(model.modelMeta?.id ?? '')
      }
      editingModelMeta.value = model.modelMeta

      setProvider(form.value.providerId, {
        autoSelectFirstModel: false,
        resetOverrides: false
      })
      if (!modelOptions.value.some(option => option.value === form.value.modelId) && form.value.modelId) {
        modelOptions.value.push({ value: form.value.modelId, label: form.value.modelId })
      }

      // 编辑时不自动刷新模型列表，避免不必要的网络请求和延迟
      // 用户可以通过手动点击刷新按钮来获取最新模型列表
    } catch (error) {
      console.error('加载模型失败:', error)
      toast.error(t('modelManager.loadFailed'))
    } finally {
      formReady.value = true
    }
  }

  const refreshModelOptions = async (showSuccess = true) => {
    if (!form.value.providerId) return

    const baseURL = (form.value.connectionConfig.baseURL as string)?.trim()
    if (!baseURL) {
      toast.error(t('modelManager.needBaseUrl'))
      return
    }

    isLoadingModelOptions.value = true

    try {
      const providerTemplateId = form.value.providerId || currentProviderType.value || 'custom'
      const connectionConfig: TextConnectionConfig = {
        baseURL,
        ...form.value.connectionConfig,
        apiKey: form.value.displayMaskedKey && form.value.originalApiKey
          ? form.value.originalApiKey
          : form.value.connectionConfig.apiKey
      }

      const existingConfig = form.value.originalId ? await modelManager.getModel(form.value.originalId) : undefined

      let providerMeta = providers.value.find(p => p.id === providerTemplateId) || existingConfig?.providerMeta
      let modelMeta = existingConfig?.modelMeta

      if (textAdapterRegistry && providerTemplateId) {
        try {
          const adapter = textAdapterRegistry.getAdapter(providerTemplateId)
          if (!providerMeta) {
            providerMeta = adapter.getProvider()
          }
          const staticModels = adapter.getModels()
          if (form.value.modelId) {
            modelMeta = staticModels.find((m: TextModel) => m.id === form.value.modelId) || modelMeta
          }
          if (!modelMeta) {
            modelMeta = staticModels[0]
          }
          if (!modelMeta && form.value.modelId) {
            modelMeta = adapter.buildDefaultModel(form.value.modelId)
          }
        } catch (error) {
          console.warn(`[useTextModelManager] Failed to load metadata for provider ${providerTemplateId}`, error)
        }
      }

      const fetchedModels = await llmService.fetchModelList(providerTemplateId, {
        connectionConfig,
        providerMeta,
        modelMeta: modelMeta ? { ...modelMeta, id: form.value.modelId || modelMeta.id } : undefined
      } as Partial<TextModelConfig>)

      modelOptions.value = fetchedModels
      if (showSuccess) {
        toast.success(t('modelManager.fetchModelsSuccess', { count: fetchedModels.length }))
      }

      if (fetchedModels.length > 0 && !fetchedModels.some((m: { value: string }) => m.value === form.value.modelId)) {
        form.value.modelId = fetchedModels[0].value
      }
    } catch (error) {
      console.error('获取模型列表失败:', error)
      toast.error(error instanceof Error ? error.message : 'Unknown error' || t('modelManager.loadFailed'))
      modelOptions.value = []
    } finally {
      isLoadingModelOptions.value = false
    }
  }

  const ensureProviderMeta = (providerId: string, existing?: TextProvider) => {
    if (existing) return existing
    const adapter = textAdapterRegistry.getAdapter(providerId)
    return adapter.getProvider()
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const ensureModelMeta = (providerId: string, modelId: string, _existing?: TextModel) => {
    const adapter = textAdapterRegistry.getAdapter(providerId)
    const staticModels = adapter.getModels()
    const foundModel = staticModels.find((m: TextModel) => m.id === modelId)
    if (foundModel) {
      return foundModel
    }
    return adapter.buildDefaultModel(modelId)
  }

  const updateExistingModel = async () => {
    if (!form.value.originalId) {
      throw new Error('编辑会话无效')
    }

    const existingConfig = await modelManager.getModel(form.value.originalId)
    if (!existingConfig) {
      throw new Error('模型不存在')
    }

    const connectionConfig: TextConnectionConfig = {
      baseURL: (form.value.connectionConfig.baseURL as string)?.trim() || existingConfig.connectionConfig?.baseURL,
      ...form.value.connectionConfig
    }

    if (form.value.displayMaskedKey) {
      if (form.value.originalApiKey) {
        connectionConfig.apiKey = form.value.originalApiKey
      } else {
        delete connectionConfig.apiKey
      }
    } else if (form.value.connectionConfig.apiKey) {
      connectionConfig.apiKey = form.value.connectionConfig.apiKey
    } else {
      delete connectionConfig.apiKey
    }

    const providerMeta = ensureProviderMeta(form.value.providerId, existingConfig.providerMeta)
    const modelMeta = ensureModelMeta(form.value.providerId, form.value.modelId, existingConfig.modelMeta)

    const updates = {
      name: form.value.name,
      enabled: form.value.enabled,
      providerMeta,
      modelMeta,
      connectionConfig,
      paramOverrides: { ...(form.value.paramOverrides || {}) }
    } as Partial<TextModelConfig>

    await modelManager.updateModel(form.value.originalId, updates)
    return form.value.originalId
  }

  const createNewModel = async () => {
    if (!form.value.id) {
      toast.error(t('modelManager.modelKeyRequired'))
      throw new Error('模型标识必填')
    }

    const providerMeta = ensureProviderMeta(form.value.providerId)
    const modelMeta = ensureModelMeta(form.value.providerId, form.value.defaultModel || form.value.modelId)

    const newConfig = {
      id: form.value.id,
      name: form.value.name,
      enabled: true,
      providerMeta,
      modelMeta,
      connectionConfig: { ...form.value.connectionConfig },
      paramOverrides: { ...(form.value.paramOverrides ?? {}) }
    } as TextModelConfig

    await modelManager.addModel(form.value.id, newConfig)
    return form.value.id
  }

  const saveForm = async () => {
    if (isSaving.value) return null
    isSaving.value = true
    try {
      const savedId = editingModelId.value ? await updateExistingModel() : await createNewModel()
      await loadModels()
      return savedId
    } finally {
      isSaving.value = false
    }
  }

  const testFormConnection = async () => {
    // 使用 canTestFormConnection 的完整校验逻辑
    if (!canTestFormConnection.value) return

    isTestingFormConnection.value = true
    formConnectionStatus.value = { type: 'info', message: t('modelManager.testing') }

    try {
      const existingConfig = editingModelId.value ? await modelManager.getModel(editingModelId.value) : undefined
      if (!existingConfig) {
        throw new Error('模型配置不存在')
      }

      if (!form.value.providerId || !form.value.modelId) {
        throw new Error('模型未选择')
      }

      const providerMeta = ensureProviderMeta(form.value.providerId, existingConfig.providerMeta)
      const modelMeta = ensureModelMeta(form.value.providerId, form.value.modelId, existingConfig.modelMeta)

      const baseURL = typeof form.value.connectionConfig?.baseURL === 'string'
        ? form.value.connectionConfig.baseURL.trim()
        : undefined

      const connectionConfig: TextConnectionConfig = {
        baseURL: baseURL || existingConfig.connectionConfig?.baseURL,
        ...existingConfig.connectionConfig,
        ...form.value.connectionConfig,
        apiKey: form.value.displayMaskedKey && form.value.originalApiKey
          ? form.value.originalApiKey
          : (form.value.connectionConfig.apiKey || existingConfig.connectionConfig?.apiKey)
      }

      const tempConfig = {
        id: `temp-test-${editingModelId.value}-${Date.now()}`,
        name: form.value.name,
        enabled: form.value.enabled,
        providerMeta,
        modelMeta,
        connectionConfig,
        paramOverrides: { ...(form.value.paramOverrides || {}) }
      } as TextModelConfig

      await modelManager.addModel(tempConfig.id, tempConfig)

      try {
        // 测试临时模型
        await llmService.testConnection(tempConfig.id)
        formConnectionStatus.value = { type: 'success', message: t('modelManager.testSuccess', { provider: form.value.name }) }
        toast.success(t('modelManager.testSuccess', { provider: form.value.name }))
      } finally {
        // 清理临时模型
        try {
          await modelManager.deleteModel(tempConfig.id)
        } catch (cleanupError) {
          console.warn('清理临时测试模型失败:', cleanupError)
        }
      }

    } catch (error) {
      console.error('连接测试失败:', error)
      formConnectionStatus.value = {
        type: 'error',
        message: t('modelManager.testFailed', { provider: form.value.name, error: error instanceof Error ? error.message : 'Unknown error' || 'Unknown error' })
      }
      toast.error(t('modelManager.testFailed', { provider: form.value.name, error: error instanceof Error ? error.message : 'Unknown error' || 'Unknown error' }))
    } finally {
      isTestingFormConnection.value = false
    }
  }

  watch(() => form.value.connectionConfig.apiKey, (newValue) => {
    if (!editingModelId.value) return
    const val = newValue ?? ''
    const isMasked = typeof val === 'string' && val.includes('*')
    form.value.displayMaskedKey = isMasked
    if (!isMasked && typeof val === 'string') {
      form.value.originalApiKey = val
    }
  })

  const onModelChange = (modelId: string) => {
    form.value.modelId = modelId
    form.value.defaultModel = modelId || ''

    if (modelId && form.value.providerId) {
      advancedParameters.applyDefaultsFromModel()
    }
  }

  return {
    // list state
    models,
    loadingModels,
    loadModels,
    isDefaultModel,
    testingConnections,
    testConfigConnection,
    enableModel,
    disableModel,
    deleteModel,

    // providers
    providers,
    isLoadingProviders,
    loadProviders: ensureProvidersLoaded,
    selectProvider: setProvider,

    // form state & helpers
    form,
    formReady,
    isSaving,
    modalTitle,
    editingModelId,
    providerOptions,
    connectionFields,
    modelOptions,
    isLoadingModelOptions,
    currentParameterDefinitions,
    availableParameterCount,
    currentProviderType,
    selectedProvider,
    updateParamOverrides,
    onModelChange,
    prepareForCreate,
    prepareForEdit,
    refreshModelOptions,
    saveForm,
    resetFormState,
    isTestingFormConnection,
    canTestFormConnection,
    testFormConnection,
    isConnectionConfigured,
    canRefreshModelOptions,
    formConnectionStatus
  }
}

export type TextModelManager = ReturnType<typeof useTextModelManager>
