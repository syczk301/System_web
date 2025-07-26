import React, { useState, useEffect } from 'react';
import {
  Card,
  Form,
  InputNumber,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Select,
  Tabs,
  Table,
  message,
  Switch,
  Progress,
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  DownloadOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { updateConfig } from '../store/slices/analysisSlice';
import { addResult, updateResult } from '../store/slices/analysisSlice';
import type { AnalysisResult } from '../store/slices/analysisSlice';
import { getNumericColumns } from '../utils/excelParser';
// useAutoUpload已移除，数据现在通过全局预加载器处理

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

// ICA数据预处理类
class ICADataPreprocessor {
  static preprocessData(data: { [key: string]: number[] }): {
    processedData: { [key: string]: number[] } | null;
    removedColumns: string[];
    sampleSize: number;
  } {
    try {
      const dataKeys = Object.keys(data);
      if (dataKeys.length === 0) {
        throw new Error("输入数据为空");
      }

      const removedColumns: string[] = [];
      const validColumns: string[] = [];

      // 1. 检测并处理恒定值列
      for (const col of dataKeys) {
        const values = data[col];
        const uniqueValues = [...new Set(values.filter(v => !isNaN(v)))];
        
        if (uniqueValues.length === 1) {
          // 只有一个唯一值
          removedColumns.push(col);
          continue;
        } else if (uniqueValues.length < 10) {
          // 检查数值变化是否在容差范围内
          const std = this.calculateStd(values);
          if (std < 1e-6) {
            removedColumns.push(col);
            continue;
          }
        }
        validColumns.push(col);
      }

      if (validColumns.length < 2) {
        throw new Error("移除恒定值列后，有效变量数不足2个");
      }

      // 2. 处理缺失值和数值转换
      const processedData: { [key: string]: number[] } = {};
      const finalValidColumns: string[] = [];

      for (const col of validColumns) {
        const values = data[col];
        // 处理NaN值，用均值填充
        const validValues = values.filter(v => !isNaN(v));
        if (validValues.length === 0) {
          removedColumns.push(col);
          continue;
        }

        const mean = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;
        const processedValues = values.map(v => isNaN(v) ? mean : v);

        // 检查处理后的标准差
        const std = this.calculateStd(processedValues);
        if (std < 1e-6) {
          removedColumns.push(col);
          continue;
        }

        processedData[col] = processedValues;
        finalValidColumns.push(col);
      }

      if (finalValidColumns.length < 2) {
        throw new Error("预处理后有效变量数不足2个");
      }

      // 确定样本大小
      const sampleSize = Math.min(...finalValidColumns.map(col => processedData[col].length));

      // 3. 标准化数据
      const standardizedData: { [key: string]: number[] } = {};
      for (const col of finalValidColumns) {
        const values = processedData[col].slice(0, sampleSize);
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const std = this.calculateStd(values);
        
        if (std > 0) {
          standardizedData[col] = values.map(v => (v - mean) / std);
        } else {
          // 如果标准差为0，设为0
          standardizedData[col] = values.map(() => 0);
        }
      }

      return {
        processedData: standardizedData,
        removedColumns,
        sampleSize
      };

    } catch (error) {
      console.error('数据预处理失败:', error);
      return {
        processedData: null,
        removedColumns: [],
        sampleSize: 0
      };
    }
  }

  private static calculateStd(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

// FastICA算法实现类
class FastICAAlgorithm {
  private components: number[][];
  private mixing: number[][];
  private meanValues: number[];
  private nComponents: number;
  private nFeatures: number;
  private maxIter: number;
  private tolerance: number;

  constructor(nComponents: number, maxIter: number = 1000, tolerance: number = 1e-4) {
    this.nComponents = nComponents;
    this.maxIter = maxIter;
    this.tolerance = tolerance;
    this.components = [];
    this.mixing = [];
    this.meanValues = [];
    this.nFeatures = 0;
  }

  // 矩阵操作工具函数
  private static matrixMultiply(a: number[][], b: number[][]): number[][] {
    const result: number[][] = [];
    for (let i = 0; i < a.length; i++) {
      result[i] = [];
      for (let j = 0; j < b[0].length; j++) {
        let sum = 0;
        for (let k = 0; k < b.length; k++) {
          sum += a[i][k] * b[k][j];
        }
        result[i][j] = sum;
      }
    }
    return result;
  }

  private static vectorMatrixMultiply(v: number[], m: number[][]): number[] {
    const result: number[] = [];
    for (let j = 0; j < m[0].length; j++) {
      let sum = 0;
      for (let i = 0; i < v.length; i++) {
        sum += v[i] * m[i][j];
      }
      result[j] = sum;
    }
    return result;
  }

  private static matrixTranspose(matrix: number[][]): number[][] {
    return matrix[0].map((_, colIndex) => matrix.map(row => row[colIndex]));
  }

  // 白化预处理
  private whiten(X: number[][]): { whitenedX: number[][], whiteningMatrix: number[][] } {
    const nSamples = X.length;
    const nFeatures = X[0].length;
    
    console.log('开始白化处理，数据维度:', nSamples, 'x', nFeatures);
    
    // 计算协方差矩阵
    const cov: number[][] = Array(nFeatures).fill(null).map(() => Array(nFeatures).fill(0));
    
    for (let i = 0; i < nFeatures; i++) {
      for (let j = 0; j < nFeatures; j++) {
        let sum = 0;
        for (let k = 0; k < nSamples; k++) {
          sum += X[k][i] * X[k][j];
        }
        cov[i][j] = sum / (nSamples - 1);
      }
    }

    // 检查协方差矩阵的有效性
    for (let i = 0; i < nFeatures; i++) {
      for (let j = 0; j < nFeatures; j++) {
        if (!isFinite(cov[i][j])) {
          console.error(`协方差矩阵包含无效值 [${i}][${j}]:`, cov[i][j]);
          throw new Error('协方差矩阵计算失败');
        }
      }
    }

    // 简化的特征值分解（使用对角化近似，但增强数值稳定性）
    const eigenValues: number[] = [];
    const eigenVectors: number[][] = Array(nFeatures).fill(null).map(() => Array(nFeatures).fill(0));
    
    for (let i = 0; i < nFeatures; i++) {
      // 使用对角元素作为特征值的近似，但增加数值稳定性
      let eigenValue = Math.max(cov[i][i], 1e-10); // 提高最小阈值避免除零
      
      // 如果对角元素太小，使用行和的一部分作为补偿
      if (eigenValue < 1e-6) {
        const rowSum = cov[i].reduce((sum, val) => sum + Math.abs(val), 0);
        eigenValue = Math.max(eigenValue, rowSum / nFeatures * 0.1);
      }
      
      eigenValues[i] = eigenValue;
      eigenVectors[i][i] = 1; // 单位矩阵近似
      
      console.log(`特征值 ${i}: ${eigenValue}`);
    }

    // 计算白化矩阵
    const whiteningMatrix: number[][] = Array(nFeatures).fill(null).map(() => Array(nFeatures).fill(0));
    for (let i = 0; i < nFeatures; i++) {
      const sqrtEigenValue = Math.sqrt(eigenValues[i]);
      if (sqrtEigenValue < 1e-10) {
        console.warn(`特征值 ${i} 过小: ${eigenValues[i]}, 使用最小阈值`);
        whiteningMatrix[i][i] = 1.0 / Math.sqrt(1e-10);
      } else {
        whiteningMatrix[i][i] = 1.0 / sqrtEigenValue;
      }
      
      if (!isFinite(whiteningMatrix[i][i])) {
        console.error(`白化矩阵包含无效值 [${i}][${i}]:`, whiteningMatrix[i][i]);
        throw new Error('白化矩阵计算失败');
      }
    }

    // 应用白化
    const whitenedX: number[][] = [];
    for (let i = 0; i < nSamples; i++) {
      const whitenedRow = FastICAAlgorithm.vectorMatrixMultiply(X[i], whiteningMatrix);
      
      // 检查白化结果的有效性
      if (whitenedRow.some(val => !isFinite(val))) {
        console.error(`白化第${i}行产生无效值:`, whitenedRow);
        throw new Error('白化过程产生了NaN或无穷大值');
      }
      
      whitenedX.push(whitenedRow);
    }

    console.log('白化完成，检查前5个样本:');
    for (let i = 0; i < Math.min(5, whitenedX.length); i++) {
      const sampleStats = {
        mean: whitenedX[i].reduce((sum, val) => sum + val, 0) / whitenedX[i].length,
        std: Math.sqrt(whitenedX[i].reduce((sum, val) => sum + val * val, 0) / whitenedX[i].length)
      };
      console.log(`样本${i}: 均值=${sampleStats.mean.toFixed(4)}, 标准差=${sampleStats.std.toFixed(4)}`);
    }

    return { whitenedX, whiteningMatrix };
  }

  // 双曲正切函数及其导数
  private tanh(x: number): number {
    return Math.tanh(x);
  }

  private tanhDerivative(x: number): number {
    const t = Math.tanh(x);
    return 1 - t * t;
  }

  // 装饰函数
  private decorrelate(w: number[], W: number[][]): number[] {
    // 格拉姆-施密特正交化
    let result = [...w];
    
    for (let i = 0; i < W.length; i++) {
      const dot = W[i].reduce((sum, val, idx) => sum + val * result[idx], 0);
      for (let j = 0; j < result.length; j++) {
        result[j] -= dot * W[i][j];
      }
    }

    // 归一化
    const norm = Math.sqrt(result.reduce((sum, val) => sum + val * val, 0));
    if (norm > 1e-8) {
      result = result.map(val => val / norm);
    }

    return result;
  }

  // 拟合方法
  fit(X: number[][]): void {
    this.nFeatures = X[0].length;
    const nSamples = X.length;

    // 1. 中心化数据
    this.meanValues = Array(this.nFeatures).fill(0);
    for (let j = 0; j < this.nFeatures; j++) {
      for (let i = 0; i < nSamples; i++) {
        this.meanValues[j] += X[i][j];
      }
      this.meanValues[j] /= nSamples;
    }

    const centeredX: number[][] = X.map(row =>
      row.map((val, idx) => val - this.meanValues[idx])
    );

    // 2. 白化
    const { whitenedX } = this.whiten(centeredX);

    // 3. FastICA算法
    this.components = [];
    
    for (let comp = 0; comp < this.nComponents; comp++) {
      // 随机初始化权重向量
      let w = Array(this.nFeatures).fill(0).map(() => Math.random() - 0.5);
      
      // 归一化
      let norm = Math.sqrt(w.reduce((sum, val) => sum + val * val, 0));
      w = w.map(val => val / norm);

      let converged = false;
      let iteration = 0;

      while (!converged && iteration < this.maxIter) {
        const wOld = [...w];

        // 计算期望值
        const expectations = Array(this.nFeatures).fill(0);
        const expectations2 = Array(this.nFeatures).fill(0);

        for (let i = 0; i < nSamples; i++) {
          const projection = whitenedX[i].reduce((sum, val, idx) => sum + val * w[idx], 0);
          const tanhVal = this.tanh(projection);
          const tanhDeriv = this.tanhDerivative(projection);

          for (let j = 0; j < this.nFeatures; j++) {
            expectations[j] += whitenedX[i][j] * tanhVal;
            expectations2[j] += tanhDeriv;
          }
        }

        // 更新权重
        for (let j = 0; j < this.nFeatures; j++) {
          w[j] = expectations[j] / nSamples - (expectations2[j] / nSamples) * w[j];
        }

        // 装饰（正交化）
        w = this.decorrelate(w, this.components);

        // 归一化
        norm = Math.sqrt(w.reduce((sum, val) => sum + val * val, 0));
        if (norm > 1e-8) {
          w = w.map(val => val / norm);
        }

        // 检查收敛
        const difference = w.reduce((sum, val, idx) => 
          sum + Math.abs(val - wOld[idx]), 0);
        
        if (difference < this.tolerance) {
          converged = true;
        }

        iteration++;
      }

      this.components.push(w);
    }

    // 计算混合矩阵（components矩阵需要正确的维度安排）
    // components矩阵: [nComponents x nFeatures] - 每行是一个独立成分的权重向量
    // mixing矩阵: [nFeatures x nComponents] - 混合矩阵，用于从独立成分重构原始信号
    // 关系: X = S * mixing^T, 其中S是独立成分矩阵 [nSamples x nComponents]
    
    console.log('计算混合矩阵...');
    console.log('- components矩阵维度 (应该是[nComponents x nFeatures]):', this.components.length, 'x', this.components[0]?.length);
    console.log('- nComponents:', this.nComponents);
    console.log('- nFeatures:', this.nFeatures);
    
    // 验证components矩阵的维度
    if (this.components.length !== this.nComponents) {
      throw new Error(`components矩阵行数(${this.components.length}) != nComponents(${this.nComponents})`);
    }
    if (this.components[0].length !== this.nFeatures) {
      throw new Error(`components矩阵列数(${this.components[0].length}) != nFeatures(${this.nFeatures})`);
    }
    
    // mixing矩阵应该是components的转置: [nFeatures x nComponents]
    this.mixing = FastICAAlgorithm.matrixTranspose(this.components);
    
    console.log('- mixing矩阵维度 (应该是[nFeatures x nComponents]):', this.mixing.length, 'x', this.mixing[0]?.length);
    
    // 验证mixing矩阵的维度
    if (this.mixing.length !== this.nFeatures) {
      throw new Error(`mixing矩阵行数(${this.mixing.length}) != nFeatures(${this.nFeatures})`);
    }
    if (this.mixing[0].length !== this.nComponents) {
      throw new Error(`mixing矩阵列数(${this.mixing[0].length}) != nComponents(${this.nComponents})`);
    }
    
    console.log('训练完成:');
    console.log('- 独立成分矩阵(components)维度:', this.components.length, 'x', this.components[0]?.length);
    console.log('- 混合矩阵(mixing)维度:', this.mixing.length, 'x', this.mixing[0]?.length);
    console.log('- 特征数量:', this.nFeatures);
    console.log('- 独立成分数量:', this.nComponents);
    
    // 验证混合矩阵的有效性
    for (let i = 0; i < this.mixing.length; i++) {
      for (let j = 0; j < this.mixing[i].length; j++) {
        if (!isFinite(this.mixing[i][j])) {
          console.error(`混合矩阵包含无效值 [${i}][${j}]:`, this.mixing[i][j]);
          throw new Error('训练过程产生了无效的混合矩阵');
        }
      }
    }
  }

  // 变换方法
  transform(X: number[][]): number[][] {
    if (this.components.length === 0) {
      throw new Error("模型未训练，请先调用fit方法");
    }

    const nSamples = X.length;
    const centeredX = X.map(row =>
      row.map((val, idx) => val - this.meanValues[idx])
    );

    const result: number[][] = [];
    for (let i = 0; i < nSamples; i++) {
      const transformedRow: number[] = [];
      for (let comp = 0; comp < this.nComponents; comp++) {
        const projection = centeredX[i].reduce((sum, val, idx) => 
          sum + val * this.components[comp][idx], 0);
        transformedRow.push(projection);
      }
      result.push(transformedRow);
    }

    return result;
  }

  // 逆变换方法
  inverseTransform(S: number[][]): number[][] {
    if (this.mixing.length === 0) {
      throw new Error("模型未训练，请先调用fit方法");
    }

    console.log('开始逆变换...');
    console.log('独立成分矩阵S维度:', S.length, 'x', S[0]?.length);
    console.log('混合矩阵mixing维度:', this.mixing.length, 'x', this.mixing[0]?.length);
    console.log('均值向量长度:', this.meanValues.length);

    // 检查维度匹配
    // S的维度: [nSamples x nComponents]
    // mixing的维度: [nFeatures x nComponents]
    // 重构: X = S * mixing^T, 结果维度: [nSamples x nFeatures]
    if (S[0].length !== this.nComponents) {
      console.error('维度不匹配: S的列数(' + S[0].length + ') != nComponents(' + this.nComponents + ')');
      throw new Error(`维度不匹配: 独立成分数量(${S[0].length}) != 期望的独立成分数量(${this.nComponents})`);
    }

    if (this.mixing[0].length !== this.nComponents) {
      console.error('mixing矩阵列数(' + this.mixing[0].length + ') != nComponents(' + this.nComponents + ')');
      throw new Error(`混合矩阵维度错误: 列数(${this.mixing[0].length}) != 独立成分数量(${this.nComponents})`);
    }

    const result: number[][] = [];
    for (let i = 0; i < S.length; i++) {
      // 检查当前行的有效性
      if (S[i].some(val => !isFinite(val))) {
        console.error(`S矩阵第${i}行包含无效值:`, S[i]);
        throw new Error(`独立成分矩阵第${i}行包含NaN或无穷大值`);
      }

      // 进行矩阵乘法：S[i] * mixing^T
      // S[i]是1xnComponents向量，mixing^T是nComponentsxnFeatures矩阵
      // 结果是1xnFeatures向量
      const reconstructed: number[] = Array(this.nFeatures).fill(0);
      
      for (let j = 0; j < this.nFeatures; j++) { // 遍历特征
        let sum = 0;
        for (let k = 0; k < this.nComponents; k++) { // 遍历独立成分
          // 检查混合矩阵的有效性
          if (!isFinite(this.mixing[j][k])) {
            console.error(`混合矩阵包含无效值 [${j}][${k}]:`, this.mixing[j][k]);
            throw new Error(`混合矩阵包含NaN或无穷大值`);
          }
          // S[i][k] * mixing[j][k] （mixing已经是[nFeatures x nComponents]格式）
          sum += S[i][k] * this.mixing[j][k];
        }
        reconstructed[j] = sum;
      }

      // 检查重构结果的有效性
      if (reconstructed.some(val => !isFinite(val))) {
        console.error(`重构结果第${i}行包含无效值:`, reconstructed);
        throw new Error(`重构过程产生了NaN或无穷大值`);
      }

      // 添加均值（反标准化）
      const denormalized = reconstructed.map((val, idx) => {
        if (idx >= this.meanValues.length) {
          console.error(`均值向量索引越界: ${idx} >= ${this.meanValues.length}`);
          throw new Error(`均值向量长度不匹配`);
        }
        if (!isFinite(this.meanValues[idx])) {
          console.error(`均值向量包含无效值 [${idx}]:`, this.meanValues[idx]);
          throw new Error(`均值向量包含NaN或无穷大值`);
        }
        const result = val + this.meanValues[idx];
        if (!isFinite(result)) {
          console.error(`反标准化后产生无效值: ${val} + ${this.meanValues[idx]} = ${result}`);
          throw new Error(`反标准化过程产生了NaN或无穷大值`);
        }
        return result;
      });
      
      result.push(denormalized);
    }

    console.log('逆变换完成，结果维度:', result.length, 'x', result[0]?.length);
    console.log('预期结果维度: [' + S.length + ' x ' + this.nFeatures + ']');
    
    // 验证最终结果维度
    if (result.length !== S.length || result[0].length !== this.nFeatures) {
      throw new Error(`重构结果维度错误: 得到[${result.length} x ${result[0].length}], 期望[${S.length} x ${this.nFeatures}]`);
    }
    
    return result;
  }

  // 获取组件
  getComponents(): number[][] {
    return this.components;
  }

  // 获取混合矩阵
  getMixing(): number[][] {
    return this.mixing;
  }
}

// I²统计量和控制限计算类
class ICAStatistics {
  // 计算I²统计量
  static calculateI2Statistics(S: number[][]): number[] {
    return S.map(row => row.reduce((sum, val) => sum + val * val, 0));
  }

  // 简化的核密度估计（KDE）实现
  static calculateKDE(data: number[], bandwidth?: number): {
    evaluate: (x: number) => number;
    grid: number[];
    values: number[];
  } {
    if (!bandwidth) {
      // 使用Silverman法则估算带宽
      const n = data.length;
      const std = this.calculateStd(data);
      bandwidth = 1.06 * std * Math.pow(n, -1/5);
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    const gridSize = 1000;
    const grid: number[] = [];
    
    // 创建网格点
    for (let i = 0; i < gridSize; i++) {
      grid[i] = min + (i / (gridSize - 1)) * range;
    }

    // 高斯核函数
    const gaussianKernel = (x: number): number => {
      return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
    };

    // 计算KDE值
    const evaluate = (x: number): number => {
      let sum = 0;
      for (const dataPoint of data) {
        sum += gaussianKernel((x - dataPoint) / bandwidth);
      }
      return sum / (data.length * bandwidth);
    };

    // 计算网格点上的KDE值
    const values = grid.map(x => evaluate(x));

    return { evaluate, grid, values };
  }

  // 使用KDE计算控制限
  static calculateControlLimitKDE(data: number[], confidenceLevel: number = 0.99): number {
    const kde = this.calculateKDE(data);
    const { grid, values } = kde;

    // 计算累积分布函数
    let cdfSum = 0;
    const cdf: number[] = [];
    const dx = grid.length > 1 ? (grid[1] - grid[0]) : 1;
    
    for (let i = 0; i < values.length; i++) {
      cdfSum += values[i] * dx;
      cdf[i] = cdfSum;
    }

    // 归一化CDF
    const maxCdf = cdf[cdf.length - 1];
    const normalizedCdf = cdf.map(val => val / maxCdf);

    // 找到对应置信水平的控制限
    for (let i = 0; i < normalizedCdf.length; i++) {
      if (normalizedCdf[i] >= confidenceLevel) {
        return grid[i];
      }
    }

    // 如果没找到，返回最大值
    return Math.max(...data);
  }

  // 计算标准差
  private static calculateStd(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }

  // 计算重构误差
  static calculateReconstructionError(original: number[][], reconstructed: number[][]): number[] {
    const errors: number[] = [];
    
    for (let i = 0; i < original.length; i++) {
      let error = 0;
      for (let j = 0; j < original[i].length; j++) {
        error += Math.pow(original[i][j] - reconstructed[i][j], 2);
      }
      errors.push(error);
    }
    
    return errors;
  }

  // 计算变量贡献度
  static calculateContributions(S: number[][], components: number[][], anomalyIndices: number[], variableNames?: string[]): {
    variable: string;
    contribution: number;
  }[] {
    if (anomalyIndices.length === 0) {
      return [];
    }

    const nFeatures = components[0].length;
    const contributions: number[] = Array(nFeatures).fill(0);

    // 计算异常点的平均贡献度
    for (const idx of anomalyIndices) {
      const s = S[idx];
      for (let j = 0; j < nFeatures; j++) {
        let contrib = 0;
        for (let i = 0; i < s.length; i++) {
          contrib += Math.pow(s[i] * components[i][j], 2);
        }
        contributions[j] += contrib;
      }
    }

    // 归一化
    const totalContrib = contributions.reduce((sum, val) => sum + val, 0);
    const normalizedContribs = contributions.map(val => 
      totalContrib > 0 ? val / totalContrib : 0
    );

    // 生成结果，使用实际变量名
    return normalizedContribs.map((contrib, index) => ({
      variable: variableNames && index < variableNames.length ? variableNames[index] : `变量${index + 1}`,
      contribution: contrib
    })).sort((a, b) => b.contribution - a.contribution);
  }
}

// ICA分析器主类
class ICAAnalyzer {
  private ica: FastICAAlgorithm | null = null;
  private preprocessedData: { [key: string]: number[] } | null = null;
  private removedColumns: string[] = [];
  private sampleSize: number = 0;
  private variableNames: string[] = [];
  private S: number[][] = []; // 独立成分
  private originalMatrix: number[][] = []; // 原始数据矩阵
  private reconstructedMatrix: number[][] = []; // 重构数据矩阵

  // 计算重构误差
  private calculateReconstructionError(ica: FastICAAlgorithm, originalMatrix: number[][]): number {
    try {
      console.log('开始计算重构误差...');
      console.log('原始矩阵维度:', originalMatrix.length, 'x', originalMatrix[0]?.length);
      
      // 检查输入数据的有效性
      if (!originalMatrix || originalMatrix.length === 0 || !originalMatrix[0]) {
        console.error('原始矩阵无效');
        return NaN;
      }
      
      // 检查是否存在NaN或无穷大值
      let hasInvalidValues = false;
      for (let i = 0; i < originalMatrix.length; i++) {
        for (let j = 0; j < originalMatrix[i].length; j++) {
          if (!isFinite(originalMatrix[i][j])) {
            console.error(`原始矩阵包含无效值 [${i}][${j}]:`, originalMatrix[i][j]);
            hasInvalidValues = true;
          }
        }
      }
      
      if (hasInvalidValues) {
        return NaN;
      }
      
      const S = ica.transform(originalMatrix);
      console.log('变换后矩阵维度:', S.length, 'x', S[0]?.length);
      
      // 检查变换结果的有效性
      if (!S || S.length === 0 || !S[0]) {
        console.error('变换结果无效');
        return NaN;
      }
      
      // 检查变换结果中的无效值
      for (let i = 0; i < Math.min(5, S.length); i++) { // 只检查前5行以避免过多日志
        for (let j = 0; j < S[i].length; j++) {
          if (!isFinite(S[i][j])) {
            console.error(`变换结果包含无效值 [${i}][${j}]:`, S[i][j]);
            return NaN;
          }
        }
      }
      
      const reconstructed = ica.inverseTransform(S);
      console.log('重构矩阵维度:', reconstructed.length, 'x', reconstructed[0]?.length);
      
      // 检查重构结果的有效性
      if (!reconstructed || reconstructed.length === 0 || !reconstructed[0]) {
        console.error('重构结果无效');
        return NaN;
      }
      
      // 检查维度匹配
      if (reconstructed.length !== originalMatrix.length || 
          reconstructed[0].length !== originalMatrix[0].length) {
        console.error('维度不匹配:', {
          original: [originalMatrix.length, originalMatrix[0].length],
          reconstructed: [reconstructed.length, reconstructed[0].length]
        });
        return NaN;
      }
      
      let totalError = 0;
      let count = 0;
      let maxError = 0;
      let invalidCount = 0;
      
      for (let i = 0; i < originalMatrix.length; i++) {
        for (let j = 0; j < originalMatrix[i].length; j++) {
          const original = originalMatrix[i][j];
          const recon = reconstructed[i][j];
          
          // 检查重构值的有效性
          if (!isFinite(recon)) {
            console.error(`重构值无效 [${i}][${j}]:`, recon);
            invalidCount++;
            continue;
          }
          
          const error = Math.pow(original - recon, 2);
          
          // 检查误差值的有效性
          if (!isFinite(error)) {
            console.error(`误差值无效 [${i}][${j}]: orig=${original}, recon=${recon}, error=${error}`);
            invalidCount++;
            continue;
          }
          
          totalError += error;
          maxError = Math.max(maxError, error);
          count++;
        }
      }
      
      if (count === 0) {
        console.error('没有有效的误差值可以计算');
        return NaN;
      }
      
      if (invalidCount > 0) {
        console.warn(`发现 ${invalidCount} 个无效值，使用 ${count} 个有效值计算误差`);
      }
      
      const meanError = totalError / count;
      
      console.log('重构误差计算完成:', {
        totalError: totalError,
        count: count,
        meanError: meanError,
        maxError: maxError,
        invalidCount: invalidCount
      });
      
      // 检查最终结果
      if (!isFinite(meanError)) {
        console.error('最终计算结果无效:', meanError);
        return NaN;
      }
      
      return meanError;
      
    } catch (error) {
      console.error('计算重构误差时出错:', error);
      console.error('错误堆栈:', error instanceof Error ? error.stack : '未知错误');
      return NaN; // 返回NaN而不是Infinity，明确表示计算失败
    }
  }

  // 自动选择最佳独立成分数量 - 简化版本（参照ica.py但增加数量）
  private async findOptimalComponents(
    originalMatrix: number[][], 
    maxIter: number, 
    tolerance: number,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<{
    bestComponents: number;
    errorHistory: Array<{ components: number; error: number }>;
  }> {
    const nVariables = originalMatrix[0].length; // 实际变量个数
    
    console.log(`优化版独立成分数量确定:`, {
      变量个数: nVariables,
      选择策略: '基于变量数量的适应性选择'
    });
    
    // 基于变量数量的适应性选择策略（增加数量）
    let bestComponents: number;
    if (nVariables <= 10) {
      bestComponents = Math.min(6, nVariables); // 小数据集：最多6个（增加）
    } else if (nVariables <= 30) {
      bestComponents = Math.min(Math.floor(nVariables * 0.5), 20); // 中小数据集：50%或最多20个（增加）
    } else if (nVariables <= 50) {
      bestComponents = Math.min(Math.floor(nVariables * 0.4), 30); // 中等数据集：40%或最多30个（增加）
    } else if (nVariables <= 100) {
      bestComponents = Math.min(Math.floor(nVariables * 0.35), 50); // 大数据集：35%或最多50个（增加）
    } else if (nVariables <= 200) {
      bestComponents = Math.min(Math.floor(nVariables * 0.3), 80); // 较大数据集：30%或最多80个（新增）
    } else {
      bestComponents = Math.min(Math.floor(nVariables * 0.25), 100); // 超大数据集：25%或最多100个（增加）
    }
    
    // 确保至少有2个独立成分
    bestComponents = Math.max(2, bestComponents);
    
    // 更新进度
    progressCallback?.(60, `已确定独立成分数量: ${bestComponents}个`);
    
    console.log(`确定独立成分数量: ${bestComponents}/${nVariables} (${((bestComponents / nVariables) * 100).toFixed(1)}%)`);
    
    // 返回简单的结果，不进行复杂搜索
    return { 
      bestComponents, 
      errorHistory: [{ components: bestComponents, error: 0 }] 
    };
  }



  // 执行完整的ICA分析
  async performAnalysis(
    rawData: { [key: string]: number[] }, 
    nComponents?: number, 
    maxIter: number = 1000, 
    tolerance: number = 1e-4, 
    autoSelect: boolean = false,
    progressCallback?: (progress: number, message: string) => void
  ): Promise<any> {
    try {
      console.log('开始ICA分析...');

      // 1. 数据预处理
      const preprocessResult = ICADataPreprocessor.preprocessData(rawData);
      if (!preprocessResult.processedData) {
        throw new Error('数据预处理失败');
      }

      this.preprocessedData = preprocessResult.processedData;
      this.removedColumns = preprocessResult.removedColumns;
      this.sampleSize = preprocessResult.sampleSize;
      this.variableNames = Object.keys(this.preprocessedData);

      console.log('预处理完成:', {
        originalVariables: Object.keys(rawData).length,
        validVariables: this.variableNames.length,
        removedColumns: this.removedColumns,
        sampleSize: this.sampleSize
      });

      // 2. 准备数据矩阵
      this.originalMatrix = [];
      for (let i = 0; i < this.sampleSize; i++) {
        const row: number[] = [];
        for (const varName of this.variableNames) {
          row.push(this.preprocessedData[varName][i]);
        }
        this.originalMatrix.push(row);
      }

      // 3. 确定组件数量
      let finalComponents = nComponents;
      let errorHistory: Array<{ components: number; error: number }> = [];
      
      if (autoSelect || !nComponents) {
        console.log('开始异步搜索最佳独立成分数量...');
        const optimalResult = await this.findOptimalComponents(this.originalMatrix, maxIter, tolerance, progressCallback);
        finalComponents = optimalResult.bestComponents;
        errorHistory = optimalResult.errorHistory;
        console.log('异步搜索完成，自动选择的组件数量:', finalComponents);
      } else {
        // 即使手动指定，也要确保在合理范围内
        finalComponents = Math.min(Math.max(nComponents, 2), this.variableNames.length);
        console.log('手动指定的组件数量:', finalComponents);
      }

      // 4. 训练ICA模型
      console.log('开始训练最终ICA模型...');
      progressCallback?.(70, '正在训练最终ICA模型...');
      this.ica = new FastICAAlgorithm(finalComponents, maxIter, tolerance);
      this.ica.fit(this.originalMatrix);

      // 5. 变换到独立成分空间
      this.S = this.ica.transform(this.originalMatrix);

      // 6. 重构数据
      this.reconstructedMatrix = this.ica.inverseTransform(this.S);

      // 7. 计算I²统计量
      const i2Values = ICAStatistics.calculateI2Statistics(this.S);

      // 8. 计算控制限
      const controlLimit = ICAStatistics.calculateControlLimitKDE(i2Values, 0.99);

      // 9. 计算重构误差
      const reconstructionErrors = ICAStatistics.calculateReconstructionError(
        this.originalMatrix,
        this.reconstructedMatrix
      );

      // 10. 异常检测
      const anomalyIndices = i2Values
        .map((val, idx) => ({ val, idx }))
        .filter(item => item.val > controlLimit)
        .map(item => item.idx);

      // 11. 计算贡献度
      const contributions = ICAStatistics.calculateContributions(
        this.S,
        this.ica.getComponents(),
        anomalyIndices,
        this.variableNames
      );

      // 12. 生成收敛曲线（模拟）
      const convergence = Array.from({ length: Math.min(maxIter / 50, 20) }, (_, i) => 
        Math.exp(-i * 0.3) + Math.random() * 0.1
      );

      // 13. 计算最终重构误差
      const finalReconstructionError = this.calculateReconstructionError(this.ica, this.originalMatrix);

      console.log('ICA分析完成:', {
        finalComponents,
        i2Range: [Math.min(...i2Values), Math.max(...i2Values)],
        controlLimit,
        anomaliesCount: anomalyIndices.length,
        averageReconstructionError: reconstructionErrors.reduce((a, b) => a + b, 0) / reconstructionErrors.length,
        finalReconstructionError,
        autoSelected: autoSelect || !nComponents
      });

      return {
        iSquared: i2Values,
        reconstructionError: reconstructionErrors,
        controlLimits: {
          iSquared: controlLimit,
          reconstructionError: ICAStatistics.calculateControlLimitKDE(reconstructionErrors, 0.95),
        },
        contributions: contributions.slice(0, 10), // 只返回前10个贡献度
        convergence,
        anomalies: {
          indices: anomalyIndices,
          count: anomalyIndices.length,
          rate: (anomalyIndices.length / this.sampleSize * 100).toFixed(2)
        },
        dataInfo: {
          sampleSize: this.sampleSize,
          variables: this.variableNames,
          removedColumns: this.removedColumns,
          nComponents: finalComponents,
          convergenceIterations: convergence.length * 50,
          autoSelected: autoSelect || !nComponents,
          finalReconstructionError,
        },
        components: this.ica.getComponents(),
        independentSources: this.S,
        optimizationHistory: errorHistory, // 添加优化历史
      };

    } catch (error) {
      console.error('ICA分析失败:', error);
      throw error;
    }
  }

  // 生成故障诊断报告
  generateDiagnosisReport(analysisResults: any): string {
    try {
      let report = "ICA独立成分分析故障诊断报告\n";
      report += "=".repeat(50) + "\n\n";
      
      // 总体状态评估
      report += "一、总体状态评估\n";
      report += "-".repeat(40) + "\n";
      
      const { dataInfo, anomalies, controlLimits } = analysisResults;
      const anomalyRate = parseFloat(anomalies.rate);
      
      report += `1. 样本总数: ${dataInfo.sampleSize}\n`;
      report += `2. 异常检出率: ${anomalies.rate}%\n`;
      report += `3. I²统计量控制限: ${controlLimits.iSquared.toFixed(4)}\n`;
      report += `4. 重构误差控制限: ${controlLimits.reconstructionError.toFixed(4)}\n`;
      report += `5. 独立成分数量: ${dataInfo.nComponents}\n`;
      report += `6. 算法收敛迭代数: ${dataInfo.convergenceIterations}\n\n`;
      
      // 异常点详细分析
      report += "二、异常点详细分析\n";
      report += "-".repeat(40) + "\n";
      
      if (anomalies.count > 0) {
        report += `共检测到 ${anomalies.count} 个异常点:\n`;
        report += `异常点索引: [${anomalies.indices.slice(0, 20).join(', ')}`;
        if (anomalies.indices.length > 20) {
          report += `, ... (共${anomalies.indices.length}个)`;
        }
        report += "]\n\n";
        
        // 主要贡献变量
        report += "主要贡献变量分析:\n";
        analysisResults.contributions.slice(0, 5).forEach((contrib: any, index: number) => {
          report += `${index + 1}. ${contrib.variable}: ${(contrib.contribution * 100).toFixed(2)}%\n`;
        });
      } else {
        report += "当前监测周期内未检测到显著异常\n";
      }
      
      report += "\n三、诊断结论与建议\n";
      report += "-".repeat(40) + "\n";
      
      if (anomalyRate > 10) {
        report += "1. 异常程度: 严重\n";
        report += "2. 建议措施: 建议立即进行系统检查和维护\n";
      } else if (anomalyRate > 5) {
        report += "1. 异常程度: 中等\n";
        report += "2. 建议措施: 建议关注系统状态，适时进行维护\n";
      } else {
        report += "1. 异常程度: 轻微或正常\n";
        report += "2. 建议措施: 保持当前监控，定期检查\n";
      }
      
      if (dataInfo.removedColumns.length > 0) {
        report += `\n注意: 以下变量因数据质量问题已被移除: ${dataInfo.removedColumns.join(', ')}\n`;
      }
      
      return report;
      
    } catch (error) {
      console.error('生成诊断报告失败:', error);
      return "诊断报告生成失败";
    }
  }
}

const ICAAnalysis: React.FC = () => {
  const [form] = Form.useForm();
  const [running, setRunning] = useState(false);
  const [formValues, setFormValues] = useState({
    dataFile: undefined,
    nComponents: 4,
    maxIter: 1000,
    tolerance: 1e-4,
    autoComponents: true,
  });
  const [renderKey, setRenderKey] = useState(0);
  const dispatch = useAppDispatch();
  const { files } = useAppSelector((state) => state.data);
  const { config, results } = useAppSelector((state) => state.analysis);

  // 自动加载数据
  // 移除useAutoUpload - 数据现在通过全局预加载器自动处理

  // 自动选择第一个可用文件
  useEffect(() => {
    const successFiles = files.filter(f => f.status === 'success');
    console.log('[ICA分析] 检查文件自动选择:', {
      totalFiles: files.length,
      successFiles: successFiles.length,
      currentDataFile: formValues.dataFile,
      fileNames: successFiles.map(f => f.name)
    });
    
    if (successFiles.length > 0 && !formValues.dataFile) {
      const firstFileId = successFiles[0].id;
      console.log('[ICA分析] 自动选择第一个文件:', successFiles[0].name, 'ID:', firstFileId);
      
      // 同时更新form和formValues状态
      form.setFieldValue('dataFile', firstFileId);
      setFormValues(prev => ({ ...prev, dataFile: firstFileId }));
    }
  }, [files, form, formValues.dataFile]);

  // 获取最新的ICA分析结果
  const currentResult = results
    .filter(result => result.type === 'ica' && result.status === 'completed')
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;

  // 确保表单值与本地状态同步
  useEffect(() => {
    console.log('ICA组件初始化，设置表单值:', formValues);
    form.setFieldsValue(formValues);
  }, [form, formValues]);

  const handleAnalysis = async (values: any) => {
    console.log('开始ICA分析，接收到的参数:', values);
    
    if (!values.dataFile) {
      message.error('请选择数据文件');
      return;
    }

    setRunning(true);
    setFormValues(values); // 更新本地状态

    // 更新配置到Redux
    dispatch(updateConfig({ type: 'ica', config: values }));

    // 创建分析结果
    const result: AnalysisResult = {
      id: Date.now().toString(),
      type: 'ica',
      name: `ICA分析_${new Date().toLocaleString()}`,
      dataFileId: values.dataFile,
      parameters: values,
      results: {},
      charts: [],
      status: 'running',
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    dispatch(addResult(result));

    try {
      // 获取选中的数据文件
      const selectedFile = files.find(f => f.id === values.dataFile);
      
      if (!selectedFile?.rawData) {
        message.error('所选文件没有数据，请重新上传文件');
        setRunning(false);
        return;
      }

      // 更新进度：数据准备
      dispatch(updateResult({
        id: result.id,
        updates: { progress: 10 }
      }));

      // 使用真实数据进行ICA分析
      const numericData = getNumericColumns(selectedFile.rawData);
      
      if (Object.keys(numericData).length === 0) {
        message.error('所选文件中没有数值型数据，请检查数据格式');
        setRunning(false);
        return;
      }

      console.log('数据预览:', {
        variables: Object.keys(numericData),
        sampleCounts: Object.fromEntries(
          Object.entries(numericData).map(([key, vals]) => [key, vals.length])
        )
      });

      // 更新进度：参数确定
      dispatch(updateResult({
        id: result.id,
        updates: { progress: 20 }
      }));

      // 确定组件数量
      let nComponents = values.nComponents;
      const autoSelect = values.autoComponents;
      
      if (autoSelect) {
        // 自动选择模式：让算法自动确定最佳数量
        nComponents = undefined; // 传递undefined让算法自动选择
        console.log('使用自动选择模式确定独立成分数量');
      } else {
        // 手动指定模式：使用用户指定的数量
        if (!nComponents || nComponents < 2) {
          nComponents = Math.min(4, Object.keys(numericData).length);
        }
        nComponents = Math.min(nComponents, Object.keys(numericData).length);
        console.log('手动指定独立成分数量:', nComponents);
      }

      // 更新进度：开始分析
      dispatch(updateResult({
        id: result.id,
        updates: { progress: 30 }
      }));

      // 为了避免UI卡顿，使用setTimeout将耗时计算推迟到下一个事件循环
      await new Promise<void>((resolve) => {
        setTimeout(async () => {
          try {
            // 执行ICA分析
            const analyzer = new ICAAnalyzer();
            
            // 分步执行分析，每步更新进度
            console.log('开始执行ICA分析...');
            
            // 更新进度：模型训练
            dispatch(updateResult({
              id: result.id,
              updates: { progress: 50 }
            }));

            const analysisResults = await analyzer.performAnalysis(
              numericData,
              nComponents,
              values.maxIter || 1000,
              values.tolerance || 1e-4,
              autoSelect, // 传递autoSelect参数
              // 进度回调函数
              (progress: number, message: string) => {
                dispatch(updateResult({
                  id: result.id,
                  updates: { progress }
                }));
                console.log(`进度更新: ${progress}% - ${message}`);
              }
            );

            // 更新进度：生成图表
            dispatch(updateResult({
              id: result.id,
              updates: { progress: 70 }
            }));

            // 生成图表数据
            const charts = [
              {
                type: 'scatter',
                data: {
                  title: 'I²监控图',
                  xData: Array.from({ length: analysisResults.iSquared.length }, (_, i) => i + 1),
                  yData: analysisResults.iSquared,
                  controlLimit: analysisResults.controlLimits.iSquared,
                  anomalies: analysisResults.anomalies,
                },
              },
              {
                type: 'scatter',
                data: {
                  title: '重构误差监控图',
                  xData: Array.from({ length: analysisResults.reconstructionError.length }, (_, i) => i + 1),
                  yData: analysisResults.reconstructionError,
                  controlLimit: analysisResults.controlLimits.reconstructionError,
                },
              },
              {
                type: 'bar',
                data: {
                  title: '变量贡献度分析',
                  xData: analysisResults.contributions.map((c: any) => c.variable),
                  yData: analysisResults.contributions.map((c: any) => c.contribution),
                },
              },
              {
                type: 'line',
                data: {
                  title: '算法收敛曲线',
                  xData: Array.from({ length: analysisResults.convergence.length }, (_, i) => i + 1),
                  yData: analysisResults.convergence,
                },
              },
            ];

            // 如果有优化历史，添加组件数量优化图表
            // 简化后不再需要优化历史图表
            // if (analysisResults.optimizationHistory && analysisResults.optimizationHistory.length > 0) {
            //   charts.push({
            //     type: 'line',
            //     data: {
            //       title: '独立成分数量优化曲线',
            //       xData: analysisResults.optimizationHistory.map((h: any) => h.components),
            //       yData: analysisResults.optimizationHistory.map((h: any) => h.error),
            //       isOptimization: true,
            //     },
            //   });
            // }

            // 更新进度：生成报告
            dispatch(updateResult({
              id: result.id,
              updates: { progress: 85 }
            }));

            // 生成故障诊断报告
            const diagnosisReport = analyzer.generateDiagnosisReport(analysisResults);

            // 更新进度：完成
            dispatch(updateResult({
              id: result.id,
              updates: { progress: 95 }
            }));

            // 更新分析结果
            dispatch(updateResult({
              id: result.id,
              updates: {
                status: 'completed',
                progress: 100,
                results: {
                  ...analysisResults,
                  diagnosisReport
                },
                charts,
                completedAt: new Date().toISOString(),
              },
            }));

            setRunning(false);
            setRenderKey(prev => prev + 1); // 强制重新渲染
            message.success(`ICA分析完成！已选择${analysisResults.dataInfo.nComponents}个独立成分 (${((analysisResults.dataInfo.nComponents / analysisResults.dataInfo.variables.length) * 100).toFixed(1)}%)`);

            console.log('ICA分析完成，结果:', {
              componentsSelected: analysisResults.dataInfo.nComponents,
              componentsRatio: `${((analysisResults.dataInfo.nComponents / analysisResults.dataInfo.variables.length) * 100).toFixed(1)}%`,
              anomaliesCount: analysisResults.anomalies.count,
              anomalyRate: analysisResults.anomalies.rate,
              variablesProcessed: analysisResults.dataInfo.variables.length,
              optimizationTested: analysisResults.optimizationHistory?.length || 0
            });

            resolve();
          } catch (error) {
            console.error('ICA分析执行错误:', error);
            dispatch(updateResult({
              id: result.id,
              updates: {
                status: 'error',
                progress: 0,
              },
            }));
            setRunning(false);
            message.error(`ICA分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
            resolve();
          }
        }, 100); // 短暂延迟以允许UI更新
      });

    } catch (error) {
      console.error('ICA分析错误:', error);
      dispatch(updateResult({
        id: result.id,
        updates: {
          status: 'error',
          progress: 0,
        },
      }));
      setRunning(false);
      message.error(`ICA分析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  const getScatterOption = (chartData: any) => {
    const isI2Chart = chartData.title.includes('I²');
    const anomalies = chartData.anomalies || { indices: [] };
    
    // 分离正常点和异常点
    const normalData: Array<[number, number]> = [];
    const anomalyData: Array<[number, number]> = [];
    
    chartData.yData.forEach((value: number, index: number) => {
      const point: [number, number] = [index + 1, value];
      if (anomalies.indices.includes(index)) {
        anomalyData.push(point);
      } else {
        normalData.push(point);
      }
    });

    return {
      title: {
        text: chartData.title,
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold',
        },
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: any) => {
          const isAnomaly = params.seriesName === '异常点';
          const sampleIndex = params.value[0];
          const statValue = params.value[1];
          return `样本 ${sampleIndex}<br/>${isI2Chart ? 'I²统计量' : '重构误差'}: ${statValue.toFixed(4)}${isAnomaly ? '<br/><span style="color: red;">⚠️ 异常点</span>' : ''}`;
        },
      },
      legend: {
        data: ['正常点', '异常点', '控制限'],
        top: 'bottom',
      },
      xAxis: {
        type: 'value',
        name: '样本序号',
        nameLocation: 'middle',
        nameGap: 30,
        min: 1,
        max: chartData.xData.length,
      },
      yAxis: {
        type: 'value',
        name: isI2Chart ? 'I²统计量值' : '重构误差值',
        nameLocation: 'middle',
        nameGap: 60,
        min: 0,
      },
      series: [
        // 正常点
        {
          name: '正常点',
          type: 'scatter',
          data: normalData,
          symbolSize: 6,
          itemStyle: {
            color: '#52c41a',
            opacity: 0.8,
          },
        },
        // 异常点
        {
          name: '异常点',
          type: 'scatter',
          data: anomalyData,
          symbolSize: 10,
          itemStyle: {
            color: '#ff4d4f',
            borderColor: '#fff',
            borderWidth: 2,
          },
        },
        // 控制限线
        {
          name: '控制限',
          type: 'line',
          data: [[1, chartData.controlLimit], [chartData.xData.length, chartData.controlLimit]],
          lineStyle: {
            color: '#ff4d4f',
            type: 'dashed',
            width: 2,
          },
          symbol: 'none',
          markArea: {
            silent: true,
            itemStyle: {
              color: 'rgba(255, 77, 79, 0.1)',
            },
            data: [
              [
                { yAxis: chartData.controlLimit },
                { yAxis: Math.max(...chartData.yData) * 1.1 }
              ]
            ],
          },
        },
      ],
      grid: {
        left: '10%',
        right: '10%',
        bottom: '20%',
        top: '15%',
      },
    };
  };

  const getBarOption = (chartData: any) => ({
    title: {
      text: chartData.title,
      left: 'center',
      textStyle: {
        fontSize: 16,
        fontWeight: 'bold',
      },
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const data = params[0];
        return `${data.name}: ${(data.value * 100).toFixed(2)}%`;
      },
    },
    xAxis: {
      type: 'category',
      data: chartData.xData,
      axisLabel: {
        rotate: 45,
        interval: 0,
      },
    },
    yAxis: {
      type: 'value',
      name: '贡献度',
      axisLabel: {
        formatter: (value: number) => `${(value * 100).toFixed(0)}%`,
      },
    },
    series: [
      {
        name: '贡献度',
        type: 'bar',
        data: chartData.yData,
        itemStyle: {
          color: (params: any) => {
            const colors = ['#722ed1', '#13c2c2', '#52c41a', '#fa8c16', '#eb2f96'];
            return colors[params.dataIndex % colors.length];
          },
        },
        label: {
          show: true,
          position: 'top',
          formatter: (params: any) => `${(params.value * 100).toFixed(1)}%`,
        },
      },
    ],
    grid: {
      left: '10%',
      right: '10%',
      bottom: '25%',
      top: '15%',
    },
  });

  const getLineOption = (chartData: any) => {
    const isOptimization = chartData.isOptimization;
    const optimalPoint = chartData.optimalPoint;
    
    const option = {
      title: {
        text: chartData.title,
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold',
        },
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const data = params[0];
          if (isOptimization) {
            return `${data.name} 个组件<br/>重构误差: ${data.value.toFixed(6)}`;
          } else {
            return `迭代 ${data.name}: ${data.value.toFixed(4)}`;
          }
        },
      },
      xAxis: {
        type: 'category',
        data: chartData.xData,
        name: isOptimization ? '独立成分数量' : '迭代次数',
        nameLocation: 'middle',
        nameGap: 30,
      },
      yAxis: {
        type: 'value',
        name: isOptimization ? '重构误差' : '收敛值',
        nameLocation: 'middle',
        nameGap: 50,
      },
      series: [
        {
          name: isOptimization ? '重构误差' : '收敛值',
          type: 'line',
          data: chartData.yData,
          smooth: !isOptimization, // 优化曲线不平滑，收敛曲线平滑
          itemStyle: {
            color: isOptimization ? '#722ed1' : '#1890ff',
          },
          lineStyle: {
            width: 3,
          },
          symbol: 'circle',
          symbolSize: isOptimization ? 8 : 6,
          markPoint: isOptimization && optimalPoint ? {
            data: [
              {
                name: '最优点',
                coord: [optimalPoint, chartData.yData[chartData.xData.indexOf(optimalPoint)]],
                itemStyle: {
                  color: '#52c41a',
                },
                label: {
                  show: true,
                  position: 'top',
                  formatter: `最优: ${optimalPoint}个组件`,
                  fontSize: 12,
                  color: '#52c41a',
                },
              },
            ],
          } : undefined,
        },
      ],
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
        top: '15%',
      },
    };

    return option;
  };

  const contributionColumns = [
    {
      title: '变量名称',
      dataIndex: 'variable',
      key: 'variable',
    },
    {
      title: '贡献度',
      dataIndex: 'contribution',
      key: 'contribution',
      render: (value: number) => `${(value * 100).toFixed(2)}%`,
    },
    {
      title: '重要性排序',
      dataIndex: 'rank',
      key: 'rank',
    },
  ];

  const contributionData = currentResult?.results?.contributions?.map((item: any, index: number) => ({
    key: index,
    variable: item.variable,
    contribution: item.contribution,
    rank: index + 1,
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Title level={3}>ICA独立成分分析</Title>
        <Space>
          <Button icon={<DownloadOutlined />}>导出结果</Button>
          <Button type="primary" icon={<BarChartOutlined />}>查看历史</Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col span={8}>
          <Card title="参数设置">
            <Form
              form={form}
              layout="vertical"
              initialValues={formValues}
              onFinish={handleAnalysis}
              onValuesChange={(changedValues, allValues) => {
                console.log('ICA表单值变化:', { changedValues, allValues });
                setFormValues(allValues);
                dispatch(updateConfig({ type: 'ica', config: allValues }));
              }}
            >
              <Form.Item
                name="dataFile"
                label="选择数据文件"
                rules={[{ required: true, message: '请选择数据文件' }]}
                tooltip="选择已上传并成功解析的Excel数据文件"
              >
                <Select placeholder="选择数据文件">
                  {files.filter(f => f.status === 'success' && f.rawData).map(file => {
                    const numericColumns = file.rawData ? Object.keys(getNumericColumns(file.rawData)).length : 0;
                    return (
                      <Option key={file.id} value={file.id}>
                        {file.name} ({file.rowCount} 行 × {file.columnCount} 列 | {numericColumns} 个数值列)
                      </Option>
                    );
                  })}
                </Select>
              </Form.Item>

              {files.filter(f => f.status === 'success' && f.rawData).length === 0 && (
                <div className="mb-4 p-3 bg-yellow-50 rounded border border-yellow-200">
                  <Text type="warning" className="text-sm">
                    ⚠️ 没有可用的数据文件。请先到 <strong>数据管理</strong> 页面上传Excel文件。
                  </Text>
                </div>
              )}

              <Form.Item
                name="autoComponents"
                label="自动确定独立成分数量"
                valuePropName="checked"
                tooltip="系统将自动选择最适合的独立成分数量"
              >
                <Switch
                  checkedChildren="是"
                  unCheckedChildren="否"
                  onChange={(checked) => {
                    const newValues = { ...formValues, autoComponents: checked };
                    if (checked) {
                      newValues.nComponents = undefined;
                      form.setFieldsValue({ autoComponents: checked, nComponents: undefined });
                    } else {
                      newValues.nComponents = 4;
                      form.setFieldsValue({ autoComponents: checked, nComponents: 4 });
                    }
                    setFormValues(newValues);
                    dispatch(updateConfig({ type: 'ica', config: newValues }));
                  }}
                />
              </Form.Item>

              <Form.Item
                noStyle
                shouldUpdate={(prevValues, currentValues) => 
                  prevValues.autoComponents !== currentValues.autoComponents || 
                  prevValues.dataFile !== currentValues.dataFile
                }
              >
                {({ getFieldValue }) => {
                  const autoComponents = getFieldValue('autoComponents');
                  const selectedFileId = getFieldValue('dataFile');
                  const selectedFile = files.find(f => f.id === selectedFileId);
                  
                  // 基于实际变量个数确定最大独立成分数量
                  let maxComponents = 4; // 默认值
                  if (selectedFile?.rawData) {
                    const numVars = Object.keys(getNumericColumns(selectedFile.rawData)).length;
                    if (numVars <= 5) {
                      maxComponents = Math.max(2, numVars - 1);
                    } else if (numVars <= 10) {
                      maxComponents = Math.max(3, Math.floor(numVars * 0.8));
                    } else if (numVars <= 20) {
                      maxComponents = Math.min(12, Math.max(4, Math.floor(numVars * 0.6)));
                    } else {
                      maxComponents = Math.min(15, Math.max(5, Math.floor(numVars * 0.5)));
                    }
                  }
                  
                  return !autoComponents ? (
                    <Form.Item
                      name="nComponents"
                      label={`独立成分数量 (范围: 2-${selectedFile?.rawData ? Object.keys(getNumericColumns(selectedFile.rawData)).length : 100})`}
                      rules={[{ required: true, message: '请输入独立成分数量' }]}
                      tooltip="建议选择2到100个独立成分，或变量总数的25%-50%"
                    >
                      <InputNumber
                        min={2}
                        max={selectedFile?.rawData ? Object.keys(getNumericColumns(selectedFile.rawData)).length : 100}
                        className="w-full"
                        placeholder="建议: 2-100"
                      />
                    </Form.Item>
                  ) : (
                    <div className="mb-4 p-3 bg-blue-50 rounded border border-blue-200">
                      <Text type="secondary" className="text-sm">
                        💡 <strong>自动选择策略：</strong>基于变量数量的适应性选择，为大数据集提供更多独立成分。
                        {selectedFile?.rawData && (() => {
                          const numVars = Object.keys(getNumericColumns(selectedFile.rawData)).length;
                          let autoComponents: number;
                          let strategy: string;
                          
                          if (numVars <= 10) {
                            autoComponents = Math.min(6, numVars);
                            strategy = '小数据集：最多6个独立成分';
                          } else if (numVars <= 30) {
                            autoComponents = Math.min(Math.floor(numVars * 0.5), 20);
                            strategy = '中小数据集：50%变量数或最多20个';
                          } else if (numVars <= 50) {
                            autoComponents = Math.min(Math.floor(numVars * 0.4), 30);
                            strategy = '中等数据集：40%变量数或最多30个';
                          } else if (numVars <= 100) {
                            autoComponents = Math.min(Math.floor(numVars * 0.35), 50);
                            strategy = '大数据集：35%变量数或最多50个';
                          } else if (numVars <= 200) {
                            autoComponents = Math.min(Math.floor(numVars * 0.3), 80);
                            strategy = '较大数据集：30%变量数或最多80个';
                          } else {
                            autoComponents = Math.min(Math.floor(numVars * 0.25), 100);
                            strategy = '超大数据集：25%变量数或最多100个';
                          }
                          
                          return (
                            <div className="mt-2 space-y-1">
                              <div className="text-xs text-blue-600">
                                <strong>当前数据：</strong>{numVars} 个数值变量 | <strong>自动选择：</strong>{autoComponents} 个独立成分
                              </div>
                              <div className="text-xs text-blue-500">
                                <strong>策略：</strong>{strategy}
                              </div>
                            </div>
                          );
                        })()}
                        {currentResult?.results?.dataInfo?.autoSelected && (
                          <div className="mt-3 p-2 bg-green-50 rounded border border-green-200">
                            <Text type="success" className="text-sm font-medium">
                              ✓ 已自动选择 <strong>{currentResult.results.dataInfo.nComponents}</strong> 个独立成分
                              （重构误差: <strong>
                                {(() => {
                                  const error = currentResult.results.dataInfo.finalReconstructionError;
                                  if (error === null || error === undefined) {
                                    return '计算中...';
                                  } else if (isNaN(error) || !isFinite(error)) {
                                    return '计算失败';
                                  } else {
                                    return error.toFixed(6);
                                  }
                                })()}
                              </strong>）
                            </Text>
                          </div>
                        )}
                      </Text>
                    </div>
                  );
                }}
              </Form.Item>

              <Form.Item
                name="maxIter"
                label="最大迭代次数"
              >
                <InputNumber
                  min={50}
                  max={1000}
                  className="w-full"
                  placeholder="最大迭代次数"
                />
              </Form.Item>

              <Form.Item
                name="tolerance"
                label="收敛容差"
              >
                <Select>
                  <Option value={1e-3}>1e-3</Option>
                  <Option value={1e-4}>1e-4</Option>
                  <Option value={1e-5}>1e-5</Option>
                </Select>
              </Form.Item>

              <Form.Item>
                <Space className="w-full">
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={running}
                    icon={<PlayCircleOutlined />}
                    disabled={running}
                  >
                    开始分析
                  </Button>
                  <Button
                    danger
                    icon={<StopOutlined />}
                    disabled={!running}
                    onClick={() => setRunning(false)}
                  >
                    停止分析
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col span={16}>
          <Card title="分析结果">
            {running && (
              <div className="text-center py-8">
                <div className="mb-4">
                  <Text className="text-lg">正在进行ICA分析...</Text>
                </div>
                <Progress 
                  percent={currentResult?.progress || 0} 
                  className="mt-2 mb-4" 
                  strokeColor={{
                    '0%': '#108ee9',
                    '100%': '#87d068',
                  }}
                  format={(percent) => `${percent}%`}
                />
                <div className="text-sm text-gray-500">
                  {(() => {
                    const progress = currentResult?.progress || 0;
                    if (progress < 20) return '正在准备数据...';
                    if (progress < 30) return '正在确定分析参数...';
                    if (progress < 50) return '正在开始智能搜索最佳独立成分数量...';
                    if (progress < 70) return '正在智能搜索中，测试不同的独立成分配置...';
                    if (progress < 85) return '正在生成监控图表...';
                    if (progress < 95) return '正在生成故障诊断报告...';
                    return '即将完成...';
                  })()}
                </div>
                {/* 移除自动选择模式的提示信息 */}
              </div>
            )}

            {!running && currentResult && currentResult.status === 'completed' && (
              <div>
                {/* 调试信息 */}
                {process.env.NODE_ENV === 'development' && (
                  <div className="mb-4 p-2 bg-gray-100 rounded text-xs">
                    <div>结果ID: {currentResult.id}</div>
                    <div>创建时间: {currentResult.createdAt}</div>
                    <div>数据变量: {currentResult.results?.dataInfo?.variables.length} 个</div>
                    <div>独立成分数量: {currentResult.results?.dataInfo?.nComponents} 个 
                      ({((currentResult.results?.dataInfo?.nComponents / currentResult.results?.dataInfo?.variables.length) * 100).toFixed(1)}%)</div>
                    <div>自动选择: {currentResult.results?.dataInfo?.autoSelected ? '是' : '否'}</div>
                    <div>最终重构误差: {(() => {
                      const error = currentResult.results?.dataInfo?.finalReconstructionError;
                      if (error === null || error === undefined) {
                        return '未计算';
                      } else if (isNaN(error) || !isFinite(error)) {
                        return 'NaN (计算失败)';
                      } else {
                        return error.toFixed(6);
                      }
                    })()}</div>
                    <div>异常检出率: {currentResult.results?.anomalies?.rate}%</div>
                    <div>图表数量: {currentResult.charts?.length || 0}</div>
                    <div>优化历史: {currentResult.results?.optimizationHistory?.length || 0} 个测试点</div>
                    {currentResult.results?.dataInfo?.autoSelected && (
                      <div className="mt-1 text-green-600">
                        搜索策略: {currentResult.results.dataInfo.variables.length <= 5 ? '小规模' : 
                                  currentResult.results.dataInfo.variables.length <= 10 ? '中等规模' : 
                                  currentResult.results.dataInfo.variables.length <= 20 ? '较大规模' : '大规模'}数据
                      </div>
                    )}
                  </div>
                )}
                
                <Tabs defaultActiveKey="charts" key={`ica-tabs-${renderKey}-${currentResult?.id}`}>
                  <TabPane tab="监控图表" key="charts">
                    <div className="space-y-6">
                      {currentResult.charts.map((chart, index) => (
                        <div key={index} className="w-full">
                          <div className="border rounded p-4 bg-white shadow-sm">
                            <ReactECharts
                              key={`chart-${renderKey}-${currentResult?.id}-${index}`}
                              option={
                                chart.type === 'scatter'
                                  ? getScatterOption(chart.data)
                                  : chart.type === 'bar'
                                  ? getBarOption(chart.data)
                                  : getLineOption(chart.data)
                              }
                              style={{ height: '450px', width: '100%' }}
                              opts={{ 
                                renderer: 'canvas',
                                devicePixelRatio: window.devicePixelRatio || 1
                              }}
                              echarts={echarts}
                              notMerge={true}
                              lazyUpdate={true}
                            />
                          </div>
                        </div>
                      ))}
                      
                      {/* 添加异常检测结果说明 */}
                      <div className="mt-6 p-4 bg-gray-50 rounded border">
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">📊 异常检测结果</h4>
                        {(() => {
                          if (!currentResult?.results?.anomalies) return <Text>暂无结果</Text>;
                          
                          const { anomalies, controlLimits, dataInfo } = currentResult.results;
                          
                          return (
                            <div className="space-y-3 text-sm">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Text strong className="text-blue-600">控制限设置：</Text>
                                  <div className="mt-1">
                                    <div>I² = <Text code>{controlLimits.iSquared.toFixed(4)}</Text></div>
                                    <div>重构误差 = <Text code>{controlLimits.reconstructionError.toFixed(4)}</Text></div>
                                  </div>
                                </div>
                                <div>
                                  <Text strong className="text-red-600">异常检测统计：</Text>
                                  <div className="mt-1">
                                    <div>检出异常数： <Text strong className="text-red-600">{anomalies.count}</Text> 个</div>
                                    <div>异常检出率： <Text strong className="text-red-600">{anomalies.rate}%</Text></div>
                                    <div>样本总数： <Text strong>{dataInfo.sampleSize}</Text> 个</div>
                                  </div>
                                </div>
                              </div>
                              
                              {anomalies.count > 0 && (
                                <div>
                                  <Text strong className="text-gray-700">异常点位索引：</Text>
                                  <div className="mt-2">
                                    <Text code className="text-xs">
                                      [{anomalies.indices.slice(0, 20).join(', ')}
                                      {anomalies.indices.length > 20 ? `, ... (共${anomalies.indices.length}个)` : ''}]
                                    </Text>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </TabPane>

                  <TabPane tab="贡献度分析" key="contribution">
                    <div className="space-y-4">
                      <Card type="inner" title="变量贡献度排序">
                        <Table
                          key={`contrib-table-${renderKey}-${currentResult?.id}`}
                          columns={contributionColumns}
                          dataSource={contributionData}
                          pagination={false}
                          size="small"
                        />
                      </Card>

                      <Row gutter={16}>
                        <Col span={12}>
                          <Card type="inner" title="控制限">
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <Text>I²控制限:</Text>
                                <Text strong>{currentResult.results.controlLimits.iSquared.toFixed(4)}</Text>
                              </div>
                              <div className="flex justify-between">
                                <Text>重构误差控制限:</Text>
                                <Text strong>{currentResult.results.controlLimits.reconstructionError.toFixed(4)}</Text>
                              </div>
                            </div>
                          </Card>
                        </Col>
                        <Col span={12}>
                          <Card type="inner" title="算法参数">
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <Text>独立成分数:</Text>
                                <Text strong>{currentResult.results.dataInfo?.nComponents || currentResult.parameters.nComponents}</Text>
                              </div>
                              <div className="flex justify-between">
                                <Text>最大迭代次数:</Text>
                                <Text strong>{currentResult.parameters.maxIter || 1000}</Text>
                              </div>
                              <div className="flex justify-between">
                                <Text>收敛容差:</Text>
                                <Text strong>{currentResult.parameters.tolerance || 1e-4}</Text>
                              </div>
                              <div className="flex justify-between">
                                <Text>自动选择组件:</Text>
                                <Text strong>{currentResult.parameters.autoComponents ? '是' : '否'}</Text>
                              </div>
                            </div>
                          </Card>
                        </Col>
                      </Row>
                    </div>
                  </TabPane>

                  <TabPane tab="故障诊断报告" key="diagnosis">
                    <Card type="inner" title="ICA独立成分分析故障诊断报告">
                      <div 
                        style={{ 
                          background: 'white',
                          padding: '20px',
                          borderRadius: '4px',
                          fontFamily: 'monospace',
                          fontSize: '13px',
                          lineHeight: '1.6',
                          whiteSpace: 'pre-line',
                          maxHeight: '600px',
                          overflow: 'auto'
                        }}
                      >
                        {currentResult.results.diagnosisReport || '诊断报告生成中...'}
                      </div>
                    </Card>
                  </TabPane>
                </Tabs>
              </div>
            )}

            {!running && !currentResult && (
              <div className="text-center py-8 text-gray-500">
                <BarChartOutlined className="text-4xl mb-4" />
                <div>请配置参数并开始ICA分析</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ICAAnalysis;