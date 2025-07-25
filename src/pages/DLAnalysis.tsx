import React, { useState, useEffect, useRef } from 'react';
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
  Progress,
  Tabs,
  message,
  Spin,
  Alert,
  Statistic,
  Table,
  Tooltip,
  Badge,
  Switch,
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  DownloadOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  SyncOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { updateConfig, setCurrentResult } from '../store/slices/analysisSlice';
import { addResult, updateResult } from '../store/slices/analysisSlice';
import type { AnalysisResult } from '../store/slices/analysisSlice';
import { 
  trainDLModel, 
  predictAnomalies,
  extractNumericData,
  type DLResults,
  type ProgressCallback,
  type DLConfig 
} from '../utils/deepLearning';
import { exportChartDataToCSV } from '../utils/exportUtils';
import { useAutoUpload } from '../hooks/useAutoUpload';

const { Title, Text, Paragraph } = Typography;
const { TabPane } = Tabs;
const { Option } = Select;

interface ProgressMessage {
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface AnomalyPoint {
  index: number;
  error: number;
  timestamp: string;
}

// 计算百分比并返回整数
const calculatePercentageInt = (value: number): number => {
  return Math.round(value * 100);
};

const DLAnalysis: React.FC = () => {
  const [form] = Form.useForm();
  const [running, setRunning] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const [progressMessages, setProgressMessages] = useState<ProgressMessage[]>([]);
  const [dlResults, setDlResults] = useState<DLResults | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [realTimeDetection, setRealTimeDetection] = useState(true);
  const [realtimeData, setRealtimeData] = useState<{
    errors: number[];
    anomalies: AnomalyPoint[];
    currentIndex: number;
  }>({ errors: [], anomalies: [], currentIndex: 0 });
  
  const realtimeTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dispatch = useAppDispatch();
  const { files } = useAppSelector((state) => state.data);
  const { config } = useAppSelector((state) => state.analysis);

  // 自动加载数据
  const { autoUploadCompleted, isLoading } = useAutoUpload();

  // 清理资源
  useEffect(() => {
    return () => {
      if (dlResults?.model) {
        dlResults.model.dispose();
      }
      if (abortController) {
        abortController.abort();
      }
      if (realtimeTimerRef.current) {
        clearInterval(realtimeTimerRef.current);
      }
    };
  }, [dlResults, abortController]);



  // 添加进度消息
  const addProgressMessage = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    const newMessage: ProgressMessage = {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type
    };
    setProgressMessages(prev => [...prev.slice(-9), newMessage]); // 保留最近10条消息
  };

