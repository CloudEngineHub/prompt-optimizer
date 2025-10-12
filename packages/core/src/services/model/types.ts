import { IImportExportable } from '../../interfaces/import-export';
import type { UnifiedParameterDefinition } from './parameter-schema';

// === 新架构核心类型 ===

/**
 * 连接参数的类型安全定义
 */
export interface ConnectionSchema {
  required: string[];
  optional: string[];
  fieldTypes: Record<string, 'string' | 'number' | 'boolean'>;
}

/**
 * 文本模型服务提供商元数据
 */
export interface TextProvider {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly requiresApiKey: boolean;
  readonly defaultBaseURL: string;
  readonly supportsDynamicModels: boolean;
  readonly connectionSchema?: ConnectionSchema;
}

/**
 * 文本模型元数据
 */
export interface TextModel {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly providerId: string;
  readonly capabilities: {
    supportsTools: boolean;
    supportsReasoning?: boolean;
    maxContextLength?: number;
  };
  readonly parameterDefinitions: readonly ParameterDefinition[];
  readonly defaultParameterValues?: Record<string, unknown>;
}

/**
 * 模型参数定义
 */
export type ParameterDefinition = UnifiedParameterDefinition;

/**
 * 新架构的文本模型配置
 */
export interface TextModelConfig {
  id: string;
  name: string;
  enabled: boolean;
  providerMeta: TextProvider;
  modelMeta: TextModel;
  connectionConfig: {
    apiKey?: string;
    baseURL?: string;
    [key: string]: any;
  };
  paramOverrides?: Record<string, unknown>; // 统一的参数覆盖（包含内置和自定义参数）
  /**
   * @deprecated 已废弃，将在 v3.0 移除
   * 旧版本的自定义参数字段，现已合并到 paramOverrides
   * 仅用于向后兼容读取旧数据，新代码不应使用此字段
   */
  customParamOverrides?: Record<string, unknown>;
}

/**
 * 持久化时使用的TextModelConfig结构
 */
export interface StoredTextModelConfig {
  id: string;
  name: string;
  enabled: boolean;
  providerMeta: TextProvider;
  modelMeta: TextModel;
  connectionConfig: Record<string, any>;
  paramOverrides?: Record<string, unknown>; // 统一的参数覆盖（包含内置和自定义参数）
  /**
   * @deprecated 已废弃，将在 v3.0 移除
   * 旧版本的自定义参数字段，现已合并到 paramOverrides
   * 仅用于向后兼容读取旧数据，新代码不应使用此字段
   */
  customParamOverrides?: Record<string, unknown>;
}

// === 传统结构（兼容旧数据） ===

export interface ModelConfig {
  name: string;
  baseURL: string;
  apiKey?: string;
  models?: string[];
  defaultModel: string;
  enabled: boolean;
  provider: 'deepseek' | 'gemini' | 'custom' | 'zhipu' | string;
  llmParams?: Record<string, any>;
}

// === 模型管理器接口 ===

export interface IModelManager extends IImportExportable {
  ensureInitialized(): Promise<void>;
  isInitialized(): Promise<boolean>;

  getAllModels(): Promise<TextModelConfig[]>;
  getModel(key: string): Promise<TextModelConfig | undefined>;

  addModel(key: string, config: TextModelConfig): Promise<void>;
  updateModel(key: string, config: Partial<TextModelConfig>): Promise<void>;
  deleteModel(key: string): Promise<void>;

  enableModel(key: string): Promise<void>;
  disableModel(key: string): Promise<void>;

  getEnabledModels(): Promise<TextModelConfig[]>;
}
