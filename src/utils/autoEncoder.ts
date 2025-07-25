import * as tf from '@tensorflow/tfjs';
import { Matrix } from 'ml-matrix';

// 设置随机种子以确保结果可重现
// tf.util.seedrandom('42'); // 这个API不存在，删除这行

export interface AEResults {
  analyzer: AEAnalyzer;
  data: number[][];
  X_train: number[][];
  X_test: number[][];
  re2_test: number[];
  spe_test: number[];
  re2_control_limit: number;
  spe_control_limit: number;
  re2_anomalies: AnomalyResult;
  spe_anomalies: AnomalyResult;
  train_losses: number[];
}

export interface AnomalyResult {
  mask: boolean[];
  indices: number[];
  count: number;
  percentage: number;
}

export interface TrainingProgress {
  epoch: number;
  totalEpochs: number;
  loss: number;
  message: string;
}

export type ProgressCallback = (message: string) => void;

/**
 * 标准化器类 - 模拟sklearn的StandardScaler
 */
export class StandardScaler {
  private mean: number[] = [];
  private std: number[] = [];
  private fitted = false;

  fit(data: number[][]): void {
    const matrix = new Matrix(data);
    this.mean = [];
    this.std = [];

    for (let col = 0; col < matrix.columns; col++) {
      const column = matrix.getColumn(col);
      const mean = column.reduce((a, b) => a + b, 0) / column.length;
      const variance = column.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / column.length;
      const std = Math.sqrt(variance);

      this.mean.push(mean);
      this.std.push(std || 1); // 避免除零
    }
    this.fitted = true;
  }

  transform(data: number[][]): number[][] {
    if (!this.fitted) {
      throw new Error('Scaler must be fitted before transform');
    }

    return data.map(row =>
      row.map((val, idx) => (val - this.mean[idx]) / this.std[idx])
    );
  }

  fitTransform(data: number[][]): number[][] {
    this.fit(data);
    return this.transform(data);
  }
}

/**
 * 自动编码器模型类 - 基于TensorFlow.js
 */
export class AutoEncoder {
  private model: tf.LayersModel | null = null;
  private inputDim: number;
  private encodingDim: number;

  constructor(inputDim: number, encodingDim: number = 10) {
    this.inputDim = inputDim;
    this.encodingDim = encodingDim;
    this.buildModel();
  }

  private buildModel(): void {
    // 输入层
    const input = tf.input({ shape: [this.inputDim] });

    // 编码器部分
    const encoded1 = tf.layers.dense({
      units: 64,
      activation: 'relu',
      kernelInitializer: 'glorotUniform'
    }).apply(input);

    const encoded2 = tf.layers.dense({
      units: 32,
      activation: 'relu',
      kernelInitializer: 'glorotUniform'
    }).apply(encoded1);

    const encoded3 = tf.layers.dense({
      units: this.encodingDim,
      activation: 'relu',
      kernelInitializer: 'glorotUniform'
    }).apply(encoded2);

    // 解码器部分
    const decoded1 = tf.layers.dense({
      units: 32,
      activation: 'relu',
      kernelInitializer: 'glorotUniform'
    }).apply(encoded3);

    const decoded2 = tf.layers.dense({
      units: 64,
      activation: 'relu',
      kernelInitializer: 'glorotUniform'
    }).apply(decoded1);

    const decoded3 = tf.layers.dense({
      units: this.inputDim,
      activation: 'sigmoid',
      kernelInitializer: 'glorotUniform'
    }).apply(decoded2);

    // 创建模型
    this.model = tf.model({ inputs: input, outputs: decoded3 as tf.SymbolicTensor });

    // 编译模型
    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'meanSquaredError'
    });
  }

  async predict(data: tf.Tensor): Promise<tf.Tensor> {
    if (!this.model) {
      throw new Error('Model not built');
    }
    return this.model.predict(data) as tf.Tensor;
  }

  async fit(
    xTrain: tf.Tensor,
    epochs: number = 150,
    batchSize: number = 32,
    onEpochEnd?: (epoch: number, loss: number) => void
  ): Promise<number[]> {
    if (!this.model) {
      throw new Error('Model not built');
    }

    const losses: number[] = [];

    const history = await this.model.fit(xTrain, xTrain, {
      epochs,
      batchSize,
      shuffle: true,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          const loss = logs?.loss as number;
          losses.push(loss);
          if (onEpochEnd) {
            onEpochEnd(epoch, loss);
          }
        }
      }
    });

    return losses;
  }

  dispose(): void {
    if (this.model) {
      this.model.dispose();
    }
  }
}

