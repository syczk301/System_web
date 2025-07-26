import React, { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Tag,
  Modal,
  Tabs,
  Row,
  Col,
  Select,
  DatePicker,
  Input,
  Popconfirm,
  message,
  Empty,
} from 'antd';
import {
  EyeOutlined,
  DownloadOutlined,
  DeleteOutlined,
  SearchOutlined,
  FileTextOutlined,
  BarChartOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import ReactECharts from 'echarts-for-react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { removeResult } from '../store/slices/analysisSlice';
import type { AnalysisResult } from '../store/slices/analysisSlice';
// useAutoUpload已移除，数据现在通过全局预加载器处理

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;
const { TabPane } = Tabs;

const Results: React.FC = () => {
  const [selectedResult, setSelectedResult] = useState<AnalysisResult | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const dispatch = useAppDispatch();
  const { results } = useAppSelector((state) => state.analysis);
  const { files } = useAppSelector((state) => state.data);

  // 自动加载数据
  // 移除useAutoUpload - 数据现在通过全局预加载器自动处理

  const getAnalysisTypeName = (type: string) => {
    const typeMap: Record<string, string> = {
      pca: 'PCA主成分分析',
      ica: 'ICA独立成分分析',
      ae: 'Autoencoder自编码器',
      dl: '深度学习分析',
      spc: 'SPC统计过程控制',
    };
    return typeMap[type] || type;
  };

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      running: 'processing',
      completed: 'success',
      failed: 'error',
      cancelled: 'default',
    };
    return colorMap[status] || 'default';
  };

  const getStatusText = (status: string) => {
    const textMap: Record<string, string> = {
      running: '运行中',
      completed: '已完成',
      failed: '失败',
      cancelled: '已取消',
    };
    return textMap[status] || status;
  };

  const handleViewResult = (result: AnalysisResult) => {
    setSelectedResult(result);
    setModalVisible(true);
  };

  const handleDeleteResult = (resultId: string) => {
    dispatch(removeResult(resultId));
    message.success('分析结果已删除');
  };

  const handleDownloadResult = (result: AnalysisResult) => {
    // 模拟下载功能
    const data = {
      name: result.name,
      type: result.type,
      parameters: result.parameters,
      results: result.results,
      createdAt: result.createdAt,
      completedAt: result.completedAt,
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.name}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    message.success('分析结果已下载');
  };

  const filteredResults = results.filter(result => {
    const matchesSearch = result.name.toLowerCase().includes(searchText.toLowerCase());
    const matchesType = filterType === 'all' || result.type === filterType;
    const matchesStatus = filterStatus === 'all' || result.status === filterStatus;
    return matchesSearch && matchesType && matchesStatus;
  });

  const columns = [
    {
      title: '分析名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: AnalysisResult) => (
        <div>
          <div className="font-medium">{text}</div>
          <div className="text-sm text-gray-500">
            {getAnalysisTypeName(record.type)}
          </div>
        </div>
      ),
    },
    {
      title: '数据文件',
      dataIndex: 'dataFileId',
      key: 'dataFileId',
      render: (fileId: string) => {
        const file = files.find(f => f.id === fileId);
        return file ? file.name : '未知文件';
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string, record: AnalysisResult) => (
        <div>
          <Tag color={getStatusColor(status)}>
            {getStatusText(status)}
          </Tag>
          {status === 'running' && record.progress !== undefined && (
            <div className="text-xs text-gray-500 mt-1">
              进度: {record.progress}%
            </div>
          )}
        </div>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => new Date(text).toLocaleString(),
    },
    {
      title: '完成时间',
      dataIndex: 'completedAt',
      key: 'completedAt',
      render: (text: string) => text ? new Date(text).toLocaleString() : '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: AnalysisResult) => (
        <Space size="middle">
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handleViewResult(record)}
            disabled={record.status !== 'completed'}
          >
            查看
          </Button>
          <Button
            type="link"
            icon={<DownloadOutlined />}
            onClick={() => handleDownloadResult(record)}
            disabled={record.status !== 'completed'}
          >
            下载
          </Button>
          <Popconfirm
            title="确定要删除这个分析结果吗？"
            onConfirm={() => handleDeleteResult(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const renderChartInModal = (chart: any) => {
    if (!chart || !chart.data) return null;

    let option = {};
    
    switch (chart.type) {
      case 'scatter':
        option = {
          title: { text: chart.data.title, left: 'center' },
          tooltip: { trigger: 'item' },
          xAxis: { type: 'value', name: chart.data.xLabel },
          yAxis: { type: 'value', name: chart.data.yLabel },
          series: [{
            type: 'scatter',
            data: chart.data.data,
            itemStyle: { color: '#1890ff' },
          }],
        };
        break;
      case 'line':
        option = {
          title: { text: chart.data.title, left: 'center' },
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: chart.data.xData },
          yAxis: { type: 'value' },
          series: [{
            type: 'line',
            data: chart.data.yData || chart.data.trainData,
            smooth: true,
            itemStyle: { color: '#1890ff' },
          }],
        };
        break;
      case 'bar':
        option = {
          title: { text: chart.data.title, left: 'center' },
          tooltip: { trigger: 'axis' },
          xAxis: { type: 'category', data: chart.data.xData },
          yAxis: { type: 'value' },
          series: [{
            type: 'bar',
            data: chart.data.yData,
            itemStyle: { color: '#52c41a' },
          }],
        };
        break;
      default:
        return <div className="text-center text-gray-500">不支持的图表类型</div>;
    }

    return (
      <ReactECharts
        option={option}
        style={{ height: '300px' }}
      />
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Title level={3}>分析结果</Title>
        <Space>
          <Button icon={<FileTextOutlined />}>生成报告</Button>
          <Button type="primary" icon={<BarChartOutlined />}>批量导出</Button>
        </Space>
      </div>

      {/* 筛选器 */}
      <Card>
        <Row gutter={16} align="middle">
          <Col span={6}>
            <Input
              placeholder="搜索分析名称"
              prefix={<SearchOutlined />}
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </Col>
          <Col span={4}>
            <Select
              placeholder="分析类型"
              value={filterType}
              onChange={setFilterType}
              className="w-full"
            >
              <Option value="all">全部类型</Option>
              <Option value="pca">PCA分析</Option>
              <Option value="ica">ICA分析</Option>
              <Option value="ae">自编码器</Option>
              <Option value="dl">深度学习</Option>
              <Option value="spc">SPC分析</Option>
            </Select>
          </Col>
          <Col span={4}>
            <Select
              placeholder="状态"
              value={filterStatus}
              onChange={setFilterStatus}
              className="w-full"
            >
              <Option value="all">全部状态</Option>
              <Option value="running">运行中</Option>
              <Option value="completed">已完成</Option>
              <Option value="failed">失败</Option>
              <Option value="cancelled">已取消</Option>
            </Select>
          </Col>
          <Col span={6}>
            <RangePicker className="w-full" />
          </Col>
          <Col span={4}>
            <Button icon={<FilterOutlined />} className="w-full">
              重置筛选
            </Button>
          </Col>
        </Row>
      </Card>

      {/* 结果列表 */}
      <Card>
        {filteredResults.length > 0 ? (
          <Table
            columns={columns}
            dataSource={filteredResults}
            rowKey="id"
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
            }}
          />
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="暂无分析结果"
          >
            <Button type="primary">开始新的分析</Button>
          </Empty>
        )}
      </Card>

      {/* 结果详情模态框 */}
      <Modal
        title={selectedResult ? `${selectedResult.name} - 详细结果` : '分析结果'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        footer={[
          <Button key="download" icon={<DownloadOutlined />} onClick={() => selectedResult && handleDownloadResult(selectedResult)}>
            下载结果
          </Button>,
          <Button key="close" onClick={() => setModalVisible(false)}>
            关闭
          </Button>,
        ]}
        width={1000}
      >
        {selectedResult && (
          <Tabs defaultActiveKey="charts">
            <TabPane tab="图表展示" key="charts">
              {selectedResult.charts && selectedResult.charts.length > 0 ? (
                <Row gutter={[16, 16]}>
                  {selectedResult.charts.map((chart, index) => (
                    <Col span={12} key={index}>
                      <Card type="inner" title={chart.data?.title || `图表 ${index + 1}`}>
                        {renderChartInModal(chart)}
                      </Card>
                    </Col>
                  ))}
                </Row>
              ) : (
                <Empty description="暂无图表数据" />
              )}
            </TabPane>
            
            <TabPane tab="参数配置" key="parameters">
              <Card type="inner" title="分析参数">
                <div className="space-y-3">
                  {Object.entries(selectedResult.parameters || {}).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <Text strong>{key}:</Text>
                      <Text>{String(value)}</Text>
                    </div>
                  ))}
                </div>
              </Card>
            </TabPane>
            
            <TabPane tab="数值结果" key="results">
              <Card type="inner" title="分析结果">
                {selectedResult.results && Object.keys(selectedResult.results).length > 0 ? (
                  <div className="space-y-3">
                    {Object.entries(selectedResult.results).map(([key, value]) => {
                      if (Array.isArray(value)) {
                        return (
                          <div key={key}>
                            <Text strong>{key}:</Text>
                            <div className="ml-4 mt-1">
                              {value.slice(0, 5).map((item, index) => (
                                <div key={index} className="text-sm text-gray-600">
                                  {typeof item === 'object' ? JSON.stringify(item) : String(item)}
                                </div>
                              ))}
                              {value.length > 5 && (
                                <div className="text-sm text-gray-400">... 还有 {value.length - 5} 项</div>
                              )}
                            </div>
                          </div>
                        );
                      } else if (typeof value === 'object') {
                        return (
                          <div key={key}>
                            <Text strong>{key}:</Text>
                            <pre className="ml-4 mt-1 text-sm bg-gray-50 p-2 rounded">
                              {JSON.stringify(value, null, 2)}
                            </pre>
                          </div>
                        );
                      } else {
                        return (
                          <div key={key} className="flex justify-between">
                            <Text strong>{key}:</Text>
                            <Text>{String(value)}</Text>
                          </div>
                        );
                      }
                    })}
                  </div>
                ) : (
                  <Empty description="暂无数值结果" />
                )}
              </Card>
            </TabPane>
            
            <TabPane tab="分析信息" key="info">
              <Card type="inner" title="基本信息">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Text strong>分析类型:</Text>
                    <Text>{getAnalysisTypeName(selectedResult.type)}</Text>
                  </div>
                  <div className="flex justify-between">
                    <Text strong>数据文件:</Text>
                    <Text>{files.find(f => f.id === selectedResult.dataFileId)?.name || '未知文件'}</Text>
                  </div>
                  <div className="flex justify-between">
                    <Text strong>创建时间:</Text>
                    <Text>{new Date(selectedResult.createdAt).toLocaleString()}</Text>
                  </div>
                  {selectedResult.completedAt && (
                    <div className="flex justify-between">
                      <Text strong>完成时间:</Text>
                      <Text>{new Date(selectedResult.completedAt).toLocaleString()}</Text>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <Text strong>状态:</Text>
                    <Tag color={getStatusColor(selectedResult.status)}>
                      {getStatusText(selectedResult.status)}
                    </Tag>
                  </div>
                </div>
              </Card>
            </TabPane>
          </Tabs>
        )}
      </Modal>
    </div>
  );
};

export default Results;