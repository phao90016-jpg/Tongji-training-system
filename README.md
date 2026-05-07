# 企业内部培训管理系统

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Oracle](https://img.shields.io/badge/Oracle-19c+-red.svg)](https://www.oracle.com/database/)
[![Express](https://img.shields.io/badge/Express-4.18+-blue.svg)](https://expressjs.com/)

一个基于 Node.js 和 Oracle 数据库的企业内部培训管理系统，提供完整的培训课程管理、员工报名、签到评分等功能。

## ✨ 功能特性

- 🔐 **员工登录系统** - 支持员工ID和密码登录
- 📚 **课程管理** - 查看发布中的培训课程信息
- 📝 **在线报名** - 员工可在线报名培训课程
- ⚠️ **冲突检测** - 自动检测时间冲突和黑名单
- ✅ **培训签到** - 支持二维码/手动签到
- ⭐ **讲师评分** - 培训结束后为讲师评分
- 📊 **数据统计** - 部门KPI、预算使用情况分析
- 👥 **讲师风采** - 展示讲师信息和评分统计

## 🛠 技术栈

- **后端**: Node.js + Express.js
- **数据库**: Oracle Database
- **前端**: EJS 模板引擎 + HTML/CSS/JavaScript
- **数据库驱动**: oracledb
- **其他**: dotenv (环境变量), CORS

## 📋 先决条件

- Node.js 18.0 或更高版本
- Oracle Database 19c 或更高版本
- 已配置的 Oracle 数据库连接

## 🚀 安装步骤

### 1. 克隆项目

```bash
git clone https://github.com/your-username/training-system.git
cd training-system
```

### 2. 安装依赖

```bash
npm install
```

### 3. 数据库配置

#### 创建数据库表

使用提供的 SQL 文件创建数据库表结构：

```bash
# 连接到 Oracle 数据库，执行以下 SQL 文件：
# - training_schema.sql (基础表结构)
# - employee_expansion.sql (员工数据)
# - course_expansion.sql (课程数据)
```

#### 配置环境变量

复制 `.env.example` 文件为 `.env` 并填写实际值：

```bash
cp .env.example .env
```

然后编辑 `.env` 文件：

```env
# 数据库配置
DB_USER=your_oracle_username
DB_PASSWORD=your_oracle_password
DB_CONNECT_STRING=your_host:1521/your_service_name

# 服务器配置
PORT=3000
```

**注意**: 请根据你的 Oracle 数据库配置修改上述参数。

### 4. 运行应用

```bash
# 开发模式
npm run dev

# 或生产模式
npm start
```

服务器将在 `http://localhost:3000` 启动。

## 🔧 配置说明

### 数据库连接字符串格式

根据你的 Oracle 数据库配置，连接字符串格式如下：

- **本地数据库**: `localhost:1521/orcl`
- **远程数据库**: `192.168.1.100:1521/orclpdb`
- **云数据库**: 根据云服务商提供的信息

### 测试账号

系统提供以下测试账号：

- 张三 (ID: 1001, 密码: 123456)
- 李四 (ID: 1002, 密码: 123456)
- 王五 (ID: 1003, 密码: 123456)
- 赵六 (ID: 1004, 密码: 123456)
- 张伟 (ID: 1005, 密码: 123456)
- 王芳 (ID: 1006, 密码: 123456)
- 彭浩 (ID: 1019, 密码: 123456)

## 📖 API 接口文档

### 主要接口

| 方法 | 端点 | 描述 |
|------|------|------|
| POST | `/api/login` | 员工登录 |
| GET | `/api/courses` | 获取所有课程 |
| POST | `/api/register` | 报名课程 |
| POST | `/api/check-conflict` | 冲突检测 |
| POST | `/api/signin` | 培训签到 |
| POST | `/api/rate-trainer` | 讲师评分 |
| GET | `/api/kpi` | 部门KPI数据 |
| GET | `/api/budget` | 预算使用情况 |

### 健康检查

```bash
GET /api/health
```

返回系统状态信息。

## 📁 项目结构

```
training-system/
├── server.js              # 主服务器文件
├── package.json           # 项目配置和依赖
├── training_schema.sql    # 数据库表结构
├── employee_expansion.sql # 员工数据
├── course_expansion.sql   # 课程数据
├── views/                 # EJS 模板文件
│   ├── login.ejs         # 登录页面
│   └── main.ejs          # 主页面
├── public/                # 静态资源
│   ├── style.css         # 样式文件
│   └── images/           # 图片资源
└── README.md             # 项目说明
```

## 🤝 贡献指南

1. Fork 本项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

## 📄 许可证

本项目采用 ISC 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 创建 Issue: [GitHub Issues](https://github.com/your-username/training-system/issues)
- 发送邮件: your-email@example.com

---

**注意**: 请在使用前确保 Oracle 数据库已正确配置，并根据实际环境修改 `.env` 文件中的配置信息。