  const handleAnalysis = async (values: any) => {
    if (!values.dataFile) {
      message.error('请选择数据文件');
      return;
    }

    try {
      setRunning(true);
      setProgress(0);
      setProgressMessages([]);
      setDlResults(null);

      // 创建中止控制器
      const controller = new AbortController();
      setAbortController(controller);

      // 保存配置
      dispatch(updateConfig({ type: 'dl', config: values }));

      // 添加分析结果
      const result: AnalysisResult = {
        id: Date.now().toString(),
        type: 'dl',
        name: `深度学习分析_${new Date().toLocaleString()}`,
        dataFileId: values.dataFile,
        parameters: values,
        results: {},
        charts: [],
        status: 'running',
        progress: 0,
        createdAt: new Date().toISOString(),
      };

      dispatch(addResult(result));
      setCurrentResult(result);

      addProgressMessage('开始深度学习分析...', 'info');

      // 获取选择的数据文件
      const selectedFile = files.find(f => f.id === values.dataFile);
      if (!selectedFile || !selectedFile.rawData) {
        throw new Error('数据文件不存在或未解析');
      }

      addProgressMessage('提取数值数据...', 'info');
      const numericData = extractNumericData(selectedFile.rawData);
      
      addProgressMessage(`数据准备完成: ${numericData.length}行 × ${numericData[0].length}列`, 'success');

      // 构建模型配置
      const dlConfig: DLConfig = {
        inputDim: numericData[0].length, // 将在训练时更新
        embedDim: values.embedDim || 16,
        numHeads: values.numHeads || 2,
        numLayers: values.numLayers || 3,
        hiddenDim: values.hiddenDim || 32,
        dropout: values.dropout || 0.1,
        epochs: values.epochs || 200,
        batchSize: values.batchSize || 16,
        patience: values.patience || 20,
        variancePercentile: values.variancePercentile || 1
      };

      // 进度回调
      const onProgress: ProgressCallback = (epoch, trainLoss, valLoss) => {
        const progressPercent = Math.min(90, Math.round((epoch / dlConfig.epochs) * 90));
        setProgress(progressPercent);
        
        dispatch(updateResult({
          id: result.id,
          updates: { progress: progressPercent },
        }));

        if (epoch % 10 === 0 || epoch <= 5) {
          const formattedTrainLoss = trainLoss < 0.001 ? trainLoss.toExponential(3) : trainLoss.toFixed(3);
          const formattedValLoss = valLoss < 0.001 ? valLoss.toExponential(3) : valLoss.toFixed(3);
          addProgressMessage(
            `Epoch ${epoch}/${dlConfig.epochs}: 训练损失=${formattedTrainLoss}, 验证损失=${formattedValLoss}`,
            'info'
          );
        }
      };

      addProgressMessage('开始训练RATransformer模型...', 'info');

      // 训练模型
      const results = await trainDLModel(
        numericData,
        dlConfig,
        onProgress,
        controller.signal
      );

      setDlResults(results);
      setProgress(95);

      addProgressMessage('模型训练完成，正在生成结果...', 'success');

      // 生成图表数据
      const charts = [
        {
          type: 'line',
          data: {
            title: '训练损失曲线',
            epochs: Array.from({ length: results.trainLosses.length }, (_, i) => i + 1),
            trainLosses: results.trainLosses,
            valLosses: results.valLosses,
            metric: 'loss'
          }
        },
        {
          type: 'bar',
          data: {
            title: '特征重要性分析',
            features: results.featureImportance.map(f => `特征${f.index + 1}`),
            importance: results.featureImportance.map(f => f.importance),
          }
        }
      ];

      if (results.testResults) {
        charts.push({
          type: 'scatter',
          data: {
            title: '异常检测结果',
            errors: results.testResults.errors,
            threshold: results.threshold,
            anomalies: results.testResults.anomalies
          }
        });
      }

      // 更新结果
      const finalResults = {
        trainLosses: results.trainLosses,
        valLosses: results.valLosses,
        threshold: results.threshold,
        featureImportance: results.featureImportance,
        selectedFeatures: results.selectedFeatures,
        modelSummary: {
          totalFeatures: numericData[0].length,
          selectedFeatures: results.selectedFeatures.length,
          trainSamples: Math.floor(numericData.length * 0.8 * 0.8),
          valSamples: Math.floor(numericData.length * 0.8 * 0.2),
          testSamples: Math.floor(numericData.length * 0.2),
          finalTrainLoss: results.trainLosses[results.trainLosses.length - 1],
          finalValLoss: results.valLosses[results.valLosses.length - 1],
          epochs: results.trainLosses.length
        },
        testResults: results.testResults
      };

      const completedResult: AnalysisResult = {
        ...result,
        status: 'completed',
        results: finalResults,
        charts,
        progress: 100,
        completedAt: new Date().toISOString(),
      };

      dispatch(updateResult({
        id: result.id,
        updates: {
          status: 'completed',
          results: finalResults,
          charts,
          progress: 100,
          completedAt: new Date().toISOString(),
        },
      }));

      // 同时更新currentResult状态
      setCurrentResult(completedResult);

      setProgress(100);
      addProgressMessage('深度学习分析完成！', 'success');
      message.success('深度学习分析完成！');
      
      // 训练完成后自动进行异常检测
      setTimeout(() => {
        handlePredict();
      }, 500);

    } catch (error: any) {
      console.error('分析错误:', error);
      const errorMessage = error.message || '分析过程中发生未知错误';
      
      addProgressMessage(`分析失败: ${errorMessage}`, 'error');
      message.error(`分析失败: ${errorMessage}`);
      
      if (currentResult) {
        const failedResult: AnalysisResult = {
          ...currentResult,
          status: 'failed',
          error: errorMessage,
        };

        dispatch(updateResult({
          id: currentResult.id,
          updates: {
            status: 'failed',
            error: errorMessage,
          },
        }));

        // 同时更新currentResult状态
        setCurrentResult(failedResult);
      }
    } finally {
      setRunning(false);
      setAbortController(null);
    }
  };

