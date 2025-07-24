import React, { useState } from 'react';
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
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  DownloadOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import {
  addResult,
  updateResult,
  updateConfig,
} from '../store/slices/analysisSlice';
import type { AnalysisResult } from '../store/slices/analysisSlice';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const AEAnalysis: React.FC = () => {
  const [form] = Form.useForm();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const dispatch = useAppDispatch();
  const { files } = useAppSelector((state) => state.data);
  const { config } = useAppSelector((state) => state.analysis);

  const handleAnalysis = async (values: any) => {
    if (!values.dataFile) {
      message.error('请选择数据文件');
      return;
    }

    setRunning(true);
    setProgress(0);

    dispatch(updateConfig({ type: 'ae', config: values }));

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

    const timer = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + 5;
        dispatch(updateResult({
          id: result.id,
          updates: { progress: newProgress },
        }));

        if (newProgress >= 100) {
          clearInterval(timer);
          setRunning(false);
          
          const mockResults = {
            trainLoss: Array.from({ length: values.epochs }, (_, i) => Math.exp(-i * 0.05) + Math.random() * 0.1),
            valLoss: Array.from({ length: values.epochs }, (_, i) => Math.exp(-i * 0.04) + Math.random() * 0.15),
            reconstructionError: Array.from({ length: 50 }, (_, i) => Math.random() * 2 + i * 0.02),
            spe: Array.from({ length: 50 }, (_, i) => Math.random() * 1.5 + i * 0.015),
            controlLimits: {
              reconstructionError: 1.8,
              spe: 1.2,
            },
            finalLoss: 0.023,
            encoderDim: values.encoderDim,
          };

          const charts = [
            {
              type: 'line',
              data: {
                title: '训练损失曲线',
                xData: Array.from({ length: values.epochs }, (_, i) => i + 1),
                trainData: mockResults.trainLoss,
                valData: mockResults.valLoss,
              },
            },
            {
              type: 'scatter',
              data: {
                title: '重构误差监控图',
                xData: Array.from({ length: 50 }, (_, i) => i + 1),
                yData: mockResults.reconstructionError,
                controlLimit: mockResults.controlLimits.reconstructionError,
              },
            },
            {
              type: 'scatter',
              data: {
                title: 'SPE监控图',
                xData: Array.from({ length: 50 }, (_, i) => i + 1),
                yData: mockResults.spe,
                controlLimit: mockResults.controlLimits.spe,
              },
            },
          ];

          dispatch(updateResult({
            id: result.id,
            updates: {
              status: 'completed',
              results: mockResults,
              charts,
              completedAt: new Date().toISOString(),
            },
          }));

          message.success('自动编码器分析完成！');
        }
        return newProgress;
      });
    }, 400);
  };

  const getLossOption = (chartData: any) => ({
    title: {
      text: chartData.title,
      left: 'center',
    },
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      data: ['训练损失', '验证损失'],
      top: 30,
    },
    xAxis: {
      type: 'category',
      data: chartData.xData,
      name: 'Epoch',
    },
    yAxis: {
      type: 'value',
      name: '损失值',
    },
    series: [
      {
        name: '训练损失',
        type: 'line',
        data: chartData.trainData,
        smooth: true,
        itemStyle: {
          color: '#1890ff',
        },
      },
      {
        name: '验证损失',
        type: 'line',
        data: chartData.valData,
        smooth: true,
        itemStyle: {
          color: '#52c41a',
        },
      },
    ],
  });

  const getScatterOption = (chartData: any) => ({
    title: {
      text: chartData.title,
      left: 'center',
    },
    tooltip: {
      trigger: 'axis',
    },
    xAxis: {
      type: 'category',
      data: chartData.xData,
      name: '样本序号',
    },
    yAxis: {
      type: 'value',
      name: '误差值',
    },
    series: [
      {
        name: '重构误差',
        type: 'scatter',
        data: chartData.yData,
        symbolSize: 6,
        itemStyle: {
          color: '#722ed1',
        },
      },
      {
        name: '控制限',
        type: 'line',
        data: Array(chartData.xData.length).fill(chartData.controlLimit),
        lineStyle: {
          color: '#ff4d4f',
          type: 'dashed',
          width: 2,
        },
        symbol: 'none',
      },
    ],
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Title level={3}>自动编码器分析</Title>
        <Space>
          <Button icon={<DownloadOutlined />}>导出结果</Button>
          <Button type="primary" icon={<BarChartOutlined />}>查看历史</Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col span={8}>
          <Card title="网络结构设置">
            <Form
              form={form}
              layout="vertical"
              initialValues={config.ae}
              onFinish={handleAnalysis}
            >
              <Form.Item
                name="dataFile"
                label="选择数据文件"
                rules={[{ required: true, message: '请选择数据文件' }]}
              >
                <Select placeholder="选择数据文件">
                  {files.filter(f => f.status === 'success').map(file => (
                    <Option key={file.id} value={file.id}>
                      {file.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                name="encoderDim"
                label="编码器维度"
                rules={[{ required: true, message: '请输入编码器维度' }]}
              >
                <InputNumber
                  min={2}
                  max={100}
                  className="w-full"
                  placeholder="编码器维度"
                />
              </Form.Item>

              <Form.Item
                name="epochs"
                label="训练轮数"
              >
                <InputNumber
                  min={10}
                  max={1000}
                  className="w-full"
                  placeholder="训练轮数"
                />
              </Form.Item>

              <Form.Item
                name="batchSize"
                label="批次大小"
              >
                <Select>
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
                <Select>
                  <Option value={0.01}>0.01</Option>
                  <Option value={0.001}>0.001</Option>
                  <Option value={0.0001}>0.0001</Option>
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
                    开始训练
                  </Button>
                  <Button
                    danger
                    icon={<StopOutlined />}
                    disabled={!running}
                    onClick={() => setRunning(false)}
                  >
                    停止训练
                  </Button>
                </Space>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col span={16}>
          <Card title="训练结果">
            {running && (
              <div className="text-center py-8">
                <Spin size="large" />
                <div className="mt-4">
                  <Text>正在训练自动编码器模型...</Text>
                  <Progress percent={progress} className="mt-2" />
                </div>
              </div>
            )}

            {!running && currentResult && currentResult.status === 'completed' && (
              <Tabs defaultActiveKey="training">
                <TabPane tab="训练过程" key="training">
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <ReactECharts
                        option={getLossOption(currentResult.charts[0].data)}
                        style={{ height: '400px' }}
                      />
                    </Col>
                  </Row>
                  
                  <Row gutter={16} className="mt-4">
                    <Col span={12}>
                      <Card type="inner" title="训练参数">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Text>编码器维度:</Text>
                            <Text strong>{currentResult.parameters.encoderDim}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>训练轮数:</Text>
                            <Text strong>{currentResult.parameters.epochs}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>批次大小:</Text>
                            <Text strong>{currentResult.parameters.batchSize}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>学习率:</Text>
                            <Text strong>{currentResult.parameters.learningRate}</Text>
                          </div>
                        </div>
                      </Card>
                    </Col>
                    <Col span={12}>
                      <Card type="inner" title="训练结果">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Text>最终损失:</Text>
                            <Text strong>{currentResult.results.finalLoss.toFixed(6)}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>重构误差控制限:</Text>
                            <Text strong>{currentResult.results.controlLimits.reconstructionError}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>SPE控制限:</Text>
                            <Text strong>{currentResult.results.controlLimits.spe}</Text>
                          </div>
                        </div>
                      </Card>
                    </Col>
                  </Row>
                </TabPane>

                <TabPane tab="异常检测" key="detection">
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <ReactECharts
                        option={getScatterOption(currentResult.charts[1].data)}
                        style={{ height: '300px' }}
                      />
                    </Col>
                    <Col span={12}>
                      <ReactECharts
                        option={getScatterOption(currentResult.charts[2].data)}
                        style={{ height: '300px' }}
                      />
                    </Col>
                  </Row>
                </TabPane>
              </Tabs>
            )}

            {!running && !currentResult && (
              <div className="text-center py-8 text-gray-500">
                <BarChartOutlined className="text-4xl mb-4" />
                <div>请配置网络结构并开始训练</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AEAnalysis;