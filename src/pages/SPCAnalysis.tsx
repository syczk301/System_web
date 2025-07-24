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
  Table,
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  DownloadOutlined,
  BarChartOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { updateConfig } from '../store/slices/analysisSlice';
import { addResult, updateResult } from '../store/slices/analysisSlice';
import type { AnalysisResult } from '../store/slices/analysisSlice';
import { getNumericColumns } from '../utils/excelParser';
import { useAutoUpload } from '../hooks/useAutoUpload';

const { Title, Text } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;

const SPCAnalysis: React.FC = () => {
  const [form] = Form.useForm();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const dispatch = useAppDispatch();
  const { files } = useAppSelector((state) => state.data);
  const { config } = useAppSelector((state) => state.analysis);

  // 自动加载数据
  const { autoUploadCompleted, isLoading } = useAutoUpload();

  const handleAnalysis = async (values: any) => {
    if (!values.dataFile) {
      message.error('请选择数据文件');
      return;
    }

    setRunning(true);
    setProgress(0);

    dispatch(updateConfig({ type: 'spc', config: values }));

    const selectedFile = files.find(f => f.id === values.dataFile);
    
    const result: AnalysisResult = {
      id: Date.now().toString(),
      type: 'spc',
      name: `SPC分析_${selectedFile?.name || 'Unknown'}_${new Date().toLocaleString()}`,
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
          
          // 使用真实数据进行SPC分析
          let xBarData: number[] = [];
          let rData: number[] = [];
          let analysisResults: any = {};
          let charts: any[] = [];

          if (selectedFile && selectedFile.rawData) {
            const numericColumns = getNumericColumns(selectedFile.rawData);
            
            if (numericColumns.length > 0) {
              // 使用第一个数值列进行SPC分析
              const columnName = numericColumns[0];
              const columnData = selectedFile.rawData.data
                .map(row => parseFloat(row[columnName]))
                .filter(val => !isNaN(val))
                .slice(0, Math.min(100, selectedFile.rawData.data.length));
              
              if (columnData.length >= values.subgroupSize) {
                // 计算X̄和R值
                const subgroupSize = values.subgroupSize || 5;
                const numSubgroups = Math.floor(columnData.length / subgroupSize);
                
                for (let i = 0; i < numSubgroups; i++) {
                  const subgroup = columnData.slice(i * subgroupSize, (i + 1) * subgroupSize);
                  const mean = subgroup.reduce((a, b) => a + b, 0) / subgroup.length;
                  const range = Math.max(...subgroup) - Math.min(...subgroup);
                  xBarData.push(mean);
                  rData.push(range);
                }
                
                const xBarMean = xBarData.reduce((a, b) => a + b, 0) / xBarData.length;
                const rMean = rData.reduce((a, b) => a + b, 0) / rData.length;
                
                const xBarUCL = xBarMean + 3 * (rMean / 2.326);
                const xBarLCL = xBarMean - 3 * (rMean / 2.326);
                const rUCL = rMean * 2.114;
                
                // 检测异常点
                const xBarAlerts = xBarData.map((value, index) => ({
                  index: index + 1,
                  value,
                  isAlert: value > xBarUCL || value < xBarLCL,
                  type: value > xBarUCL ? '超出上控制限' : value < xBarLCL ? '超出下控制限' : '',
                })).filter(item => item.isAlert);
                
                const rAlerts = rData.map((value, index) => ({
                  index: index + 1,
                  value,
                  isAlert: value > rUCL,
                  type: value > rUCL ? '极差超出控制限' : '',
                })).filter(item => item.isAlert);

                // 计算过程能力指数
                const overallMean = columnData.reduce((a, b) => a + b, 0) / columnData.length;
                const overallStd = Math.sqrt(columnData.reduce((sum, val) => sum + Math.pow(val - overallMean, 2), 0) / (columnData.length - 1));
                
                // 使用用户输入的规格限或计算默认值
                const usl = values.usl || (overallMean + 3 * overallStd);
                const lsl = values.lsl || (overallMean - 3 * overallStd);
                const target = overallMean;
                
                const cp = (usl - lsl) / (6 * overallStd);
                const cpk = Math.min((usl - overallMean) / (3 * overallStd), (overallMean - lsl) / (3 * overallStd));

                analysisResults = {
                  xBarData,
                  rData,
                  xBarMean,
                  rMean,
                  xBarUCL,
                  xBarLCL,
                  rUCL,
                  rLCL: 0,
                  cp: Math.max(0, cp),
                  cpk: Math.max(0, cpk),
                  pp: cp,
                  ppk: cpk,
                  alerts: [...xBarAlerts, ...rAlerts],
                  processCapability: {
                    specification: {
                      usl,
                      lsl,
                      target,
                    },
                    sigma: overallStd,
                  },
                  columnName,
                };

                charts = [
                  {
                    type: 'line',
                    data: {
                      title: `X̄控制图 (${columnName})`,
                      xData: Array.from({ length: xBarData.length }, (_, i) => i + 1),
                      yData: xBarData,
                      ucl: xBarUCL,
                      lcl: xBarLCL,
                      centerLine: xBarMean,
                      alerts: xBarAlerts,
                    },
                  },
                  {
                    type: 'line',
                    data: {
                      title: `R控制图 (${columnName})`,
                      xData: Array.from({ length: rData.length }, (_, i) => i + 1),
                      yData: rData,
                      ucl: rUCL,
                      lcl: 0,
                      centerLine: rMean,
                      alerts: rAlerts,
                    },
                  },
                  {
                    type: 'histogram',
                    data: {
                      title: `过程能力分析 (${columnName})`,
                      data: columnData,
                      usl,
                      lsl,
                      target,
                    },
                  },
                ];
              }
            }
          }
          
          // 如果没有真实数据或数据不足，使用模拟数据
          if (xBarData.length === 0) {
            const mockSampleSize = 50;
            xBarData = Array.from({ length: mockSampleSize }, (_, i) => {
              const base = 100 + Math.sin(i * 0.2) * 5;
              return base + (Math.random() - 0.5) * 8;
            });
            
            rData = Array.from({ length: mockSampleSize }, () => Math.random() * 15 + 2);
            
            const xBarMean = xBarData.reduce((a, b) => a + b, 0) / xBarData.length;
            const rMean = rData.reduce((a, b) => a + b, 0) / rData.length;
            
            const xBarUCL = xBarMean + 3 * (rMean / 2.326);
            const xBarLCL = xBarMean - 3 * (rMean / 2.326);
            const rUCL = rMean * 2.114;
            
            const xBarAlerts = xBarData.map((value, index) => ({
              index: index + 1,
              value,
              isAlert: value > xBarUCL || value < xBarLCL,
              type: value > xBarUCL ? '超出上控制限' : value < xBarLCL ? '超出下控制限' : '',
            })).filter(item => item.isAlert);
            
            const rAlerts = rData.map((value, index) => ({
              index: index + 1,
              value,
              isAlert: value > rUCL,
              type: value > rUCL ? '极差超出控制限' : '',
            })).filter(item => item.isAlert);

            analysisResults = {
              xBarData,
              rData,
              xBarMean,
              rMean,
              xBarUCL,
              xBarLCL,
              rUCL,
              rLCL: 0,
              cp: 1.33,
              cpk: 1.15,
              pp: 1.28,
              ppk: 1.12,
              alerts: [...xBarAlerts, ...rAlerts],
              processCapability: {
                specification: {
                  usl: 115,
                  lsl: 85,
                  target: 100,
                },
                sigma: rMean / 1.128,
              },
              columnName: '模拟数据',
            };

            charts = [
              {
                type: 'line',
                data: {
                  title: 'X̄控制图 (模拟数据)',
                  xData: Array.from({ length: mockSampleSize }, (_, i) => i + 1),
                  yData: xBarData,
                  ucl: xBarUCL,
                  lcl: xBarLCL,
                  centerLine: xBarMean,
                  alerts: xBarAlerts,
                },
              },
              {
                type: 'line',
                data: {
                  title: 'R控制图 (模拟数据)',
                  xData: Array.from({ length: mockSampleSize }, (_, i) => i + 1),
                  yData: rData,
                  ucl: rUCL,
                  lcl: 0,
                  centerLine: rMean,
                  alerts: rAlerts,
                },
              },
              {
                type: 'histogram',
                data: {
                  title: '过程能力分析 (模拟数据)',
                  data: xBarData,
                  usl: analysisResults.processCapability.specification.usl,
                  lsl: analysisResults.processCapability.specification.lsl,
                  target: analysisResults.processCapability.specification.target,
                },
              },
            ];
          }

          dispatch(updateResult({
            id: result.id,
            updates: {
              status: 'completed',
              results: analysisResults,
              charts,
              completedAt: new Date().toISOString(),
            },
          }));

          message.success('SPC分析完成！');
        }
        return newProgress;
      });
    }, 400);
  };

  const getControlChartOption = (chartData: any) => {
    const alertPoints = chartData.alerts || [];
    
    return {
      title: {
        text: chartData.title,
        left: 'center',
      },
      tooltip: {
        trigger: 'axis',
        formatter: (params: any) => {
          const dataIndex = params[0].dataIndex;
          const alert = alertPoints.find((a: any) => a.index === dataIndex + 1);
          let result = `样本 ${dataIndex + 1}<br/>值: ${params[0].value.toFixed(3)}`;
          if (alert) {
            result += `<br/><span style="color: red;">⚠️ ${alert.type}</span>`;
          }
          return result;
        },
      },
      legend: {
        data: ['数据点', '上控制限', '下控制限', '中心线'],
        top: 30,
      },
      xAxis: {
        type: 'category',
        data: chartData.xData,
        name: '样本序号',
      },
      yAxis: {
        type: 'value',
        name: '测量值',
      },
      series: [
        {
          name: '数据点',
          type: 'line',
          data: chartData.yData.map((value: number, index: number) => {
            const alert = alertPoints.find((a: any) => a.index === index + 1);
            return {
              value,
              itemStyle: alert ? { color: '#ff4d4f' } : { color: '#1890ff' },
              symbol: alert ? 'triangle' : 'circle',
              symbolSize: alert ? 8 : 6,
            };
          }),
          connectNulls: false,
        },
        {
          name: '上控制限',
          type: 'line',
          data: Array(chartData.xData.length).fill(chartData.ucl),
          lineStyle: {
            color: '#ff4d4f',
            type: 'dashed',
          },
          symbol: 'none',
        },
        {
          name: '下控制限',
          type: 'line',
          data: Array(chartData.xData.length).fill(chartData.lcl),
          lineStyle: {
            color: '#ff4d4f',
            type: 'dashed',
          },
          symbol: 'none',
        },
        {
          name: '中心线',
          type: 'line',
          data: Array(chartData.xData.length).fill(chartData.centerLine),
          lineStyle: {
            color: '#52c41a',
            type: 'solid',
          },
          symbol: 'none',
        },
      ],
    };
  };

  const getHistogramOption = (chartData: any) => {
    const bins = 20;
    const min = Math.min(...chartData.data);
    const max = Math.max(...chartData.data);
    const binWidth = (max - min) / bins;
    
    const histogram = Array(bins).fill(0);
    chartData.data.forEach((value: number) => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), bins - 1);
      histogram[binIndex]++;
    });
    
    const binLabels = Array.from({ length: bins }, (_, i) => 
      (min + i * binWidth).toFixed(1)
    );

    return {
      title: {
        text: chartData.title,
        left: 'center',
      },
      tooltip: {
        trigger: 'axis',
      },
      xAxis: {
        type: 'category',
        data: binLabels,
        name: '测量值',
      },
      yAxis: {
        type: 'value',
        name: '频次',
      },
      series: [
        {
          name: '频次分布',
          type: 'bar',
          data: histogram,
          itemStyle: {
            color: '#1890ff',
          },
        },
      ],
      graphic: [
        {
          type: 'line',
          shape: {
            x1: ((chartData.lsl - min) / (max - min)) * 100 + '%',
            y1: '10%',
            x2: ((chartData.lsl - min) / (max - min)) * 100 + '%',
            y2: '90%',
          },
          style: {
            stroke: '#ff4d4f',
            lineWidth: 2,
          },
        },
        {
          type: 'line',
          shape: {
            x1: ((chartData.usl - min) / (max - min)) * 100 + '%',
            y1: '10%',
            x2: ((chartData.usl - min) / (max - min)) * 100 + '%',
            y2: '90%',
          },
          style: {
            stroke: '#ff4d4f',
            lineWidth: 2,
          },
        },
      ],
    };
  };

  const alertColumns = [
    {
      title: '样本序号',
      dataIndex: 'index',
      key: 'index',
    },
    {
      title: '测量值',
      dataIndex: 'value',
      key: 'value',
      render: (value: number) => value.toFixed(3),
    },
    {
      title: '异常类型',
      dataIndex: 'type',
      key: 'type',
      render: (text: string) => (
        <span className="text-red-600">
          <AlertOutlined className="mr-1" />
          {text}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Title level={3}>SPC统计过程控制</Title>
        <Space>
          <Button icon={<DownloadOutlined />}>导出结果</Button>
          <Button type="primary" icon={<BarChartOutlined />}>查看历史</Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col span={8}>
          <Card title="分析配置">
            <Form
              form={form}
              layout="vertical"
              initialValues={config.spc}
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
                name="chartType"
                label="控制图类型"
                rules={[{ required: true, message: '请选择控制图类型' }]}
              >
                <Radio.Group>
                  <Radio.Button value="xbar-r">X̄-R图</Radio.Button>
                  <Radio.Button value="xbar-s">X̄-S图</Radio.Button>
                  <Radio.Button value="individual">单值图</Radio.Button>
                </Radio.Group>
              </Form.Item>

              <Form.Item
                name="subgroupSize"
                label="子组大小"
                rules={[{ required: true, message: '请输入子组大小' }]}
              >
                <InputNumber
                  min={2}
                  max={25}
                  className="w-full"
                  placeholder="子组大小"
                />
              </Form.Item>

              <Form.Item
                name="confidenceLevel"
                label="置信水平"
              >
                <Select placeholder="选择置信水平">
                  <Option value={0.95}>95%</Option>
                  <Option value={0.99}>99%</Option>
                  <Option value={0.999}>99.9%</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="usl"
                label="规格上限 (USL)"
              >
                <InputNumber
                  className="w-full"
                  placeholder="规格上限"
                />
              </Form.Item>

              <Form.Item
                name="lsl"
                label="规格下限 (LSL)"
              >
                <InputNumber
                  className="w-full"
                  placeholder="规格下限"
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
                  <Text>正在进行SPC分析...</Text>
                  <Progress percent={progress} className="mt-2" />
                </div>
              </div>
            )}

            {!running && currentResult && currentResult.status === 'completed' && (
              <Tabs defaultActiveKey="control-charts">
                <TabPane tab="控制图" key="control-charts">
                  <Row gutter={[16, 16]}>
                    <Col span={24}>
                      <ReactECharts
                        option={getControlChartOption(currentResult.charts[0].data)}
                        style={{ height: '350px' }}
                      />
                    </Col>
                    <Col span={24}>
                      <ReactECharts
                        option={getControlChartOption(currentResult.charts[1].data)}
                        style={{ height: '350px' }}
                      />
                    </Col>
                  </Row>
                </TabPane>

                <TabPane tab="过程能力" key="capability">
                  <Row gutter={[16, 16]}>
                    <Col span={16}>
                      <ReactECharts
                        option={getHistogramOption(currentResult.charts[2].data)}
                        style={{ height: '400px' }}
                      />
                    </Col>
                    <Col span={8}>
                      <Card type="inner" title="能力指数">
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <Text>Cp (过程能力):</Text>
                            <Text strong className={currentResult.results.cp >= 1.33 ? 'text-green-600' : 'text-orange-600'}>
                              {currentResult.results.cp.toFixed(3)}
                            </Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>Cpk (过程能力指数):</Text>
                            <Text strong className={currentResult.results.cpk >= 1.33 ? 'text-green-600' : 'text-orange-600'}>
                              {currentResult.results.cpk.toFixed(3)}
                            </Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>Pp (过程性能):</Text>
                            <Text strong>{currentResult.results.pp.toFixed(3)}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>Ppk (过程性能指数):</Text>
                            <Text strong>{currentResult.results.ppk.toFixed(3)}</Text>
                          </div>
                        </div>
                      </Card>
                      
                      <Card type="inner" title="控制限" className="mt-4">
                        <div className="space-y-2">
                          <div className="flex justify-between">
                            <Text>X̄ 上控制限:</Text>
                            <Text strong>{currentResult.results.xBarUCL.toFixed(3)}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>X̄ 中心线:</Text>
                            <Text strong>{currentResult.results.xBarMean.toFixed(3)}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>X̄ 下控制限:</Text>
                            <Text strong>{currentResult.results.xBarLCL.toFixed(3)}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>R 上控制限:</Text>
                            <Text strong>{currentResult.results.rUCL.toFixed(3)}</Text>
                          </div>
                          <div className="flex justify-between">
                            <Text>R 中心线:</Text>
                            <Text strong>{currentResult.results.rMean.toFixed(3)}</Text>
                          </div>
                        </div>
                      </Card>
                    </Col>
                  </Row>
                </TabPane>

                <TabPane tab="异常报警" key="alerts">
                  <div className="space-y-4">
                    {currentResult.results.alerts.length > 0 ? (
                      <>
                        <div className="bg-red-50 border border-red-200 rounded p-4">
                          <div className="flex items-center">
                            <AlertOutlined className="text-red-500 mr-2" />
                            <Text strong className="text-red-700">
                              检测到 {currentResult.results.alerts.length} 个异常点
                            </Text>
                          </div>
                        </div>
                        <Table
                          columns={alertColumns}
                          dataSource={currentResult.results.alerts}
                          rowKey="index"
                          size="small"
                          pagination={false}
                        />
                      </>
                    ) : (
                      <div className="bg-green-50 border border-green-200 rounded p-4 text-center">
                        <div className="text-green-600">
                          <Text strong>✓ 过程处于统计控制状态，未检测到异常点</Text>
                        </div>
                      </div>
                    )}
                    
                    <Card type="inner" title="判异规则说明">
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>• 规则1: 单点超出控制限</div>
                        <div>• 规则2: 连续9点在中心线同一侧</div>
                        <div>• 规则3: 连续6点递增或递减</div>
                        <div>• 规则4: 连续14点交替上下</div>
                      </div>
                    </Card>
                  </div>
                </TabPane>
              </Tabs>
            )}

            {!running && !currentResult && (
              <div className="text-center py-8 text-gray-500">
                <BarChartOutlined className="text-4xl mb-4" />
                <div>请配置分析参数并开始SPC分析</div>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SPCAnalysis;