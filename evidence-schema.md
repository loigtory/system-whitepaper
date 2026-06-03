# 证据包结构

白皮书必须从证据包生成，不能直接凭浏览器过程记忆生成。每个系统单独生成一个证据包目录。

## 推荐目录

```text
outputs/
  [system-code]/          # 与 systems[].code 一致，非 name
    evidence.json
    quality-report.json
    operation-log.jsonl
    test-data-ledger.json
    screenshots/
    {系统名称}_系统功能白皮书_{YYYYMMDD}.md   # 名称来自 systems[].name
```

## evidence.json

```json
{
  "systemInfo": {
    "code": "contract",
    "name": "合同管理系统",
    "testUrl": "https://test-contract.example.com",
    "loginRole": "全权限测试账号",
    "collectedAt": "2026-05-18T17:30:00+08:00",
    "environment": "hosts 指向测试环境"
  },
  "menuMap": [
    {
      "path": "合同管理 > 合同列表",
      "title": "合同列表",
      "url": "/contract/list",
      "status": "visited",
      "coreCoverage": true,
      "excludeReason": null
    }
  ],
  "pageInventory": [
    {
      "id": "page-contract-list",
      "menuPath": "合同管理 > 合同列表",
      "type": "list",
      "title": "合同列表",
      "url": "/contract/list",
      "mainAreas": ["查询区", "列表区", "操作区"],
      "screenshot": "screenshots/合同管理_合同列表_首页_20260518.png",
      "evidenceRefs": ["log-001", "shot-001"]
    }
  ],
  "actionInventory": [
    {
      "pageId": "page-contract-list",
      "name": "删除",
      "type": "delete",
      "selectorHint": "button:has-text('删除')",
      "risk": "high",
      "validated": true,
      "validationScope": "only-ai-test-data"
    }
  ],
  "formInventory": [
    {
      "pageId": "page-contract-create",
      "formName": "新增合同",
      "fields": [
        {
          "label": "合同名称",
          "required": true,
          "type": "text",
          "fillStrategy": "AI_AUTO_TEST_名称",
          "blocked": false
        }
      ]
    }
  ],
  "flowResults": [
    {
      "name": "合同新增与删除",
      "status": "verified",
      "testDataIds": ["td-001"],
      "steps": [
        "进入合同列表",
        "创建 AI_AUTO_TEST_ 合同",
        "搜索测试合同",
        "执行删除",
        "重新搜索无结果"
      ],
      "screenshots": ["shot-001", "shot-002", "shot-003"],
      "unverifiedCases": ["已审批合同删除", "批量删除"]
    }
  ],
  "screenshotIndex": [
    {
      "id": "shot-001",
      "file": "screenshots/合同管理_合同列表_首页_20260518.png",
      "module": "合同管理",
      "function": "合同列表",
      "step": "首页",
      "caption": "合同列表页面，包含查询区和删除按钮。",
      "includeInWhitepaper": true
    }
  ],
  "blockedItems": [
    {
      "module": "合同管理",
      "function": "合同新增",
      "severity": "P1",
      "reason": "缺少可用审批流",
      "suggestedAction": "创建 AI_AUTO_TEST_ 审批流后定向复跑",
      "resolved": false
    }
  ]
}
```

## test-data-ledger.json

```json
[
  {
    "id": "td-001",
    "name": "AI_AUTO_TEST_合同_20260518_001",
    "type": "contract",
    "purpose": "验证合同新增与删除",
    "createdAt": "2026-05-18T17:30:00+08:00",
    "sourcePage": "合同管理 > 合同列表 > 新增",
    "usedBy": ["合同新增", "合同删除"],
    "cleanupStatus": "deleted"
  }
]
```

## operation-log.jsonl

每行记录一个动作，必须能追踪关键结论：

```jsonl
{"id":"log-001","time":"2026-05-18T17:30:01+08:00","action":"navigate","target":"合同管理 > 合同列表","result":"success"}
{"id":"log-002","time":"2026-05-18T17:31:10+08:00","action":"delete","target":"AI_AUTO_TEST_合同_20260518_001","result":"success","guard":"test-data-ledger-matched"}
```

## quality-report.json

```json
{
  "menuCoverage": 0.99,
  "corePageScreenshotCoverage": 1,
  "coreFunctionClassificationCoverage": 0.99,
  "writeOperationSafetyCompliance": 1,
  "unverifiedContentLabeling": 1,
  "coreConclusionTraceability": 1,
  "blockingIssues": [],
  "canFinalize": true
}
```
