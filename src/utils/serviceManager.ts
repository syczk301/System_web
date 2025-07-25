// 服务管理器 - 自动启动和管理后端AE分析服务
import { message } from 'antd';
import { pythonStarter } from './pythonStarter';

export interface ServiceStatus {
  isRunning: boolean;
  isStarting: boolean;
  error?: string;
  port: number;
  url: string;
}

export class AEServiceManager {
  private status: ServiceStatus = {
    isRunning: false,
    isStarting: false,
    port: 5000,
    url: 'http://localhost:5000'
  };

  private checkInterval: NodeJS.Timeout | null = null;
  private startupProcess: any = null;

  constructor() {
    // 延迟初始化，避免构造函数中的异步操作
    setTimeout(() => {
      this.initialize();
    }, 100);
  }

  /**
   * 初始化服务管理器
   */
  private async initialize(): Promise<void> {
    try {
      const hasRealService = await this.checkServiceStatus();
      if (!hasRealService) {
        // 立即启动模拟服务
        await this.startService();
      }
    } catch (error) {
      console.warn('初始化服务管理器失败:', error);
      // 启动模拟服务作为后备
      this.startMockService();
      this.status.isRunning = true;
      this.status.isStarting = false;
    }
  }

  /**
   * 获取当前服务状态
   */
  getStatus(): ServiceStatus {
    return { ...this.status };
  }

  /**
   * 检查服务状态
   */
  async checkServiceStatus(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2秒超时
      
      const response = await fetch(`${this.status.url}/api/health`, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-cache',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        this.status.isRunning = true;
        this.status.error = undefined;
        return true;
      }
    } catch (error) {
      // 服务未运行或连接失败
    }

