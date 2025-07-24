import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Card,
  Row,
  Col,
  Typography,
  Button,
  Space,
  Statistic,
  Timeline,
  Tag,
} from 'antd';
import {
  BarChartOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  UserOutlined,
  RightOutlined,
  TrophyOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { useAppSelector } from '../store/hooks';

const { Title, Paragraph, Text } = Typography;

const Home: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAppSelector((state) => state.auth);
  const { files } = useAppSelector((state) => state.data);
  const { results } = useAppSelector((state) => state.analysis);

  const quickActions = [
    {
      title: 'PCA分析',
      description: '主成分分析，降维和异常检测',
      icon: <BarChartOutlined className="text-2xl text-blue-500" />,
      path: '/analysis/pca',
      color: 'blue',
    },
    {
      title: 'ICA分析',
      description: '独立成分分析，信号分离',
      icon: <BarChartOutlined className="text-2xl text-green-500" />,
      path: '/analysis/ica',
      color: 'green',
    },
    {
      title: '自动编码器',
      description: '深度学习异常检测',
      icon: <BarChartOutlined className="text-2xl text-purple-500" />,
      path: '/analysis/ae',
      color: 'purple',
    },
    {
      title: 'SPC分析',
      description: '统计过程控制',
      icon: <BarChartOutlined className="text-2xl text-orange-500" />,
      path: '/analysis/spc',
      color: 'orange',
    },
    {
      title: '数据管理',
      description: '上传和管理数据文件',
      icon: <DatabaseOutlined className="text-2xl text-cyan-500" />,
      path: '/data',
      color: 'cyan',
    },
    {
      title: '结果展示',
      description: '查看分析结果和报告',
      icon: <FileTextOutlined className="text-2xl text-red-500" />,
      path: '/results',
      color: 'red',
    },
  ];

  const recentActivities = [
    {
      time: '2024-01-15 14:30',
      action: '完成PCA分析',
      status: 'success',
      description: '质检数据.xlsx',
    },
    {
      time: '2024-01-15 13:45',
      action: '上传数据文件',
      status: 'info',
      description: '正常数据.xlsx',
    },
    {
      time: '2024-01-15 10:20',
      action: '生成分析报告',
      status: 'success',
      description: 'ICA异常检测报告',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 欢迎区域 */}
      <Card className="bg-gradient-to-r from-blue-500 to-purple-600 text-white border-0">
        <Row align="middle">
          <Col span={16}>
            <Title level={2} className="!text-white !mb-2">
              欢迎使用智能诊断系统
            </Title>
            <Paragraph className="!text-blue-100 text-lg !mb-4">
              专业的工业过程监控与故障诊断平台，集成PCA、ICA、自动编码器等多种先进算法
            </Paragraph>
            <Space>
              <Button
                type="primary"
                size="large"
                ghost
                onClick={() => navigate('/data')}
              >
                开始分析
              </Button>
              <Button
                size="large"
                ghost
                onClick={() => navigate('/results')}
              >
                查看结果
              </Button>
            </Space>
          </Col>
          <Col span={8} className="text-right">
            <TrophyOutlined className="text-6xl text-yellow-300" />
          </Col>
        </Row>
      </Card>

      {/* 统计信息 */}
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="数据文件"
              value={files.length}
              suffix="个"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="分析结果"
              value={results.length}
              suffix="个"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="用户角色"
              value={user?.role === 'admin' ? '管理员' : '普通用户'}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="在线状态"
              value="正常"
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={16}>
        {/* 快速操作 */}
        <Col span={16}>
          <Card title="快速操作" extra={<Text type="secondary">选择分析模块</Text>}>
            <Row gutter={[16, 16]}>
              {quickActions.map((action, index) => (
                <Col span={8} key={index}>
                  <Card
                    hoverable
                    className="text-center cursor-pointer transition-all duration-300 hover:shadow-lg"
                    onClick={() => navigate(action.path)}
                    bodyStyle={{ padding: '20px 16px' }}
                  >
                    <Space direction="vertical" size="small" className="w-full">
                      {action.icon}
                      <Title level={5} className="!mb-1">
                        {action.title}
                      </Title>
                      <Text type="secondary" className="text-xs">
                        {action.description}
                      </Text>
                      <Button
                        type="link"
                        size="small"
                        icon={<RightOutlined />}
                        className="!p-0"
                      >
                        开始使用
                      </Button>
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          </Card>
        </Col>

        {/* 最近活动 */}
        <Col span={8}>
          <Card title="最近活动" extra={<ClockCircleOutlined />}>
            <Timeline
              items={recentActivities.map((activity, index) => ({
                key: index,
                color: activity.status === 'success' ? 'green' : 'blue',
                children: (
                  <div>
                    <div className="flex justify-between items-start mb-1">
                      <Text strong>{activity.action}</Text>
                      <Tag
                        color={activity.status === 'success' ? 'success' : 'processing'}
                        className="text-xs"
                      >
                        {activity.status === 'success' ? '完成' : '进行中'}
                      </Tag>
                    </div>
                    <Text type="secondary" className="text-sm">
                      {activity.description}
                    </Text>
                    <br />
                    <Text type="secondary" className="text-xs">
                      {activity.time}
                    </Text>
                  </div>
                ),
              }))}
            />
          </Card>
        </Col>
      </Row>

      {/* 系统介绍 */}
      <Card title="系统功能介绍">
        <Row gutter={16}>
          <Col span={8}>
            <Card type="inner" title="数据分析">
              <Paragraph>
                支持多种先进的数据分析算法，包括PCA主成分分析、ICA独立成分分析、
                自动编码器深度学习模型等，为工业过程提供全面的数据洞察。
              </Paragraph>
            </Card>
          </Col>
          <Col span={8}>
            <Card type="inner" title="异常检测">
              <Paragraph>
                基于统计学习和深度学习的异常检测技术，能够及时发现生产过程中的
                异常情况，提供早期预警和故障诊断能力。
              </Paragraph>
            </Card>
          </Col>
          <Col span={8}>
            <Card type="inner" title="可视化展示">
              <Paragraph>
                提供丰富的图表和可视化功能，包括监控图、散点图、热力图等，
                帮助用户直观理解数据分析结果。
              </Paragraph>
            </Card>
          </Col>
        </Row>
      </Card>
    </div>
  );
};

export default Home;