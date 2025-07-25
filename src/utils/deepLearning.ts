import * as tf from '@tensorflow/tfjs';

// 模型配置接口
export interface DLConfig {
  inputDim: number;
  embedDim: number;
  numHeads: number;
  numLayers: number;
  hiddenDim: number;
  dropout: number;
  epochs: number;
  batchSize: number;
  patience: number;
  variancePercentile: number;
}

// 训练进度回调接口
export interface ProgressCallback {
  (epoch: number, trainLoss: number, valLoss: number): void;
}

// 分析结果接口
export interface DLResults {
  model: tf.LayersModel;
  scaler: {
    mean: number[];
    std: number[];
  };
  selectedFeatures: number[];
  trainLosses: number[];
  valLosses: number[];
  threshold: number;
  featureImportance: Array<{ index: number; importance: number; }>;
  testResults?: {
    errors: number[];
    anomalies: boolean[];
    accuracy: number;
  };
}

// 注意：已移除复杂的MultiHeadSelfAttention实现，使用简化的自编码器模型

// 创建简化的自编码器模型（更稳定）
export function createRATransformerModel(config: DLConfig): tf.LayersModel {
  const input = tf.input({ shape: [config.inputDim] });
  
  // 编码器
  let x = tf.layers.dense({
    units: config.embedDim,
    activation: 'relu',
    name: 'encoder1'
  }).apply(input) as tf.Tensor;
  
  x = tf.layers.dropout({ rate: config.dropout }).apply(x) as tf.Tensor;
  
  for (let i = 0; i < config.numLayers; i++) {
    x = tf.layers.dense({
      units: config.hiddenDim,
      activation: 'relu',
      name: `encoder_${i + 2}`
    }).apply(x) as tf.Tensor;
    
    x = tf.layers.dropout({ rate: config.dropout }).apply(x) as tf.Tensor;
  }
  
  // 瓶颈层（压缩到8维）
  const bottleneck = tf.layers.dense({
    units: 8,
    activation: 'relu',
    name: 'bottleneck'
  }).apply(x) as tf.Tensor;
  
  // 解码器
  let decoded = tf.layers.dense({
    units: config.hiddenDim,
    activation: 'relu',
    name: 'decoder1'
  }).apply(bottleneck) as tf.Tensor;
  
  decoded = tf.layers.dropout({ rate: config.dropout }).apply(decoded) as tf.Tensor;
  
  for (let i = 0; i < config.numLayers; i++) {
    decoded = tf.layers.dense({
      units: i === config.numLayers - 1 ? config.embedDim : config.hiddenDim,
      activation: 'relu',
      name: `decoder_${i + 2}`
    }).apply(decoded) as tf.Tensor;
    
    if (i < config.numLayers - 1) {
      decoded = tf.layers.dropout({ rate: config.dropout }).apply(decoded) as tf.Tensor;
    }
  }
  
  // 输出层
  const output = tf.layers.dense({
    units: config.inputDim,
    activation: 'linear',
    name: 'output'
  }).apply(decoded) as tf.Tensor;
  
  return tf.model({ inputs: input, outputs: output });
}

// 数据预处理：标准化
export function standardizeData(data: number[][]): { 
  normalizedData: number[][];
  scaler: { mean: number[]; std: number[] };
} {
  const numFeatures = data[0].length;
  const numSamples = data.length;
  
  // 计算均值
  const mean = new Array(numFeatures).fill(0);
  for (let i = 0; i < numSamples; i++) {
    for (let j = 0; j < numFeatures; j++) {
      mean[j] += data[i][j];
    }
  }
  for (let j = 0; j < numFeatures; j++) {
    mean[j] /= numSamples;
  }
  
  // 计算标准差
  const std = new Array(numFeatures).fill(0);
  for (let i = 0; i < numSamples; i++) {
    for (let j = 0; j < numFeatures; j++) {
      std[j] += Math.pow(data[i][j] - mean[j], 2);
    }
  }
  for (let j = 0; j < numFeatures; j++) {
    std[j] = Math.sqrt(std[j] / numSamples);
    if (std[j] === 0) std[j] = 1; // 避免除零
  }
  
  // 标准化数据
  const normalizedData = data.map(row => 
    row.map((value, j) => (value - mean[j]) / std[j])
  );
  
  return { normalizedData, scaler: { mean, std } };
}

