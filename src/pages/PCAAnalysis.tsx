import React, { useState } from 'react';
import {
  Card,
  Form,
  InputNumber,
  Switch,
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

const PCAAnalysis: React.FC = () => {
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

    // 更新配置
    dispatch(updateConfig({ type: 'pca', config: values }));

    // 创建分析结果
    const result: AnalysisResult = {
      id: Date.now().toString(),
      type: 'pca',
      name: `PCA分析_${new Date().toLocaleString()}`,
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

    // 模拟分析进程
    const timer = setInterval(() => {
      setProgress(prev => {
        const newProgress = prev + 10;
        dispatch(updateResult({
          id: result.id,
          updates: { progress: newProgress },
        }));

        if (newProgress >= 100) {
          clearInterval(timer);
          setRunning(false);
          
          // 模拟分析结果
          const mockResults = {
            eigenValues: [2.85, 1.42, 0.73],
            varianceRatio: [0.475, 0.237, 0.122],
            cumulativeVariance: [0.475, 0.712, 0.834],
            tSquared: Array.from({ length: 50 }, (_, i) => Math.random() * 10 + i * 0.1),
            spe: Array.from({ length: 50 }, (_, i) => Math.random() * 5 + i * 0.05),
            controlLimits: {
              tSquared: 8.5,
              spe: 4.2,
            },
          };

          const charts = [
            {
              type: 'scatter',
              data: {
                title: 'T²监控图',
                xData: Array.from({ length: 50 }, (_, i) => i + 1),
                yData: mockResults.tSquared,
                controlLimit: mockResults.controlLimits.tSquared,
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
            {
              type: 'bar',
              data: {
                title: '累积方差贡献率',
                xData: ['PC1', 'PC2', 'PC3'],
                yData: mockResults.cumulativeVariance,
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

          message.success('PCA分析完成！');
        }
        return newProgress;
      });
    }, 300);
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
          color: '#1890ff',
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
      name: '方差贡献率',
      max: 1,
    },
    series: [
      {
        name: '累积方差贡献率',
        type: 'bar',
        data: chartData.yData,
        itemStyle: {
          color: '#52c41a',
        },
      },
    ],
  });

  const resultsColumns = [
    {
      title: '主成分',
      dataIndex: 'component',
      key: 'component',
    },
    {
      title: '特征值',
      dataIndex: 'eigenValue',
      key: 'eigenValue',
      render: (value: number) => value.toFixed(3),
    },
    {
      title: '方差贡献率',
      dataIndex: 'varianceRatio',
      key: 'varianceRatio',
      render: (value: number) => `${(value * 100).toFixed(2)}%`,
    },
    {
      title: '累积方差贡献率',
      dataIndex: 'cumulativeVariance',
      key: 'cumulativeVariance',
      render: (value: number) => `${(value * 100).toFixed(2)}%`,
    },
  ];

  const resultsData = currentResult?.results?.eigenValues?.map((eigenValue: number, index: number) => ({
    key: index,
    component: `PC${index + 1}`,
    eigenValue,
    varianceRatio: currentResult.results.varianceRatio[index],
    cumulativeVariance: currentResult.results.cumulativeVariance[index],
  })) || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Title level={3}>PCA主成分分析</Title>
        <Space>
          <Button icon={<DownloadOutlined />}>导出结果</Button>
          <Button type="primary" icon={<BarChartOutlined />}>查看历史</Button>
        </Space>
      </div>

      <Row gutter={16}>
        {/* 参数配置 */}
        <Col span={8}>
          <Card title="参数设置">
            <Form
              form={form}
              layout="vertical"
              initialValues={config.pca}
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
                label="主成分数量"
                rules={[{ required: true, message: '请输入主成分数量' }]}
              >
                <InputNumber
                  min={1}
                  max={10}
                  className="w-full"
                  placeholder="主成分数量"
                />
              </Form.Item>

              <Form.Item
                name="removeOutliers"
                label="移除异常值"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>

              <Form.Item
                name="confidenceLevel"
                label="置信水平"
              >
                <Select>
                  <Option value={0.90}>90%</Option>
                  <Option value={0.95}>95%</Option>
                  <Option value={0.99}>99%</Option>
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

        {/* 分析进度和结果 */}
        <Col span={16}>
          <Card title="分析结果">
            {running && (
              <div className="text-center py-8">
                <Spin size="large" />
                <div className="mt-4">
                  <Text>正在进行PCA分析...</Text>
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
                              : getBarOption(chart.data)
                          }
                          style={{ height: '300px' }}
                        />
                      </Col>
                    ))}
                  </Row>
                </TabPane>

                <TabPane tab="数值结果" key="results">
                  <div className="space-y-4">
                    <Card type="inner" title="主成分分析结果">
                      <Table
                        columns={resultsColumns}
                        dataSource={resultsData}
                        pagination={false}
                        size="small"
                      />
                    </Card>

                    <Row gutter={16}>
                      <Col span={12}>
                        <Card type="inner" title="控制限">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <Text>T²控制限:</Text>
                              <Text strong>{currentResult.results.controlLimits.tSquared}</Text>
                            </div>
                            <div className="flex justify-between">
                              <Text>SPE控制限:</Text>
                              <Text strong>{currentResult.results.controlLimits.spe}</Text>
                            </div>
                          </div>
                        </Card>
                      </Col>
                      <Col span={12}>
                        <Card type="inner" title="分析参数">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <Text>主成分数量:</Text>
                              <Text strong>{currentResult.parameters.nComponents}</Text>
                            </div>
                            <div className="flex justify-between">
                              <Text>置信水平:</Text>
                              <Text strong>{(currentResult.parameters.confidenceLevel * 100).toFixed(0)}%</Text>
                            </div>
                            <div className="flex justify-between">
                              <Text>移除异常值:</Text>
                              <Text strong>{currentResult.parameters.removeOutliers ? '是' : '否'}</Text>
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
                <div>请配置参数并开始PCA分析</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default PCAAnalysis;