  const handlePredict = async () => {
    if (!dlResults) {
      message.error('请先训练模型');
      return;
    }

    if (!currentResult?.dataFileId) {
      message.error('没有数据文件');
      return;
    }

    try {
      setPredicting(true);
      addProgressMessage('开始异常检测预测...', 'info');

      const selectedFile = files.find(f => f.id === currentResult.dataFileId);
      if (!selectedFile?.rawData) {
        throw new Error('数据文件不存在');
      }

      const numericData = extractNumericData(selectedFile.rawData);
      
      const predictionResults = await predictAnomalies(
        dlResults.model,
        numericData,
        dlResults.scaler,
        dlResults.selectedFeatures,
        dlResults.threshold
      );

      // 准备实时检测数据
      const anomalyPoints: AnomalyPoint[] = [];
      predictionResults.errors.forEach((error, index) => {
        if (predictionResults.anomalies[index]) {
          anomalyPoints.push({
            index,
            error,
            timestamp: new Date(Date.now() + index * 1000).toLocaleTimeString()
          });
        }
      });

      setRealtimeData({
        errors: predictionResults.errors,
        anomalies: anomalyPoints,
        currentIndex: 0
      });

      addProgressMessage(
        `检测完成: 发现${anomalyPoints.length}个异常点 (共${predictionResults.errors.length}个样本)`,
        anomalyPoints.length > 0 ? 'warning' : 'success'
      );

      message.success('异常检测完成');
      
      // 异常检测完成后，如果实时检测开关已开启，自动开始实时检测演示
      if (realTimeDetection && predictionResults.errors.length > 0) {
        setTimeout(() => {
          startRealTimeDetection();
        }, 1000);
      }

    } catch (error: any) {
      console.error('预测错误:', error);
      addProgressMessage(`预测失败: ${error.message}`, 'error');
      message.error(`预测失败: ${error.message}`);
    } finally {
      setPredicting(false);
    }
  };

  const startRealTimeDetection = () => {
    if (!realtimeData.errors.length) {
      message.error('请先进行异常检测');
      return;
    }

    setRealTimeDetection(true);
    setRealtimeData(prev => ({ ...prev, currentIndex: 0 }));

    realtimeTimerRef.current = setInterval(() => {
      setRealtimeData(prev => {
        if (prev.currentIndex >= prev.errors.length - 1) {
          setRealTimeDetection(false);
          if (realtimeTimerRef.current) {
            clearInterval(realtimeTimerRef.current);
          }
          addProgressMessage('实时检测演示完成', 'success');
          return prev;
        }
        return { ...prev, currentIndex: prev.currentIndex + 1 };
      });
    }, 100);
  };

  const stopRealTimeDetection = () => {
    setRealTimeDetection(false);
    if (realtimeTimerRef.current) {
      clearInterval(realtimeTimerRef.current);
    }
  };