/**
 * 自动编码器分析器类
 */
export class AEAnalyzer {
  private model: AutoEncoder | null = null;
  private scaler: StandardScaler = new StandardScaler();
  private isTrained = false;
  private trainLosses: number[] = [];

  /**
   * 加载和预处理数据
   */
  loadData(data: number[][]): number[][] {
    try {
      // 过滤掉包含NaN或无穷大的行
      const cleanData = data.filter(row => 
        row.every(val => !isNaN(val) && isFinite(val))
      );

      if (cleanData.length === 0) {
        throw new Error('数据为空或没有有效的数值');
      }

      console.log(`数据加载成功: ${cleanData.length} 行, ${cleanData[0].length} 列`);
      return cleanData;
    } catch (error) {
      console.error('数据加载失败:', error);
      throw error;
    }
  }

  /**
   * 数据预处理 - 分割训练集和测试集
   */
  preprocessData(data: number[][], testSize: number = 0.2): {
    XTrain: number[][];
    XTest: number[][];
  } {
    try {
      // 标准化数据
      const XScaled = this.scaler.fitTransform(data);

      // 简单的训练测试集分割
      const trainSize = Math.floor(XScaled.length * (1 - testSize));
      const shuffledIndices = Array.from({ length: XScaled.length }, (_, i) => i)
        .sort(() => Math.random() - 0.5);

      const trainIndices = shuffledIndices.slice(0, trainSize);
      const testIndices = shuffledIndices.slice(trainSize);

      const XTrain = trainIndices.map(i => XScaled[i]);
      const XTest = testIndices.map(i => XScaled[i]);

      console.log(`数据预处理完成 - 训练集: ${XTrain.length}, 测试集: ${XTest.length}`);
      return { XTrain, XTest };
    } catch (error) {
      console.error('数据预处理失败:', error);
      throw error;
    }
  }

  /**
   * 训练自动编码器模型
   */
  async trainModel(
    XTrain: number[][],
    XTest: number[][],
    epochs: number = 150,
    batchSize: number = 32,
    learningRate: number = 0.001,
    progressCallback?: ProgressCallback
  ): Promise<boolean> {
    try {
      const inputDim = XTrain[0].length;
      const encodingDim = Math.max(2, Math.floor(inputDim / 4));

      // 创建模型
      this.model = new AutoEncoder(inputDim, encodingDim);

      if (progressCallback) {
        progressCallback('🚀 开始训练自动编码器模型...');
        progressCallback(`📊 模型结构: ${inputDim} -> ${encodingDim} -> ${inputDim}`);
        progressCallback(`⚙️ 训练参数: epochs=${epochs}, batch_size=${batchSize}, lr=${learningRate}`);
        progressCallback('-'.repeat(50));
      }

      // 转换为TensorFlow.js张量
      const xTrainTensor = tf.tensor2d(XTrain);

      // 训练模型
      this.trainLosses = await this.model.fit(
        xTrainTensor,
        epochs,
        batchSize,
        (epoch, loss) => {
          if (progressCallback) {
            progressCallback(`训练轮次 ${epoch + 1}/${epochs}, 损失: ${loss.toFixed(6)}`);
          }
        }
      );

      this.isTrained = true;

      if (progressCallback) {
        progressCallback('-'.repeat(50));
        progressCallback('✅ 模型训练完成!');
        progressCallback(`📈 最终损失: ${this.trainLosses[this.trainLosses.length - 1].toFixed(6)}`);
      }

      // 清理张量
      xTrainTensor.dispose();

      return true;
    } catch (error) {
      if (progressCallback) {
        progressCallback(`❌ 训练失败: ${error}`);
      }
      console.error('训练失败:', error);
      return false;
    }
  }

  /**
   * 计算RE²和SPE统计量
   */
  async calculateStatistics(XData: number[][]): Promise<{
    re2: number[];
    spe: number[];
  }> {
    if (!this.isTrained || !this.model) {
      throw new Error('模型尚未训练');
    }

    const xDataTensor = tf.tensor2d(XData);
    
    try {
      // 获取重构数据
      const xReconstructed = await this.model.predict(xDataTensor);
      
      // 计算重构误差
      const reconstructionError = tf.sub(xDataTensor, xReconstructed);
      
      // 计算SPE (平方预测误差)
      const spe = tf.sum(tf.square(reconstructionError), 1);
      
      // 计算RE² (最大重构误差的平方)
      const re2 = tf.max(tf.square(reconstructionError), 1);
      
      // 转换为JavaScript数组
      const speArray = await spe.data();
      const re2Array = await re2.data();
      
      // 清理张量
      xDataTensor.dispose();
      xReconstructed.dispose();
      reconstructionError.dispose();
      spe.dispose();
      re2.dispose();
      
      return {
        re2: Array.from(re2Array),
        spe: Array.from(speArray)
      };
    } catch (error) {
      xDataTensor.dispose();
      throw error;
    }
  }

  /**
   * 计算控制限
   */
  calculateControlLimits(statistics: number[], confidenceLevel: number = 0.99): number {
    const sorted = [...statistics].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * confidenceLevel);
    return sorted[Math.min(index, sorted.length - 1)];
  }

  /**
   * 检测异常
   */
  detectAnomalies(statistics: number[], controlLimit: number): AnomalyResult {
    const anomalyMask = statistics.map(stat => stat > controlLimit);
    const anomalyIndices = anomalyMask
      .map((isAnomaly, index) => isAnomaly ? index : -1)
      .filter(index => index !== -1);
    
    const anomalyCount = anomalyIndices.length;
    const anomalyPercentage = (anomalyCount / statistics.length) * 100;

    return {
      mask: anomalyMask,
      indices: anomalyIndices,
      count: anomalyCount,
      percentage: anomalyPercentage
    };
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.model) {
      this.model.dispose();
    }
  }

  get isTrainedModel(): boolean {
    return this.isTrained;
  }

  get losses(): number[] {
    return [...this.trainLosses];
  }
}

/**
 * 运行故障检测分析的主函数
 */
export async function runFaultDetection(
  data: number[][],
  progressCallback?: ProgressCallback,
  epochs: number = 150
): Promise<AEResults | null> {
  try {
    // 初始化分析器
    const analyzer = new AEAnalyzer();

    if (progressCallback) {
      progressCallback('📁 正在处理数据...');
    }

    // 加载数据
    const cleanData = analyzer.loadData(data);

    if (progressCallback) {
      progressCallback(`✅ 数据处理成功: ${cleanData.length} 行, ${cleanData[0].length} 列`);
      progressCallback('🔄 正在进行数据预处理...');
    }

    // 预处理数据
    const { XTrain, XTest } = analyzer.preprocessData(cleanData);

    if (progressCallback) {
      progressCallback('✅ 数据预处理完成');
    }

    // 训练模型
    const success = await analyzer.trainModel(XTrain, XTest, epochs, 32, 0.001, progressCallback);
    if (!success) {
      return null;
    }

    if (progressCallback) {
      progressCallback('📊 正在计算统计量和控制限...');
    }

    // 计算测试集统计量
    const { re2: re2Test, spe: speTest } = await analyzer.calculateStatistics(XTest);

    // 计算控制限
    const re2ControlLimit = analyzer.calculateControlLimits(re2Test);
    const speControlLimit = analyzer.calculateControlLimits(speTest);

    // 检测异常
    const re2Anomalies = analyzer.detectAnomalies(re2Test, re2ControlLimit);
    const speAnomalies = analyzer.detectAnomalies(speTest, speControlLimit);

    if (progressCallback) {
      progressCallback('✅ 统计量计算完成');
      progressCallback(`🔍 RE² 异常检测: ${re2Anomalies.count} 个异常样本 (${re2Anomalies.percentage.toFixed(2)}%)`);
      progressCallback(`🔍 SPE 异常检测: ${speAnomalies.count} 个异常样本 (${speAnomalies.percentage.toFixed(2)}%)`);
      progressCallback('🎉 分析完成!');
    }

    // 返回结果
    const results: AEResults = {
      analyzer,
      data: cleanData,
      X_train: XTrain,
      X_test: XTest,
      re2_test: re2Test,
      spe_test: speTest,
      re2_control_limit: re2ControlLimit,
      spe_control_limit: speControlLimit,
      re2_anomalies: re2Anomalies,
      spe_anomalies: speAnomalies,
      train_losses: analyzer.losses
    };

    return results;
  } catch (error) {
    if (progressCallback) {
      progressCallback(`❌ 分析过程出错: ${error}`);
    }
    console.error('故障检测分析失败:', error);
    return null;
  }
}

/**
 * 运行RE²分析
 */
export async function runAeRe2Analysis(
  data: number[][],
  progressCallback?: ProgressCallback,
  epochs: number = 150
): Promise<AEResults | null> {
  return runFaultDetection(data, progressCallback, epochs);
}

/**
 * 运行SPE分析
 */
export async function runAeSpeAnalysis(
  data: number[][],
  progressCallback?: ProgressCallback,
  epochs: number = 150
): Promise<AEResults | null> {
  return runFaultDetection(data, progressCallback, epochs);
} 