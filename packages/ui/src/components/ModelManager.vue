<template>
  <div
    class="fixed inset-0 theme-mask z-[60] flex items-center justify-center overflow-y-auto"
    @click="$emit('close')"
  >
    <div
      class="relative theme-manager-container w-full max-w-3xl m-4"
      @click.stop
    >
      <div class="p-6 space-y-6">
        <!-- 标题和关闭按钮 -->
        <div class="flex items-center justify-between">
          <h2 class="text-xl font-semibold theme-manager-text">{{ t('modelManager.title') }}</h2>
          <button
            @click="$emit('close')"
            class="theme-manager-text-secondary hover:theme-manager-text transition-colors text-xl"
          >
            ×
          </button>
        </div>

        <!-- 已启用模型列表 -->
        <div class="space-y-3">
          <h3 class="text-lg font-semibold theme-manager-text">{{ t('modelManager.modelList') }}</h3>
          <div class="space-y-3">
            <div v-for="model in models" :key="model.key" 
                 :class="['p-4 rounded-xl border transition-colors',
                         model.enabled 
                           ? 'theme-manager-card' 
                           : 'theme-manager-card opacity-50 shadow-none hover:shadow-none']">
              <div class="flex items-center justify-between">
                <div>
                  <div class="flex items-center gap-2">
                    <h4 class="font-medium" :class="model.enabled ? 'theme-manager-text' : 'theme-manager-text-disabled'">
                      {{ model.name }}
                    </h4>
                    <span v-if="!model.enabled" 
                          class="theme-manager-tag">
                      {{ t('modelManager.disabled') }}
                    </span>
                  </div>
                  <p class="text-sm" :class="model.enabled ? 'theme-manager-text-secondary' : 'theme-manager-text-disabled'">
                    {{ model.model }}
                  </p>
                </div>
                <div class="flex items-center space-x-2">
                  <button @click="testConnection(model.key)"
                          class="theme-manager-button-test">
                    {{ t('modelManager.testConnection') }}
                  </button>
                  <button @click="editModel(model.key)"
                          class="theme-manager-button-edit">
                    {{ t('modelManager.editModel') }}
                  </button>
                  <button @click="model.enabled ? disableModel(model.key) : enableModel(model.key)"
                          :class="[
                            model.enabled 
                              ? 'theme-manager-button-warning' 
                              : 'theme-manager-button-success'
                          ]">
                    {{ model.enabled ? t('common.disable') : t('common.enable') }}
                  </button>
                  <!-- 只对自定义模型显示删除按钮 -->
                  <button v-if="!isDefaultModel(model.key)" 
                          @click="handleDelete(model.key)"
                          class="theme-manager-button-danger">
                    {{ t('common.delete') }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 使用 Teleport 将模态框传送到 body -->
        <Teleport to="body">
          <!-- 编辑模型弹窗 -->
          <div v-if="isEditing" 
               class="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto"
               @click="cancelEdit">
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm"></div>
            
            <div class="relative theme-manager-container w-full max-w-2xl m-4 z-10"
                 @click.stop>
              <div class="p-6 space-y-6">
                <div class="flex items-center justify-between">
                  <h3 class="text-xl font-semibold theme-manager-text">{{ t('modelManager.editModel') }}</h3>
                  <button
                    @click="cancelEdit"
                    class="theme-manager-text-secondary hover:theme-manager-text transition-colors text-xl"
                  >
                    ×
                  </button>
                </div>
                
                <form @submit.prevent="saveEdit" class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium theme-manager-text mb-1.5">{{ t('modelManager.displayName') }}</label>
                    <input v-model="editingModel.name" type="text" required
                           class="theme-manager-input"
                           :placeholder="t('modelManager.displayNamePlaceholder')" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium theme-manager-text mb-1.5">{{ t('modelManager.apiUrl') }}</label>
                    <input v-model="editingModel.baseURL" type="url" required
                           class="theme-manager-input"
                           :placeholder="t('modelManager.apiUrlPlaceholder')" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium theme-manager-text mb-1.5">{{ t('modelManager.defaultModel') }}</label>
                    <div class="flex items-center gap-2">
                      <ElSelect
                        v-model="editingModel.defaultModel"
                        filterable
                        allow-create
                        default-first-option
                        create-item-position="top"
                        class="flex-grow el-themed-select"
                        popper-class="el-themed-dropdown"
                        :placeholder="t('modelManager.defaultModelPlaceholder', '输入或选择模型名称')"
                        :disabled="isLoadingModels">
                        <ElOption
                          v-for="model in availableModels"
                          :key="model"
                          :label="model"
                          :value="model" />
                      </ElSelect>
                      <button @click="fetchModels(editingModel.key)" 
                              type="button"
                              :disabled="isLoadingModels || !editingModel.apiKey || !editingModel.baseURL"
                              class="min-w-[150px] theme-manager-button-secondary">
                        {{ isLoadingModels ? t('common.loading') : t('modelManager.fetchModels') }}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label class="block text-sm font-medium theme-manager-text mb-1.5">{{ t('modelManager.apiKey') }}</label>
                    <ElInput
                      v-model="editingModel.apiKey"
                      type="password"
                      show-password
                      class="el-themed-input w-full"
                      :placeholder="t('modelManager.apiKeyPlaceholder')">
                    </ElInput>
                  </div>
                  <div v-if="vercelProxyAvailable" class="flex items-center space-x-2">
                    <input 
                      :id="`vercel-proxy-${editingModel.key}`" 
                      v-model="editingModel.useVercelProxy" 
                      type="checkbox"
                      class="w-4 h-4 text-purple-600 bg-black/20 border-purple-600/50 rounded focus:ring-purple-500/50"
                    />
                    <label :for="`vercel-proxy-${editingModel.key}`" class="text-sm font-medium theme-manager-text">
                      {{ t('modelManager.useVercelProxy') }}
                    </label>
                  </div>
                  <div class="flex justify-end space-x-3 pt-4">
                    <button
                      type="button"
                      @click="cancelEdit"
                      class="theme-manager-button-secondary"
                    >
                      {{ t('common.cancel') }}
                    </button>
                    <button
                      type="submit"
                      class="theme-manager-button-primary"
                    >
                      {{ t('common.save') }}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>

          <!-- 添加模型弹窗 -->
          <div v-if="showAddForm" class="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto" @click="showAddForm = false">
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm"></div>
            
            <div class="relative theme-manager-container w-full max-w-2xl m-4 z-10" @click.stop>
              <div class="p-6 space-y-6">
                <div class="flex items-center justify-between">
                  <h3 class="text-xl font-semibold theme-manager-text">{{ t('modelManager.addModel') }}</h3>
                  <button @click="showAddForm = false" class="theme-manager-text-secondary hover:theme-manager-text transition-colors text-xl">×</button>
                </div>
                
                <form @submit.prevent="addCustomModel" class="space-y-4">
                  <div>
                    <label class="block text-sm font-medium theme-manager-text mb-1.5">{{ t('modelManager.modelKey') }}</label>
                    <input v-model="newModel.key" type="text" required
                           class="theme-manager-input"
                           :placeholder="t('modelManager.modelKeyPlaceholder')" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium theme-manager-text mb-1.5">{{ t('modelManager.displayName') }}</label>
                    <input v-model="newModel.name" type="text" required
                           class="theme-manager-input"
                           :placeholder="t('modelManager.displayNamePlaceholder')" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium theme-manager-text mb-1.5">{{ t('modelManager.apiUrl') }}</label>
                    <input v-model="newModel.baseURL" type="url" required
                           class="theme-manager-input"
                           :placeholder="t('modelManager.apiUrlPlaceholder')" />
                  </div>
                  <div>
                    <label class="block text-sm font-medium theme-manager-text mb-1.5">{{ t('modelManager.defaultModel') }}</label>
                    <div class="flex items-center gap-2">
                      <ElSelect
                        v-model="newModel.defaultModel"
                        filterable
                        allow-create
                        default-first-option
                        create-item-position="top"
                        class="flex-grow el-themed-select"
                        popper-class="el-themed-dropdown"
                        :placeholder="t('modelManager.defaultModelPlaceholder', '输入或选择模型名称')"
                        :disabled="isLoadingModels">
                        <ElOption
                          v-for="model in newModelAvailableModels"
                          :key="model"
                          :label="model"
                          :value="model" />
                      </ElSelect>
                      <button @click="fetchNewModels()" 
                              type="button"
                              :disabled="isLoadingModels || !newModel.apiKey || !newModel.baseURL"
                              class="min-w-[150px] theme-manager-button-secondary">
                        {{ isLoadingModels ? t('common.loading') : t('modelManager.fetchModels') }}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label class="block text-sm font-medium theme-manager-text mb-1.5">{{ t('modelManager.apiKey') }}</label>
                    <ElInput
                      v-model="newModel.apiKey"
                      type="password"
                      show-password
                      required
                      class="el-themed-input w-full"
                      :placeholder="t('modelManager.apiKeyPlaceholder')">
                    </ElInput>
                  </div>
                  <div v-if="vercelProxyAvailable" class="flex items-center space-x-2">
                    <input 
                      id="new-model-vercel-proxy" 
                      v-model="newModel.useVercelProxy" 
                      type="checkbox"
                      class="w-4 h-4 text-purple-600 bg-black/20 border-purple-600/50 rounded focus:ring-purple-500/50"
                    />
                    <label for="new-model-vercel-proxy" class="text-sm font-medium theme-manager-text">
                      {{ t('modelManager.useVercelProxyHint') }}
                    </label>
                  </div>
                  <div class="flex justify-end space-x-3 pt-4">
                    <button type="button" @click="showAddForm = false" class="theme-manager-button-secondary">
                      {{ t('common.cancel') }}
                    </button>
                    <button type="submit" class="theme-manager-button-primary">
                      {{ t('common.create') }}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </Teleport>

        <!-- 添加模型按钮 -->
        <div class="mt-2 theme-manager-divider pt-2">
          <button @click="showAddForm = true" class="w-full theme-manager-button-secondary py-3 flex items-center justify-center space-x-2">
            <span>+</span>
            <span>{{ t('modelManager.addModel') }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, defineEmits, watch } from 'vue';
import { useI18n } from 'vue-i18n'
import { modelManager, createLLMService, checkVercelApiAvailability, resetVercelStatusCache } from '@prompt-optimizer/core';
import { useToast } from '../composables/useToast';
import { ElInput, ElSelect, ElOption } from 'element-plus';

const { t } = useI18n()
const toast = useToast();
const emit = defineEmits(['modelsUpdated', 'close', 'select']);

const models = ref([]);
const isEditing = ref(false);
const showAddForm = ref(false);
const editingModel = ref(null);
const newModel = ref({
  key: '',
  name: '',
  baseURL: '',
  defaultModel: '',
  apiKey: '',
  useVercelProxy: false
});
// 是否支持Vercel代理
const vercelProxyAvailable = ref(false);

// 检测Vercel代理是否可用
const checkVercelProxy = async () => {
  try {
    // 先重置缓存，确保每次都重新检测
    resetVercelStatusCache();
    // 使用core中的检测函数
    const available = await checkVercelApiAvailability();
    vercelProxyAvailable.value = available;
    console.log('Vercel代理检测结果:', vercelProxyAvailable.value);
  } catch (error) {
    console.log('Vercel代理不可用:', error);
    vercelProxyAvailable.value = false;
  }
};

// 加载所有模型
const loadModels = () => {
  try {
    // 强制刷新模型数据
    const allModels = modelManager.getAllModels();
    
    // 使用深拷贝确保响应式更新
    models.value = JSON.parse(JSON.stringify(allModels)).sort((a, b) => {
      // 启用的模型排在前面
      if (a.enabled !== b.enabled) {
        return a.enabled ? -1 : 1;
      }
      // 默认模型排在前面
      if (isDefaultModel(a.key) !== isDefaultModel(b.key)) {
        return isDefaultModel(a.key) ? -1 : 1;
      }
      return 0;
    });
    
    console.log('处理后的模型列表:', models.value.map(m => ({
      key: m.key,
      name: m.name,
      enabled: m.enabled,
      hasApiKey: !!m.apiKey
    })));
    
    emit('modelsUpdated', models.value[0]?.key);
  } catch (error) {
    console.error('加载模型列表失败:', error);
    toast.error('加载模型列表失败');
  }
};

// 测试连接
const testConnection = async (key) => {
  try {
    const model = modelManager.getModel(key);
    if (!model) throw new Error(t('modelManager.modelNotFound'));

    const llm = createLLMService(modelManager);
    await llm.testConnection(key);
    toast.success(t('modelManager.testSuccess'));
  } catch (error) {
    console.error('连接测试失败:', error);
    toast.error(t('modelManager.testFailed', { error: error.message }));
  }
};

// 判断是否为默认模型
const isDefaultModel = (key) => {
  return ['openai', 'gemini', 'deepseek'].includes(key);
};

// 处理删除
const handleDelete = async (key) => {
  if (confirm(t('modelManager.deleteConfirm'))) {
    try {
      modelManager.deleteModel(key)
      loadModels()
      toast.success(t('modelManager.deleteSuccess'))
    } catch (error) {
      console.error('删除模型失败:', error)
      toast.error(t('modelManager.deleteFailed', { error: error.message }))
    }
  }
};

// 编辑模型
const editModel = (key) => {
  const model = modelManager.getModel(key);
  if (model) {
    editingModel.value = {
      key,
      name: model.name,
      baseURL: model.baseURL,
      defaultModel: model.defaultModel,
      apiKey: model.apiKey, // 直接使用原始密钥
      useVercelProxy: model.useVercelProxy,
      provider: model.provider
    };
    isEditing.value = true;
  }
};

// 取消编辑
const cancelEdit = () => {
  isEditing.value = false;
  editingModel.value = null;
  resetModelsList();
};

// 保存编辑
const saveEdit = async () => {
  console.log('开始保存编辑...');
  
  try {
    const originalConfig = modelManager.getModel(editingModel.value.key)
    if (!originalConfig) {
      throw new Error('找不到原始配置')
    }

    const config = {
      name: editingModel.value.name,
      baseURL: editingModel.value.baseURL,
      models: [editingModel.value.defaultModel],
      defaultModel: editingModel.value.defaultModel,
      apiKey: editingModel.value.apiKey.trim() || originalConfig.apiKey,
      enabled: originalConfig.enabled,
      provider: originalConfig.provider,
      useVercelProxy: editingModel.value.useVercelProxy
    }

    modelManager.updateModel(editingModel.value.key, config)
    
    loadModels()
    
    emit('modelsUpdated', editingModel.value.key)
    
    isEditing.value = false
    editingModel.value = null
        
    toast.success(t('modelManager.updateSuccess'))
  } catch (error) {
    console.error('更新模型失败:', error)
    toast.error(t('modelManager.updateFailed', { error: error.message }))
  }
};

// 添加自定义模型
const addCustomModel = async () => {
  try {
    const config = {
      name: newModel.value.name,
      baseURL: newModel.value.baseURL,
      models: [newModel.value.defaultModel],
      defaultModel: newModel.value.defaultModel,
      apiKey: newModel.value.apiKey,
      enabled: true,
      provider: 'custom',
      useVercelProxy: newModel.value.useVercelProxy
    }

    modelManager.addModel(newModel.value.key, config)
    loadModels()
    showAddForm.value = false
    // 修改这里，传递新添加的模型的 key
    emit('modelsUpdated', newModel.value.key)
    newModel.value = {
      key: '',
      name: '',
      baseURL: '',
      defaultModel: '',
      apiKey: '',
      useVercelProxy: false
    }
    toast.success('模型添加成功')
  } catch (error) {
    console.error('添加模型失败:', error)
    toast.error(`添加模型失败: ${error.message}`)
  }
};

// 启用/禁用模型
const enableModel = async (key) => {
  try {
    const model = modelManager.getModel(key)
    if (!model) throw new Error(t('modelManager.modelNotFound'))

    modelManager.enableModel(key)
    loadModels()
    emit('modelsUpdated', key)
    toast.success(t('modelManager.enableSuccess'))
  } catch (error) {
    console.error('启用模型失败:', error)
    toast.error(t('modelManager.enableFailed', { error: error.message }))
  }
}

const disableModel = async (key) => {
  try {
    const model = modelManager.getModel(key)
    if (!model) throw new Error(t('modelManager.modelNotFound'))

    modelManager.disableModel(key)
    loadModels()
    emit('modelsUpdated', key)
    toast.success(t('modelManager.disableSuccess'))
  } catch (error) {
    console.error('禁用模型失败:', error)
    toast.error(t('modelManager.disableFailed', { error: error.message }))
  }
}

const availableModels = ref([]);
const newModelAvailableModels = ref(['default-model']);  // 默认至少有一个选项
const isLoadingModels = ref(false);

/**
 * 获取可用模型列表
 * @param {string} mode 模式：'edit'或'new'
 * @param {string} modelKey 当mode为edit时的模型key
 */
const fetchAvailableModels = async (mode, modelKey = null) => {
  // 确定来源对象和目标数组
  const source = mode === 'edit' ? editingModel.value : newModel.value;
  const targetRef = mode === 'edit' ? availableModels : newModelAvailableModels;
  
  // 验证基本参数
  if (!source.apiKey) {
    toast.error(t('modelManager.needApiKeyAndBaseUrl', '请先填写API地址和密钥'));
    return;
  }
  
  if (!source.baseURL) {
    toast.error(t('modelManager.needApiKeyAndBaseUrl', '请先填写API地址和密钥'));
    return;
  }
  
  // 准备配置
  const config = {
    baseURL: source.baseURL,
    apiKey: source.apiKey,
    provider: source.provider || 'custom',
    useVercelProxy: source.useVercelProxy
  };
  
  // 如果是新建模式，补充完整配置
  if (mode === 'new') {
    Object.assign(config, {
      defaultModel: 'unknown',
      models: ['unknown'],
      name: 'Temporary',
      enabled: true
    });
  }
  
  isLoadingModels.value = true;
  
  try {
    // 获取模型列表
    const models = await modelManager.fetchModelsListWithConfig(
      mode === 'edit' ? modelKey : config, 
      mode === 'edit' ? config : {}, 
      createLLMService
    );
    
    console.log('获取到模型列表:', models);
    
    // 处理结果
    if (models.length === 0) {
      toast.warning(t('modelManager.noModelsFound', '未找到可用模型'));
      targetRef.value = [source.defaultModel || 'default-model'];
    } else {
      targetRef.value = models;
      
      // 更新默认选中的模型
      if (mode === 'edit' && !models.includes(source.defaultModel)) {
        source.defaultModel = models[0];
      } else if (mode === 'new') {
        source.defaultModel = models[0];
      }
      
      toast.success(t('modelManager.fetchModelsSuccess', {count: models.length}, `成功获取 ${models.length} 个模型`));
    }
  } catch (error) {
    console.error('获取模型列表失败:', error);
    toast.error(t('modelManager.fetchModelsFailed', {error: error.message}, `获取模型列表失败: ${error.message}`));
    
    // 确保有默认选项
    targetRef.value = [source.defaultModel || 'default-model'];
  } finally {
    isLoadingModels.value = false;
  }
};

// 保留原有函数的引用，但调用新的通用函数
const fetchModels = (key) => fetchAvailableModels('edit', key);
const fetchNewModels = () => fetchAvailableModels('new');

// 重置状态
const resetModelsList = () => {
  availableModels.value = [];
  newModelAvailableModels.value = ['default-model'];
};

// 当编辑或创建表单打开/关闭时，重置状态
watch(() => isEditing.value, (newValue) => {
  if (newValue && editingModel.value) {
    // 编辑对话框打开时，确保至少有当前选中的模型
    availableModels.value = [editingModel.value.defaultModel];
  } else {
    resetModelsList();
  }
});

// 初始化
onMounted(() => {
  loadModels();
  checkVercelProxy();
});
</script>

<style scoped>
/* 添加过渡动画 */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

/* 统一Select组件样式 */
:deep(.el-select) {
  width: 100%;
}

/* 解决边框重叠问题 */
:deep(.el-select .el-input__wrapper) {
  border: none !important;
  box-shadow: none !important;
  background-color: transparent !important;
  padding: 0 11px !important;
}

/* 自定义Select边框样式 */
:deep(.el-themed-select.el-select) {
  background-color: var(--bg-input, rgba(0, 0, 0, 0.1));
  border: 1px solid var(--border-input, rgba(255, 255, 255, 0.1));
  border-radius: 0.5rem;
  transition: border-color 0.2s ease;
  overflow: hidden;
  min-height: 38px;
  padding: 0;
}

:deep(.el-themed-select.el-select:hover) {
  border-color: var(--border-input-focus, rgba(157, 78, 221, 0.5));
}

:deep(.el-themed-select.el-select:focus-within) {
  border-color: var(--primary-color, #8a2be2);
}

/* 密码输入框图标颜色 */
:deep(.el-input__suffix) {
  color: var(--text-secondary, #aaa);
}

:deep(.el-input__suffix:hover) {
  color: var(--text-highlight, #bf7af0);
}

/* 确保输入框文本颜色正确 */
:deep(.el-input__inner) {
  color: var(--text-normal, #fff);
  height: auto;
  line-height: inherit;
  background-color: transparent;
}

/* 重置全局样式，避免冲突 */
:global(.el-select-dropdown) {
  background-color: var(--bg-dropdown, #2a2a2a) !important;
  border: 1px solid var(--border-dropdown, rgba(255, 255, 255, 0.1)) !important;
  border-radius: 0.5rem !important;
}

:global(.el-select-dropdown__item) {
  color: var(--text-normal, #fff) !important;
}

:global(.el-select-dropdown__item:hover) {
  background-color: var(--bg-hover, rgba(255, 255, 255, 0.1)) !important;
}

:global(.el-select-dropdown__item.selected) {
  background-color: var(--bg-selected, rgba(138, 43, 226, 0.2)) !important;
  color: var(--text-highlight, #bf7af0) !important;
}

/* 确保下拉菜单的创建新选项样式正确 */
:global(.el-select-dropdown__item.is-created) {
  color: var(--text-highlight, #bf7af0) !important;
}

:global(.el-select-dropdown__item.is-created::before) {
  content: "新增: ";
  color: var(--text-secondary, #aaa);
  margin-right: 4px;
}
</style>