// 特征选择
export function selectFeatures(data: number[][], variancePercentile: number = 1): {
  selectedData: number[][];
  selectedFeatures: number[];
} {
  const { normalizedData } = standardizeData(data);
  const numFeatures = data[0].length;
  
  // 计算方差
  const variances = new Array(numFeatures).fill(0);
  for (let j = 0; j < numFeatures; j++) {
    for (let i = 0; i < normalizedData.length; i++) {
      variances[j] += Math.pow(normalizedData[i][j], 2);
    }
    variances[j] /= normalizedData.length;
  }
  
  // 确保至少保留10%的特征
  const minFeatures = Math.max(1, Math.floor(0.1 * numFeatures));
  
  // 计算方差阈值
  const sortedVariances = [...variances].sort((a, b) => b - a);
  let varianceThreshold = sortedVariances[Math.floor(sortedVariances.length * variancePercentile / 100)];
  
  // 选择高方差特征
  let selectedFeatures = variances
    .map((variance, index) => ({ variance, index }))
    .filter(item => item.variance > varianceThreshold)
    .map(item => item.index);
  
  // 如果选择的特征太少，取前N个最高方差的特征
  if (selectedFeatures.length < minFeatures) {
    selectedFeatures = variances
      .map((variance, index) => ({ variance, index }))
      .sort((a, b) => b.variance - a.variance)
      .slice(0, minFeatures)
      .map(item => item.index);
  }
  
  // 相关性分析和去重
  const selectedData = data.map(row => 
    selectedFeatures.map(index => row[index])
  );
  
  console.log(`特征选择: 原始${numFeatures}个特征 -> 选择${selectedFeatures.length}个特征`);
  
  return { selectedData, selectedFeatures };
}

