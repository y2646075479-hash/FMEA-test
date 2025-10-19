// 该模块创建并配置 Express 应用实例，供入口文件引用
const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// 如需托管前端，可在此处添加静态资源目录
app.use(routes);

module.exports = app;
