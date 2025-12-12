# Cookie管理器浏览器插件

一个功能强大的Chrome浏览器插件，用于管理多个Cookie配置，支持快速切换和自动记录。

## 功能特性

- ✅ **创建配置**：轻松创建多个Cookie配置，每个配置可以管理不同的域名
- ✅ **切换配置**：一键切换配置，自动清空并恢复对应配置的Cookie
- ✅ **删除配置**：删除不需要的配置
- ✅ **自动记录**：当插件启用且选中配置时，自动记录指定域名的Cookie变化
- ✅ **域名管理**：为每个配置添加或删除需要管理的域名
- ✅ **启用/禁用**：可以随时启用或禁用插件功能

## 安装说明

1. 下载或克隆本项目到本地
2. 打开Chrome浏览器，进入扩展程序管理页面（`chrome://extensions/`）
3. 开启"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择项目根目录
6. 确保在`icons/`目录下放置了以下图标文件：
   - `icon16.png` (16x16像素)
   - `icon48.png` (48x48像素)
   - `icon128.png` (128x128像素)

## 使用方法

### 1. 创建配置

1. 点击浏览器工具栏中的插件图标
2. 点击"新建配置"按钮
3. 输入配置名称（例如："工作环境"、"测试环境"等）
4. 点击"创建"

### 2. 添加域名

1. 在配置列表中，点击配置右侧的"域名"按钮
2. 在输入框中输入要管理的域名（例如：`example.com`）
3. 点击"添加"按钮
4. 可以添加多个域名

### 3. 启用插件

1. 在插件弹窗顶部，将开关切换到"启用"状态
2. 确保已选择一个配置（点击配置项或"切换"按钮）
3. 现在插件会自动记录指定域名的Cookie变化

### 4. 切换配置

1. 点击要切换到的配置项，或点击配置右侧的"切换"按钮
2. 插件会：
   - 保存当前配置的所有Cookie
   - 清空浏览器中的所有Cookie
   - 加载新配置保存的Cookie

### 5. 删除配置

1. 点击配置右侧的"删除"按钮
2. 确认删除操作

## 注意事项

⚠️ **重要提示**：

- 切换配置时会清空所有Cookie，请确保重要数据已保存
- 某些Cookie（如`httpOnly`）无法通过JavaScript设置，这些Cookie在恢复时可能会失败
- 建议在切换配置前，确保当前配置的Cookie已正确保存
- 插件需要访问所有网站的Cookie权限才能正常工作

## 技术架构

- **Manifest V3**：使用最新的Chrome扩展规范
- **Service Worker**：后台服务处理Cookie拦截和切换
- **Storage API**：使用`chrome.storage.local`存储配置和Cookie数据
- **Cookies API**：使用`chrome.cookies`进行Cookie操作

## 项目结构

```
cookie-manager/
├── manifest.json          # 插件配置文件
├── popup/
│   ├── popup.html         # 弹窗主界面
│   ├── popup.css          # 样式文件
│   └── popup.js           # 弹窗逻辑
├── background/
│   └── service-worker.js  # Service Worker（后台脚本）
├── utils/
│   ├── storage.js         # 存储管理工具
│   ├── cookie-manager.js  # Cookie操作核心逻辑
│   └── config-manager.js  # 配置管理逻辑
└── icons/                 # 插件图标
```

## 开发说明

本项目使用ES6模块化开发，所有工具模块都使用`export`导出功能。

### 核心模块

- **config-manager.js**：管理配置的创建、删除、切换
- **cookie-manager.js**：处理Cookie的保存、加载、清空
- **storage.js**：封装chrome.storage操作
- **service-worker.js**：后台服务，监听Cookie变化

## 许可证

MIT License

