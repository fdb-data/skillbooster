# Electron + Claude Code 一键配置脚本 (Windows)
Write-Host "🚀 开始配置 Electron 开发环境 for Claude Code" -ForegroundColor Cyan

# 1. 检查 claude 命令是否存在
if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Host "❌ 未找到 claude 命令，请先安装 Claude Code CLI" -ForegroundColor Red
    exit 1
}

# 2. 安装 Skills（失败时会跳过）
$skills = @(
    "frontend-design",
    "canvas-design",
    "electron-scaffold",
    "electron-pro",
    "full-stack-electron"
)
foreach ($skill in $skills) {
    Write-Host "📦 安装 Skill: $skill"
    claude skills add $skill 2>$null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  $skill 安装失败（可能名称已变更），继续..." -ForegroundColor Yellow
    }
}

# 3. 配置 MCP 服务器 (auto-feedback)
$configPath = "$env:USERPROFILE\.claude\settings.json"
$configDir = Split-Path $configPath -Parent
if (-not (Test-Path $configDir)) {
    New-Item -ItemType Directory -Path $configDir -Force | Out-Null
}

# 读取现有配置或创建新配置
if (Test-Path $configPath) {
    $config = Get-Content $configPath -Raw | ConvertFrom-Json
} else {
    $config = @{ mcpServers = @{} } | ConvertTo-Json -Depth 10 | ConvertFrom-Json
}

# 添加 auto-feedback MCP 服务器
if (-not $config.mcpServers) { $config.mcpServers = @{} }
$config.mcpServers | Add-Member -MemberType NoteProperty -Name "feedback" -Value @{
    command = "npx"
    args    = @("auto-feedback")
} -Force

# 保存配置
$config | ConvertTo-Json -Depth 10 | Set-Content $configPath
Write-Host "✅ MCP 配置已写入 $configPath" -ForegroundColor Green

# 4. 创建示例 Electron + React 项目
$projectName = "my-electron-app"
if (Test-Path $projectName) {
    Write-Host "⚠️ 目录 $projectName 已存在，跳过创建示例项目" -ForegroundColor Yellow
} else {
    Write-Host "📁 创建示例项目: $projectName"
    mkdir $projectName | Out-Null
    cd $projectName

    # 初始化 package.json
    npm init -y | Out-Null
    npm install electron react react-dom concurrently cross-env --save
    npm install -D @types/node typescript vite @vitejs/plugin-react --save-dev

    # 生成主进程文件
    New-Item -ItemType Directory -Path "src/main" -Force | Out-Null
    @'
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  // 开发时加载 Vite dev server
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
  }
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
'@ | Out-File -FilePath "src/main/main.js" -Encoding utf8

    # 生成 preload 脚本
    @'
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  send: (channel, data) => ipcRenderer.send(channel, data),
  receive: (channel, func) => ipcRenderer.on(channel, (event, ...args) => func(...args))
});
'@ | Out-File -FilePath "src/main/preload.js" -Encoding utf8

    # 生成 React 前端 (Vite)
    New-Item -ItemType Directory -Path "src/renderer" -Force | Out-Null
    @'
import React from 'react';
import ReactDOM from 'react-dom/client';
function App() {
  return <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
    <h1>⚡ Electron + React + Claude Code</h1>
    <p>你的环境已完全配置好！</p>
    <button onClick={() => window.electronAPI.send('ping')}>发送 IPC 消息</button>
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
'@ | Out-File -FilePath "src/renderer/App.jsx" -Encoding utf8

    @'
<!DOCTYPE html>
<html><body><div id="root"></div><script type="module" src="/src/main.jsx"></script></body></html>
'@ | Out-File -FilePath "src/renderer/index.html" -Encoding utf8

    @'
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
'@ | Out-File -FilePath "src/renderer/main.jsx" -Encoding utf8

    # Vite 配置
    @'
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5173 }
});
'@ | Out-File -FilePath "vite.config.js" -Encoding utf8

    # 修改 package.json 的 scripts
    $pkg = Get-Content "package.json" -Raw | ConvertFrom-Json
    $pkg.scripts = @{
        "dev"       = "concurrently \"npm run dev:vite\" \"npm run dev:electron\""
        "dev:vite"  = "vite"
        "dev:electron" = "cross-env NODE_ENV=development electron src/main/main.js"
        "build"     = "vite build --outDir renderer/dist"
        "start"     = "electron src/main/main.js"
    }
    $pkg.main = "src/main/main.js"
    $pkg | ConvertTo-Json -Depth 10 | Set-Content "package.json"

    Write-Host "✅ 示例项目已创建: $(Get-Location)" -ForegroundColor Green
}

Write-Host "`n🎉 所有配置已完成！" -ForegroundColor Cyan
Write-Host "👉 使用方法：" -ForegroundColor Yellow
Write-Host "   1. cd $projectName"
Write-Host "   2. npm run dev  (启动 Electron + React 开发环境)"
Write-Host "   3. 在同一个目录下运行: claude code"
Write-Host "   4. 在 Claude Code 中问：'打开 Electron 应用并截图反馈' —— Claude 会自动调用 MCP 启动应用并截图"