  // 图表配置
  const getLossChartOption = (chartData: any) => ({
    title: {
      text: chartData.title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const epoch = params[0].axisValue;
        let result = `Epoch ${epoch}<br/>`;
        params.forEach((param: any) => {
          result += `${param.seriesName}: ${param.value.toFixed(6)}<br/>`;
        });
        return result;
      }
    },
    legend: {
      data: ['训练损失', '验证损失'],
      top: 35
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.epochs,
      name: 'Epoch',
      nameLocation: 'middle',
      nameGap: 30
    },
    yAxis: {
      type: 'value',
      name: '损失值',
      nameLocation: 'middle',
      nameGap: 50,
      scale: true
    },
    series: [
      {
        name: '训练损失',
        type: 'line',
        data: chartData.trainLosses,
        smooth: true,
        itemStyle: { color: '#1890ff' },
        lineStyle: { width: 2 }
      },
      {
        name: '验证损失',
        type: 'line',
        data: chartData.valLosses,
        smooth: true,
        itemStyle: { color: '#52c41a' },
        lineStyle: { width: 2 }
      }
    ]
  });

  const getFeatureImportanceOption = (chartData: any) => ({
    title: {
      text: chartData.title,
      left: 'center',
      textStyle: { fontSize: 16, fontWeight: 'bold' }
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const feature = params[0].axisValue;
        const importance = params[0].value;
        return `${feature}<br/>重要性: ${importance.toFixed(6)}`;
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: chartData.features,
      name: '特征',
      nameLocation: 'middle',
      nameGap: 30,
      axisLabel: {
        rotate: 45
      }
    },
    yAxis: {
      type: 'value',
      name: '重要性分数',
      nameLocation: 'middle',
      nameGap: 50
    },
    series: [
      {
        name: '重要性',
        type: 'bar',
        data: chartData.importance,
        itemStyle: { 
          color: new Array(chartData.importance.length).fill(0).map((_, i) => {
            const colors = ['#722ed1', '#13c2c2', '#52c41a', '#faad14', '#f5222d'];
            return colors[i % colors.length];
          })
        }
      }
    ]
  });

  const getRealtimeDetectionOption = () => {
    // 如果实时检测正在运行，显示到当前索引；否则显示所有数据
    const endIndex = realTimeDetection ? realtimeData.currentIndex + 1 : realtimeData.errors.length;
    const currentErrors = realtimeData.errors.slice(0, endIndex);
    // 横轴显示样本编号，从1开始
    const currentIndices = Array.from({ length: currentErrors.length }, (_, i) => i + 1);
    
    const anomalyData = realtimeData.anomalies
      .filter(a => a.index < endIndex)
      .map(a => [a.index + 1, a.error]); // 异常点的横轴也要从1开始

    return {
      title: {
        text: '实时异常检测',
        left: 'center',
        textStyle: { fontSize: 16, fontWeight: 'bold' }
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const index = params[0].axisValue;
          const error = params[0].value;
          const isAnomaly = error > dlResults?.threshold;
          // 智能格式化数值：如果数值很小，显示科学计数法；否则显示3位小数
          const formattedError = error < 0.001 ? error?.toExponential(3) : error?.toFixed(3);
          return `样本 ${index}<br/>重构误差: ${formattedError}<br/>状态: ${isAnomaly ? '异常' : '正常'}`;
        }
      },
      legend: {
        data: ['重构误差', '控制限', '异常点'],
        top: 35
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        top: '15%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: currentIndices,
        name: '样本编号',
        nameLocation: 'middle',
        nameGap: 30
      },
      yAxis: {
        type: 'value',
        name: '重构误差',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: {
          formatter: (value: number) => {
            if (value === 0) return '0';
            if (value < 0.001) return value.toExponential(1);
            return value.toFixed(3);
          }
        }
      },
      series: [
        {
          name: '重构误差',
          type: 'line',
          data: currentErrors,
          itemStyle: { color: '#1890ff' },
          lineStyle: { width: 1 },
          symbol: 'circle',
          symbolSize: 4
        },
        {
          name: '控制限',
          type: 'line',
          data: new Array(currentErrors.length).fill(dlResults?.threshold),
          itemStyle: { color: '#f5222d' },
          lineStyle: { type: 'dashed', width: 2 },
          symbol: 'none'
        },
        {
          name: '异常点',
          type: 'scatter',
          data: anomalyData,
          itemStyle: { color: '#ff4d4f' },
          symbolSize: 8,
          symbol: 'diamond'
        }
      ]
    };
  };

  const stopTraining = () => {
    if (abortController) {
      abortController.abort();
      addProgressMessage('用户取消训练', 'warning');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Title level={3}>深度学习检测</Title>
        <Space>
          <Button icon={<DownloadOutlined />}>导出结果</Button>
          <Button type="primary" icon={<BarChartOutlined />}>查看历史</Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col span={8}>
          <Card title="模型配置" className="h-full">
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                epochs: 200,
                batchSize: 16,
                embedDim: 16,
                numHeads: 2,
                numLayers: 3,
                hiddenDim: 32,
                dropout: 0.1,
                patience: 20,
                variancePercentile: 1,
                ...config.dl
              }}
              onFinish={handleAnalysis}
            >
              <Form.Item
                name="dataFile"
                label="选择数据文件"
                rules={[{ required: true, message: '请选择数据文件' }]}
              >
                <Select placeholder="选择数据文件">
                  {files.filter(f => f.status === 'success' && f.rawData).map(file => (
                    <Option key={file.id} value={file.id}>
                      {file.name} ({file.rowCount} 行 × {file.columnCount} 列)
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item name="epochs" label="训练轮数">
                    <InputNumber
                      min={1}
                      max={1000}
                      className="w-full"
                      placeholder="200"
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="batchSize" label="批次大小">
                    <InputNumber
                      min={1}
                      max={128}
                      className="w-full"
                      placeholder="16"
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item name="embedDim" label="嵌入维度">
                    <InputNumber
                      min={8}
                      max={128}
                      className="w-full"
                      placeholder="16"
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="numHeads" label="注意力头数">
                    <InputNumber
                      min={1}
                      max={8}
                      className="w-full"
                      placeholder="2"
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Row gutter={8}>
                <Col span={12}>
                  <Form.Item name="numLayers" label="网络层数">
                    <InputNumber
                      min={1}
                      max={12}
                      className="w-full"
                      placeholder="3"
                    />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="hiddenDim" label="隐藏层维度">
                    <InputNumber
                      min={16}
                      max={512}
                      className="w-full"
                      placeholder="32"
                    />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item>
                <Space className="w-full" direction="vertical">
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={running}
                    icon={<PlayCircleOutlined />}
                    disabled={running}
                    className="w-full"
                  >
                    训练模型
                  </Button>
                  <Button
                    danger
                    icon={<StopOutlined />}
                    disabled={!running}
                    onClick={stopTraining}
                    className="w-full"
                  >
                    停止训练
                  </Button>
                </Space>
              </Form.Item>

              {dlResults && (
                <Form.Item>
                  <Space className="w-full" direction="vertical">
                    <Button
                      type="default"
                      loading={predicting}
                      icon={<SyncOutlined />}
                      disabled={predicting || running}
                      onClick={handlePredict}
                      className="w-full"
                    >
                      检测异常
                    </Button>
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={realTimeDetection}
                        onChange={(checked) => {
                          if (checked) {
                            startRealTimeDetection();
                          } else {
                            stopRealTimeDetection();
                          }
                        }}
                        disabled={!realtimeData.errors.length}
                      />
                      <Text className="text-sm">实时检测演示</Text>
                    </div>
                  </Space>
                </Form.Item>
              )}
            </Form>


          </Card>
        </Col>

        <Col span={16}>
          <Card title="分析结果" className="h-full">

            {/* 进度条和状态 */}
            {running && (
              <div className="mb-4">
                <Progress 
                  percent={Math.round(progress)} 
                  status={progress === 100 ? 'success' : 'active'}
                  strokeColor={{
                    '0%': '#108ee9',
                    '100%': '#87d068',
                  }}
                  format={(percent) => `${Math.round(percent || 0)}%`}
                />
                <div className="mt-3 max-h-32 overflow-y-auto">
                  {progressMessages.slice(-3).map((msg, index) => (
                    <div key={index} className="text-xs text-gray-600 mb-1">
                      <Badge 
                        status={msg.type === 'error' ? 'error' : msg.type === 'success' ? 'success' : 'processing'}
                        text={`${msg.timestamp}: ${msg.message}`}
                      />
                    </div>
                  ))}
                </div>
                <div className="text-center py-8">
                  <Spin size="large" />
                  <div className="mt-4">
                    <Text>正在训练RATransformer模型...</Text>
                    <div className="mt-2">
                      <Text type="secondary">
                        {progressMessages.length > 0 && progressMessages[progressMessages.length - 1].message}
                      </Text>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {!running && currentResult && currentResult.status === 'completed' && (
              <Tabs defaultActiveKey="training">
                <TabPane tab="训练结果" key="training">
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <ReactECharts
                        option={getLossChartOption(currentResult.charts[0].data)}
                        style={{ height: '300px' }}
                      />
                    </Col>
                  </Row>
                  
                  <Row gutter={16} className="mt-4">
                    <Col span={8}>
                      <Card type="inner" title="模型统计">
                        <Statistic 
                          title="总特征数" 
                          value={currentResult.results.modelSummary.totalFeatures} 
                          prefix={<InfoCircleOutlined />}
                        />
                        <Statistic 
                          title="选择特征数" 
                          value={currentResult.results.modelSummary.selectedFeatures} 
                          prefix={<CheckCircleOutlined />}
                          className="mt-2"
                        />
                        <Statistic 
                          title="训练样本" 
                          value={currentResult.results.modelSummary.trainSamples} 
                          className="mt-2"
                        />
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card type="inner" title="训练指标">
                        <Statistic 
                          title="训练轮数" 
                          value={currentResult.results.modelSummary.epochs} 
                          suffix="epochs"
                        />
                        <Statistic 
                          title="最终训练损失" 
                          value={currentResult.results.modelSummary.finalTrainLoss < 0.001 ? currentResult.results.modelSummary.finalTrainLoss.toExponential(3) : currentResult.results.modelSummary.finalTrainLoss.toFixed(3)} 
                          className="mt-2"
                        />
                        <Statistic 
                          title="最终验证损失" 
                          value={currentResult.results.modelSummary.finalValLoss < 0.001 ? currentResult.results.modelSummary.finalValLoss.toExponential(3) : currentResult.results.modelSummary.finalValLoss.toFixed(3)} 
                          className="mt-2"
                        />
                      </Card>
                    </Col>
                    <Col span={8}>
                      <Card type="inner" title="检测配置">
                        <Statistic 
                          title="控制限" 
                          value={currentResult.results.threshold < 0.001 ? currentResult.results.threshold.toExponential(3) : currentResult.results.threshold.toFixed(3)} 
                          prefix={<ExclamationCircleOutlined />}
                        />
                        {currentResult.results.testResults && (
                          <Statistic 
                            title="测试准确率" 
                            value={calculatePercentageInt(currentResult.results.testResults.accuracy)} 
                            suffix="%"
                            className="mt-2"
                          />
                        )}
                      </Card>
                    </Col>
                  </Row>
                </TabPane>

                <TabPane tab="特征分析" key="features">
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <ReactECharts
                        option={getFeatureImportanceOption(currentResult.charts[1].data)}
                        style={{ height: '400px' }}
                      />
                    </Col>
                  </Row>
                  
                  <Card type="inner" title="特征重要性排序" className="mt-4">
                    <Table
                      size="small"
                      dataSource={currentResult.results.featureImportance.slice(0, 10)}
                      pagination={false}
                      columns={[
                        {
                          title: '排名',
                          key: 'rank',
                          render: (_, __, index) => index + 1,
                          width: 60
                        },
                        {
                          title: '特征索引',
                          dataIndex: 'index',
                          render: (index) => `特征${index + 1}`
                        },
                        {
                          title: '重要性分数',
                          dataIndex: 'importance',
                          render: (importance) => importance < 0.001 ? importance.toExponential(3) : importance.toFixed(3)
                        }
                      ]}
                    />
                  </Card>
                </TabPane>

                <TabPane tab="异常检测" key="detection">
                  {realTimeDetection || realtimeData.errors.length > 0 ? (
                    <div>
                      <Row gutter={[16, 16]}>
                        <Col span={24}>
                          <ReactECharts
                            option={getRealtimeDetectionOption()}
                            style={{ height: '400px' }}
                          />
                        </Col>
                      </Row>
                      
                      <Row gutter={16} className="mt-4">
                        <Col span={12}>
                          <Card type="inner" title="检测统计">
                            <Statistic 
                              title="总样本数" 
                              value={realtimeData.errors.length} 
                            />
                            <Statistic 
                              title="异常样本数" 
                              value={realtimeData.anomalies.length} 
                              valueStyle={{ color: realtimeData.anomalies.length > 0 ? '#cf1322' : '#3f8600' }}
                              className="mt-2"
                            />
                            <Statistic 
                              title="异常率" 
                              value={realtimeData.errors.length > 0 ? calculatePercentageInt(realtimeData.anomalies.length / realtimeData.errors.length) : 0} 
                              suffix="%"
                              valueStyle={{ color: realtimeData.anomalies.length > 0 ? '#cf1322' : '#3f8600' }}
                              className="mt-2"
                            />
                          </Card>
                        </Col>
                        <Col span={12}>
                          <Card type="inner" title="当前状态">
                            <Statistic 
                              title="当前样本" 
                              value={realTimeDetection ? realtimeData.currentIndex + 1 : realtimeData.errors.length} 
                              suffix={`/ ${realtimeData.errors.length}`}
                            />
                            {realTimeDetection && (
                              <div className="mt-2">
                                <Badge status="processing" text="实时检测中..." />
                              </div>
                            )}
                          </Card>
                        </Col>
                      </Row>

                      {realtimeData.anomalies.length > 0 && (
                        <Card type="inner" title="异常点详情" className="mt-4">
                          <Table
                            size="small"
                            dataSource={realtimeData.anomalies.slice(0, 10)}
                            pagination={false}
                            columns={[
                              {
                                title: '样本编号',
                                dataIndex: 'index',
                                width: 100
                              },
                              {
                                title: '重构误差',
                                dataIndex: 'error',
                                render: (error) => error < 0.001 ? error.toExponential(3) : error.toFixed(3)
                              },
                              {
                                title: '严重程度',
                                dataIndex: 'error',
                                render: (error) => {
                                  const severity = error / (dlResults?.threshold || 1);
                                  if (severity > 3) return <Badge status="error" text="严重" />;
                                  if (severity > 2) return <Badge status="warning" text="中等" />;
                                  return <Badge status="default" text="轻微" />;
                                }
                              }
                            ]}
                          />
                        </Card>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <ThunderboltOutlined className="text-4xl mb-4" />
                      <div>请先训练模型并进行异常检测</div>
                    </div>
                  )}
                </TabPane>

                <TabPane tab="训练日志" key="logs">
                  <Card type="inner" title="训练过程日志">
                    <div className="max-h-96 overflow-y-auto">
                      {progressMessages.map((msg, index) => (
                        <div key={index} className="mb-2 p-2 rounded" style={{
                          backgroundColor: msg.type === 'error' ? '#fff2f0' : 
                                         msg.type === 'success' ? '#f6ffed' : 
                                         msg.type === 'warning' ? '#fffbf0' : '#f0f9ff'
                        }}>
                          <div className="flex items-center space-x-2">
                            <Badge 
                              status={msg.type === 'error' ? 'error' : 
                                     msg.type === 'success' ? 'success' : 
                                     msg.type === 'warning' ? 'warning' : 'processing'} 
                            />
                            <Text className="text-xs text-gray-500">{msg.timestamp}</Text>
                          </div>
                          <Text className="text-sm">{msg.message}</Text>
                        </div>
                      ))}
                    </div>
                  </Card>
                </TabPane>
              </Tabs>
            )}

            {!running && !currentResult && (
              <div className="text-center py-8 text-gray-500">
                <BarChartOutlined className="text-4xl mb-4" />
                <div>请配置模型参数并开始训练</div>
                <Paragraph className="mt-4 text-sm">
                  基于RATransformer的深度学习异常检测模型，支持：
                  <br />• 自动特征选择和数据预处理
                  <br />• 多头自注意力机制
                  <br />• 实时训练监控和早停
                  <br />• 智能异常检测和可视化
                </Paragraph>
              </div>
            )}

            {currentResult && currentResult.status === 'failed' && (
              <Alert
                type="error"
                message="分析失败"
                description={currentResult.error}
                showIcon
                className="mb-4"
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DLAnalysis;