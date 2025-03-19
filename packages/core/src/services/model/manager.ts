import { ModelConfig, IModelManager } from './types';
import { ModelConfigError } from '../llm/errors';
import { defaultModels } from './defaults';

/**
 * 模型管理器实现
 */
export class ModelManager implements IModelManager {
  private models: Record<string, ModelConfig>;

  constructor() {
    this.models = {};
    this.init();
  }

  /**
   * 初始化模型管理器
   */
  private init(): void {
    try {
      // 1. 先从本地存储加载所有模型配置
      const storedData = localStorage.getItem('models');
      if (storedData) {
        this.models = JSON.parse(storedData);
      }

      // 2. 检查内置模型是否存在，不存在则添加到本地存储
      let hasChanges = false;
      Object.entries(defaultModels).forEach(([key, config]) => {
        if (!this.models[key]) {
          this.models[key] = {
            ...config
          };
          hasChanges = true;
        }
      });

      // 3. 如果有新增的内置模型，保存到本地存储
      if (hasChanges) {
        this.saveToStorage();
      }
    } catch (error) {
      console.error('初始化模型管理器失败:', error);
    }
  }

  /**
   * 获取所有模型配置
   */
  getAllModels(): Array<ModelConfig & { key: string }> {
    // 每次获取都从存储重新加载最新数据
    const storedData = localStorage.getItem('models');
    if (storedData) {
      try {
        this.models = JSON.parse(storedData);
      } catch (error) {
        console.error('解析模型配置失败:', error);
      }
    }

    const returnValue = Object.entries(this.models).map(([key, config]) => ({
      ...config,
      key
    }));
    return returnValue;

  }

  /**
   * 获取指定模型配置
   */
  getModel(key: string): ModelConfig | undefined {
    return this.models[key];
  }

  /**
   * 添加模型配置
   */
  addModel(key: string, config: ModelConfig): void {
    if (this.models[key]) {
      throw new ModelConfigError(`模型 ${key} 已存在`);
    }
    this.validateConfig(config);
    this.models[key] = { ...config };
    this.saveToStorage();
  }

  /**
   * 更新模型配置
   */
  updateModel(key: string, config: Partial<ModelConfig>): void {
    if (!this.models[key]) {
      throw new ModelConfigError(`模型 ${key} 不存在`);
    }

    // 合并配置时保留原有 enabled 状态
    const updatedConfig = {
      ...this.models[key],
      ...config,
      // 确保 enabled 属性存在
      enabled: config.enabled !== undefined ? config.enabled : this.models[key].enabled
    };

    // 如果更新了关键字段或尝试启用模型，需要验证配置
    if (
      config.name !== undefined ||
      config.baseURL !== undefined ||
      config.defaultModel !== undefined || 
      config.models !== undefined ||
      config.apiKey !== undefined ||
      config.enabled
    ) {
      this.validateConfig(updatedConfig);
    }

    this.models[key] = updatedConfig;
    this.saveToStorage();
  }

  /**
   * 使用临时配置获取模型列表
   * 
   * 该方法允许使用临时配置获取模型列表，而不会修改存储的配置。
   * 适用于在用户编辑模型配置时预览和获取可用模型，或测试新的API连接。
   * 
   * @param baseConfig 基础配置或模型key
   * @param tempConfig 临时配置，会覆盖基础配置中的同名属性
   * @param llmServiceFactory LLM服务工厂函数
   * @returns 可用模型列表
   */
  async fetchModelsListWithConfig(baseConfig: string | ModelConfig, tempConfig: Partial<ModelConfig> = {}, llmServiceFactory?: (manager: IModelManager) => any): Promise<string[]> {
    let baseModelConfig: ModelConfig;
    
    // 如果baseConfig是字符串，则视为模型key，获取对应的配置
    if (typeof baseConfig === 'string') {
      const model = this.getModel(baseConfig);
      if (!model) {
        throw new ModelConfigError(`模型 ${baseConfig} 不存在`);
      }
      baseModelConfig = model;
    } else {
      baseModelConfig = baseConfig;
    }
    
    // 合并配置
    const mergedConfig = {
      ...baseModelConfig,
      ...tempConfig
    };
    
    // 验证基本配置
    if (!mergedConfig.baseURL || !mergedConfig.apiKey) {
      throw new ModelConfigError('获取模型列表需要有效的API地址和密钥');
    }
    
    // 创建LLM服务
    let llmService;
    if (llmServiceFactory) {
      llmService = llmServiceFactory(this);
    } else {
      const { createLLMService } = require('../llm/service');
      llmService = createLLMService(this);
    }
    
    // 直接使用合并的配置获取模型列表
    return await llmService.fetchAvailableModels(mergedConfig);
  }

  /**
   * 删除模型配置
   */
  deleteModel(key: string): void {
    if (!this.models[key]) {
      throw new ModelConfigError(`模型 ${key} 不存在`);
    }
    delete this.models[key];
    this.saveToStorage();
  }

  /**
   * 启用模型
   */
  enableModel(key: string): void {
    if (!this.models[key]) {
      throw new ModelConfigError(`未知的模型: ${key}`);
    }

    // 使用完整验证
    this.validateEnableConfig(this.models[key]);

    this.models[key].enabled = true;
    this.saveToStorage();
  }

  /**
   * 禁用模型
   */
  disableModel(key: string): void {
    if (!this.models[key]) {
      throw new ModelConfigError(`未知的模型: ${key}`);
    }

    this.models[key].enabled = false;
    this.saveToStorage();
  }

  /**
   * 验证模型配置
   */
  private validateConfig(config: ModelConfig): void {
    const errors: string[] = [];

    if (!config.name) {
      errors.push('缺少模型名称(name)');
    }
    if (!config.baseURL) {
      errors.push('缺少基础URL(baseURL)');
    }
    if (!Array.isArray(config.models)) {
      errors.push('模型列表(models)必须是数组');
    } else if (config.models.length === 0) {
      errors.push('模型列表(models)不能为空');
    }
    if (!config.defaultModel) {
      errors.push('缺少默认模型(defaultModel)');
    } else if (!config.models?.includes(config.defaultModel)) {
      errors.push('默认模型必须在模型列表中');
    }

    if (errors.length > 0) {
      throw new ModelConfigError('无效的模型配置：' + errors.join('、'));
    }
  }

  private validateEnableConfig(config: ModelConfig): void {
    this.validateConfig(config);

    if (!config.apiKey) {
      throw new ModelConfigError('启用模型需要提供API密钥');
    }
  }

  /**
   * 保存配置到本地存储
   */
  private saveToStorage(): void {
    try {
      localStorage.setItem('models', JSON.stringify(this.models));
    } catch (error) {
      console.error('保存模型配置失败:', error);
    }
  }

  /**
   * 获取所有已启用的模型配置
   */
  getEnabledModels(): Array<ModelConfig & { key: string }> {
    return this.getAllModels().filter(model => model.enabled);
  }
}

// 导出单例实例
export const modelManager = new ModelManager(); 