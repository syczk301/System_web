import React, { useState, useEffect } from 'react';
import {
  Card,
  Upload,
  Table,
  Button,
  Space,
  Typography,
  Row,
  Col,
  Statistic,
  Tag,
  DatePicker,
  Select,
  Input,
  message,
  Modal,
  Descriptions,
  Pagination,
} from 'antd';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import {
  InboxOutlined,
  UploadOutlined,
  DeleteOutlined,
  EyeOutlined,
  DownloadOutlined,
  FileExcelOutlined,
} from '@ant-design/icons';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import {
  addFile,
  updateFile,
  removeFile,
  setCurrentFile,
  setFilter,
} from '../store/slices/dataSlice';
import type { DataFile } from '../store/slices/dataSlice';
// 移除autoUpload导入 - 已被数据预加载器替代
import { parseExcelFile, convertToTableData, getDataStatistics, type ParsedData } from '../utils/excelParser';
// useAutoUpload已移除，数据现在通过全局预加载器处理
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Dragger } = Upload;
const { RangePicker } = DatePicker;
const { Option } = Select;
const { Search } = Input;

const DataManagement: React.FC = () => {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<DataFile | null>(null);
  const [visualizationFile, setVisualizationFile] = useState<DataFile | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [chartsPerPage] = useState(6);
  const dispatch = useAppDispatch();
  const { files, filter } = useAppSelector((state) => state.data);

  // 自动加载数据
  // 移除useAutoUpload - 数据现在通过全局预加载器自动处理


  const handleUpload = async (file: File) => {
    // 检查文件类型
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      message.error('请上传Excel文件（.xlsx或.xls格式）');
      return false;
    }

    const newFile: DataFile = {
      id: Date.now().toString(),
      name: file.name,
      size: file.size,
      uploadTime: new Date().toISOString(),
      status: 'uploading',
    };

    dispatch(addFile(newFile));
    // dispatch(setUploadProgress(10));

    try {
      // 解析Excel文件
      const parsedData = await parseExcelFile(file);
      // dispatch(setUploadProgress(50));
      
      // 转换为表格数据
      const tableData = convertToTableData(parsedData);
      // dispatch(setUploadProgress(80));
      
      // 获取统计信息
      const statistics = getDataStatistics(parsedData);
      // dispatch(setUploadProgress(100));
      
      // 更新文件状态
      dispatch(updateFile({
        id: newFile.id,
        updates: {
          status: 'success',
          data: tableData,
          columns: parsedData.headers,
          rawData: parsedData,
          statistics,
          rowCount: parsedData.rowCount,
          columnCount: parsedData.columnCount,
        },
      }));
      
      // dispatch(setUploadProgress(0));
      // message.success(`${file.name} 解析成功！共 ${parsedData.rowCount} 行数据`);
    } catch (error) {
      dispatch(updateFile({
        id: newFile.id,
        updates: { status: 'error' },
      }));
      // dispatch(setUploadProgress(0));
      message.error(`${file.name} 解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }

    return false; // 阻止默认上传行为
  };

  const handleDelete = (fileId: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个文件吗？',
      onOk: () => {
        dispatch(removeFile(fileId));
        message.success('文件删除成功');
      },
    });
  };

  const handlePreview = (file: DataFile) => {
    setSelectedFile(file);
    setPreviewVisible(true);
  };

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <Space>
          <FileExcelOutlined className="text-green-500" />
          <Text>{text}</Text>
        </Space>
      ),
    },
    {
      title: '文件大小',
      dataIndex: 'size',
      key: 'size',
      render: (size: number) => `${(size / 1024).toFixed(2)} KB`,
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      key: 'uploadTime',
      render: (time: string) => dayjs(time).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const statusMap = {
          uploading: { color: 'processing', text: '上传中' },
          success: { color: 'success', text: '成功' },
          error: { color: 'error', text: '失败' },
        };
        const config = statusMap[status as keyof typeof statusMap];
        return <Tag color={config.color}>{config.text}</Tag>;
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record: DataFile) => (
        <Space>
          <Button
            type="link"
            icon={<EyeOutlined />}
            onClick={() => handlePreview(record)}
            disabled={record.status !== 'success'}
          >
            预览
          </Button>
          <Button
            type="link"
            icon={<DownloadOutlined />}
            disabled={record.status !== 'success'}
          >
            下载
          </Button>
          <Button
            type="link"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record.id)}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  const previewColumns = selectedFile?.columns?.map(col => ({
    title: col,
    dataIndex: col,
    key: col,
  })) || [];

  // 生成直方图数据
  const generateHistogramData = (data: number[], columnName: string) => {
    if (!data || data.length === 0) return null;
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const binCount = Math.min(20, Math.ceil(Math.sqrt(data.length))); // 自适应分箱数量
    const binWidth = (max - min) / binCount;
    
    const bins = Array(binCount).fill(0);
    const binLabels = [];
    
    // 创建分箱标签
    for (let i = 0; i < binCount; i++) {
      const binStart = min + i * binWidth;
      const binEnd = min + (i + 1) * binWidth;
      binLabels.push(binStart.toFixed(1));
    }
    
    // 统计每个分箱的频数
    data.forEach(value => {
      const binIndex = Math.min(Math.floor((value - min) / binWidth), binCount - 1);
      bins[binIndex]++;
    });
    
    return {
      title: columnName,
      xData: binLabels,
      yData: bins,
      min: min.toFixed(2),
      max: max.toFixed(2),
      count: data.length
    };
  };

  // 获取直方图配置
  const getHistogramOption = (histogramData: any) => {
    if (!histogramData) return {};
    
    return {
      title: {
        text: histogramData.title,
        left: 'center',
        textStyle: {
          fontSize: 14,
          fontWeight: 'normal'
        }
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
        top: '20%'
      },
      xAxis: {
        type: 'category',
        data: histogramData.xData,
        axisLabel: {
          fontSize: 10,
          rotate: 45
        },
        name: '值',
        nameLocation: 'middle',
        nameGap: 25
      },
      yAxis: {
        type: 'value',
        name: '频数',
        nameLocation: 'middle',
        nameGap: 30,
        axisLabel: {
          fontSize: 10
        }
      },
      series: [{
        data: histogramData.yData,
        type: 'bar',
        itemStyle: {
          color: '#5B9BD5'
        },
        barWidth: '80%'
      }],
      tooltip: {
        trigger: 'axis',
        formatter: function(params: any) {
          const dataIndex = params[0].dataIndex;
          const binStart = histogramData.xData[dataIndex];
          const binEnd = dataIndex < histogramData.xData.length - 1 ? 
            histogramData.xData[dataIndex + 1] : 
            histogramData.max;
          return `区间: [${binStart}, ${binEnd})<br/>频数: ${params[0].value}`;
        }
      }
    };
  };

  // 获取数值列数据
  const getNumericColumnsData = (file: DataFile) => {
    if (!file.rawData) return [];
    
    const numericColumns: Array<{name: string, data: number[]}> = [];
    
    file.rawData.headers.forEach((header, colIndex) => {
      const columnData = file.rawData!.data.map(row => {
        const value = row[colIndex];
        return typeof value === 'number' ? value : parseFloat(value);
      }).filter(val => !isNaN(val));
      
      if (columnData.length > 0) {
        numericColumns.push({
          name: header,
          data: columnData
        });
      }
    });
    
    return numericColumns;
  };

  // 设置可视化文件
  useEffect(() => {
    const successFiles = files.filter(f => f.status === 'success' && f.rawData);
    if (successFiles.length > 0 && !visualizationFile) {
      setVisualizationFile(successFiles[0]);
    }
  }, [files, visualizationFile]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Title level={3}>数据管理</Title>
        <Button type="primary" icon={<UploadOutlined />}>
          批量上传
        </Button>
      </div>

      {/* 统计信息 */}
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总文件数"
              value={files.length}
              suffix="个"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="成功上传"
              value={files.filter(f => f.status === 'success').length}
              suffix="个"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="总大小"
              value={(files.reduce((sum, f) => sum + f.size, 0) / 1024 / 1024).toFixed(2)}
              suffix="MB"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="状态"
              value="就绪"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 文件上传 */}
      <Card title="文件上传" className="mb-6">
        {/* 上传提示已移除，数据通过全局预加载器无感处理 */}
        <Dragger
          name="file"
          multiple
          accept=".xlsx,.xls,.csv"
          beforeUpload={handleUpload}
          showUploadList={false}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined className="text-4xl text-blue-500" />
          </p>
          <p className="ant-upload-text text-lg">点击或拖拽文件到此区域上传</p>
          <p className="ant-upload-hint text-gray-500">
            支持 Excel (.xlsx, .xls) 和 CSV 格式文件，单个文件不超过 10MB
            <br />
            <Text type="secondary">系统已自动加载：正常数据.xlsx, 质检数据.xlsx</Text>
          </p>
        </Dragger>
      </Card>

      {/* 数据筛选 */}
      <Card title="数据筛选">
        <Row gutter={16}>
          <Col span={8}>
            <Text>时间范围：</Text>
            <RangePicker
              className="w-full mt-1"
              onChange={(dates) => {
                dispatch(setFilter({
                  ...filter,
                  dateRange: dates ? [dates[0]!.format('YYYY-MM-DD'), dates[1]!.format('YYYY-MM-DD')] : undefined,
                }));
              }}
            />
          </Col>
          <Col span={8}>
            <Text>车间：</Text>
            <Select
              className="w-full mt-1"
              placeholder="选择车间"
              allowClear
              onChange={(value) => {
                dispatch(setFilter({ ...filter, workshop: value }));
              }}
            >
              <Option value="workshop1">第一车间</Option>
              <Option value="workshop2">第二车间</Option>
              <Option value="workshop3">第三车间</Option>
            </Select>
          </Col>
          <Col span={8}>
            <Text>设备：</Text>
            <Search
              className="mt-1"
              placeholder="搜索设备"
              allowClear
              onSearch={(value) => {
                dispatch(setFilter({ ...filter, equipment: value }));
              }}
            />
          </Col>
        </Row>
      </Card>

      {/* 数据可视化概览 */}
      {visualizationFile && (() => {
        const numericColumns = getNumericColumnsData(visualizationFile);
        const totalColumns = numericColumns.length;
        const startIndex = (currentPage - 1) * chartsPerPage;
        const endIndex = Math.min(startIndex + chartsPerPage, totalColumns);
        const currentColumns = numericColumns.slice(startIndex, endIndex);
        
        return (
          <Card 
            title="数据可视化概览" 
            extra={
              <Space>
                <Select
                  value={visualizationFile.id}
                  onChange={(value) => {
                    const file = files.find(f => f.id === value);
                    if (file) {
                      setVisualizationFile(file);
                      setCurrentPage(1);
                    }
                  }}
                  style={{ width: 200 }}
                >
                  {files.filter(f => f.status === 'success' && f.rawData).map(file => (
                    <Option key={file.id} value={file.id}>{file.name}</Option>
                  ))}
                </Select>
              </Space>
            }
          >
            <div className="mb-4">
              <Text className="text-blue-600 text-lg font-medium">
                数据分布可视化 (第{startIndex + 1}-{endIndex}列，共{totalColumns}列)
              </Text>
            </div>
            
            <Row gutter={[16, 16]}>
              {currentColumns.map((column, index) => {
                const histogramData = generateHistogramData(column.data, column.name);
                if (!histogramData) return null;
                
                return (
                  <Col span={8} key={`${column.name}-${index}`}>
                    <div className="border rounded p-2 bg-white shadow-sm">
                      <ReactECharts
                        option={getHistogramOption(histogramData)}
                        style={{ height: '280px', width: '100%' }}
                        opts={{ 
                          renderer: 'canvas',
                          devicePixelRatio: window.devicePixelRatio || 1
                        }}
                        echarts={echarts}
                        notMerge={true}
                        lazyUpdate={true}
                      />
                    </div>
                  </Col>
                );
              })}
            </Row>
            
            {totalColumns > chartsPerPage && (
              <div className="mt-4 text-center">
                <Pagination
                  current={currentPage}
                  total={totalColumns}
                  pageSize={chartsPerPage}
                  onChange={(page) => setCurrentPage(page)}
                  showSizeChanger={false}
                  showQuickJumper
                  showTotal={(total, range) => `第 ${range[0]}-${range[1]} 列，共 ${total} 列`}
                />
              </div>
            )}
          </Card>
        );
      })()}

      {/* 文件列表 */}
      <Card title="文件列表">
        <Table
          columns={columns}
          dataSource={files}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个文件`,
          }}
        />
      </Card>

      {/* 数据预览模态框 */}
      <Modal
        title={`数据预览 - ${selectedFile?.name}`}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        width={1000}
        footer={[
          <Button key="close" onClick={() => setPreviewVisible(false)}>
            关闭
          </Button>,
        ]}
      >
        {selectedFile && (
          <div className="space-y-4">
            <Descriptions bordered size="small">
              <Descriptions.Item label="文件名">{selectedFile.name}</Descriptions.Item>
              <Descriptions.Item label="文件大小">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </Descriptions.Item>
              <Descriptions.Item label="上传时间">
                {dayjs(selectedFile.uploadTime).format('YYYY-MM-DD HH:mm:ss')}
              </Descriptions.Item>
              <Descriptions.Item label="数据行数">
                {selectedFile.data?.length || 0} 行
              </Descriptions.Item>
              <Descriptions.Item label="列数">
                {selectedFile.columns?.length || 0} 列
              </Descriptions.Item>
            </Descriptions>
            
            <Table
              columns={previewColumns}
              dataSource={selectedFile.data?.slice(0, 100)} // 只显示前100行
              rowKey="id"
              size="small"
              pagination={false}
              scroll={{ y: 400 }}
            />
            
            {selectedFile.data && selectedFile.data.length > 100 && (
              <Text type="secondary">
                仅显示前100行数据，完整数据请下载文件查看
              </Text>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default DataManagement;