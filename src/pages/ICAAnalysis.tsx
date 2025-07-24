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
  Table,
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

const ICAAnalysis: React.FC = () => {
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

    dispatch(updateConfig({ type: 'ica', config: values }));

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
    setCurrentResult(result);

    const timer = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + 12;
        dispatch(updateResult({
          id: result.id,
          updates: { progress: newProgress },
        }));

        if (newProgress >= 100) {
          clearInterval(timer);
          setRunning(false);
          
          const mockResults = {
            iSquared: Array.from({ length: 50 }, (_, i) => Math.random() * 8 + i * 0.08),
            reconstructionError: Array.from({ length: 50 }, (_, i) => Math.random() * 3 + i * 0.03),
            controlLimits: {
              iSquared: 6.8,
              reconstructionError: 2.5,
            },
            contributions: [
              { variable: '温度', contribution: 0.35 },
              { variable: '压力', contribution: 0.28 },
              { variable: '流量', contribution: 0.22 },
              { variable: '质量', contribution: 0.15 },
            ],
            convergence: Array.from({ length: 20 }, (_, i) => Math.exp(-i * 0.3)),
          };

          const charts = [
            {
              type: 'scatter',
              data: {
                title: 'I²监控图',
                xData: Array.from({ length: 50 }, (_, i) => i + 1),
                yData: mockResults.iSquared,
                controlLimit: mockResults.controlLimits.iSquared,
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
              type: 'bar',
              data: {
                title: '变量贡献度分析',
                xData: mockResults.contributions.map(c => c.variable),
                yData: mockResults.contributions.map(c => c.contribution),
              },
            },
            {
              type: 'line',
              data: {
                title: '算法收敛曲线',
                xData: Array.from({ length: 20 }, (_, i) => i + 1),
                yData: mockResults.convergence,
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

          message.success('ICA分析完成！');
        }
        return newProgress;
      });
    }, 250);
  };

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
      name: '统计量值',
    },
    series: [
      {
        name: '统计量',
        type: 'scatter',
        data: chartData.yData,
        symbolSize: 6,
        itemStyle: {
          color: '#52c41a',
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
      name: '贡献度',
    },
    series: [
      {
        name: '贡献度',
        type: 'bar',
        data: chartData.yData,
        itemStyle: {
          color: '#722ed1',
        },
      },
    ],
  });

  const getLineOption = (chartData: any) => ({
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
      name: '迭代次数',
    },
    yAxis: {
      type: 'value',
      name: '收敛值',
    },
    series: [
      {
        name: '收敛值',
        type: 'line',
        data: chartData.yData,
        smooth: true,
        itemStyle: {
          color: '#1890ff',
        },
      },
    ],
  });

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
              initialValues={config.ica}
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
                name="nComponents"
                label="独立成分数量"
                rules={[{ required: true, message: '请输入独立成分数量' }]}
              >
                <InputNumber
                  min={1}
                  max={10}
                  className="w-full"
                  placeholder="独立成分数量"
                />
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
                <Spin size="large" />
                <div className="mt-4">
                  <Text>正在进行ICA分析...</Text>
                  <Progress percent={progress} className="mt-2" />
                </div>
              </div>
            )}

            {!running && currentResult && currentResult.status === 'completed' && (
              <Tabs defaultActiveKey="charts">
                <TabPane tab="监控图表" key="charts">
                  <Row gutter={[16, 16]}>
                    {currentResult.charts.map((chart, index) => (
                      <Col span={12} key={index}>
                        <ReactECharts
                          option={
                            chart.type === 'scatter'
                              ? getScatterOption(chart.data)
                              : chart.type === 'bar'
                              ? getBarOption(chart.data)
                              : getLineOption(chart.data)
                          }
                          style={{ height: '300px' }}
                        />
                      </Col>
                    ))}
                  </Row>
                </TabPane>

                <TabPane tab="贡献度分析" key="contribution">
                  <div className="space-y-4">
                    <Card type="inner" title="变量贡献度排序">
                      <Table
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
                              <Text strong>{currentResult.results.controlLimits.iSquared}</Text>
                            </div>
                            <div className="flex justify-between">
                              <Text>重构误差控制限:</Text>
                              <Text strong>{currentResult.results.controlLimits.reconstructionError}</Text>
                            </div>
                          </div>
                        </Card>
                      </Col>
                      <Col span={12}>
                        <Card type="inner" title="算法参数">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <Text>独立成分数:</Text>
                              <Text strong>{currentResult.parameters.nComponents}</Text>
                            </div>
                            <div className="flex justify-between">
                              <Text>最大迭代次数:</Text>
                              <Text strong>{currentResult.parameters.maxIter}</Text>
                            </div>
                            <div className="flex justify-between">
                              <Text>收敛容差:</Text>
                              <Text strong>{currentResult.parameters.tolerance}</Text>
                            </div>
                          </div>
                        </Card>
                      </Col>
                    </Row>
                  </div>
                </TabPane>
              </Tabs>
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