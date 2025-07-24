import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Layout as AntLayout,
  Menu,
  Button,
  Avatar,
  Dropdown,
  Space,
  Typography,
  theme,
} from 'antd';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  HomeOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  UserOutlined,
  FileTextOutlined,
  LogoutOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { logout } from '../store/slices/authSlice';

const { Header, Sider, Content } = AntLayout;
const { Title } = Typography;

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login');
  };

  const menuItems = [
    {
      key: '/home',
      icon: <HomeOutlined />,
      label: '首页',
    },
    {
      key: '/data',
      icon: <DatabaseOutlined />,
      label: '数据管理',
    },
    {
      key: 'analysis',
      icon: <BarChartOutlined />,
      label: '算法分析',
      children: [
        {
          key: '/analysis/pca',
          label: 'PCA分析',
        },
        {
          key: '/analysis/ica',
          label: 'ICA分析',
        },
        {
          key: '/analysis/ae',
          label: '自动编码器',
        },
        {
          key: '/analysis/dl',
          label: '深度学习',
        },
        {
          key: '/analysis/spc',
          label: 'SPC分析',
        },
      ],
    },
    {
      key: '/results',
      icon: <FileTextOutlined />,
      label: '结果展示',
    },
  ];

  // 管理员用户可以看到用户管理菜单
  if (user?.role === 'admin') {
    menuItems.splice(-1, 0, {
      key: '/users',
      icon: <UserOutlined />,
      label: '用户管理',
    });
  }

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人信息',
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置',
    },
    {
      type: 'divider' as const,
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ];

  return (
    <AntLayout className="min-h-screen">
      <Sider trigger={null} collapsible collapsed={collapsed} className="bg-white shadow-md">
        <div className="flex items-center justify-center h-16 border-b border-gray-200">
          <Title level={4} className="!mb-0 text-blue-600">
            {collapsed ? '智诊' : '智能诊断系统'}
          </Title>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['analysis']}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="border-r-0"
        />
      </Sider>
      <AntLayout>
        <Header
          style={{ padding: 0, background: colorBgContainer }}
          className="shadow-sm border-b border-gray-200"
        >
          <div className="flex items-center justify-between px-6">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              className="text-lg w-16 h-16"
            />
            <Space>
              <span className="text-gray-600">欢迎，{user?.username}</span>
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                <Avatar
                  size="default"
                  icon={<UserOutlined />}
                  className="cursor-pointer bg-blue-500"
                />
              </Dropdown>
            </Space>
          </div>
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: 24,
            minHeight: 280,
            background: colorBgContainer,
            borderRadius: borderRadiusLG,
          }}
        >
          {children}
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;