import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Modal,
  Form,
  Input,
  Select,
  message,
  Popconfirm,
  Tag,
  Avatar,
  Row,
  Col,
  Statistic,
} from 'antd';
import {
  UserAddOutlined,
  EditOutlined,
  DeleteOutlined,
  UserOutlined,
  TeamOutlined,
  CrownOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useAppSelector } from '../store/hooks';
import userService, { User } from '../services/userService';

const { Title, Text } = Typography;
const { Option } = Select;

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [searchText, setSearchText] = useState('');
  const [form] = Form.useForm();
  const { user: currentUser } = useAppSelector((state) => state.auth);

  // 加载用户数据
  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = () => {
    const allUsers = userService.getAllUsers();
    setUsers(allUsers);
  };

  const handleAddUser = () => {
    setEditingUser(null);
    form.resetFields();
    setModalVisible(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    form.setFieldsValue(user);
    setModalVisible(true);
  };

  const handleDeleteUser = (userId: string) => {
    const success = userService.deleteUser(userId);
    if (success) {
      loadUsers();
      message.success('用户删除成功');
    } else {
      message.error('用户删除失败');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (editingUser) {
        // 编辑用户
        const updatedUser = userService.updateUser(editingUser.id, values);
        if (updatedUser) {
          loadUsers();
          message.success('用户信息更新成功');
        } else {
          message.error('用户更新失败');
          return;
        }
      } else {
        // 检查用户名是否已存在
        if (userService.isUsernameExists(values.username)) {
          message.error('用户名已存在，请选择其他用户名');
          return;
        }
        
        // 添加新用户
        const newUser = userService.addUser({
          username: values.username,
          password: values.password,
          email: values.email,
          role: values.role,
          status: values.status,
          department: values.department,
          phone: values.phone
        });
        
        loadUsers();
        message.success('用户添加成功');
      }

      setModalVisible(false);
      form.resetFields();
    } catch (error) {
      console.error('表单验证失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleModalCancel = () => {
    setModalVisible(false);
    form.resetFields();
    setEditingUser(null);
  };

  const filteredUsers = users.filter(user => 
    user.username.toLowerCase().includes(searchText.toLowerCase()) ||
    user.email.toLowerCase().includes(searchText.toLowerCase()) ||
    (user.department && user.department.includes(searchText))
  );

  const columns = [
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      render: (text: string, record: User) => (
        <div className="flex items-center space-x-3">
          <Avatar 
            size={40} 
            icon={<UserOutlined />} 
            style={{ backgroundColor: record.role === 'admin' ? '#722ed1' : '#1890ff' }}
          />
          <div>
            <div className="font-medium">{text}</div>
            <div className="text-sm text-gray-500">{record.email}</div>
          </div>
        </div>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag 
          icon={role === 'admin' ? <CrownOutlined /> : <UserOutlined />}
          color={role === 'admin' ? 'purple' : 'blue'}
        >
          {role === 'admin' ? '管理员' : '普通用户'}
        </Tag>
      ),
    },
    {
      title: '部门',
      dataIndex: 'department',
      key: 'department',
      render: (text: string) => text || '-',
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : 'red'}>
          {status === 'active' ? '活跃' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '最后登录',
      dataIndex: 'lastLogin',
      key: 'lastLogin',
      render: (text: string) => {
        if (!text) {
          return <Text type="secondary">从未登录</Text>;
        }
        const date = new Date(text);
        return <Text>{date.toLocaleString()}</Text>;
      },
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (text: string) => {
        const date = new Date(text);
        return date.toLocaleString();
      },
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: User) => (
        <Space size="middle">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEditUser(record)}
            disabled={record.id === currentUser?.id && record.role === 'admin'}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个用户吗？"
            onConfirm={() => handleDeleteUser(record.id)}
            okText="确定"
            cancelText="取消"
            disabled={record.id === currentUser?.id}
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              disabled={record.id === currentUser?.id}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const activeUsers = users.filter(user => user.status === 'active').length;
  const adminUsers = users.filter(user => user.role === 'admin').length;
  const totalUsers = users.length;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <Title level={3}>用户管理</Title>
        <Button
          type="primary"
          icon={<UserAddOutlined />}
          onClick={handleAddUser}
        >
          添加用户
        </Button>
      </div>

      {/* 统计卡片 */}
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总用户数"
              value={totalUsers}
              prefix={<TeamOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="活跃用户"
              value={activeUsers}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="管理员"
              value={adminUsers}
              prefix={<CrownOutlined />}
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="禁用用户"
              value={totalUsers - activeUsers}
              prefix={<UserOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>

      {/* 用户列表 */}
      <Card>
        <div className="mb-4">
          <Input
            placeholder="搜索用户名、邮箱或部门"
            prefix={<SearchOutlined />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 300 }}
          />
        </div>
        
        <Table
          columns={columns}
          dataSource={filteredUsers}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
          }}
        />
      </Card>

      {/* 添加/编辑用户模态框 */}
      <Modal
        title={editingUser ? '编辑用户' : '添加用户'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        confirmLoading={loading}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            role: 'user',
            status: 'active',
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 3, message: '用户名至少3个字符' },
                ]}
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  { type: 'email', message: '请输入有效的邮箱地址' },
                ]}
              >
                <Input placeholder="请输入邮箱" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="role"
                label="角色"
                rules={[{ required: true, message: '请选择角色' }]}
              >
                <Select placeholder="请选择角色">
                  <Option value="admin">管理员</Option>
                  <Option value="user">普通用户</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="status"
                label="状态"
                rules={[{ required: true, message: '请选择状态' }]}
              >
                <Select placeholder="请选择状态">
                  <Option value="active">活跃</Option>
                  <Option value="inactive">禁用</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="department"
                label="部门"
              >
                <Select placeholder="请选择部门" allowClear>
                  <Option value="信息技术部">信息技术部</Option>
                  <Option value="生产部">生产部</Option>
                  <Option value="质量部">质量部</Option>
                  <Option value="数据分析部">数据分析部</Option>
                  <Option value="研发部">研发部</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="电话"
                rules={[
                  { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号码' },
                ]}
              >
                <Input placeholder="请输入电话号码" />
              </Form.Item>
            </Col>
          </Row>

          {!editingUser && (
            <Form.Item
              name="password"
              label="密码"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6个字符' },
              ]}
            >
              <Input.Password placeholder="请输入密码" />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement;