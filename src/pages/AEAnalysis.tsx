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
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { updateConfig } from '../store/slices/analysisSlice';
import { addResult, updateResult } from '../store/slices/analysisSlice';
import type { AnalysisResult } from '../store/slices/analysisSlice';
// 替换原来的后端API导入
import { 
  runFaultDetection, 
  type AEResults,
  type ProgressCallback 
} from '../utils/autoEncoder';
import { exportChartDataToCSV } from '../utils/exportUtils';
import { useAutoUpload } from '../hooks/useAutoUpload';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface ProgressMessage {
  timestamp: string;
  message: string;
}

// 从ParsedData中提取数值数据
const extractNumericData = (parsedData: any): number[][] => {
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
};

const AEAnalysis: React.FC = () => {
  const [form] = Form.useForm();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const [progressMessages, setProgressMessages] = useState<ProgressMessage[]>([]);
  const [aeResults, setAeResults] = useState<AEResults | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  
  const dispatch = useAppDispatch();
  const { files } = useAppSelector((state) => state.data);
  const { config } = useAppSelector((state) => state.analysis);

  // 自动加载数据
  const { autoUploadCompleted, isLoading } = useAutoUpload();

  // 清理资源
  useEffect(() => {
    return () => {
      if (aeResults?.analyzer) {
        aeResults.analyzer.dispose();
      }
      if (abortController) {
        abortController.abort();
      }
    };
  }, [aeResults, abortController]);

  const handleAnalysis = async (values: any) => {
    if (!values.dataFile) {
      message.error('请选择数据文件');
      return;
    }

    try {
      setRunning(true);
      setProgress(0);
      setProgressMessages([]);
      setAeResults(null);

      // 创建中止控制器
      const controller = new AbortController();
      setAbortController(controller);

      // 更新配置
      dispatch(updateConfig({ type: 'ae', config: values }));

      // 获取选中的数据文件
      const selectedFile = files.find(f => f.id === values.dataFile);
      if (!selectedFile?.rawData) {
        message.error('选中的文件没有可用数据');
        setRunning(false);
        return;
      }

      // 创建分析记录
      const result: AnalysisResult = {
        id: Date.now().toString(),
        type: 'ae',
        name: `自动编码器分析_${new Date().toLocaleString()}`,
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

      message.success('AE分析任务已启动，正在处理...');

      // 进度回调函数
      const progressCallback: ProgressCallback = (message: string) => {
        const progressMsg: ProgressMessage = {
          timestamp: new Date().toISOString(),
          message
        };
        
        setProgressMessages(prev => [...prev, progressMsg]);
        
        // 根据消息内容估算进度
        let estimatedProgress = 0;
        if (message.includes('📁')) {
          estimatedProgress = 5;
        } else if (message.includes('🔄')) {
          estimatedProgress = 10;
        } else if (message.includes('🚀')) {
          estimatedProgress = 15;
        } else if (message.includes('训练轮次')) {
          const match = message.match(/训练轮次 (\d+)\/(\d+)/);
          if (match) {
            const currentEpoch = parseInt(match[1]);
            const totalEpochs = parseInt(match[2]);
            estimatedProgress = Math.min(90, (currentEpoch / totalEpochs) * 70 + 15);
          }
        } else if (message.includes('📊')) {
          estimatedProgress = 95;
        } else if (message.includes('🎉')) {
          estimatedProgress = 100;
        }
        
        setProgress(estimatedProgress);
        dispatch(updateResult({
          id: result.id,
          updates: { progress: estimatedProgress },
        }));
      };

      // 从ParsedData中提取数值数据
      const numericData = extractNumericData(selectedFile.rawData);
      
      // 启动分析
      const analysisResults = await runFaultDetection(
        numericData,
        progressCallback,
        values.epochs || 150
      );
      
      if (analysisResults && !controller.signal.aborted) {
        
        setAeResults(analysisResults);

        // 生成图表数据
        const charts = generateCharts(analysisResults);
        
        // 创建完全可序列化的结果对象（深度复制，移除所有函数和对象引用）
        const serializableResults = {
          data: JSON.parse(JSON.stringify(analysisResults.data)),
          X_train: JSON.parse(JSON.stringify(analysisResults.X_train)),
          X_test: JSON.parse(JSON.stringify(analysisResults.X_test)),
          re2_test: [...analysisResults.re2_test],
          spe_test: [...analysisResults.spe_test],
          re2_control_limit: Number(analysisResults.re2_control_limit),
          spe_control_limit: Number(analysisResults.spe_control_limit),
          re2_anomalies: {
            mask: [...analysisResults.re2_anomalies.mask],
            indices: [...analysisResults.re2_anomalies.indices],
            count: Number(analysisResults.re2_anomalies.count),
            percentage: Number(analysisResults.re2_anomalies.percentage)
          },
          spe_anomalies: {
            mask: [...analysisResults.spe_anomalies.mask],
            indices: [...analysisResults.spe_anomalies.indices],
            count: Number(analysisResults.spe_anomalies.count),
            percentage: Number(analysisResults.spe_anomalies.percentage)
          },
          train_losses: [...analysisResults.train_losses]
        };

        // 更新分析结果（只存储基本状态，不存储复杂数据）
        const updateData = {
          id: result.id,
          updates: {
            status: 'completed' as const,
            results: {
              // 只存储摘要信息
              summary: {
                re2_anomaly_count: analysisResults.re2_anomalies.count,
                spe_anomaly_count: analysisResults.spe_anomalies.count,
                re2_anomaly_percentage: analysisResults.re2_anomalies.percentage,
                spe_anomaly_percentage: analysisResults.spe_anomalies.percentage,
                final_loss: analysisResults.train_losses[analysisResults.train_losses.length - 1],
                sample_count: analysisResults.X_test.length
              }
            },
            charts,
            completedAt: new Date().toISOString(),
            progress: 100,
          },
        };
        
        dispatch(updateResult(updateData));
        
        // 同时更新本地状态
        setCurrentResult(prev => prev ? {
          ...prev,
          status: 'completed' as const,
          results: updateData.updates.results,
          charts,
          completedAt: updateData.updates.completedAt,
          progress: updateData.updates.progress,
        } : null);
        
        message.success('AE分析完成！');
      } else if (!controller.signal.aborted) {
        throw new Error('分析失败');
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        message.info('分析已取消');
      } else {
        console.error('AE分析失败:', error);
        message.error(error instanceof Error ? error.message : '分析失败');
      }
    } finally {
      setRunning(false);
      setAbortController(null);
    }
  };

  const generateCharts = (results: AEResults) => {
    const charts = [];

    // 训练损失曲线图
    if (results.train_losses.length > 0) {
      charts.push({
        type: 'line',
        data: {
          title: '自动编码器训练损失曲线',
          xData: Array.from({ length: results.train_losses.length }, (_, i) => i + 1),
          trainData: results.train_losses,
        },
      });
    }

    // RE²监控图
    if (results.re2_test.length > 0) {
      charts.push({
        type: 'scatter',
        data: {
          title: 'RE²异常检测监控图',
          xData: Array.from({ length: results.re2_test.length }, (_, i) => i + 1),
          yData: results.re2_test,
          controlLimit: results.re2_control_limit,
          anomalyIndices: results.re2_anomalies.indices,
        },
      });
    }

    // SPE监控图
    if (results.spe_test.length > 0) {
      charts.push({
        type: 'scatter',
        data: {
          title: 'SPE异常检测监控图',
          xData: Array.from({ length: results.spe_test.length }, (_, i) => i + 1),
          yData: results.spe_test,
          controlLimit: results.spe_control_limit,
          anomalyIndices: results.spe_anomalies.indices,
        },
      });
    }

    return charts;
  };

  const handleStopAnalysis = () => {
    if (abortController) {
      abortController.abort();
      message.info('分析任务已取消');
    }
    setRunning(false);
  };

  // 图表配置生成函数
  const getLossOption = (chartData: any) => ({
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
        return `Epoch ${params[0].axisValue}<br/>损失值: ${params[0].value.toFixed(6)}`;
      },
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: chartData.xData,
      name: 'Epoch',
      nameLocation: 'middle',
      nameGap: 30,
    },
    yAxis: {
      type: 'value',
      name: '损失值',
      nameLocation: 'middle',
      nameGap: 40,
      axisLabel: {
        formatter: (value: number) => value.toFixed(4),
      },
    },
    series: [
      {
        name: '训练损失',
        type: 'line',
        data: chartData.trainData,
        smooth: true,
        symbol: 'circle',
        symbolSize: 4,
        lineStyle: {
          width: 2,
        },
        itemStyle: {
          color: '#1890ff',
        },
      },
    ],
  });

  const getMonitoringOption = (chartData: any) => {
    const { yData, controlLimit, anomalyIndices = [] } = chartData;
    
    // 分离正常点和异常点
    const normalData = yData.map((val: number, idx: number) => 
      anomalyIndices.includes(idx) ? null : [idx + 1, val]
    ).filter((item: any) => item !== null);
    
    const anomalyData = anomalyIndices.map((idx: number) => [idx + 1, yData[idx]]);

    return {
      title: {
        text: chartData.title,
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold',
          color: '#1f1f1f'
        },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#d9d9d9',
        borderWidth: 1,
        textStyle: {
          color: '#333'
        },
        formatter: (params: any) => {
          const isAnomaly = params.seriesName === '异常点';
          const status = isAnomaly ? '<span style="color: #ff4d4f;">⚠️ 异常</span>' : '<span style="color: #52c41a;">✓ 正常</span>';
          return `样本 ${params.value[0]}<br/>${params.seriesName}: ${params.value[1].toFixed(4)}<br/>${status}`;
        },
      },
      legend: {
        data: ['正常点', '异常点', '控制限'],
        top: 35,
        textStyle: {
          fontSize: 12
        }
      },
      grid: {
        left: '8%',
        right: '5%',
        bottom: '10%',
        top: '20%',
        containLabel: true,
      },
      xAxis: {
        type: 'value',
        name: '样本序号',
        nameLocation: 'middle',
        nameGap: 25,
        nameTextStyle: {
          fontSize: 12,
          color: '#666'
        },
        axisLine: {
          lineStyle: {
            color: '#d9d9d9'
          }
        },
        axisTick: {
          lineStyle: {
            color: '#d9d9d9'
          }
        },
        axisLabel: {
          color: '#666',
          fontSize: 11
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: '#f0f0f0',
            type: 'solid'
          }
        }
      },
      yAxis: {
        type: 'value',
        name: chartData.title.includes('RE²') ? 'RE² 统计量' : 'SPE 统计量',
        nameLocation: 'middle',
        nameGap: 45,
        nameTextStyle: {
          fontSize: 12,
          color: '#666'
        },
        axisLine: {
          lineStyle: {
            color: '#d9d9d9'
          }
        },
        axisTick: {
          lineStyle: {
            color: '#d9d9d9'
          }
        },
        axisLabel: {
          color: '#666',
          fontSize: 11,
          formatter: (value: number) => value.toFixed(3)
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: '#f0f0f0',
            type: 'solid'
          }
        }
      },
      series: [
        {
          name: '正常点',
          type: 'scatter',
          data: normalData,
          symbolSize: 8,
          itemStyle: {
            color: '#52c41a',
            borderColor: '#389e0d',
            borderWidth: 1,
            opacity: 0.8
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 8,
              shadowColor: '#52c41a'
            }
          }
        },
        {
          name: '异常点',
          type: 'scatter',
          data: anomalyData,
          symbolSize: 12,
          itemStyle: {
            color: '#ff4d4f',
            borderColor: '#cf1322',
            borderWidth: 2,
            opacity: 0.9
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: '#ff4d4f'
            }
          }
        },
        {
          name: '控制限',
          type: 'line',
          data: Array.from({ length: yData.length }, (_, i) => [i + 1, controlLimit]),
          lineStyle: {
            color: '#ff7875',
            type: 'dashed',
            width: 3,
            opacity: 0.8
          },
          symbol: 'none',
          itemStyle: {
            color: '#ff7875',
          },
          markLine: {
            silent: true,
            data: [{
              yAxis: controlLimit,
              label: {
                formatter: `控制限: ${controlLimit.toFixed(4)}`,
                position: 'end',
                color: '#ff4d4f',
                fontSize: 11
              },
              lineStyle: {
                color: '#ff4d4f',
                type: 'dashed',
                width: 2
              }
            }]
          }
        },
      ],
      animation: true,
      animationDuration: 800,
      animationEasing: 'cubicOut'
    };
  };

  // 异常数据表格列定义
  const anomalyColumns = [
    {
      title: '样本序号',
      dataIndex: 'index',
      key: 'index',
      width: 100,
    },
    {
      title: 'RE²值',
      dataIndex: 're2Value',
      key: 're2Value',
      render: (val: number) => val?.toFixed(4),
      width: 120,
    },
    {
      title: 'SPE值',
      dataIndex: 'speValue',
      key: 'speValue',
      render: (val: number) => val?.toFixed(4),
      width: 120,
    },
    {
      title: '异常类型',
      dataIndex: 'anomalyType',
      key: 'anomalyType',
      render: (types: string[]) => (
        <Space>
          {types.map(type => (
            <Badge key={type} status="error" text={type} />
          ))}
        </Space>
      ),
    },
  ];

  // 生成异常数据表格数据
  const getAnomalyTableData = () => {
    if (!aeResults) return [];

    const { re2_test, spe_test, re2_anomalies, spe_anomalies } = aeResults;
    const allIndices = new Set([...re2_anomalies.indices, ...spe_anomalies.indices]);

    return Array.from(allIndices).map(index => {
      const anomalyTypes = [];
      if (re2_anomalies.indices.includes(index)) anomalyTypes.push('RE²异常');
      if (spe_anomalies.indices.includes(index)) anomalyTypes.push('SPE异常');

      return {
        key: index,
        index: index + 1,
        re2Value: re2_test[index],
        speValue: spe_test[index],
        anomalyType: anomalyTypes,
      };
    }).sort((a, b) => a.index - b.index);
  };

  const handleExportChartData = (chartData: any, title: string) => {
    try {
      exportChartDataToCSV(chartData, title);
      message.success('图表数据导出成功');
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导出失败');
    }
  };

  // 生成数据信息
  const getDataInfo = () => {
    if (!aeResults) return null;
    
    return {
      samples_train: aeResults.X_train.length,
      samples_test: aeResults.X_test.length,
      features: aeResults.X_train[0]?.length || 0,
    };
  };

  const dataInfo = getDataInfo();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Title level={3}>
          <Space>
            自动编码器分析
            <Tooltip title="基于TensorFlow.js的前端机器学习实现">
              <CheckCircleOutlined className="text-green-500" />
            </Tooltip>
          </Space>
        </Title>
        <Space>
          <Space.Compact>
            <Button 
              icon={<DownloadOutlined />} 
              disabled={!aeResults} 
              onClick={() => handleExportChartData(currentResult?.charts || [], '自动编码器分析结果')}
            >
              导出数据
            </Button>
          </Space.Compact>
          <Button type="primary" icon={<BarChartOutlined />}>
            查看历史
          </Button>
        </Space>
      </div>

      <Alert
        message="前端机器学习模式"
        description="使用TensorFlow.js在浏览器中直接运行自动编码器分析，无需后端服务，数据安全处理在本地完成。"
        type="success"
        showIcon
        closable
      />

      <Row gutter={16}>
        <Col span={8}>
          <Card title="网络结构设置" className="h-full">
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                ...config.ae,
                encoderDim: 10,
                epochs: 150,
                batchSize: 32,
                learningRate: 0.001,
                confidenceLevel: 0.99,
              }}
              onFinish={handleAnalysis}
            >
              <Form.Item
                name="dataFile"
                label="选择数据文件"
                rules={[{ required: true, message: '请选择数据文件' }]}
              >
                <Select placeholder="选择数据文件" disabled={running}>
                  {files.filter(f => f.status === 'success').map(file => (
                    <Option key={file.id} value={file.id}>
                      <Space>
                        {file.name}
                        <Text type="secondary">({file.rowCount}行)</Text>
                      </Space>
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="encoderDim"
                label={
                  <Space>
                    编码器维度
                    <Tooltip title="编码器隐层维度，通常设为输入维度的1/4到1/2">
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
                rules={[{ required: true, message: '请输入编码器维度' }]}
              >
                <InputNumber
                  min={2}
                  max={100}
                  className="w-full"
                  placeholder="编码器维度"
                  disabled={running}
                />
              </Form.Item>

              <Form.Item
                name="epochs"
                label={
                  <Space>
                    训练轮数
                    <Tooltip title="训练迭代次数，通常50-200轮">
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
              >
                <InputNumber
                  min={10}
                  max={1000}
                  className="w-full"
                  placeholder="训练轮数"
                  disabled={running}
                />
              </Form.Item>

              <Form.Item
                name="batchSize"
                label="批次大小"
              >
                <Select disabled={running}>
                  <Option value={16}>16</Option>
                  <Option value={32}>32</Option>
                  <Option value={64}>64</Option>
                  <Option value={128}>128</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="learningRate"
                label="学习率"
              >
                <Select disabled={running}>
                  <Option value={0.01}>0.01</Option>
                  <Option value={0.001}>0.001</Option>
                  <Option value={0.0001}>0.0001</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="confidenceLevel"
                label={
                  <Space>
                    置信度
                    <Tooltip title="异常检测的置信水平">
                      <InfoCircleOutlined />
                    </Tooltip>
                  </Space>
                }
              >
                <Select disabled={running}>
                  <Option value={0.95}>95%</Option>
                  <Option value={0.99}>99%</Option>
                  <Option value={0.999}>99.9%</Option>
                </Select>
              </Form.Item>

              <Form.Item>
                <Space className="w-full">
                  <Button
                    type="primary"
                    htmlType="submit"
                    loading={running}
                    icon={running ? <SyncOutlined spin /> : <PlayCircleOutlined />}
                    disabled={running}
                    className="flex-1"
                  >
                    {running ? '正在训练...' : '开始训练'}
                  </Button>
                  <Button
                    danger
                    icon={<StopOutlined />}
                    disabled={!running}
                    onClick={handleStopAnalysis}
                  >
                    停止训练
                  </Button>
                </Space>
              </Form.Item>
            </Form>

            {/* 训练进度显示 */}
            {running && (
              <Card type="inner" title="训练进度" className="mt-4">
                <Progress percent={Math.round(progress)} className="mb-4" />
                <div className="max-h-40 overflow-y-auto">
                  {progressMessages.slice(-10).map((msg, index) => (
                    <div key={index} className="text-xs text-gray-600 mb-1">
                      <Text code className="mr-2">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </Text>
                      {msg.message}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </Card>
        </Col>

        <Col span={16}>
          <Card title="分析结果">
            {running && (
              <div className="text-center py-8">
                <Spin size="large" />
                <div className="mt-4">
                  <Text>正在训练自动编码器模型，请耐心等待...</Text>
                  <Progress percent={Math.round(progress)} className="mt-2" />
                </div>
              </div>
            )}

            {!running && aeResults && dataInfo && (
              <Tabs 
                defaultActiveKey="overview"
                items={[
                    {
                      key: 'overview',
                      label: '分析概览',
                      children: (
                        <>
                          <Row gutter={[16, 16]}>
                            <Col span={6}>
                              <Statistic
                                title="训练样本数"
                                value={dataInfo.samples_train}
                                prefix={<BarChartOutlined />}
                              />
                            </Col>
                            <Col span={6}>
                              <Statistic
                                title="测试样本数"
                                value={dataInfo.samples_test}
                                prefix={<BarChartOutlined />}
                              />
                            </Col>
                            <Col span={6}>
                              <Statistic
                                title="特征维度"
                                value={dataInfo.features}
                                prefix={<InfoCircleOutlined />}
                              />
                            </Col>
                            <Col span={6}>
                              <Statistic
                                title="最终损失"
                                value={aeResults.train_losses[aeResults.train_losses.length - 1]}
                                precision={6}
                                prefix={<SyncOutlined />}
                              />
                            </Col>
                          </Row>

                          <Row gutter={[16, 16]} className="mt-6">
                            <Col span={12}>
                              <Card type="inner" title="RE²异常检测">
                                <Statistic
                                  title="异常样本数"
                                  value={aeResults.re2_anomalies.count}
                                  suffix={`/ ${dataInfo.samples_test}`}
                                  valueStyle={{ color: aeResults.re2_anomalies.count > 0 ? '#ff4d4f' : '#52c41a' }}
                                />
                                <Statistic
                                  title="异常比例"
                                  value={aeResults.re2_anomalies.percentage}
                                  precision={2}
                                  suffix="%"
                                  className="mt-2"
                                  valueStyle={{ color: aeResults.re2_anomalies.percentage > 5 ? '#ff4d4f' : '#52c41a' }}
                                />
                                <Statistic
                                  title="控制限"
                                  value={aeResults.re2_control_limit}
                                  precision={4}
                                  className="mt-2"
                                />
                              </Card>
                            </Col>
                            <Col span={12}>
                              <Card type="inner" title="SPE异常检测">
                                <Statistic
                                  title="异常样本数"
                                  value={aeResults.spe_anomalies.count}
                                  suffix={`/ ${dataInfo.samples_test}`}
                                  valueStyle={{ color: aeResults.spe_anomalies.count > 0 ? '#ff4d4f' : '#52c41a' }}
                                />
                                <Statistic
                                  title="异常比例"
                                  value={aeResults.spe_anomalies.percentage}
                                  precision={2}
                                  suffix="%"
                                  className="mt-2"
                                  valueStyle={{ color: aeResults.spe_anomalies.percentage > 5 ? '#ff4d4f' : '#52c41a' }}
                                />
                                <Statistic
                                  title="控制限"
                                  value={aeResults.spe_control_limit}
                                  precision={4}
                                  className="mt-2"
                                />
                              </Card>
                            </Col>
                          </Row>
                        </>
                      )
                    },
                    {
                      key: 'training',
                      label: '训练过程',
                      children: (
                        currentResult?.charts && currentResult.charts.length > 0 && (
                          <div>
                            <div className="flex justify-end mb-4">
                              <Button 
                                size="small" 
                                icon={<DownloadOutlined />}
                                onClick={() => handleExportChartData(currentResult.charts[0].data, '训练损失曲线')}
                              >
                                导出数据
                              </Button>
                            </div>
                            <ReactECharts
                              option={getLossOption(currentResult.charts[0].data)}
                              style={{ height: '400px' }}
                            />
                          </div>
                        )
                      )
                    },
                    {
                      key: 'detection',
                      label: '异常检测',
                      children: (
                        <>
                          <div className="flex justify-end mb-4">
                            <Space>
                              <Button 
                                size="small" 
                                icon={<DownloadOutlined />}
                                onClick={() => handleExportChartData(currentResult?.charts[1]?.data, 'RE²异常检测')}
                                disabled={!currentResult?.charts || currentResult.charts.length < 2}
                              >
                                导出RE²数据
                              </Button>
                              <Button 
                                size="small" 
                                icon={<DownloadOutlined />}
                                onClick={() => handleExportChartData(currentResult?.charts[2]?.data, 'SPE异常检测')}
                                disabled={!currentResult?.charts || currentResult.charts.length < 3}
                              >
                                导出SPE数据
                              </Button>
                            </Space>
                          </div>
                          <Row gutter={[24, 24]}>
                            <Col span={24}>
                              <Title level={4}>RE² 异常检测监控图</Title>
                              {currentResult?.charts && currentResult.charts[1] ? (
                                <Card>
                                  <ReactECharts
                                    option={getMonitoringOption(currentResult.charts[1].data)}
                                    style={{ height: '450px', width: '100%' }}
                                  />
                                  <Row gutter={16} className="mt-4 text-center">
                                    <Col span={6}>
                                      <Statistic
                                        title="总样本数"
                                        value={aeResults.re2_test.length}
                                        prefix="📊"
                                      />
                                    </Col>
                                    <Col span={6}>
                                      <Statistic
                                        title="异常样本数"
                                        value={aeResults.re2_anomalies.count}
                                        prefix="⚠️"
                                        valueStyle={{ color: aeResults.re2_anomalies.count > 0 ? '#ff4d4f' : '#52c41a' }}
                                      />
                                    </Col>
                                    <Col span={6}>
                                      <Statistic
                                        title="异常比例"
                                        value={aeResults.re2_anomalies.percentage}
                                        precision={2}
                                        suffix="%"
                                        prefix="📈"
                                        valueStyle={{ color: aeResults.re2_anomalies.percentage > 5 ? '#ff4d4f' : '#52c41a' }}
                                      />
                                    </Col>
                                    <Col span={6}>
                                      <Statistic
                                        title="控制限"
                                        value={aeResults.re2_control_limit}
                                        precision={4}
                                        prefix="🎯"
                                      />
                                    </Col>
                                  </Row>
                                </Card>
                              ) : (
                                <Alert
                                  message="未生成RE²异常检测图表"
                                  description="请确保已成功运行AE分析，并生成相关图表。"
                                  type="warning"
                                  showIcon
                                />
                              )}
                            </Col>
                            <Col span={24}>
                              <Title level={4}>SPE 异常检测监控图</Title>
                              {currentResult?.charts && currentResult.charts[2] ? (
                                <Card>
                                  <ReactECharts
                                    option={getMonitoringOption(currentResult.charts[2].data)}
                                    style={{ height: '450px', width: '100%' }}
                                  />
                                  <Row gutter={16} className="mt-4 text-center">
                                    <Col span={6}>
                                      <Statistic
                                        title="总样本数"
                                        value={aeResults.spe_test.length}
                                        prefix="📊"
                                      />
                                    </Col>
                                    <Col span={6}>
                                      <Statistic
                                        title="异常样本数"
                                        value={aeResults.spe_anomalies.count}
                                        prefix="⚠️"
                                        valueStyle={{ color: aeResults.spe_anomalies.count > 0 ? '#ff4d4f' : '#52c41a' }}
                                      />
                                    </Col>
                                    <Col span={6}>
                                      <Statistic
                                        title="异常比例"
                                        value={aeResults.spe_anomalies.percentage}
                                        precision={2}
                                        suffix="%"
                                        prefix="📈"
                                        valueStyle={{ color: aeResults.spe_anomalies.percentage > 5 ? '#ff4d4f' : '#52c41a' }}
                                      />
                                    </Col>
                                    <Col span={6}>
                                      <Statistic
                                        title="控制限"
                                        value={aeResults.spe_control_limit}
                                        precision={4}
                                        prefix="🎯"
                                      />
                                    </Col>
                                  </Row>
                                </Card>
                              ) : (
                                <Alert
                                  message="未生成SPE异常检测图表"
                                  description="请确保已成功运行AE分析，并生成相关图表。"
                                  type="warning"
                                  showIcon
                                />
                              )}
                            </Col>
                          </Row>
                        </>
                      )
                    },
                    {
                      key: 'anomalies',
                      label: '异常详情',
                      children: (
                        <Table
                          columns={anomalyColumns}
                          dataSource={getAnomalyTableData()}
                          pagination={{
                            pageSize: 10,
                            showSizeChanger: true,
                            showQuickJumper: true,
                            showTotal: (total) => `共 ${total} 个异常样本`,
                          }}
                          size="small"
                        />
                      )
                    }
                  ]}
                />
              )}

            {!running && !aeResults && (
              <div className="text-center py-8 text-gray-500">
                <BarChartOutlined className="text-4xl mb-4" />
                <div>请配置网络结构并开始训练</div>
                <Paragraph className="mt-2 text-sm">
                  自动编码器是一种无监督深度学习算法，通过重构误差进行异常检测
                </Paragraph>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AEAnalysis;