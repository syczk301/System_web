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
    if (existingUsers.length === 0) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.DEFAULT_USERS));
    }
  }

  getAllUsers(): User[] {
    try {
      const users = localStorage.getItem(this.STORAGE_KEY);
      return users ? JSON.parse(users) : [];
    } catch (error) {
      console.error('Error loading users:', error);
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

  addUser(userData: Omit<User, 'id' | 'createdAt'>): User {
    const users = this.getAllUsers();
    const newUser: User = {
      ...userData,
      id: `user-${Date.now()}`,
      createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
    return newUser;
  }

  updateUser(id: string, userData: Partial<Omit<User, 'id' | 'createdAt'>>): User | null {
    const users = this.getAllUsers();
    const userIndex = users.findIndex(user => user.id === id);
    
    if (userIndex === -1) {
      return null;
    }
    
    users[userIndex] = { ...users[userIndex], ...userData };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(users));
    return users[userIndex];
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