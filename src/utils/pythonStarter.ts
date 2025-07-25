// Python后端启动器
import { message } from 'antd';

export interface PythonServiceConfig {
  pythonPath: string;
  scriptPath: string;
  workingDir: string;
  port: number;
  autoStart: boolean;
}

export class PythonServiceStarter {
  private config: PythonServiceConfig;
  private isStarting: boolean = false;
  private process: any = null;

  constructor(config?: Partial<PythonServiceConfig>) {
    this.config = {
      pythonPath: 'python',
      scriptPath: 'api/ae_service.py',
      workingDir: '.',
      port: 5000,
      autoStart: true,
      ...config
    };
  }

  /**
   * 检测Python环境
   */
  async checkPythonEnvironment(): Promise<boolean> {
    try {
      // 检查是否在支持的环境中（Electron、Tauri等）
      if (this.isElectronEnvironment()) {
        return await this.checkPythonInElectron();
      }
      
      if (this.isTauriEnvironment()) {
        return await this.checkPythonInTauri();
      }

      // 浏览器环境中尝试通过扩展或其他方式
      return await this.checkPythonInBrowser();
      
    } catch (error) {
      console.error('检测Python环境失败:', error);
      return false;
    }
  }

  /**
   * 启动Python后端服务
   */
  async startPythonService(): Promise<boolean> {
    if (this.isStarting) {
      return false;
    }

    this.isStarting = true;

    try {
      // 检查Python环境
      const hasPython = await this.checkPythonEnvironment();
      if (!hasPython) {
        throw new Error('Python环境不可用');
      }

      // 根据环境选择启动方式
      if (this.isElectronEnvironment()) {
        return await this.startInElectron();
      }
      
      if (this.isTauriEnvironment()) {
        return await this.startInTauri();
      }

      // 尝试其他启动方式
      return await this.startInBrowser();

    } catch (error) {
      console.error('启动Python服务失败:', error);
      message.error(`启动失败: ${error instanceof Error ? error.message : '未知错误'}`);
      return false;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * 停止Python服务
   */
  async stopPythonService(): Promise<boolean> {
    try {
      if (this.process) {
        if (this.isElectronEnvironment()) {
          return await this.stopInElectron();
        }
        
        if (this.isTauriEnvironment()) {
          return await this.stopInTauri();
        }
      }
      
      return true;
    } catch (error) {
      console.error('停止Python服务失败:', error);
      return false;
    }
  }

  /**
   * 检查是否为Electron环境
   */
  private isElectronEnvironment(): boolean {
    return typeof window !== 'undefined' && 
           window.process && 
           window.process.type === 'renderer';
  }

  /**
   * 检查是否为Tauri环境
   */
  private isTauriEnvironment(): boolean {
    return typeof window !== 'undefined' && 
           window.__TAURI__ !== undefined;
  }

  /**
   * 在Electron中检查Python
   */
  private async checkPythonInElectron(): Promise<boolean> {
    try {
      const { ipcRenderer } = window.require('electron');
      return await ipcRenderer.invoke('check-python');
    } catch (error) {
      return false;
    }
  }

  /**
   * 在Tauri中检查Python
   */
  private async checkPythonInTauri(): Promise<boolean> {
    try {
      const { invoke } = window.__TAURI__.tauri;
      return await invoke('check_python');
    } catch (error) {
      return false;
    }
  }

  /**
   * 在浏览器中检查Python（通过本地服务或扩展）
   */
  private async checkPythonInBrowser(): Promise<boolean> {
    try {
      // 方式1: 检查是否有本地开发工具服务
      const response = await fetch('http://localhost:8899/check-python', {
        method: 'GET',
        mode: 'cors',
      });
      return response.ok;
    } catch (error) {
      // 方式2: 检查浏览器扩展
      if (this.hasLocalServiceExtension()) {
        return true;
      }
      
      // 方式3: 使用WebAssembly Python
      return this.hasWasmPython();
    }
  }

  /**
   * 在Electron中启动Python服务
   */
  private async startInElectron(): Promise<boolean> {
    try {
      const { ipcRenderer } = window.require('electron');
      const result = await ipcRenderer.invoke('start-python-service', {
        script: this.config.scriptPath,
        workingDir: this.config.workingDir,
        port: this.config.port
      });
      
      if (result.success) {
        this.process = result.process;
        message.success('Python后端服务启动成功！');
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Electron环境启动失败: ${error}`);
    }
  }

  /**
   * 在Tauri中启动Python服务
   */
  private async startInTauri(): Promise<boolean> {
    try {
      const { invoke } = window.__TAURI__.tauri;
      const result = await invoke('start_python_service', {
        script: this.config.scriptPath,
        working_dir: this.config.workingDir,
        port: this.config.port
      });
      
      if (result.success) {
        this.process = result.process_id;
        message.success('Python后端服务启动成功！');
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      throw new Error(`Tauri环境启动失败: ${error}`);
    }
  }

  /**
   * 在浏览器中启动Python服务
   */
  private async startInBrowser(): Promise<boolean> {
    try {
      // 方式1: 通过本地开发工具服务启动
      const response = await fetch('http://localhost:8899/start-python', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          script: this.config.scriptPath,
          workingDir: this.config.workingDir,
          port: this.config.port
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          this.process = result.process_id;
          message.success('Python后端服务启动成功！');
          return true;
        } else {
          throw new Error(result.error);
        }
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      // 方式2: 尝试浏览器扩展
      if (await this.startWithExtension()) {
        return true;
      }

      // 方式3: 使用WebAssembly（功能有限）
      if (await this.startWithWasm()) {
        return true;
      }

      throw new Error('浏览器环境无法启动Python服务，请考虑使用Electron版本');
    }
  }

  /**
   * 停止Electron中的服务
   */
  private async stopInElectron(): Promise<boolean> {
    try {
      const { ipcRenderer } = window.require('electron');
      await ipcRenderer.invoke('stop-python-service', this.process);
      this.process = null;
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 停止Tauri中的服务
   */
  private async stopInTauri(): Promise<boolean> {
    try {
      const { invoke } = window.__TAURI__.tauri;
      await invoke('stop_python_service', { process_id: this.process });
      this.process = null;
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查是否有本地服务扩展
   */
  private hasLocalServiceExtension(): boolean {
    return typeof window !== 'undefined' && 
           window.localServiceExtension !== undefined;
  }

  /**
   * 检查是否有WebAssembly Python
   */
  private hasWasmPython(): boolean {
    return typeof window !== 'undefined' && 
           window.pyodide !== undefined;
  }

  /**
   * 通过扩展启动
   */
  private async startWithExtension(): Promise<boolean> {
    try {
      if (this.hasLocalServiceExtension()) {
        const result = await window.localServiceExtension.startPython({
          script: this.config.scriptPath,
          workingDir: this.config.workingDir,
          port: this.config.port
        });
        
        if (result.success) {
          this.process = result.process_id;
          message.success('通过浏览器扩展启动Python服务成功！');
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * 通过WebAssembly启动（有限功能）
   */
  private async startWithWasm(): Promise<boolean> {
    try {
      if (this.hasWasmPython()) {
        // 注意：WebAssembly Python功能有限，无法完全替代真实Python
        console.warn('使用WebAssembly Python，功能可能受限');
        
        // 加载并执行Python脚本
        const pythonCode = await this.loadPythonScript();
        await window.pyodide.runPython(pythonCode);
        
        message.info('使用WebAssembly Python模式（功能受限）');
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * 加载Python脚本内容
   */
  private async loadPythonScript(): Promise<string> {
    // 这里需要将Python脚本转换为WebAssembly兼容的版本
    // 由于WebAssembly限制，需要简化的实现
    return `
# WebAssembly版本的简化AE服务
import json
from js import fetch, Response

class SimpleAEService:
    def __init__(self):
        self.tasks = {}
    
    def start_analysis(self, data):
        task_id = f"wasm_{len(self.tasks)}"
        self.tasks[task_id] = {
            "status": "running",
            "progress": 0
        }
        return {"task_id": task_id}
    
    def get_status(self, task_id):
        return self.tasks.get(task_id, {"status": "not_found"})

ae_service = SimpleAEService()
print("WebAssembly AE Service initialized")
`;
  }

  /**
   * 获取启动状态
   */
  getStartupStatus(): {
    isStarting: boolean;
    hasProcess: boolean;
    environment: string;
  } {
    let environment = 'browser';
    if (this.isElectronEnvironment()) environment = 'electron';
    if (this.isTauriEnvironment()) environment = 'tauri';

    return {
      isStarting: this.isStarting,
      hasProcess: this.process !== null,
      environment
    };
  }
}

// 声明全局类型
declare global {
  interface Window {
    require: any;
    process: any;
    __TAURI__: any;
    localServiceExtension: any;
    pyodide: any;
  }
}

// 导出默认实例
export const pythonStarter = new PythonServiceStarter(); 