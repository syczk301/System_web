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
  Statistic,
  Alert,
  Divider,
  Tooltip,
} from 'antd';
import {
  PlayCircleOutlined,
  StopOutlined,
  DownloadOutlined,
  BarChartOutlined,
  AlertOutlined,
  SettingOutlined,
  InfoCircleOutlined,
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

// SPC控制图常数表（基于子组大小）
const SPC_CONSTANTS: Record<number, any> = {
  2: { A2: 1.880, D3: 0, D4: 3.267, A3: 2.659, B3: 0, B4: 3.267, C4: 0.7979 },
  3: { A2: 1.023, D3: 0, D4: 2.575, A3: 1.954, B3: 0, B4: 2.568, C4: 0.8862 },
  4: { A2: 0.729, D3: 0, D4: 2.282, A3: 1.628, B3: 0, B4: 2.266, C4: 0.9213 },
  5: { A2: 0.577, D3: 0, D4: 2.114, A3: 1.427, B3: 0, B4: 2.089, C4: 0.9400 },
  6: { A2: 0.483, D3: 0, D4: 2.004, A3: 1.287, B3: 0.030, B4: 1.970, C4: 0.9515 },
  7: { A2: 0.419, D3: 0.076, D4: 1.924, A3: 1.182, B3: 0.118, B4: 1.882, C4: 0.9594 },
  8: { A2: 0.373, D3: 0.136, D4: 1.864, A3: 1.099, B3: 0.185, B4: 1.815, C4: 0.9650 },
  9: { A2: 0.337, D3: 0.184, D4: 1.816, A3: 1.032, B3: 0.239, B4: 1.761, C4: 0.9693 },
  10: { A2: 0.308, D3: 0.223, D4: 1.777, A3: 0.975, B3: 0.284, B4: 1.716, C4: 0.9727 },
};

// 休哈特控制图类
class ShewartChart {
  static validateData(data: number[], requiredColumns: string[]) {
    // 验证数据的有效性
    if (data.length === 0) {
      throw new Error('数据为空');
    }
    
    const invalidValues = data.filter(val => isNaN(val) || val === null || val === undefined);
    if (invalidValues.length > 0) {
      console.warn(`警告：删除了${invalidValues.length}个无效数据`);
    }
    
    const validData = data.filter(val => !isNaN(val) && val !== null && val !== undefined);
    if (validData.length === 0) {
      throw new Error('没有有效数据');
    }
    
    return validData;
  }

  static calculateControlLimits(data: number[]) {
    const validData = this.validateData(data, ['data']);

    const mean = validData.reduce((sum, val) => sum + val, 0) / validData.length;
    const variance = validData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (validData.length - 1);
    const std = Math.sqrt(variance);
    
    return {
      data: validData,
      mean,
      std,
      UCL: mean + 3 * std,
      LCL: mean - 3 * std,
    };
  }
}

// X̄-R控制图类
class XbarRChart {
  static processData(data: number[], subgroupSize: number) {
    if (data.length < subgroupSize) {
      throw new Error(`数据点不足，无法生成控制图。需要至少${subgroupSize}个数据点。`);
    }
    
    const numSubgroups = Math.floor(data.length / subgroupSize);
    const processedData = data.slice(0, numSubgroups * subgroupSize);
    
    const subgroups: number[][] = [];
    for (let i = 0; i < numSubgroups; i++) {
      subgroups.push(processedData.slice(i * subgroupSize, (i + 1) * subgroupSize));
    }
    
    return { subgroups, numSubgroups };
  }
  
  static calculateControlLimits(data: number[], subgroupSize: number) {
    const { subgroups } = this.processData(data, subgroupSize);
    
    // 计算X̄（子组均值）和R（极差）
    const xBar = subgroups.map(group => 
      group.reduce((sum, val) => sum + val, 0) / group.length
    );
    const r = subgroups.map(group => 
      Math.max(...group) - Math.min(...group)
    );
    
    // 检查数据变异性
    if (r.every(val => val < 1e-10)) {
      throw new Error("数据几乎没有变异性，无法创建有意义的控制图。");
    }
    
    // 计算总体均值和平均极差
    const xBarMean = xBar.reduce((sum, val) => sum + val, 0) / xBar.length;
    const rMean = r.reduce((sum, val) => sum + val, 0) / r.length;
    
    // 获取控制图系数
    const constants = SPC_CONSTANTS[subgroupSize] || SPC_CONSTANTS[5];
    const { A2, D3, D4 } = constants;
    
    // 计算控制限
    const UCL_xBar = xBarMean + A2 * rMean;
    const LCL_xBar = xBarMean - A2 * rMean;
    const UCL_r = D4 * rMean;
    const LCL_r = D3 * rMean;
    
    return {
      xBar,
      r,
      xBarMean,
      rMean,
      UCL_xBar,
      LCL_xBar,
      UCL_r,
      LCL_r,
    };
  }
}

// X̄-S控制图类
class XbarSChart {
  static calculateControlLimits(data: number[], subgroupSize: number) {
    const { subgroups } = XbarRChart.processData(data, subgroupSize);
    
    // 计算X̄（子组均值）和S（标准差）
    const xBar = subgroups.map(group => 
      group.reduce((sum, val) => sum + val, 0) / group.length
    );
    const s = subgroups.map(group => {
      const mean = group.reduce((sum, val) => sum + val, 0) / group.length;
      const variance = group.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (group.length - 1);
      return Math.sqrt(variance);
    });
    
    // 检查数据变异性
    if (s.every(val => val < 1e-10)) {
      throw new Error("数据几乎没有变异性，无法创建有意义的控制图。");
                }
                
    // 计算总体均值和平均标准差
    const xBarMean = xBar.reduce((sum, val) => sum + val, 0) / xBar.length;
    const sMean = s.reduce((sum, val) => sum + val, 0) / s.length;
                
    // 获取控制图系数
    const constants = SPC_CONSTANTS[subgroupSize] || SPC_CONSTANTS[5];
    const { A3, B3, B4 } = constants;
    
    // 计算控制限
    const UCL_xBar = xBarMean + A3 * sMean;
    const LCL_xBar = xBarMean - A3 * sMean;
    const UCL_s = B4 * sMean;
    const LCL_s = B3 * sMean;
    
    return {
      xBar,
      s,
      xBarMean,
      sMean,
      UCL_xBar,
      LCL_xBar,
      UCL_s,
      LCL_s,
    };
  }
}

const SPCAnalysis: React.FC = () => {
  const [form] = Form.useForm();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null);
  const [chartType, setChartType] = useState<string>('xbar-r');
  const [selectedParameter, setSelectedParameter] = useState<string>('');
  const dispatch = useAppDispatch();
  const { files } = useAppSelector((state) => state.data);
  const { config } = useAppSelector((state) => state.analysis);

  // 自动加载数据
  const { autoUploadCompleted, isLoading } = useAutoUpload();

  const performXbarRAnalysis = (data: number[], subgroupSize: number, parameter: string) => {
    try {
      const results = XbarRChart.calculateControlLimits(data, subgroupSize);
                
                // 检测异常点
      const xBarAlerts = results.xBar.map((value, index) => ({
                  index: index + 1,
                  value,
        isAlert: value > results.UCL_xBar || value < results.LCL_xBar,
        type: value > results.UCL_xBar ? '均值超出上控制限' : 
              value < results.LCL_xBar ? '均值超出下控制限' : '',
                })).filter(item => item.isAlert);
                
      const rAlerts = results.r.map((value, index) => ({
                  index: index + 1,
                  value,
        isAlert: value > results.UCL_r,
        type: value > results.UCL_r ? '极差超出控制限' : '',
                })).filter(item => item.isAlert);

      return {
        ...results,
        alerts: [...xBarAlerts, ...rAlerts],
        alertCount: xBarAlerts.length + rAlerts.length,
        inControlPercentage: ((results.xBar.length - xBarAlerts.length) / results.xBar.length * 100),
      };
    } catch (error: any) {
      throw new Error(`X̄-R分析失败: ${error.message}`);
    }
  };

  const performXbarSAnalysis = (data: number[], subgroupSize: number, parameter: string) => {
    try {
      const results = XbarSChart.calculateControlLimits(data, subgroupSize);
      
      // 检测异常点
      const xBarAlerts = results.xBar.map((value, index) => ({
        index: index + 1,
        value,
        isAlert: value > results.UCL_xBar || value < results.LCL_xBar,
        type: value > results.UCL_xBar ? '均值超出上控制限' : 
              value < results.LCL_xBar ? '均值超出下控制限' : '',
      })).filter(item => item.isAlert);
      
      const sAlerts = results.s.map((value, index) => ({
        index: index + 1,
        value,
        isAlert: value > results.UCL_s || value < results.LCL_s,
        type: value > results.UCL_s ? '标准差超出上控制限' : 
              value < results.LCL_s ? '标准差超出下控制限' : '',
      })).filter(item => item.isAlert);

      return {
        ...results,
        alerts: [...xBarAlerts, ...sAlerts],
        alertCount: xBarAlerts.length + sAlerts.length,
        inControlPercentage: ((results.xBar.length - xBarAlerts.length) / results.xBar.length * 100),
      };
    } catch (error: any) {
      throw new Error(`X̄-S分析失败: ${error.message}`);
    }
  };

  const performShewartAnalysis = (data: number[], parameter: string) => {
    try {
      const results = ShewartChart.calculateControlLimits(data);
      
      // 检测异常点
      const alerts = data.map((value, index) => ({
        index: index + 1,
        value,
        isAlert: value > results.UCL || value < results.LCL,
        type: value > results.UCL ? '超出上控制限' : 
              value < results.LCL ? '超出下控制限' : '',
      })).filter(item => item.isAlert);

      return {
        ...results,
        alerts,
        alertCount: alerts.length,
        inControlPercentage: ((data.length - alerts.length) / data.length * 100),
      };
    } catch (error: any) {
      throw new Error(`休哈特分析失败: ${error.message}`);
    }
  };

  const calculateProcessCapability = (data: number[], usl?: number, lsl?: number, analysisResults?: any) => {
    const overallMean = data.reduce((sum, val) => sum + val, 0) / data.length;
    const variance = data.reduce((sum, val) => sum + Math.pow(val - overallMean, 2), 0) / (data.length - 1);
    const overallStd = Math.sqrt(variance);
                
    // 使用用户输入的规格限或基于6σ计算默认值
    const upperSpec = usl || (overallMean + 3 * overallStd);
    const lowerSpec = lsl || (overallMean - 3 * overallStd);
    
    // 计算过程能力指数
    const cp = (upperSpec - lowerSpec) / (6 * overallStd);
    const cpk = Math.min(
      (upperSpec - overallMean) / (3 * overallStd),
      (overallMean - lowerSpec) / (3 * overallStd)
    );
    
    // Pp和Ppk通常与Cp和Cpk相同，除非有特殊的长期变异考虑
    const pp = cp;
    const ppk = cpk;

    return {
      processCapability: {
                  cp: Math.max(0, cp),
                  cpk: Math.max(0, cpk),
        pp: Math.max(0, pp),
        ppk: Math.max(0, ppk),
                    specification: {
          usl: upperSpec,
          lsl: lowerSpec,
          target: overallMean,
                    },
        statistics: {
          mean: overallMean,
          std: overallStd,
          variance: variance,
                  },
      },
    };
                };

  const createXbarRCharts = (results: any, parameter: string) => {
    return [
                  {
                    type: 'line',
                    data: {
          title: `X̄控制图 - ${parameter}`,
          xData: Array.from({ length: results.xBar.length }, (_, i) => i + 1),
          yData: results.xBar,
          ucl: results.UCL_xBar,
          lcl: results.LCL_xBar,
          centerLine: results.xBarMean,
          alerts: results.alerts.filter((alert: any) => alert.type.includes('均值')),
                    },
                  },
                  {
                    type: 'line',
                    data: {
          title: `R控制图 - ${parameter}`,
          xData: Array.from({ length: results.r.length }, (_, i) => i + 1),
          yData: results.r,
          ucl: results.UCL_r,
          lcl: results.LCL_r,
          centerLine: results.rMean,
          alerts: results.alerts.filter((alert: any) => alert.type.includes('极差')),
                    },
                  },
                ];
  };

  const createXbarSCharts = (results: any, parameter: string) => {
    return [
              {
                type: 'line',
                data: {
          title: `X̄控制图 - ${parameter}`,
          xData: Array.from({ length: results.xBar.length }, (_, i) => i + 1),
          yData: results.xBar,
          ucl: results.UCL_xBar,
          lcl: results.LCL_xBar,
          centerLine: results.xBarMean,
          alerts: results.alerts.filter((alert: any) => alert.type.includes('均值')),
                },
              },
              {
                type: 'line',
                data: {
          title: `S控制图 - ${parameter}`,
          xData: Array.from({ length: results.s.length }, (_, i) => i + 1),
          yData: results.s,
          ucl: results.UCL_s,
          lcl: results.LCL_s,
          centerLine: results.sMean,
          alerts: results.alerts.filter((alert: any) => alert.type.includes('标准差')),
                },
              },
    ];
  };

  const createShewartCharts = (results: any, parameter: string) => {
    return [
      {
        type: 'line',
                data: {
          title: `休哈特控制图 - ${parameter}`,
          xData: Array.from({ length: results.data.length }, (_, i) => i + 1),
          yData: results.data,
          ucl: results.UCL,
          lcl: results.LCL,
          centerLine: results.mean,
          alerts: results.alerts,
                },
              },
            ];
  };

  const handleAnalysis = async (values: any) => {
    if (!values.dataFile) {
      message.error('请选择数据文件');
      return;
    }

    if (!selectedParameter) {
      message.error('请选择监测特性');
      return;
    }

    setRunning(true);
    setProgress(0);

    dispatch(updateConfig({ type: 'spc', config: { ...values, chartType, parameter: selectedParameter } }));

    const selectedFile = files.find(f => f.id === values.dataFile);
    
    const result: AnalysisResult = {
      id: Date.now().toString(),
      type: 'spc',
      name: `SPC分析_${chartType.toUpperCase()}_${selectedParameter}_${new Date().toLocaleString()}`,
      dataFileId: values.dataFile,
      parameters: { ...values, chartType, parameter: selectedParameter },
      results: {},
      charts: [],
      status: 'running',
      progress: 0,
      createdAt: new Date().toISOString(),
    };

    dispatch(addResult(result));
    setCurrentResult(result);

    try {
      // 模拟分析进度
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 100));
        setProgress(i);
          dispatch(updateResult({
            id: result.id,
          updates: { progress: i },
        }));
      }

      // 执行真实的SPC分析
      if (selectedFile && selectedFile.rawData) {
        const columnIndex = selectedFile.rawData.headers.indexOf(selectedParameter);
        if (columnIndex === -1) {
          message.error(`无法找到参数 "${selectedParameter}" 的列。`);
          setRunning(false);
          return;
        }

        const numericColumns = getNumericColumns(selectedFile.rawData);
        
        if (Object.keys(numericColumns).includes(selectedParameter)) {
          const columnData = selectedFile.rawData.data
            .map(row => {
              const value = row[columnIndex];
              if (typeof value === 'number') {
                return value;
              }
              if (typeof value === 'string') {
                // 尝试从字符串中解析数值，忽略非数值字符
                const parsed = parseFloat(value.replace(/[^0-9.-]/g, ''));
                return isNaN(parsed) ? null : parsed;
              }
              return null;
            })
            .filter((val): val is number => val !== null && isFinite(val));

          if (columnData.length === 0) {
            throw new Error(`参数"${selectedParameter}"没有有效的数值数据`);
          }

          let analysisResults: any = {};
          let charts: any[] = [];

          // 根据选择的图表类型执行不同的分析
          switch (chartType) {
            case 'xbar-r':
              analysisResults = performXbarRAnalysis(columnData, values.subgroupSize || 5, selectedParameter);
              charts = createXbarRCharts(analysisResults, selectedParameter);
              break;
            case 'xbar-s':
              analysisResults = performXbarSAnalysis(columnData, values.subgroupSize || 5, selectedParameter);
              charts = createXbarSCharts(analysisResults, selectedParameter);
              break;
            case 'individual':
              analysisResults = performShewartAnalysis(columnData, selectedParameter);
              charts = createShewartCharts(analysisResults, selectedParameter);
              break;
            default:
              throw new Error('不支持的图表类型');
          }

          // 计算过程能力指数
          const capabilityResults = calculateProcessCapability(
            columnData, 
            values.usl, 
            values.lsl,
            analysisResults
          );

          const completedResult: AnalysisResult = {
            ...result,
            results: {
              ...analysisResults,
              ...capabilityResults,
              columnName: selectedParameter,
              dataCount: columnData.length,
              subgroupSize: values.subgroupSize || 5,
            },
              charts,
            status: 'completed',
            progress: 100,
              completedAt: new Date().toISOString(),
          };

          dispatch(updateResult({
            id: result.id,
            updates: {
              results: completedResult.results,
              charts: completedResult.charts,
              status: 'completed',
              progress: 100,
              completedAt: completedResult.completedAt,
            },
          }));

          setCurrentResult(completedResult);
          setRunning(false);
          message.success('SPC分析完成！');
        }
      }
    } catch (error: any) {
      console.error('SPC分析错误:', error);
      message.error(`分析失败: ${error.message}`);
      
      dispatch(updateResult({
        id: result.id,
        updates: {
          status: 'error',
          error: error.message,
        },
      }));
      
      setRunning(false);
    }
  };

  const getControlChartOption = (chartData: any) => {
    const alertPoints = chartData.alerts || [];
    
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
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#d9d9d9',
        borderWidth: 1,
        textStyle: {
          color: '#333'
        },
        formatter: (params: any) => {
          const dataIndex = params[0].dataIndex;
          let result = `样本 ${dataIndex + 1}<br/>值: ${params[0].value.toFixed(3)}`;
          const alert = alertPoints.find((a: any) => a.index === dataIndex + 1);
          if (alert) {
            result += `<br/><span style="color: #ff4d4f;">⚠️ ${alert.type}</span>`;
          }
          return result;
        },
      },
      legend: {
        data: ['测量值', '上控制限', '下控制限', '中心线'],
        top: 35,
        textStyle: {
          fontSize: 12
        }
      },
      grid: {
        left: '8%',
        right: '5%',
        bottom: '15%',
        top: '20%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: chartData.xData,
        name: '样本编号',
        nameLocation: 'middle',
        nameGap: 30,
      },
      yAxis: {
        type: 'value',
        name: '测量值',
      },
      series: [
        {
          name: '测量值',
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
      render: (type: string) => (
        <span style={{ color: '#ff4d4f' }}>
          <AlertOutlined /> {type}
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
          <Card title="参数设置" className="h-full">
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                subgroupSize: 5,
                chartType: 'xbar-r',
                ...config.spc
              }}
              onFinish={handleAnalysis}
            >
              <Form.Item
                name="dataFile"
                label="选择数据文件"
                rules={[{ required: true, message: '请选择数据文件' }]}
              >
                <Select 
                  placeholder="选择数据文件"
                  onChange={(value) => {
                    // 当数据文件改变时，清空监测特性选择
                    setSelectedParameter('');
                  }}
                >
                  {files.filter(f => f.status === 'success').map(file => (
                    <Option key={file.id} value={file.id}>
                      {file.name}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item
                label="监测特性"
                rules={[{ required: true, message: '请选择监测特性' }]}
              >
                <Select 
                  placeholder="选择监测特性" 
                  value={selectedParameter}
                  onChange={setSelectedParameter}
                >
                  {(() => {
                    const selectedFileId = form.getFieldValue('dataFile');
                    if (!selectedFileId) return null;
                    
                    const selectedFile = files.find(f => f.id === selectedFileId);
                    if (!selectedFile || !selectedFile.rawData) {
                      return <Option disabled value="">请先选择数据文件</Option>;
                    }
                    
                    const numericColumns = getNumericColumns(selectedFile.rawData);
                    const columnNames = Object.keys(numericColumns);
                    
                    console.log('Selected file:', selectedFile.name);
                    console.log('Raw data:', selectedFile.rawData);
                    console.log('Numeric columns:', numericColumns);
                    console.log('Column names:', columnNames);
                    
                    if (columnNames.length === 0) {
                      return <Option disabled value="">该文件没有数值列可用于分析</Option>;
                    }
                    
                    return columnNames.map(column => (
                      <Option key={column} value={column}>
                        {column} ({numericColumns[column].length}个数据点)
                      </Option>
                    ));
                  })()}
                </Select>
              </Form.Item>

              <Form.Item
                label="控制图类型"
                rules={[{ required: true, message: '请选择控制图类型' }]}
              >
                <Radio.Group value={chartType} onChange={(e) => setChartType(e.target.value)}>
                  <Space direction="vertical">
                    <Radio value="xbar-r">
                      <Tooltip title="适用于子组大小为2-10的连续数据">
                        X̄-R图（均值-极差图）
                      </Tooltip>
                    </Radio>
                    <Radio value="xbar-s">
                      <Tooltip title="适用于子组大小大于10的连续数据">
                        X̄-S图（均值-标准差图）
                      </Tooltip>
                    </Radio>
                    <Radio value="individual">
                      <Tooltip title="适用于个别值数据或子组大小为1">
                        单值图（休哈特图）
                      </Tooltip>
                    </Radio>
                  </Space>
                </Radio.Group>
              </Form.Item>

              {(chartType === 'xbar-r' || chartType === 'xbar-s') && (
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
              )}

              <Divider />
              
              <Form.Item label="规格限设置">
                <Row gutter={8}>
                  <Col span={12}>
                    <Form.Item name="usl">
                <InputNumber
                        placeholder="上规格限"
                  className="w-full"
                        precision={3}
                />
              </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item name="lsl">
                <InputNumber
                        placeholder="下规格限"
                  className="w-full"
                        precision={3}
                />
                    </Form.Item>
                  </Col>
                </Row>
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
                    {currentResult.charts.map((chart, index) => (
                      <Col span={24} key={index}>
                      <ReactECharts
                          option={getControlChartOption(chart.data)}
                        style={{ height: '350px' }}
                      />
                    </Col>
                    ))}
                  </Row>
                </TabPane>

                <TabPane tab="统计信息" key="statistics">
                  <Row gutter={16}>
                    <Col span={12}>
                      <Card type="inner" title="过程统计">
                        <Statistic 
                          title="数据点数" 
                          value={currentResult.results.dataCount} 
                          suffix="个"
                        />
                        <Statistic 
                          title="过程均值" 
                          value={currentResult.results.processCapability?.statistics?.mean?.toFixed(3) || 'N/A'} 
                          className="mt-2"
                        />
                        <Statistic 
                          title="过程标准差" 
                          value={currentResult.results.processCapability?.statistics?.std?.toFixed(3) || 'N/A'} 
                          className="mt-2"
                        />
                        <Statistic 
                          title="受控率" 
                          value={currentResult.results.inControlPercentage?.toFixed(1)} 
                          suffix="%"
                          className="mt-2"
                          valueStyle={{ 
                            color: currentResult.results.inControlPercentage > 95 ? '#3f8600' : '#cf1322' 
                          }}
                      />
                      </Card>
                    </Col>
                    <Col span={12}>
                      <Card type="inner" title="过程能力">
                        <Statistic 
                          title="Cp" 
                          value={currentResult.results.processCapability?.cp?.toFixed(3) || 'N/A'} 
                          valueStyle={{ 
                            color: (currentResult.results.processCapability?.cp || 0) >= 1.33 ? '#3f8600' : 
                                   (currentResult.results.processCapability?.cp || 0) >= 1.0 ? '#faad14' : '#cf1322' 
                          }}
                        />
                        <Statistic 
                          title="Cpk" 
                          value={currentResult.results.processCapability?.cpk?.toFixed(3) || 'N/A'} 
                          className="mt-2"
                          valueStyle={{ 
                            color: (currentResult.results.processCapability?.cpk || 0) >= 1.33 ? '#3f8600' : 
                                   (currentResult.results.processCapability?.cpk || 0) >= 1.0 ? '#faad14' : '#cf1322' 
                          }}
                        />
                        <div className="mt-4">
                          <Text type="secondary" className="text-xs">
                            {"Cp ≥ 1.33: 优秀 | Cp ≥ 1.0: 合格 | Cp < 1.0: 需改进"}
                            </Text>
                        </div>
                      </Card>
                    </Col>
                  </Row>
                  
                  {currentResult.results.processCapability && (
                    <Row gutter={16} className="mt-4">
                      <Col span={24}>
                        <Card type="inner" title="规格限信息">
                          <Row gutter={16}>
                            <Col span={8}>
                              <Statistic 
                                title="上规格限" 
                                value={String(currentResult.results.processCapability?.specification?.usl?.toFixed(3) || 'N/A')} 
                              />
                            </Col>
                            <Col span={8}>
                              <Statistic 
                                title="下规格限" 
                                value={String(currentResult.results.processCapability?.specification?.lsl?.toFixed(3) || 'N/A')} 
                              />
                            </Col>
                            <Col span={8}>
                              <Statistic 
                                title="目标值" 
                                value={String(currentResult.results.processCapability?.specification?.target?.toFixed(3) || 'N/A')} 
                              />
                            </Col>
                          </Row>
                      </Card>
                    </Col>
                  </Row>
                  )}
                </TabPane>

                <TabPane tab="异常报告" key="alerts">
                  {currentResult.results.alertCount > 0 ? (
                      <>
                      <Alert
                        message={`发现 ${currentResult.results.alertCount} 个异常点`}
                        description="以下样本点超出了控制限，需要特别关注"
                        type="warning"
                        showIcon
                        className="mb-4"
                      />
                        <Table
                          dataSource={currentResult.results.alerts}
                        columns={alertColumns}
                          rowKey="index"
                        pagination={{ pageSize: 10 }}
                          size="small"
                        />
                      </>
                    ) : (
                    <Alert
                      message="过程受控"
                      description="所有数据点都在控制限内，过程处于统计受控状态"
                      type="success"
                      showIcon
                    />
                  )}
                </TabPane>
              </Tabs>
            )}

            {!running && (!currentResult || currentResult.status === 'error') && (
              <div className="text-center py-8">
                <Text type="secondary">
                  {currentResult?.status === 'error' 
                    ? `分析失败: ${currentResult.error}` 
                    : '请配置参数并开始分析'
                  }
                </Text>
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default SPCAnalysis;