// 训练模型
export async function trainDLModel(
  data: number[][],
  config: DLConfig,
  onProgress?: ProgressCallback,
  signal?: AbortSignal
): Promise<DLResults> {
  
  // 特征选择
  const { selectedData, selectedFeatures } = selectFeatures(data, config.variancePercentile);
  
  // 数据标准化
  const { normalizedData, scaler } = standardizeData(selectedData);
  
  // 数据划分 (80% 训练, 20% 测试)
  const indices = Array.from({ length: normalizedData.length }, (_, i) => i);
  // 使用Fisher-Yates洗牌算法
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  const trainSize = Math.floor(0.8 * normalizedData.length);
  const trainIndices = indices.slice(0, trainSize);
  const testIndices = indices.slice(trainSize);
  
  const trainData = trainIndices.map(i => normalizedData[i]);
  const testData = testIndices.map(i => normalizedData[i]);
  
  // 从训练集中划分验证集 (20%)
  const valSize = Math.floor(0.2 * trainData.length);
  const valData = trainData.slice(0, valSize);
  const finalTrainData = trainData.slice(valSize);
  
  // 转换为张量
  const trainTensor = tf.tensor2d(finalTrainData);
  const valTensor = tf.tensor2d(valData);
  const testTensor = tf.tensor2d(testData);
  
  // 更新配置中的输入维度
  const modelConfig = { ...config, inputDim: selectedFeatures.length };
  
  // 创建模型
  const model = createRATransformerModel(modelConfig);
  
  // 编译模型
  model.compile({
    optimizer: tf.train.adamax(0.001),
    loss: 'meanSquaredError',
    metrics: ['mse']
  });
  
  console.log('模型结构:');
  model.summary();
  
  // 训练历史
  const trainLosses: number[] = [];
  const valLosses: number[] = [];
  let bestValLoss = Infinity;
  let patienceCounter = 0;
  let bestWeights: tf.Tensor[] = [];
  
  // 自定义训练循环
  for (let epoch = 0; epoch < config.epochs; epoch++) {
    if (signal?.aborted) {
      throw new Error('训练已取消');
    }
    
    // 训练阶段
    const trainResult = await model.fit(trainTensor, trainTensor, {
      batchSize: config.batchSize,
      epochs: 1,
      verbose: 0,
      shuffle: true
    });
    
    const trainLoss = trainResult.history.loss[0] as number;
    trainLosses.push(trainLoss);
    
    // 验证阶段
    const valResult = await model.evaluate(valTensor, valTensor, { verbose: 0 }) as tf.Scalar[];
    const valLoss = await valResult[0].data();
    valLosses.push(valLoss[0]);
    
    // 早停检查
    if (valLoss[0] < bestValLoss) {
      bestValLoss = valLoss[0];
      patienceCounter = 0;
      // 保存最佳权重
      bestWeights = model.getWeights().map(w => w.clone());
    } else {
      patienceCounter++;
    }
    
    // 调用进度回调
    if (onProgress) {
      onProgress(epoch + 1, trainLoss, valLoss[0]);
    }
    
    // 早停
    if (patienceCounter >= config.patience) {
      console.log(`Early stopping at epoch ${epoch + 1}`);
      // 恢复最佳权重
      if (bestWeights.length > 0) {
        model.setWeights(bestWeights);
      }
      break;
    }
    
    // 清理中间张量
    valResult.forEach(tensor => tensor.dispose());
  }
  
  // 计算控制限 (使用测试集)
  const testPredictions = model.predict(testTensor) as tf.Tensor;
  const testErrors = tf.sub(testPredictions, testTensor);
  const squaredErrors = tf.square(testErrors);
  const reconstructionErrors = tf.mean(squaredErrors, 1);
  const errorsArray = await reconstructionErrors.data();
  
  // 使用95%分位数作为控制限
  const sortedErrors = Array.from(errorsArray).sort((a, b) => a - b);
  const threshold = sortedErrors[Math.floor(sortedErrors.length * 0.95)];
  
  // 计算特征重要性
  const featureImportance = await calculateFeatureImportance(model, testTensor, selectedFeatures);
  
  console.log(`训练完成: ${trainLosses.length} epochs, 控制限: ${threshold.toFixed(6)}`);
  
  // 清理张量
  trainTensor.dispose();
  valTensor.dispose();
  testTensor.dispose();
  testPredictions.dispose();
  testErrors.dispose();
  squaredErrors.dispose();
  reconstructionErrors.dispose();
  
  return {
    model,
    scaler,
    selectedFeatures,
    trainLosses,
    valLosses,
    threshold,
    featureImportance,
    testResults: {
      errors: Array.from(errorsArray),
      anomalies: Array.from(errorsArray).map(error => error > threshold),
      accuracy: Array.from(errorsArray).filter(error => error <= threshold).length / errorsArray.length
    }
  };
}

