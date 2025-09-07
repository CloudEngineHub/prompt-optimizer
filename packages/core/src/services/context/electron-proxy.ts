/**
 * Electron环境下ContextRepo的渲染进程代理
 * 
 * 通过IPC与主进程的ContextRepo实例通信，
 * 遵循项目现有的三层架构模式：Renderer代理 → Preload桥接 → 主进程IPC处理
 */

import type { ContextRepo, ContextPackage, ContextBundle, ImportMode, ContextListItem, ImportResult } from './types';
import { safeSerializeForIPC } from '../../utils/ipc-serialization';

export class ElectronContextRepoProxy implements ContextRepo {
  private get api() {
    if (!window.electronAPI?.context) {
      throw new Error('Electron API for ContextRepo not available');
    }
    return window.electronAPI.context;
  }

  // === 基础查询 ===
  async list(): Promise<ContextListItem[]> {
    return this.api.list();
  }

  async getCurrentId(): Promise<string> {
    return this.api.getCurrentId();
  }

  async setCurrentId(id: string): Promise<void> {
    return this.api.setCurrentId(id);
  }

  async get(id: string): Promise<ContextPackage> {
    return this.api.get(id);
  }

  // === 内容管理 ===
  async create(meta?: { title?: string }): Promise<string> {
    return this.api.create(meta);
  }

  async duplicate(id: string): Promise<string> {
    return this.api.duplicate(id);
  }

  async rename(id: string, title: string): Promise<void> {
    return this.api.rename(id, title);
  }

  async save(ctx: ContextPackage): Promise<void> {
    return this.api.save(safeSerializeForIPC(ctx));
  }

  async update(id: string, patch: Partial<ContextPackage>): Promise<void> {
    return this.api.update(id, safeSerializeForIPC(patch));
  }

  async remove(id: string): Promise<void> {
    return this.api.remove(id);
  }

  // === 导入导出 ===
  async exportAll(): Promise<ContextBundle> {
    return this.api.exportAll();
  }

  async importAll(bundle: ContextBundle, mode: ImportMode): Promise<ImportResult> {
    return this.api.importAll(safeSerializeForIPC(bundle), mode);
  }

  // === IImportExportable 实现 ===
  async exportData(): Promise<ContextBundle> {
    return this.exportAll();
  }

  async importData(data: any): Promise<void> {
    if (!(await this.validateData(data))) {
      throw new Error('Invalid context bundle data');
    }
    await this.importAll(data as ContextBundle, 'replace');
  }

  async getDataType(): Promise<string> {
    return this.api.getDataType ? this.api.getDataType() : Promise.resolve('context-bundle');
  }

  async validateData(data: any): Promise<boolean> {
    return this.api.validateData 
      ? this.api.validateData(safeSerializeForIPC(data))
      : Promise.resolve(!!(data?.type && data?.type === 'context-bundle'));
  }
}