    this.status.isRunning = false;
    return false;
  }

  /**
   * 启动后端服务
   */
  async startService(): Promise<boolean> {
    if (this.status.isRunning) {
      return true;
    }

    if (this.status.isStarting) {
      return false; // 已在启动中
    }

    this.status.isStarting = true;
    this.status.error = undefined;

    try {
      // 检查是否支持本地服务启动
      if (!this.isLocalEnvironment()) {
        throw new Error('当前环境不支持自动启动本地服务');
      }

      // 尝试使用不同的方法启动服务
      const success = await this.tryStartService();
      
      if (success) {
        // 模拟服务立即可用，不需要等待
        this.status.isRunning = true;
        this.status.isStarting = false;
        return true;
      } else {
        throw new Error('服务启动失败');
      }

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      this.status.error = errorMsg;
      this.status.isStarting = false;
      throw error;
    }
  }

  /**
   * 停止服务状态检查
   */
  stopStatusCheck(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * 开始定期检查服务状态
   */
  startStatusCheck(interval: number = 5000): void {
    this.stopStatusCheck();
    this.checkInterval = setInterval(() => {
      this.checkServiceStatus();
    }, interval);
  }

  /**
   * 检查是否为本地环境
   */
  private isLocalEnvironment(): boolean {
    const hostname = window.location.hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
  }

  /**
   * 尝试启动服务
   */
  private async tryStartService(): Promise<boolean> {
    // 方法1: 尝试启动真实的Python后端服务
    if (await this.tryStartRealPythonService()) {
      return true;
    }

    // 方法2: 尝试使用Service Worker启动
    if (await this.tryServiceWorkerStart()) {
      return true;
    }

    // 方法3: 尝试使用WebAssembly
    if (await this.tryWebAssemblyStart()) {
      return true;
    }

    // 方法4: 使用模拟服务
    return this.startMockService();
  }

  /**
   * 尝试启动真实的Python后端服务
   */
  private async tryStartRealPythonService(): Promise<boolean> {
    try {
      console.log('🐍 尝试启动真实的Python后端服务...');
      
      // 检查Python环境
      const hasPython = await pythonStarter.checkPythonEnvironment();
      if (!hasPython) {
        console.log('❌ Python环境不可用');
        return false;
      }
      
      console.log('✅ Python环境检查通过');
      
      // 启动Python服务
      const success = await pythonStarter.startPythonService();
      if (success) {
        console.log('🎉 Python后端服务启动成功！');
        
        // 等待服务完全启动
        await this.waitForRealService();
        
        return true;
      } else {
        console.log('❌ Python服务启动失败');
        return false;
      }
    } catch (error) {
      console.warn('启动真实Python服务失败:', error);
      return false;
    }
  }

  /**
   * 等待真实服务启动
   */
  private async waitForRealService(maxAttempts: number = 20): Promise<void> {
    console.log('⏳ 等待Python服务启动...');
    
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.checkServiceStatus()) {
        console.log('✅ Python服务启动完成');
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log(`⏳ 等待中... (${i + 1}/${maxAttempts})`);
    }
    
    throw new Error('Python服务启动超时');
  }

  /**
   * 尝试通过Service Worker启动
   */
  private async tryServiceWorkerStart(): Promise<boolean> {
    try {
      // 暂时禁用Service Worker以避免加载问题
      return false;
      
      /*
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.register('/ae-service-worker.js');
        console.log('AE Service Worker 注册成功:', registration);
        
        // 等待Service Worker激活
        await new Promise((resolve) => {
          if (registration.active) {
            resolve(registration.active);
          } else {
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'activated') {
                    resolve(newWorker);
                  }
                });
              }
            });
          }
        });
        
        this.status.isRunning = true;
        this.status.isStarting = false;
        this.status.message = 'Service Worker 模式运行中';
        return true;
      }
      */
    } catch (error) {
      console.warn('Service Worker 启动失败:', error);
    }
    
    return false;
  }

  /**
   * 尝试使用WebAssembly启动
   */
  private async tryWebAssemblyStart(): Promise<boolean> {
    try {
      // 检查WebAssembly支持
      if (typeof WebAssembly !== 'undefined') {
        // 这里可以加载预编译的Python/PyTorch WASM模块
        // 目前WebAssembly对于复杂的深度学习库支持有限
        console.log('WebAssembly环境可用，但深度学习库支持有限');
      }
    } catch (error) {
      console.warn('WebAssembly启动失败:', error);
    }
    return false;
  }

  /**
   * 启动模拟服务
   */
  private startMockService(): boolean {
    try {
      // 创建一个模拟的后端服务
      this.createMockServiceEndpoints();
      console.log('✅ 模拟服务启动成功');
      return true;
    } catch (error) {
      console.error('模拟服务启动失败:', error);
      return false;
    }
  }

  /**
   * 创建模拟服务端点
   */
  private createMockServiceEndpoints(): void {
    // 拦截fetch请求，模拟后端API
    const originalFetch = window.fetch;
    
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input.toString();
      
      // 拦截AE分析API请求
      if (url.includes('/api/ae/')) {
        return this.handleMockAERequest(url, init);
      }
      
      if (url.includes('/api/health')) {
        return new Response(JSON.stringify({
          status: 'healthy',
          service: 'AE Analysis Service (Mock)',
          timestamp: new Date().toISOString()
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // 其他请求使用原始fetch
      return originalFetch(input, init);
    };
  }

  /**
   * 处理模拟的AE分析请求
   */
  private async handleMockAERequest(url: string, init?: RequestInit): Promise<Response> {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 100));

    if (url.includes('/api/ae/start')) {
      return this.handleMockStartRequest(init);
    } else if (url.includes('/api/ae/status/')) {
      const taskId = url.split('/').pop();
      return this.handleMockStatusRequest(taskId!);
    } else if (url.includes('/api/ae/results/')) {
      const taskId = url.split('/').pop();
      return this.handleMockResultsRequest(taskId!);
    } else if (url.includes('/api/ae/cancel/')) {
      const taskId = url.split('/').pop();
      return this.handleMockCancelRequest(taskId!);
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 处理模拟的启动请求
   */
  private async handleMockStartRequest(init?: RequestInit): Promise<Response> {
    const taskId = `mock_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 存储任务信息
    const task = {
      id: taskId,
      status: 'pending',
      created_at: new Date().toISOString(),
      messages: [],
      startTime: Date.now()
    };

    this.storeMockTask(taskId, task);

    return new Response(JSON.stringify({
      task_id: taskId,
      status: 'pending',
      message: 'AE分析任务已启动 (模拟模式)'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 处理模拟的状态请求
   */
  private async handleMockStatusRequest(taskId: string): Promise<Response> {
    const task = this.getMockTask(taskId);
    
    if (!task) {
      return new Response(JSON.stringify({ error: '任务不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 模拟训练进度
    const elapsed = Date.now() - task.startTime;
    const progressData = this.simulateTrainingProgress(elapsed);
    
    // 更新任务状态
    task.status = progressData.status;
    task.messages = progressData.messages;
    
    if (progressData.status === 'completed') {
      task.results = this.generateMockResults();
      task.completed_at = new Date().toISOString();
    }

    this.storeMockTask(taskId, task);

    return new Response(JSON.stringify(task), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 处理模拟的结果请求
   */
  private async handleMockResultsRequest(taskId: string): Promise<Response> {
    const task = this.getMockTask(taskId);
    
    if (!task) {
      return new Response(JSON.stringify({ error: '任务不存在' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (task.status !== 'completed') {
      return new Response(JSON.stringify({ error: '任务尚未完成' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      task_id: taskId,
      results: task.results,
      completed_at: task.completed_at
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 处理模拟的取消请求
   */
  private async handleMockCancelRequest(taskId: string): Promise<Response> {
    const task = this.getMockTask(taskId);
    
    if (task) {
      task.status = 'cancelled';
      this.storeMockTask(taskId, task);
    }

    return new Response(JSON.stringify({ message: '任务已取消' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * 存储模拟任务
   */
  private storeMockTask(taskId: string, task: any): void {
    const tasks = this.getMockTasks();
    tasks[taskId] = task;
    sessionStorage.setItem('ae_mock_tasks', JSON.stringify(tasks));
  }

  /**
   * 获取模拟任务
   */
  private getMockTask(taskId: string): any {
    const tasks = this.getMockTasks();
    return tasks[taskId];
  }

  /**
   * 获取所有模拟任务
   */
  private getMockTasks(): any {
    const tasksStr = sessionStorage.getItem('ae_mock_tasks');
    return tasksStr ? JSON.parse(tasksStr) : {};
  }

  /**
   * 模拟训练进度
   */
  private simulateTrainingProgress(elapsed: number) {
    const duration = 30000; // 30秒完成训练
    const progress = Math.min(elapsed / duration, 1);
    const epochs = 100;
    const currentEpoch = Math.floor(progress * epochs);

    const messages = [];
    
    if (progress < 0.1) {
      messages.push({
        timestamp: new Date().toISOString(),
        message: '🚀 开始训练自动编码器模型...'
      });
      messages.push({
        timestamp: new Date().toISOString(),
        message: '📊 模型结构: 10 -> 5 -> 10'
      });
    } else if (progress < 0.9) {
      for (let i = Math.max(1, currentEpoch - 5); i <= currentEpoch; i++) {
        const loss = Math.exp(-i * 0.02) * 0.5 + Math.random() * 0.1;
        messages.push({
          timestamp: new Date().toISOString(),
          message: `训练轮次 ${i}/${epochs}, 损失: ${loss.toFixed(6)}`
        });
      }
    } else if (progress < 1) {
      messages.push({
        timestamp: new Date().toISOString(),
        message: '📊 正在计算统计量和控制限...'
      });
    } else {
      messages.push({
        timestamp: new Date().toISOString(),
        message: '✅ AE分析完成!'
      });
    }

    return {
      status: progress >= 1 ? 'completed' : progress > 0.1 ? 'running' : 'pending',
      messages
    };
  }

  /**
   * 生成模拟结果
   */
  private generateMockResults() {
    const sampleSize = 200;
    const features = 8;
    const trainSize = Math.floor(sampleSize * 0.8);
    const testSize = sampleSize - trainSize;

    // 生成训练损失曲线
    const train_losses = Array.from({ length: 100 }, (_, i) => {
      return Math.exp(-i * 0.02) * 0.5 + Math.random() * 0.1;
    });

    // 生成RE²和SPE测试数据
    const re2_test = Array.from({ length: testSize }, () => Math.random() * 3);
    const spe_test = Array.from({ length: testSize }, () => Math.random() * 2.5);

    // 计算控制限（99分位数）
    const re2_control_limit = this.percentile(re2_test, 0.99);
    const spe_control_limit = this.percentile(spe_test, 0.99);

    // 找出异常点
    const re2_anomalies = {
      indices: re2_test.map((val, idx) => val > re2_control_limit ? idx : -1).filter(idx => idx >= 0),
      count: 0,
      percentage: 0
    };
    re2_anomalies.count = re2_anomalies.indices.length;
    re2_anomalies.percentage = (re2_anomalies.count / testSize) * 100;

    const spe_anomalies = {
      indices: spe_test.map((val, idx) => val > spe_control_limit ? idx : -1).filter(idx => idx >= 0),
      count: 0,
      percentage: 0
    };
    spe_anomalies.count = spe_anomalies.indices.length;
    spe_anomalies.percentage = (spe_anomalies.count / testSize) * 100;

    return {
      train_losses,
      re2_test,
      spe_test,
      re2_control_limit,
      spe_control_limit,
      re2_anomalies,
      spe_anomalies,
      data_info: {
        samples_train: trainSize,
        samples_test: testSize,
        features,
        file_name: '模拟数据'
      }
    };
  }

  /**
   * 计算百分位数
   */
  private percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }

  /**
   * 等待服务启动
   */
  private async waitForService(maxAttempts: number = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      if (await this.checkServiceStatus()) {
        this.status.isStarting = false;
        return;
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    this.status.isStarting = false;
    throw new Error('服务启动超时');
  }
}

// 全局服务管理器实例
export const aeServiceManager = new AEServiceManager(); 