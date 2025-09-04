import type { OptimizationMode } from '@prompt-optimizer/core'

// 基础尺寸类型
export type ComponentSize = 'small' | 'medium' | 'large'
export type LayoutMode = 'compact' | 'normal' | 'minimal'
export type ButtonSize = 'small' | 'medium' | 'large'

// TestInputSection 组件类型
export interface TestInputSectionProps {
  modelValue: string
  label: string
  placeholder?: string
  helpText?: string
  disabled?: boolean
  size?: ComponentSize
  mode?: 'compact' | 'normal'
  enableFullscreen?: boolean
  minRows?: number
  maxRows?: number
}

export interface TestInputSectionEmits {
  'update:modelValue': [value: string]
}

// TestControlBar 组件类型
export interface TestControlBarProps {
  // 模型选择相关
  modelLabel: string
  
  // 对比模式控制
  showCompareToggle?: boolean
  isCompareMode?: boolean
  
  // 主要操作按钮
  primaryActionText: string
  primaryActionDisabled?: boolean
  primaryActionLoading?: boolean
  
  // 布局配置
  layout?: 'default' | 'compact' | 'minimal'
  buttonSize?: ButtonSize
  
  // 响应式配置
  modelSelectSpan?: number
  controlButtonsSpan?: number
}

export interface TestControlBarEmits {
  'compare-toggle': []
  'primary-action': []
}

// ConversationSection 组件类型
export interface ConversationSectionProps {
  // 显示控制
  visible?: boolean
  collapsed?: boolean
  collapsible?: boolean
  
  // 内容配置
  title?: string
  maxHeight?: string
  
  // 尺寸配置
  size?: ComponentSize
}

export interface ConversationSectionEmits {
  'update:collapsed': [value: boolean]
  'toggle': [collapsed: boolean]
}

// TestResultSection 组件类型
export interface TestResultSectionProps {
  // 布局模式
  isCompareMode?: boolean
  verticalLayout?: boolean
  showOriginal?: boolean
  
  // 标题配置
  originalTitle?: string
  optimizedTitle?: string
  singleResultTitle?: string
  
  // 尺寸配置
  cardSize?: ComponentSize
  
  // 间距配置
  gap?: string | number
}

// TestAreaPanel 主容器组件类型
export interface TestAreaPanelProps {
  // 核心状态
  optimizationMode: OptimizationMode
  isTestRunning?: boolean
  advancedModeEnabled?: boolean
  
  // 测试内容
  testContent?: string
  isCompareMode?: boolean
  
  // 功能开关
  enableCompareMode?: boolean
  enableFullscreen?: boolean
  
  // 布局配置
  inputMode?: 'compact' | 'normal'
  controlBarLayout?: 'default' | 'compact' | 'minimal'
  buttonSize?: ButtonSize
  conversationMaxHeight?: string
  
  // 结果显示配置
  showOriginalResult?: boolean
  resultVerticalLayout?: boolean
  originalResultTitle?: string
  optimizedResultTitle?: string
  singleResultTitle?: string
}

export interface TestAreaPanelEmits {
  'update:testContent': [value: string]
  'update:isCompareMode': [value: boolean]
  'test': []
  'compare-toggle': []
}

// 配置对象类型
export interface TestAreaConfig {
  // 全局布局配置
  layout: {
    inputMode: 'compact' | 'normal'
    controlBarLayout: 'default' | 'compact' | 'minimal'
    buttonSize: ButtonSize
    enableFullscreen: boolean
  }
  
  // 功能开关
  features: {
    compareMode: boolean
    conversationManager: boolean
    advancedMode: boolean
  }
  
  // 高度配置
  heights: {
    testInputMin: number
    testInputMax: number
    conversationMax: string
  }
  
  // 响应式断点配置
  responsive: {
    modelSelectSpan: {
      xs: number
      sm: number
      md: number
      lg: number
    }
    controlButtonsSpan: {
      xs: number
      sm: number
      md: number
      lg: number
    }
  }
}

// 控制布局配置类型
export interface TestControlLayout {
  modelSelect: {
    span: number
    responsive: Record<string, number>
  }
  controls: {
    span: number
    responsive: Record<string, number>
    justification: 'start' | 'center' | 'end' | 'space-between'
  }
  buttons: {
    size: ButtonSize
    spacing: number
    primary: {
      type: 'primary' | 'default' | 'tertiary'
      ghost: boolean
    }
    secondary: {
      type: 'primary' | 'default' | 'tertiary'
      ghost: boolean
    }
  }
}

// 测试结果配置类型
export interface TestResultConfig {
  compareMode: {
    enabled: boolean
    layout: 'horizontal' | 'vertical'
    showOriginal: boolean
  }
  singleMode: {
    title: string
    showToolbar: boolean
  }
  display: {
    cardSize: ComponentSize
    gap: string | number
    enableDiff: boolean
    enableFullscreen: boolean
  }
}

// 组件实例类型
export interface TestAreaPanelInstance {
  // 公开方法
  toggleCompareMode: () => void
  startTest: () => void
  resetResults: () => void
  
  // 状态访问
  readonly isTestRunning: boolean
  readonly showTestInput: boolean
  readonly canStartTest: boolean
}

// 插槽类型定义
export interface TestAreaSlots {
  'model-select': () => any
  'secondary-controls': () => any
  'custom-actions': () => any
  'conversation-manager': () => any
  'original-result': () => any
  'optimized-result': () => any
  'single-result': () => any
}

// 事件回调类型
export type TestAreaEventCallbacks = {
  onTest?: () => void | Promise<void>
  onCompareToggle?: (isCompareMode: boolean) => void
  onTestContentChange?: (content: string) => void
  onModelChange?: (modelKey: string) => void
}

// 工厂函数类型
export type CreateTestAreaConfig = (options?: Partial<TestAreaConfig>) => TestAreaConfig

// 预设配置类型
export interface TestAreaPresets {
  basic: TestAreaConfig
  advanced: TestAreaConfig
  compact: TestAreaConfig
  minimal: TestAreaConfig
}