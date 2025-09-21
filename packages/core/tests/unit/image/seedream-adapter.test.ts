import { describe, test, expect, vi, beforeEach } from 'vitest'
import { SeedreamImageAdapter } from '../../../src/services/image/adapters/seedream'
import type { ImageRequest, ImageModelConfig } from '../../../src/services/image/types'

const RUN_REAL_API = process.env.RUN_REAL_API === '1'

describe('SeedreamImageAdapter', () => {
  let adapter: SeedreamImageAdapter

  beforeEach(() => {
    adapter = new SeedreamImageAdapter()
  })

  describe('Provider Information', () => {
    test('should return correct provider information', () => {
      const provider = adapter.getProvider()

      expect(provider.id).toBe('seedream')
      expect(provider.name).toContain('Seedream')
      expect(provider.requiresApiKey).toBe(true)
      expect(provider.defaultBaseURL).toBe('https://ark.cn-beijing.volces.com/api/v3')
      expect(provider.supportsDynamicModels).toBe(false)
      expect(provider.connectionSchema?.required).toContain('apiKey')
      expect(provider.connectionSchema?.optional).toEqual(expect.arrayContaining(['baseURL']))
    })
  })

  describe('Static Models', () => {
    test('should return static Seedream models', () => {
      const models = adapter.getModels()

      expect(Array.isArray(models)).toBe(true)
      expect(models.length).toBeGreaterThan(0)

      const seedreamModel = models.find(m => m.id.includes('seedream') || m.id.includes('doubao'))
      expect(seedreamModel).toBeDefined()
      expect(seedreamModel).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        providerId: 'seedream',
        capabilities: {
          text2image: true,
          image2image: expect.any(Boolean),
          multiImage: expect.any(Boolean)
        },
        parameterDefinitions: expect.any(Array)
      })
    })

    test('should include watermark and size parameters', () => {
      const models = adapter.getModels()
      const model = models[0]

      expect(model.parameterDefinitions).toBeDefined()
      const watermarkParam = model.parameterDefinitions?.find(p => p.name === 'watermark')
      const sizeParam = model.parameterDefinitions?.find(p => p.name === 'size')

      expect(watermarkParam).toBeDefined()
      expect(watermarkParam?.type).toBe('boolean')

      expect(sizeParam).toBeDefined()
      expect(sizeParam?.allowedValues).toContain('1024x1024')
    })
  })

  // Dynamic models not supported

  // Connection validation not implemented for Seedream adapter

  describe('Image Generation', () => {
    test('should generate image with Seedream/Doubao model', async () => {
      const config: ImageModelConfig = {
        id: 'test-seedream-config',
        name: 'Test Seedream Config',
        providerId: 'seedream',
        modelId: 'doubao-seedream-4-0-250828',
        enabled: true,
        connectionConfig: {
          apiKey: 'test-api-key',
          baseURL: 'https://ark.cn-beijing.volces.com/api/v3'
        },
        paramOverrides: {
          size: '1024x1024',
          watermark: false
        }
      }

      const request: ImageRequest = {
        prompt: '美丽的山水画，中国传统艺术风格',
        configId: config.id,
        count: 1,
        paramOverrides: {
          outputMimeType: 'image/png'
        }
      }

      const mockResponse = {
        code: 0,
        data: [
          {
            url: 'https://example.com/seedream-generated-image.png'
          }
        ],
        task_id: 'task-123456',
        created_at: Date.now()
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await adapter.generate(request, config)

      expect(result).toBeDefined()
      expect(result.images).toHaveLength(1)
      expect(result.images[0]).toMatchObject({
        url: expect.any(String)
      })
      expect(result.metadata).toBeDefined()
      expect(result.metadata?.configId).toBe(config.id)
      expect(result.metadata?.modelId).toBe(config.modelId)
    })

    test('should handle generation failure', async () => {
      const config: ImageModelConfig = {
        id: 'test-config',
        name: 'Test Config',
        providerId: 'seedream',
        modelId: 'doubao-seedream-4-0-250828',
        enabled: true,
        connectionConfig: {
          apiKey: 'test-api-key'
        },
        paramOverrides: {}
      }

      const request: ImageRequest = {
        prompt: 'test prompt',
        configId: config.id,
        count: 1
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          code: 400,
          message: 'Invalid request parameters'
        })
      })

      await expect(adapter.generate(request, config)).rejects.toThrow()
    })

    test('should validate required parameters', async () => {
      const config: ImageModelConfig = {
        id: 'test-config',
        name: 'Test Config',
        providerId: 'seedream',
        modelId: 'doubao-seedream-4-0-250828',
        enabled: true,
        connectionConfig: {
          // Missing apiKey
        },
        paramOverrides: {}
      }

      const request: ImageRequest = {
        prompt: 'test prompt',
        configId: config.id,
        count: 1
      }

      await expect(adapter.generate(request, config))
        .rejects.toThrow(/requires API key/i)
    })

    test('should handle Chinese prompts correctly', async () => {
      const config: ImageModelConfig = {
        id: 'chinese-test-config',
        name: 'Chinese Test Config',
        providerId: 'seedream',
        modelId: 'doubao-seedream-4-0-250828',
        enabled: true,
        connectionConfig: {
          apiKey: 'test-api-key'
        },
        paramOverrides: {}
      }

      const request: ImageRequest = {
        prompt: '古代中国山水画，水墨画风格，朦胧意境',
        configId: config.id,
        count: 1
      }

      const mockResponse = {
        code: 0,
        data: [
          { url: 'https://example.com/chinese-landscape.png' }
        ]
      }

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      })

      const result = await adapter.generate(request, config)

      expect(result).toBeDefined()
      expect(result.images).toHaveLength(1)
      // 验证请求体中包含正确的中文提示词
      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('古代中国山水画')
        })
      )
    })
  })

  describe('Provider Capabilities', () => {
    test('should not support dynamic models', () => {
      const provider = adapter.getProvider()
      expect(provider.supportsDynamicModels).toBe(false)
    })

    test('should require API key', () => {
      const provider = adapter.getProvider()
      expect(provider.requiresApiKey).toBe(true)
    })

    test('should support optional baseURL configuration', () => {
      const provider = adapter.getProvider()
      expect(provider.connectionSchema?.optional).toContain('baseURL')
      expect(provider.defaultBaseURL).toBe('https://ark.cn-beijing.volces.com/api/v3')
    })
  })

  describe('Parameter Validation', () => {
    test('should validate size parameter values', () => {
      const models = adapter.getModels()
      const model = models[0]
      const sizeParam = model.parameterDefinitions?.find(p => p.name === 'size')

      expect(sizeParam?.allowedValues).toContain('1024x1024')
      expect(sizeParam?.allowedValues).toContain('512x512')
    })

    test('should validate watermark parameter', () => {
      const models = adapter.getModels()
      const model = models[0]
      const watermarkParam = model.parameterDefinitions?.find(p => p.name === 'watermark')

      expect(watermarkParam?.type).toBe('boolean')
      expect(watermarkParam?.defaultValue).toBe(false)
    })
  })

  describe.skipIf(!RUN_REAL_API)('Real API Integration (when API key available)', () => {
    test('should perform real API call when API key is provided', async () => {
      const apiKey = process.env.VITE_SEEDREAM_API_KEY || process.env.VITE_ARK_API_KEY
      if (!apiKey) {
        console.log('跳过 Seedream 真实 API 测试：未设置 VITE_SEEDREAM_API_KEY 或 VITE_ARK_API_KEY')
        return
      }

      const config: ImageModelConfig = {
        id: 'real-seedream-test',
        name: 'Real Seedream Test',
        providerId: 'seedream',
        modelId: 'doubao-seedream-4-0-250828',
        enabled: true,
        connectionConfig: {
          apiKey: apiKey,
          baseURL: process.env.VITE_SEEDREAM_BASE_URL || process.env.VITE_ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3'
        },
        paramOverrides: {
          size: '1024x1024',
          watermark: false
        }
      }

      const request: ImageRequest = {
        prompt: '中国传统山水画，水墨画风格，远山如黛，云雾缭绕',
        configId: config.id,
        count: 1
      }

      const startTime = Date.now()
      const result = await adapter.generate(request, config)
      const endTime = Date.now()
      const duration = ((endTime - startTime) / 1000).toFixed(1)

      console.log(`Seedream 真实API生成耗时: ${duration}秒`)

      expect(result).toBeDefined()
      expect(result.images).toHaveLength(1)
      expect(result.images[0].url).toBeTruthy()
      expect(result.metadata?.created).toBeGreaterThan(0)

      // 验证图像 URL 可访问性
      if (result.images[0].url) {
        const response = await fetch(result.images[0].url, { method: 'HEAD' })
        expect(response.ok).toBe(true)
        console.log('生成的图像 URL 可访问，状态码:', response.status)
      }
    }, 45000) // 45秒超时
  })
})
