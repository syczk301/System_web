// AE分析API客户端
const API_BASE_URL = 'http://localhost:5000';

export interface AEAnalysisParameters {
  encoderDim: number;
  epochs: number;
  batchSize: number;
  learningRate: number;
  confidenceLevel?: number;
}

export interface AEAnalysisResults {
  train_losses: number[];
  re2_test: number[];
  spe_test: number[];
  re2_control_limit: number;
  spe_control_limit: number;
  re2_anomalies: {
    count: number;
    percentage: number;
    indices: number[];
  };
  spe_anomalies: {
    count: number;
    percentage: number;
    indices: number[];
  };
  data_info: {
    samples_train: number;
    samples_test: number;
    features: number;
    file_name: string;
  };
}

export interface TaskStatus {
  status: 'pending' | 'running' | 'completed' | 'error' | 'cancelled';
  created_at: string;
  completed_at?: string;
  messages: Array<{
    timestamp: string;
    message: string;
  }>;
  results?: AEAnalysisResults;
  error?: string;
  traceback?: string;
  parameters: AEAnalysisParameters;
}

export class AEAnalysisAPI {
  private baseUrl: string;

  constructor(baseUrl: string = API_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * 启动AE分析任务
   */
  async startAnalysis(fileData: any, parameters: AEAnalysisParameters): Promise<{ task_id: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/ae/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_data: fileData,
          parameters,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`启动AE分析失败: ${error.message}`);
      }
      throw new Error('启动AE分析失败: 未知错误');
    }
  }

  /**
   * 获取任务状态
   */
  async getTaskStatus(taskId: string): Promise<TaskStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/api/ae/status/${taskId}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`获取任务状态失败: ${error.message}`);
      }
      throw new Error('获取任务状态失败: 未知错误');
    }
  }

  /**
   * 获取分析结果
   */
  async getResults(taskId: string): Promise<{ task_id: string; results: AEAnalysisResults; completed_at: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/ae/results/${taskId}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`获取分析结果失败: ${error.message}`);
      }
      throw new Error('获取分析结果失败: 未知错误');
    }
  }

  /**
   * 取消分析任务
   */
  async cancelAnalysis(taskId: string): Promise<{ message: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/api/ae/cancel/${taskId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`取消分析失败: ${error.message}`);
      }
      throw new Error('取消分析失败: 未知错误');
    }
  }

  /**
   * 检查服务健康状态
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`);
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * 轮询任务状态直到完成
   */
  async pollTaskStatus(
    taskId: string,
    onProgress?: (status: TaskStatus) => void,
    interval: number = 1000
  ): Promise<TaskStatus> {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const status = await this.getTaskStatus(taskId);
          
          if (onProgress) {
            onProgress(status);
          }

          if (status.status === 'completed') {
            resolve(status);
          } else if (status.status === 'error') {
            reject(new Error(status.error || '分析过程中发生错误'));
          } else if (status.status === 'cancelled') {
            reject(new Error('分析任务已被取消'));
          } else {
            // 继续轮询
            setTimeout(poll, interval);
          }
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }
}

// 默认导出API实例
export const aeAnalysisAPI = new AEAnalysisAPI(); 