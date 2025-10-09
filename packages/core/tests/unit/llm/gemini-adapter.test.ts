import { describe, it, expect, beforeEach } from 'vitest';
import { GeminiAdapter } from '../../../src/services/llm/adapters/gemini-adapter';
import type { TextModelConfig, Message } from '../../../src/services/llm/types';

// 不使用 mock，测试实际的 SDK 行为

describe('GeminiAdapter', () => {
  let adapter: GeminiAdapter;

  const mockConfig: TextModelConfig = {
    id: 'gemini',
    name: 'Gemini',
    enabled: true,
    providerMeta: {
      id: 'gemini',
      name: 'Google Gemini',
      description: 'Google Generative AI models',
      requiresApiKey: true,
      defaultBaseURL: 'https://generativelanguage.googleapis.com',
      supportsDynamicModels: true, // 更新为 true
      connectionSchema: {
        required: ['apiKey'],
        optional: ['baseURL'],
        fieldTypes: {
          apiKey: 'string',
          baseURL: 'string'
        }
      }
    },
    modelMeta: {
      id: 'gemini-2.5-flash',
      name: 'Gemini 2.5 Flash',
      description: 'Latest Gemini model',
      providerId: 'gemini',
      capabilities: {
        supportsTools: true,
        supportsReasoning: false,
        maxContextLength: 1000000
      },
      parameterDefinitions: [],
      defaultParameterValues: {}
    },
    connectionConfig: {
      apiKey: 'test-api-key',
      baseURL: 'https://generativelanguage.googleapis.com'
    },
    paramOverrides: {}
  };

  const mockMessages: Message[] = [
    { role: 'user', content: 'Hello, Gemini!' }
  ];

  beforeEach(() => {
    adapter = new GeminiAdapter();
  });

  describe('getProvider', () => {
    it('should return Gemini provider metadata', () => {
      const provider = adapter.getProvider();

      expect(provider.id).toBe('gemini');
      expect(provider.name).toBe('Google Gemini');
      expect(provider.defaultBaseURL).toBe('https://generativelanguage.googleapis.com');
      expect(provider.supportsDynamicModels).toBe(true); // 更新期望值
      expect(provider.requiresApiKey).toBe(true);
    });
  });

  describe('getModels', () => {
    it('should return static Gemini models list', () => {
      const models = adapter.getModels();

      expect(Array.isArray(models)).toBe(true);
      expect(models.length).toBeGreaterThan(0);

      // 更新为新版本的模型 ID
      const gemini25Flash = models.find(m => m.id === 'gemini-2.5-flash');
      expect(gemini25Flash).toBeDefined();
      expect(gemini25Flash?.providerId).toBe('gemini');
    });
  });

  describe('buildDefaultModel', () => {
    it('should build valid TextModel for unknown model ID', () => {
      const model = adapter.buildDefaultModel('unknown-gemini-model');

      expect(model.id).toBe('unknown-gemini-model');
      expect(model.providerId).toBe('gemini');
      expect(model.capabilities).toBeDefined();
    });
  });

  describe('parameter definitions', () => {
    it('should include thinking parameters in definitions', () => {
      const models = adapter.getModels();
      const model = models[0];

      const paramNames = model.parameterDefinitions.map(p => p.name);

      // 验证基础参数存在
      expect(paramNames).toContain('temperature');
      expect(paramNames).toContain('topP');
      expect(paramNames).toContain('maxOutputTokens');

      // 验证思考参数存在
      expect(paramNames).toContain('thinkingBudget');
      expect(paramNames).toContain('includeThoughts');

      // 验证思考参数定义
      const thinkingBudget = model.parameterDefinitions.find(p => p.name === 'thinkingBudget');
      expect(thinkingBudget).toBeDefined();
      expect(thinkingBudget?.type).toBe('number');
      expect(thinkingBudget?.min).toBe(0);  // 允许0来禁用思考功能
      expect(thinkingBudget?.max).toBe(8192);
      expect(thinkingBudget?.description).toContain('Gemini 2.5+');

      const includeThoughts = model.parameterDefinitions.find(p => p.name === 'includeThoughts');
      expect(includeThoughts).toBeDefined();
      expect(includeThoughts?.type).toBe('boolean');
      expect(includeThoughts?.description).toContain('Gemini 2.5+');
    });

    it('should NOT enable thinking parameters by default', () => {
      const models = adapter.getModels();
      const model = models[0];

      const defaultValues = model.defaultParameterValues || {};

      // 验证基础参数有默认值
      expect(defaultValues).toHaveProperty('temperature');
      expect(defaultValues).toHaveProperty('topP');
      expect(defaultValues).toHaveProperty('maxOutputTokens');

      // 验证思考参数默认未启用
      expect(defaultValues).not.toHaveProperty('thinkingBudget');
      expect(defaultValues).not.toHaveProperty('includeThoughts');
    });
  });

  describe('error handling', () => {
    it('should throw error when API key is missing', async () => {
      const configWithoutKey = {
        ...mockConfig,
        connectionConfig: {
          ...mockConfig.connectionConfig,
          apiKey: ''
        }
      };

      // 注意：实际的错误会在运行时由 SDK 抛出
      await expect(
        adapter.sendMessage(mockMessages, configWithoutKey)
      ).rejects.toThrow();
    });
  });
});
