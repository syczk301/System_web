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
  Badge,
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
  BellOutlined,
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
    <AntLayout className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100">
      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed} 
        className="!bg-gradient-to-b from-white to-gray-50 shadow-2xl border-r border-gray-100"
        style={{
          boxShadow: '4px 0 20px rgba(0, 0, 0, 0.08)',
          transition: 'all 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div className="flex items-center justify-center h-16 border-b border-gray-100 bg-gradient-to-r from-blue-600 to-indigo-600 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-600/90 to-indigo-600/90"></div>
          <Title level={4} className="!mb-0 text-white relative z-10 font-bold tracking-wide">
            {collapsed ? (
              <span className="text-xl">智诊</span>
            ) : (
              <span className="bg-gradient-to-r from-white to-blue-100 bg-clip-text text-transparent">
                智能诊断系统
              </span>
            )}
          </Title>
          <div className="absolute -right-4 -top-4 w-16 h-16 bg-white/10 rounded-full blur-xl"></div>
          <div className="absolute -left-2 -bottom-2 w-12 h-12 bg-indigo-300/20 rounded-full blur-lg"></div>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          defaultOpenKeys={['analysis']}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          className="border-r-0 !bg-transparent mt-2"
          style={{
            fontSize: '14px',
            fontWeight: '500',
          }}
          theme="light"
        />
        <style jsx global>{`
          .ant-menu-item {
            margin: 4px 8px !important;
            border-radius: 12px !important;
            transition: all 0.1s cubic-bezier(0.4, 0, 0.2, 1) !important;
            position: relative !important;
            overflow: hidden !important;
          }
          .ant-menu-item:hover:not(.ant-menu-item-selected) {
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%) !important;
            transform: translateX(4px) !important;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15) !important;
          }
          .ant-menu-item-selected {
            background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%) !important;
            color: white !important;
            box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4) !important;
            transition: all 0.05s ease !important;
            transform: translateX(4px) !important;
          }
          .ant-menu-item-selected:hover {
            background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%) !important;
            color: white !important;
            box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4) !important;
            transform: translateX(4px) !important;
          }
          .ant-menu-item-selected .ant-menu-item-icon {
            color: white !important;
          }
          .ant-menu-submenu-title {
            margin: 4px 8px !important;
            border-radius: 12px !important;
            transition: all 0.1s ease !important;
          }
          .ant-menu-submenu-title:hover {
            background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%) !important;
            transform: translateX(2px) !important;
          }
        `}</style>
      </Sider>
      <AntLayout>
        <Header
          style={{ 
            padding: 0, 
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            backdropFilter: 'blur(10px)',
            borderBottom: '1px solid rgba(226, 232, 240, 0.8)',
          }}
          className="shadow-lg relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-white/80 to-slate-50/80"></div>
          <div className="flex items-center justify-between px-6 relative z-10">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              className="text-lg w-12 h-12 rounded-xl hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:text-blue-600 transition-all duration-100 hover:scale-105 hover:shadow-lg"
              style={{
                border: '1px solid transparent',
                background: 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
              }}
            />
            <Space size="large" className="items-center">
              <Badge count={3} size="small">
                <Button
                  type="text"
                  icon={<BellOutlined />}
                  className="w-10 h-10 rounded-full hover:bg-gradient-to-r hover:from-blue-50 hover:to-indigo-50 hover:text-blue-600 transition-all duration-100 hover:scale-105"
                />
              </Badge>
              <div className="flex items-center space-x-3">
                <div className="text-right hidden sm:block">
                  <div className="text-sm font-medium text-gray-700">欢迎回来</div>
                  <div className="text-xs text-gray-500">{user?.username}</div>
                </div>
                <Dropdown 
                  menu={{ items: userMenuItems }} 
                  placement="bottomRight"
                  trigger={['click']}
                >
                  <div className="relative cursor-pointer group">
                    <Avatar
                      size={40}
                      icon={<UserOutlined />}
                      className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 transition-all duration-150 group-hover:scale-110 group-hover:shadow-xl border-2 border-white shadow-lg"
                    />
                    <div className="absolute -inset-1 bg-gradient-to-r from-blue-400 to-indigo-500 rounded-full opacity-0 group-hover:opacity-20 transition-opacity duration-150 blur-sm"></div>
                  </div>
                </Dropdown>
              </div>
            </Space>
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gray-200 to-transparent"></div>
        </Header>
        <Content
          style={{
            margin: '24px 16px',
            padding: '32px',
            minHeight: 280,
            background: 'linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)',
            borderRadius: '20px',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04)',
            border: '1px solid rgba(226, 232, 240, 0.6)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-100/30 to-indigo-100/30 rounded-full -translate-y-32 translate-x-32 blur-3xl"></div>
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-purple-100/30 to-pink-100/30 rounded-full translate-y-24 -translate-x-24 blur-3xl"></div>
          <div className="relative z-10">
            {children}
          </div>
        </Content>
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;