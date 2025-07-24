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
  Radio,
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  DownloadOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { updateConfig } from '../store/slices/analysisSlice';
import { addResult, updateResult } from '../store/slices/analysisSlice';
import type { AnalysisResult } from '../store/slices/analysisSlice';
import { getNumericColumns } from '../utils/excelParser';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const DLAnalysis: React.FC = () => {
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

    dispatch(updateConfig({ type: 'dl', config: values }));

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

    const timer = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + 3;
        dispatch(updateResult({
          id: result.id,
          updates: { progress: newProgress },
        }));

        if (newProgress >= 100) {
          clearInterval(timer);
          setRunning(false);
          
          const mockResults = {
            trainAccuracy: Array.from({ length: values.epochs }, (_, i) => Math.min(0.95, 0.3 + i * 0.015 + Math.random() * 0.05)),
            valAccuracy: Array.from({ length: values.epochs }, (_, i) => Math.min(0.92, 0.25 + i * 0.013 + Math.random() * 0.08)),
            trainLoss: Array.from({ length: values.epochs }, (_, i) => Math.max(0.05, 2.5 * Math.exp(-i * 0.08) + Math.random() * 0.1)),
            valLoss: Array.from({ length: values.epochs }, (_, i) => Math.max(0.08, 2.8 * Math.exp(-i * 0.07) + Math.random() * 0.15)),
            predictions: Array.from({ length: 20 }, (_, i) => ({
              actual: Math.random() > 0.5 ? 'Normal' : 'Abnormal',
              predicted: Math.random() > 0.3 ? 'Normal' : 'Abnormal',
              confidence: 0.7 + Math.random() * 0.3,
            })),
            attention: Array.from({ length: 10 }, (_, i) => ({
              feature: `特征${i + 1}`,
              weight: Math.random(),
            })),
            finalAccuracy: 0.89,
            finalLoss: 0.156,
          };

          const charts = [
            {
              type: 'line',
              data: {
                title: '模型准确率',
                xData: Array.from({ length: values.epochs }, (_, i) => i + 1),
                trainData: mockResults.trainAccuracy,
                valData: mockResults.valAccuracy,
                metric: 'accuracy',
              },
            },
            {
              type: 'line',
              data: {
                title: '模型损失',
                xData: Array.from({ length: values.epochs }, (_, i) => i + 1),
                trainData: mockResults.trainLoss,
                valData: mockResults.valLoss,
                metric: 'loss',
              },
            },
            {
              type: 'bar',
              data: {
                title: '注意力权重分析',
                xData: mockResults.attention.map(a => a.feature),
                yData: mockResults.attention.map(a => a.weight),
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

          message.success('深度学习分析完成！');
        }
        return newProgress;
      });
    }, 600);
  };

  const getMetricOption = (chartData: any) => ({
    title: {
      text: chartData.title,
      left: 'center',
    },
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      data: chartData.metric === 'accuracy' ? ['训练准确率', '验证准确率'] : ['训练损失', '验证损失'],
      top: 30,
    },
    xAxis: {
      type: 'category',
      data: chartData.xData,
      name: 'Epoch',
    },
    yAxis: {
      type: 'value',
      name: chartData.metric === 'accuracy' ? '准确率' : '损失值',
    },
    series: [
      {
        name: chartData.metric === 'accuracy' ? '训练准确率' : '训练损失',
        type: 'line',
        data: chartData.trainData,
        smooth: true,
        itemStyle: {
          color: '#1890ff',
        },
      },
      {
        name: chartData.metric === 'accuracy' ? '验证准确率' : '验证损失',
        type: 'line',
        data: chartData.valData,
        smooth: true,
        itemStyle: {
          color: '#52c41a',
        },
      },
    ],
  });

  const getBarOption = (chartData: any) => ({
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
    },
    yAxis: {
      type: 'value',
      name: '注意力权重',
    },
    series: [
      {
        name: '权重',
        type: 'bar',
        data: chartData.yData,
        itemStyle: {
          color: '#722ed1',
        },
      },
    ],
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Title level={3}>深度学习分析</Title>
        <Space>
          <Button icon={<DownloadOutlined />}>导出结果</Button>
          <Button type="primary" icon={<BarChartOutlined />}>查看历史</Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col span={8}>
          <Card title="模型配置">
            <Form
              form={form}
              layout="vertical"
              initialValues={config.dl}
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
                name="modelType"
                label="模型类型"
                rules={[{ required: true, message: '请选择模型类型' }]}
              >
                <Radio.Group>
                  <Radio.Button value="transformer">Transformer</Radio.Button>
                  <Radio.Button value="lstm">LSTM</Radio.Button>
                  <Radio.Button value="cnn">CNN</Radio.Button>
                </Radio.Group>
              </Form.Item>

              <Form.Item
                name="hiddenSize"
                label="隐藏层大小"
                rules={[{ required: true, message: '请输入隐藏层大小' }]}
              >
                <InputNumber
                  min={32}
                  max={1024}
                  className="w-full"
                  placeholder="隐藏层大小"
                />
              </Form.Item>

              <Form.Item
                name="numLayers"
                label="网络层数"
              >
                <InputNumber
                  min={1}
                  max={12}
                  className="w-full"
                  placeholder="网络层数"
                />
              </Form.Item>

              <Form.Item
                name="epochs"
                label="训练轮数"
              >
                <InputNumber
                  min={10}
                  max={200}
                  className="w-full"
                  placeholder="训练轮数"
                />
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
                  <Text>正在训练深度学习模型...</Text>
                  <Progress percent={progress} className="mt-2" />
                </div>
              </div>
            )}

            {!running && currentResult && currentResult.status === 'completed' && (
              <Tabs defaultActiveKey="metrics">
                <TabPane tab="训练指标" key="metrics">
                  <Row gutter={[16, 16]}>
                    <Col span={12}>
                      <ReactECharts
                        option={getMetricOption(currentResult.charts[0].data)}
                        style={{ height: '300px' }}
                      />
                    </Col>
                    <Col span={12}>
                      <ReactECharts
                        option={getMetricOption(currentResult.charts[1].data)}
                        style={{ height: '300px' }}
                      />
                    </Col>
                  </Row>
                  
                  <Row gutter={16} className="mt-4">
                    <Col span={12}>
                      <Card type="inner" title="模型参数">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Text>模型类型:</Text>
                            <Text strong>{currentResult.parameters.modelType.toUpperCase()}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>隐藏层大小:</Text>
                            <Text strong>{currentResult.parameters.hiddenSize}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>网络层数:</Text>
                            <Text strong>{currentResult.parameters.numLayers}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>训练轮数:</Text>
                            <Text strong>{currentResult.parameters.epochs}</Text>
                          </div>
                        </div>
                      </Card>
                    </Col>
                    <Col span={12}>
                      <Card type="inner" title="最终结果">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Text>最终准确率:</Text>
                            <Text strong>{(currentResult.results.finalAccuracy * 100).toFixed(2)}%</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>最终损失:</Text>
                            <Text strong>{currentResult.results.finalLoss.toFixed(4)}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>模型状态:</Text>
                            <Text strong className="text-green-600">已收敛</Text>
                          </div>
                        </div>
                      </Card>
                    </Col>
                  </Row>
                </TabPane>

                <TabPane tab="注意力分析" key="attention">
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <ReactECharts
                        option={getBarOption(currentResult.charts[2].data)}
                        style={{ height: '400px' }}
                      />
                    </Col>
                  </Row>
                  
                  <Card type="inner" title="特征重要性" className="mt-4">
                    <Text type="secondary">
                      基于注意力机制分析各特征对模型预测的重要性。权重越高表示该特征对最终预测结果的影响越大。
                    </Text>
                  </Card>
                </TabPane>

                <TabPane tab="预测结果" key="predictions">
                  <div className="space-y-4">
                    <Card type="inner" title="预测样本">
                      <div className="grid grid-cols-2 gap-4">
                        {currentResult.results.predictions.slice(0, 8).map((pred: any, index: number) => (
                          <div key={index} className="p-3 border rounded">
                            <div className="flex justify-between items-center">
                              <Text>样本 {index + 1}</Text>
                              <Text strong className={pred.actual === pred.predicted ? 'text-green-600' : 'text-red-600'}>
                                {pred.actual === pred.predicted ? '✓' : '✗'}
                              </Text>
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              <div>实际: {pred.actual}</div>
                              <div>预测: {pred.predicted}</div>
                              <div>置信度: {(pred.confidence * 100).toFixed(1)}%</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </div>
                </TabPane>
              </Tabs>
            )}

            {!running && !currentResult && (
              <div className="text-center py-8 text-gray-500">
                <BarChartOutlined className="text-4xl mb-4" />
                <div>请配置模型参数并开始训练</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DLAnalysis;