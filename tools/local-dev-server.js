#!/usr/bin/env node

/**
 * 本地开发工具服务器
 * 用于在浏览器环境中启动和管理Python后端服务
 */

const express = require('express');
const cors = require('cors');
const { spawn, exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 8899;

// 存储活动的Python进程
const activeProcesses = new Map();

// 中间件
app.use(cors());
app.use(express.json());

// 日志函数
function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

// 检查Python环境
app.get('/check-python', async (req, res) => {
  try {
    exec('python --version', (error, stdout, stderr) => {
      if (error) {
        log(`Python检查失败: ${error.message}`);
        res.json({
          success: false,
          error: error.message,
          hasPython: false
        });
      } else {
        const version = stdout.trim();
        log(`Python检查成功: ${version}`);
        res.json({
          success: true,
          hasPython: true,
          version: version
        });
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 启动Python服务
app.post('/start-python', async (req, res) => {
  try {
    const { script, workingDir, port } = req.body;
    
    // 验证参数
    if (!script) {
      return res.status(400).json({
        success: false,
        error: '缺少script参数'
      });
    }

    // 构建脚本路径
    const scriptPath = path.resolve(workingDir || process.cwd(), script);
    
    // 检查脚本是否存在
    if (!fs.existsSync(scriptPath)) {
      return res.status(400).json({
        success: false,
        error: `Python脚本不存在: ${scriptPath}`
      });
    }

    // 检查是否已有服务在运行
    const processKey = `${script}-${port || 5000}`;
    if (activeProcesses.has(processKey)) {
      return res.json({
        success: true,
        message: 'Python服务已在运行',
        process_id: processKey,
        port: port || 5000
      });
    }

    log(`正在启动Python服务: ${scriptPath}`);

    // 启动Python进程
    const pythonProcess = spawn('python', [scriptPath], {
      cwd: workingDir || process.cwd(),
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // 设置进程信息
    const processInfo = {
      process: pythonProcess,
      script: scriptPath,
      port: port || 5000,
      startTime: new Date(),
      logs: []
    };

    activeProcesses.set(processKey, processInfo);

    // 监听进程输出
    pythonProcess.stdout.on('data', (data) => {
      const message = data.toString();
      processInfo.logs.push({ type: 'stdout', message, time: new Date() });
      log(`Python输出: ${message.trim()}`);
    });

    pythonProcess.stderr.on('data', (data) => {
      const message = data.toString();
      processInfo.logs.push({ type: 'stderr', message, time: new Date() });
      log(`Python错误: ${message.trim()}`);
    });

    pythonProcess.on('close', (code) => {
      log(`Python进程退出，代码: ${code}`);
      activeProcesses.delete(processKey);
    });

    pythonProcess.on('error', (error) => {
      log(`Python进程错误: ${error.message}`);
      activeProcesses.delete(processKey);
    });

    // 等待一段时间确保服务启动
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 检查进程是否还在运行
    if (pythonProcess.killed) {
      return res.status(500).json({
        success: false,
        error: 'Python进程启动后立即退出'
      });
    }

    log(`Python服务启动成功，PID: ${pythonProcess.pid}`);

    res.json({
      success: true,
      message: 'Python服务启动成功',
      process_id: processKey,
      pid: pythonProcess.pid,
      port: port || 5000,
      script: scriptPath
    });

  } catch (error) {
    log(`启动Python服务失败: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 停止Python服务
app.post('/stop-python', async (req, res) => {
  try {
    const { process_id } = req.body;
    
    if (!process_id) {
      return res.status(400).json({
        success: false,
        error: '缺少process_id参数'
      });
    }

    const processInfo = activeProcesses.get(process_id);
    if (!processInfo) {
      return res.json({
        success: true,
        message: '进程不存在或已停止'
      });
    }

    log(`正在停止Python进程: ${process_id}`);

    // 优雅地停止进程
    processInfo.process.kill('SIGTERM');
    
    // 如果10秒后还没停止，强制杀死
    setTimeout(() => {
      if (!processInfo.process.killed) {
        processInfo.process.kill('SIGKILL');
      }
    }, 10000);

    activeProcesses.delete(process_id);

    res.json({
      success: true,
      message: 'Python服务已停止'
    });

  } catch (error) {
    log(`停止Python服务失败: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取进程状态
app.get('/status/:process_id', (req, res) => {
  const processId = req.params.process_id;
  const processInfo = activeProcesses.get(processId);
  
  if (!processInfo) {
    return res.json({
      success: false,
      running: false,
      message: '进程不存在'
    });
  }

  res.json({
    success: true,
    running: !processInfo.process.killed,
    pid: processInfo.process.pid,
    port: processInfo.port,
    script: processInfo.script,
    startTime: processInfo.startTime,
    logs: processInfo.logs.slice(-20) // 最近20条日志
  });
});

// 获取所有活动进程
app.get('/processes', (req, res) => {
  const processes = Array.from(activeProcesses.entries()).map(([id, info]) => ({
    id,
    pid: info.process.pid,
    port: info.port,
    script: info.script,
    startTime: info.startTime,
    running: !info.process.killed
  }));

  res.json({
    success: true,
    processes
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Local Development Server',
    version: '1.0.0',
    uptime: process.uptime(),
    activeProcesses: activeProcesses.size
  });
});

// 错误处理
app.use((error, req, res, next) => {
  log(`服务器错误: ${error.message}`);
  res.status(500).json({
    success: false,
    error: error.message
  });
});

// 优雅关闭
process.on('SIGINT', () => {
  log('正在关闭服务器...');
  
  // 停止所有Python进程
  for (const [id, info] of activeProcesses) {
    log(`停止进程: ${id}`);
    info.process.kill('SIGTERM');
  }
  
  setTimeout(() => {
    process.exit(0);
  }, 5000);
});

// 启动服务器
app.listen(PORT, () => {
  log(`本地开发工具服务器启动成功`);
  log(`地址: http://localhost:${PORT}`);
  log(`健康检查: http://localhost:${PORT}/health`);
  log('');
  log('可用端点:');
  log('  GET  /check-python     - 检查Python环境');
  log('  POST /start-python     - 启动Python服务');
  log('  POST /stop-python      - 停止Python服务');
  log('  GET  /status/:id       - 获取进程状态');
  log('  GET  /processes        - 获取所有进程');
  log('  GET  /health           - 健康检查');
  log('');
});

// 导出app以便测试
module.exports = app; 