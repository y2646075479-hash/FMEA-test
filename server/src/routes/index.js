// 路由层集中注册所有 HTTP 接口并映射到对应控制器
const express = require('express');
const { getHealth } = require('../controllers/healthController');
const { generate } = require('../controllers/fmeaController');
const { getReferences } = require('../controllers/refsController');

const router = express.Router();

router.get('/health', getHealth);
router.post('/fmea/generate', generate);
router.get('/api/refs', getReferences);

module.exports = router;
