# 文档开发与预览（Conda 版）

本工程在仓库根目录下的 `mkdocs/` 子目录中，完全独立于应用项目。

## 前置条件

- 已安装 Conda（Miniconda 或 Anaconda，建议最新版）

## 创建并激活 Conda 环境（结合项目名）

在 `mkdocs/` 目录内执行：

```bash
conda create -n prompt-optimizer-docs python=3.11 pip -y
conda activate prompt-optimizer-docs
```

> 如需退出环境：`conda deactivate`

## 安装依赖

```bash
python -m pip install -r requirements.txt
```

## 本地预览

提供多种配置文件满足不同需求：

### 快速开发模式（推荐日常使用）

```bash
mkdocs serve -f mkdocs-dev.yml
```

- **启动时间**：约 0.25 秒（极速启动）
- **特点**：移除了耗时插件（如 mermaid2），保留基本 i18n 支持，专注文档编写
- **适用场景**：日常开发、快速预览、文档编写

### 中文专版（推荐生产使用）

```bash
mkdocs serve -f mkdocs-zh.yml
```

- **启动时间**：约 0.4 秒（快速启动）
- **特点**：专注中文内容，直接访问 zh 目录，无多语言复杂性
- **适用场景**：中文文档站点、生产部署

### 完整功能模式（多语言支持）

```bash
mkdocs serve -f mkdocs.yml
```

- **启动时间**：首次较慢（需下载 mermaid 库），后续启动会快很多
- **特点**：包含所有功能（图表渲染、多语言支持等）
- **适用场景**：多语言站点、功能完整预览

### 配置文件说明

- **`mkdocs-dev.yml`** - 极速开发模式，移除所有耗时功能
- **`mkdocs-zh.yml`** - 中文专版，直接指向zh目录，无i18n复杂性
- **`mkdocs.yml`** - 完整功能版，支持多语言和所有插件

默认访问 `http://127.0.0.1:8000/`。默认语言为中文，可在右上角切换英文（若存在对应页面）。
如需连同"版本切换器"一并预览，请使用：

```bash
mike serve -F mkdocs.yml
```

## 严格构建校验

```bash
mkdocs build --strict -f mkdocs.yml
```

`--strict` 会将链接/引用等问题作为错误处理，便于在提交前尽早发现问题。

## 版本与标签（mike）

本项目使用 `mike` 管理多版本（Material 原生支持）。常用命令在 `mkdocs/` 目录内执行：

```bash
# 首次发布一个版本，并同时更新/创建别名 latest
mike deploy -F mkdocs.yml 0.1 latest

# 将默认版本设置为 latest（访问根路径时优先该版本）
mike set-default -F mkdocs.yml latest

# 查看已发布版本列表
mike list -F mkdocs.yml

# 本地预览多版本站点（基于已发布到分支的内容）
mike serve -F mkdocs.yml
```

建议为文档产物使用独立分支（例如 `vercel-docs`），以便后续让 Vercel 直接托管该分支：

```bash
mike deploy --branch vercel-docs --push -F mkdocs.yml 0.1 latest
mike set-default --branch vercel-docs --push -F mkdocs.yml latest
```

> 说明：i18n 与 mike 组合时，URL 通常为 `/<version>/<lang>/...`，如 `/latest/zh/`。

## 常见问题

- 中文搜索命中率不佳：已启用 `search.lang: [zh, en]`；如仍不理想，可按需启用 `lunr-languages` 并在 `mkdocs.yml` 的 `extra_javascript` 中加载。
- 版本列表不显示：确保先用 `mike deploy` 发布至少一个版本，并用 `mike set-default` 设置默认版本。
- `mike` 命令不可用：请确认已在当前 Conda 环境安装依赖；或尝试 `python -m mike` 形式运行。

## 清理环境（可选）

完全删除环境：

```bash
conda deactivate
conda remove -n prompt-optimizer-docs --all -y
```
