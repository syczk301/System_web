# 智能诊断系统Web版

## 📋 项目简介

智能诊断系统Web版是一个专业的工业过程监控与故障诊断平台，集成了PCA、ICA、自动编码器等多种先进的数据分析算法。该系统旨在为工业生产提供实时监控、异常检测和故障诊断服务，帮助企业提高生产效率和产品质量。

通过Web化改造，用户可以随时随地访问系统，无需安装客户端软件，为制造业数字化转型提供技术支撑。

## ✨ 核心功能

### 🔐 用户角色管理
- **管理组用户**: 系统管理、用户管理、数据管理、所有分析功能、系统配置、报告审核
- **使用组用户**: 数据上传、数据分析、结果查看、报告生成（需管理组审核）

### 📊 分析模块

#### 1. PCA分析（主成分分析）
- 主成分分析算法
- T²和SPE监控图表
- 累积方差分析
- 异常值检测

#### 2. ICA分析（独立成分分析）
- 独立成分分析
- 信号分离技术
- I²统计量计算
- 贡献分析图

#### 3. 自动编码器分析
- 深度学习自动编码器
- 重构误差分析
- RE²和SPE统计量
- 异常检测算法

#### 4. 深度学习分析
- 深度神经网络模型
- Transformer模型应用
- 智能预测和分类
- 序列数据分析

#### 5. SPC分析（统计过程控制）
- X-R、X-S控制图
- 单值控制图
- 过程能力评估
- 实时过程监控

### 🗂️ 数据管理
- Excel文件上传
- 数据预览和质量检查
- 数据筛选和预处理
- 历史数据管理

### 📈 结果展示
- 交互式图表可视化
- 自动生成分析报告
- PDF报告导出
- 数据结果导出

## 🛠️ 技术栈

### 前端框架
- **React 18** - 现代化前端框架
- **TypeScript** - 类型安全的JavaScript
- **Vite** - 快速构建工具

### UI组件库
- **Ant Design** - 企业级UI设计语言
- **Tailwind CSS** - 实用优先的CSS框架
- **Lucide React** - 现代化图标库

### 状态管理
- **Zustand** - 轻量级状态管理
- **Redux Toolkit** - 可预测的状态容器

### 数据可视化
- **ECharts** - 强大的数据可视化库
- **ECharts for React** - React集成组件

### 路由和工具
- **React Router DOM** - 声明式路由
- **Day.js** - 轻量级日期处理
- **Sonner** - 优雅的通知组件

## 🚀 快速开始

### 环境要求
- Node.js >= 18.0.0
- npm 或 pnpm

### 安装依赖

```bash
# 使用 npm
npm install

# 或使用 pnpm
pnpm install
```

### 开发环境运行

```bash
# 启动开发服务器
npm run dev

# 或使用 pnpm
pnpm dev
```

访问 [http://localhost:5173](http://localhost:5173) 查看应用

### 构建生产版本

```bash
# 构建项目
npm run build

# 预览构建结果
npm run preview
```

### 代码检查

```bash
# 运行 ESLint
npm run lint

# 类型检查
npm run check
```

## 📁 项目结构

```
src/
├── components/          # 公共组件
│   ├── Empty.tsx       # 空状态组件
│   ├── Layout.tsx      # 布局组件
│   └── ProtectedRoute.tsx # 路由保护组件
├── hooks/              # 自定义Hook
│   └── useTheme.ts     # 主题Hook
├── pages/              # 页面组件
│   ├── Home.tsx        # 首页
│   ├── Login.tsx       # 登录页
│   ├── UserManagement.tsx # 用户管理
│   ├── DataManagement.tsx # 数据管理
│   ├── PCAAnalysis.tsx    # PCA分析
│   ├── ICAAnalysis.tsx    # ICA分析
│   ├── AEAnalysis.tsx     # 自动编码器分析
│   ├── DLAnalysis.tsx     # 深度学习分析
│   ├── SPCAnalysis.tsx    # SPC分析
│   └── Results.tsx        # 结果展示
├── router/             # 路由配置
├── store/              # 状态管理
│   ├── hooks.ts        # Store hooks
│   ├── index.ts        # Store配置
│   └── slices/         # Redux切片
├── lib/                # 工具库
└── assets/             # 静态资源
```

## 🔧 开发指南

### 代码规范
- 使用 TypeScript 进行类型检查
- 遵循 ESLint 代码规范
- 使用 Prettier 格式化代码
- 组件采用函数式组件 + Hooks

### 样式规范
- 优先使用 Tailwind CSS 工具类
- 组件样式模块化
- 响应式设计优先

### 状态管理
- 全局状态使用 Zustand
- 复杂状态逻辑使用 Redux Toolkit
- 组件内状态使用 useState/useReducer

## 🎨 设计系统

### 色彩方案
- **主色调**: 深空蓝 (#f0f0f0) 背景色
- **主题色**: 霓虹蓝 (#1890ff)
- **强调色**: 电紫色 (#722ed1)
- **文字色**: 深灰色 (#333333)

### 设计原则
- 现代化卡片式设计
- 响应式布局
- 简洁的线性图标
- 一致的交互体验

## 📝 使用流程

### 管理组用户
1. 登录系统进行用户管理和系统配置
2. 创建和管理使用组用户账户
3. 监控系统使用情况，审核分析报告
4. 执行所有数据分析功能

### 使用组用户
1. 登录系统，了解系统功能
2. 上传Excel格式的工业数据文件
3. 选择合适的分析算法
4. 设置分析参数，启动分析
5. 查看分析结果和监控图表
6. 生成分析报告并提交审核

## 🤝 贡献指南

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情

## 📞 联系我们

如有问题或建议，请通过以下方式联系：

- 项目仓库: [https://github.com/syczk301/System_web](https://github.com/syczk301/System_web)
- 问题反馈: [Issues](https://github.com/syczk301/System_web/issues)

---

**智能诊断系统Web版** - 为工业4.0赋能 🚀
