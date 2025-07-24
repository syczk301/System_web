import React, { useState } from 'react';
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
  Progress,
  Tag,
  DatePicker,
  Select,
  Input,
  message,
  Modal,
  Descriptions,
} from 'antd';
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
  setUploadProgress,
} from '../store/slices/dataSlice';
import type { DataFile } from '../store/slices/dataSlice';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Dragger } = Upload;
const { RangePicker } = DatePicker;
const { Option } = Select;
const { Search } = Input;

const DataManagement: React.FC = () => {
  const [previewVisible, setPreviewVisible] = useState(false);
  const [selectedFile, setSelectedFile] = useState<DataFile | null>(null);
  const dispatch = useAppDispatch();
  const { files, filter, uploadProgress } = useAppSelector((state) => state.data);

  // 模拟数据
  const mockData = [
    { id: 1, timestamp: '2024-01-15 10:00:00', temperature: 25.5, pressure: 1.2, flow: 100.5, quality: 'A' },
    { id: 2, timestamp: '2024-01-15 10:05:00', temperature: 26.1, pressure: 1.3, flow: 98.2, quality: 'A' },
    { id: 3, timestamp: '2024-01-15 10:10:00', temperature: 24.8, pressure: 1.1, flow: 102.1, quality: 'B' },
  ];

  const handleUpload = (file: File) => {
    const newFile: DataFile = {
      id: Date.now().toString(),
      name: file.name,
      size: file.size,
      uploadTime: new Date().toISOString(),
      status: 'uploading',
    };

    dispatch(addFile(newFile));

    // 模拟上传进度
    let progress = 0;
    const timer = setInterval(() => {
      progress += 10;
      dispatch(setUploadProgress(progress));
      
      if (progress >= 100) {
        clearInterval(timer);
        dispatch(updateFile({
          id: newFile.id,
          updates: {
            status: 'success',
            data: mockData,
            columns: ['timestamp', 'temperature', 'pressure', 'flow', 'quality'],
          },
        }));
        dispatch(setUploadProgress(0));
        message.success(`${file.name} 上传成功！`);
      }
    }, 200);

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
            {uploadProgress > 0 && (
              <div>
                <Text>上传进度</Text>
                <Progress percent={uploadProgress} size="small" />
              </div>
            )}
            {uploadProgress === 0 && (
              <Statistic
                title="状态"
                value="就绪"
                valueStyle={{ color: '#52c41a' }}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* 文件上传 */}
      <Card title="文件上传" className="mb-6">
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