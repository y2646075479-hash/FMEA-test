# FMEA Lab 接口测试手册

本手册说明如何使用项目自带的调试脚本验证 FMEA 生成接口与联网搜索接口，便于快速排查问题或回归测试。

## 预备条件

- Node.js 18 及以上版本。
- 已安装项目依赖（在 `server` 目录执行 `npm install`）。
- 后端服务已运行，可通过以下任一方式启动：
  - `cd server && npm start`
  - 项目根目录运行 `run_all.bat`
  - 其它等效方式（确保接口可访问）。

默认接口地址为 `http://127.0.0.1:3001`，如有修改需在测试命令中同步调整。

---

## FMEA 生成接口测试

脚本路径：`server/scripts/test-fmea.js`  
快捷命令：`npm run test:fmea`

### 运行方式

在 `server` 目录下执行以下任一命令：

```bash
# 使用默认部件“偏航系统”、默认条数 5
npm run test:fmea

# 指定部件参数（命令行追加参数）
npm run test:fmea -- 叶片

# 直接使用 node 运行，并指定部件
node scripts/test-fmea.js 主轴
```

### 可用环境变量

| 变量名            | 说明                       | 默认值       |
| ----------------- | -------------------------- | ------------ |
| `TEST_FMEA_HOST`  | 接口主机地址               | `127.0.0.1`  |
| `TEST_FMEA_PORT`  | 接口端口                   | `3001`       |
| `TEST_FMEA_PART`  | FMEA 生成的风电部件名称     | `偏航系统`   |
| `TEST_FMEA_COUNT` | 生成条目数量（3-12 合理范围） | `5`          |

示例：

```bash
TEST_FMEA_PART=塔筒 TEST_FMEA_COUNT=8 npm run test:fmea
```

### 输出解析

脚本会：

1. 打印请求目标与关键参数。
2. 检查 HTTP 状态码，失败时直接输出响应文本。
3. 解析 JSON，若 `valid=false` 会原样展示，便于模型问题排查。
4. 打印返回条目数量、首条 `项目` 名称及 `风险序数`，帮助快速确认结果。

---

## 联网搜索接口测试

脚本路径：`server/scripts/test-refs.js`  
快捷命令：`npm run test:refs`

### 运行方式

在 `server` 目录下执行以下任一命令：

```bash
# 使用默认关键词“风电 变桨轴承 维护”
npm run test:refs

# 指定关键词（命令行追加参数，记得加引号避免空格拆分）
npm run test:refs -- "风电 主轴 检维修"

# 直接使用 node 运行
node scripts/test-refs.js "风电 塔筒 裂纹"
```

### 可用环境变量

| 变量名            | 说明             | 默认值                 |
| ----------------- | ---------------- | ---------------------- |
| `TEST_REFS_HOST`  | 接口主机地址     | `127.0.0.1`            |
| `TEST_REFS_PORT`  | 接口端口         | `3001`                 |
| `TEST_REFS_QUERY` | 搜索关键词       | `风电 变桨轴承 维护`   |

示例：

```bash
TEST_REFS_QUERY="风电 叶片 冰冻" npm run test:refs
```

### 输出解析

脚本会：

1. 打印目标请求地址及关键参数。
2. 检查 HTTP 状态码，失败时输出响应文本（通常反映 SERPAPI 配置问题）。
3. 解析 JSON，统计 `items` 数量。
4. 输出首条搜索结果的标题与来源域名，帮助确认数据有效性。

---

## 常见问题

- **接口未启动或端口占用**：脚本会报错 `ECONNREFUSED`。请确认后端正在对应端口监听。
- **缺少 API Key**：/fmea/generate 如无 `DEEPSEEK_API_KEY` 会返回 500；/api/refs 如无 `SERPAPI_API_KEY` 会返回 500。请检查 `.env`。
- **JSON 解析失败**：多半是接口返回非 JSON 文本，可在终端查看原始响应定位问题。

---

## 后续扩展建议

- 根据该手册内容扩展更多自测脚本，例如批量部件回归、接口响应时间统计等。
- 若接入 CI/CD，可在管道中运行这些脚本，监控接口可用性。

祝测试顺利！
