export interface User {
  id: string;
  username: string;
  password: string;
  email?: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  lastLogin?: string;
  createdAt: string;
  department?: string;
  phone?: string;
}

class UserService {
  private readonly STORAGE_KEY = 'system_users';
  private readonly DEFAULT_USERS: User[] = [
    {
      id: 'admin-default',
      username: 'admin',
      password: 'admin',
      email: 'admin@system.com',
      role: 'admin',
      status: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
      department: '信息技术部',
      phone: '13800138000'
    },
    {
      id: 'user-default',
      username: 'user',
      password: 'user',
      email: 'user@system.com',
      role: 'user',
      status: 'active',
      createdAt: '2024-01-01T00:00:00.000Z',
      department: '生产部',
      phone: '13800138001'
    }
  ];

  constructor() {
    this.initializeUsers();
  }

  private initializeUsers(): void {
    const existingUsers = this.getAllUsers();
    
    // 检查是否需要初始化默认用户
    const hasDefaultAdmin = existingUsers.some(user => user.username === 'admin' && user.id === 'admin-default');
    const hasDefaultUser = existingUsers.some(user => user.username === 'user' && user.id === 'user-default');
    
    if (existingUsers.length === 0 || !hasDefaultAdmin || !hasDefaultUser) {
      // 如果没有用户数据或缺少默认用户，则重新初始化
      const usersToKeep = existingUsers.filter(user => 
        !this.DEFAULT_USERS.some(defaultUser => defaultUser.username === user.username)
      );
      
      const allUsers = [...this.DEFAULT_USERS, ...usersToKeep];
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(allUsers));
      
      console.log('UserService: 已初始化默认用户数据');
    }
  }

  getAllUsers(): User[] {
    try {
      const users = localStorage.getItem(this.STORAGE_KEY);
      if (!users) {
        console.log('UserService: localStorage中无用户数据');
        return [];
      }
      
      const parsedUsers = JSON.parse(users);
      
      // 验证数据结构
      if (!Array.isArray(parsedUsers)) {
        console.error('UserService: localStorage中的用户数据格式错误，不是数组');
        localStorage.removeItem(this.STORAGE_KEY);
        return [];
      }
      
      // 验证每个用户对象的必要字段
      const validUsers = parsedUsers.filter(user => {
        const isValid = user && 
          typeof user.id === 'string' && 
          typeof user.username === 'string' && 
          typeof user.password === 'string' && 
          typeof user.role === 'string' && 
          typeof user.status === 'string';
        
        if (!isValid) {
          console.warn('UserService: 发现无效用户数据:', user);
        }
        
        return isValid;
      });
      
      console.log(`UserService: 成功加载 ${validUsers.length} 个用户`);
      return validUsers;
      
    } catch (error) {
      console.error('UserService: 解析localStorage用户数据时出错:', error);
      // 清除损坏的数据
      localStorage.removeItem(this.STORAGE_KEY);
      return [];
    }
  }

  getUserById(id: string): User | null {
    const users = this.getAllUsers();
    return users.find(user => user.id === id) || null;
  }

  getUserByUsername(username: string): User | null {
    const users = this.getAllUsers();
    return users.find(user => user.username === username) || null;
  }

  addUser(userData: Omit<User, 'id' | 'createdAt' | 'lastLogin'>): User {
    const users = this.getAllUsers();
    
    // 检查用户名是否已存在
    if (users.some(user => user.username === userData.username)) {
      throw new Error('用户名已存在');
    }
    
    const newUser: User = {
      id: `user-${Date.now()}`,
      ...userData,
      createdAt: new Date().toISOString(),
      lastLogin: null
    };
    
    users.push(newUser);
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
      console.log('UserService: 成功添加用户:', newUser.username);
      
      // 验证保存是否成功
      const savedUsers = this.getAllUsers();
      const savedUser = savedUsers.find(u => u.id === newUser.id);
      if (!savedUser) {
        throw new Error('用户保存验证失败');
      }
      
      return newUser;
    } catch (error) {
      console.error('UserService: 添加用户失败:', error);
      throw new Error('保存用户数据失败');
    }
  }

  updateUser(id: string, userData: Partial<Omit<User, 'id' | 'createdAt'>>): User {
    const users = this.getAllUsers();
    const userIndex = users.findIndex(user => user.id === id);
    
    if (userIndex === -1) {
      throw new Error('用户不存在');
    }
    
    // 如果更新用户名，检查是否与其他用户冲突
    if (userData.username && userData.username !== users[userIndex].username) {
      if (users.some(user => user.username === userData.username && user.id !== id)) {
        throw new Error('用户名已存在');
      }
    }
    
    const updatedUser = { ...users[userIndex], ...userData };
    users[userIndex] = updatedUser;
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
      console.log('UserService: 成功更新用户:', updatedUser.username);
      
      // 验证保存是否成功
      const savedUsers = this.getAllUsers();
      const savedUser = savedUsers.find(u => u.id === id);
      if (!savedUser) {
        throw new Error('用户更新验证失败');
      }
      
      return updatedUser;
    } catch (error) {
      console.error('UserService: 更新用户失败:', error);
      throw new Error('保存用户数据失败');
    }
  }

  deleteUser(id: string): boolean {
    const users = this.getAllUsers();
    const filteredUsers = users.filter(user => user.id !== id);
    
    if (filteredUsers.length === users.length) {
      return false; // User not found
    }
    
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredUsers));
    return true;
  }

  validateLogin(username: string, password: string): { success: boolean; user?: User; message?: string } {
    const user = this.getUserByUsername(username);
    
    if (!user) {
      return { success: false, message: '用户名或密码错误' };
    }
    
    if (user.status !== 'active') {
      return { success: false, message: '账户已被禁用' };
    }
    
    if (user.password !== password) {
      return { success: false, message: '用户名或密码错误' };
    }
    
    // Update last login time
    this.updateUser(user.id, { lastLogin: new Date().toISOString() });
    
    return { success: true, user };
  }

  isUsernameExists(username: string, excludeId?: string): boolean {
    const users = this.getAllUsers();
    return users.some(user => user.username === username && user.id !== excludeId);
  }

  getActiveUsersCount(): number {
    const users = this.getAllUsers();
    return users.filter(user => user.status === 'active').length;
  }

  getTotalUsersCount(): number {
    return this.getAllUsers().length;
  }
}

export const userService = new UserService();
export default userService;