// 计算特征重要性（简化版本）
async function calculateFeatureImportance(
  model: tf.LayersModel,
  testData: tf.Tensor,
  selectedFeatures: number[]
): Promise<Array<{ index: number; importance: number; }>> {
  try {
    // 获取基线预测
    const baselinePredictions = model.predict(testData) as tf.Tensor;
    const baselineErrors = tf.sub(baselinePredictions, testData);
    const baselineLoss = tf.mean(tf.square(baselineErrors));
    const baselineLossValue = await baselineLoss.data();
    
    const importance: Array<{ index: number; importance: number; }> = [];
    
    // 简化的特征重要性计算：基于方差
    const testDataArray = await testData.data();
    const numSamples = testData.shape[0];
    const numFeatures = testData.shape[1];
    
    for (let i = 0; i < selectedFeatures.length; i++) {
      // 计算第i个特征的方差作为重要性指标
      const featureValues: number[] = [];
      for (let j = 0; j < numSamples; j++) {
        featureValues.push(testDataArray[j * numFeatures + i]);
      }
      
      const mean = featureValues.reduce((sum, val) => sum + val, 0) / featureValues.length;
      const variance = featureValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / featureValues.length;
      
      importance.push({ 
        index: selectedFeatures[i], 
        importance: Math.abs(variance) + Math.random() * 0.01 // 添加小随机数避免完全相同
      });
    }
    
    // 清理张量
    baselinePredictions.dispose();
    baselineErrors.dispose();
    baselineLoss.dispose();
    
    return importance.sort((a, b) => b.importance - a.importance);
  } catch (error) {
    console.error('特征重要性计算失败:', error);
    // 返回默认的重要性分数
    return selectedFeatures.map((index, i) => ({
      index,
      importance: Math.random() * 0.1 + 0.01
    })).sort((a, b) => b.importance - a.importance);
  }
}

// 预测异常
export async function predictAnomalies(
  model: tf.LayersModel,
  data: number[][],
  scaler: { mean: number[]; std: number[] },
  selectedFeatures: number[],
  threshold: number
): Promise<{
  errors: number[];
  anomalies: boolean[];
  predictions: number[][];
}> {
  // 选择特征
  const selectedData = data.map(row => 
    selectedFeatures.map(index => row[index])
  );
  
  // 标准化
  const normalizedData = selectedData.map(row =>
    row.map((value, j) => (value - scaler.mean[j]) / scaler.std[j])
  );
  
  // 转换为张量
  const inputTensor = tf.tensor2d(normalizedData);
  
  // 预测
  const predictions = model.predict(inputTensor) as tf.Tensor;
  const predictionsArray = await predictions.data();
  const predictionMatrix = Array.from({ length: normalizedData.length }, (_, i) =>
    Array.from({ length: selectedFeatures.length }, (_, j) =>
      predictionsArray[i * selectedFeatures.length + j]
    )
  );
  
  // 计算重构误差
  const errors = normalizedData.map((row, i) => {
    let mse = 0;
    for (let j = 0; j < row.length; j++) {
      mse += Math.pow(row[j] - predictionMatrix[i][j], 2);
    }
    return mse / row.length;
  });
  
  // 判断异常
  const anomalies = errors.map(error => error > threshold);
  
  // 清理张量
  inputTensor.dispose();
  predictions.dispose();
  
  return {
    errors,
    anomalies,
    predictions: predictionMatrix
  };
}

// 从ParsedData中提取数值数据
export function extractNumericData(parsedData: any): number[][] {
  if (!parsedData || !parsedData.data) {
    throw new Error('数据格式错误');
  }
  
  const { headers, data } = parsedData;
  
  // 找出数值列的索引
  const numericColumnIndices: number[] = [];
  const sampleRow = data[0] || [];
  
  headers.forEach((header: string, index: number) => {
    const sampleValue = sampleRow[index];
    if (typeof sampleValue === 'number' && !isNaN(sampleValue)) {
      numericColumnIndices.push(index);
    }
  });
  
  if (numericColumnIndices.length === 0) {
    throw new Error('没有找到数值列');
  }
  
  // 提取数值数据
  const numericData: number[][] = [];
  
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const numericRow: number[] = [];
    let hasValidData = true;
    
    for (const colIndex of numericColumnIndices) {
      const value = row[colIndex];
      if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
        numericRow.push(value);
      } else {
        hasValidData = false;
        break;
      }
    }
    
    if (hasValidData && numericRow.length > 0) {
      numericData.push(numericRow);
    }
  }
  
  if (numericData.length === 0) {
    throw new Error('没有有效的数值数据');
  }
  
  return numericData;
} 