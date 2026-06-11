const DOMAIN_LEAK_PATTERNS = [/保司/, /AI任务/, /元数据/, /发布上线/, /运行观测/];

const STATUS_WORDS = [
  "状态",
  "阶段",
  "进度",
  "结果",
  "质量",
  "风险",
  "异常",
  "审批",
  "审核",
  "启用",
  "有效",
  "完成",
  "生效",
  "失败",
  "成功",
];

const PROCESS_ROLES = [
  ["capture-input", /申请|录入|登记|新建|创建|导入|采集|提交|填报/],
  ["maintain-config", /配置|维护|设置|规则|参数|字典|模板|权限|主数据|基础信息/],
  ["review-or-approve", /审批|审核|复核|确认|通过|驳回|会签/],
  ["validate-or-check", /校验|检查|核验|对账|质量|风险|异常|预算|额度|合规|风控/],
  ["execute-or-sync", /执行|同步|处理|生成|调度|跑批|分发|推送|结算|入账/],
  ["publish-or-enable", /发布|启用|上线|生效|停用|下线/],
  ["monitor-or-report", /监控|看板|报表|统计|指标|日志|告警|审计|分析/],
  ["correct-or-retry", /编辑|调整|撤回|重试|修正|补录|回滚|冻结|解冻/],
  ["archive-or-close", /归档|关闭|完成|结案|作废|终止/],
];

const OBJECT_CATEGORIES = [
  ["approval-item", /审批|审核|复核|申请|单据|流程/],
  ["transaction", /订单|交易|费用|报销|结算|付款|收款|入账|账单|合同|采购|发票/],
  ["identity-access", /用户|员工|组织|角色|权限|账号|身份|岗位|部门/],
  ["master-data", /主数据|基础数据|字典|科目|客户|供应商|产品|物料|档案/],
  ["configuration", /配置|规则|参数|模板|策略|设置/],
  ["integration-endpoint", /接口|集成|同步|回调|消息|队列|服务|API/i],
  ["report", /报表|看板|统计|分析|台账|清单/],
  ["metric", /指标|质量|风险|异常|告警|监控|进度/],
  ["batch-job", /批次|跑批|调度|任务|作业/],
  ["audit-log", /日志|审计|轨迹|历史|流水/],
];

function compactString(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function uniqueStrings(values = []) {
  return Array.from(new Set(values.map(compactString).filter(Boolean)));
}

function classifyProcessRole(text) {
  const value = compactString(text);
  const found = PROCESS_ROLES.find(([, pattern]) => pattern.test(value));
  return found ? found[0] : "unknown";
}

function classifyObjectCategory(text) {
  const value = compactString(text);
  const found = OBJECT_CATEGORIES.find(([, pattern]) => pattern.test(value));
  return found ? found[0] : "work-item";
}

function isStateSignal(value) {
  const text = compactString(value);
  return Boolean(text && STATUS_WORDS.some((word) => text.includes(word)));
}

function roleLabel(role) {
  return {
    "capture-input": "信息采集与提交",
    "maintain-config": "配置维护",
    "review-or-approve": "审核确认",
    "validate-or-check": "校验检查",
    "execute-or-sync": "执行同步",
    "publish-or-enable": "发布启用",
    "monitor-or-report": "监控报表",
    "correct-or-retry": "修正重试",
    "archive-or-close": "归档关闭",
    unknown: "业务处理",
  }[role] || "业务处理";
}

function categoryLabel(category) {
  return {
    "approval-item": "审批单据",
    transaction: "交易记录",
    "identity-access": "身份权限对象",
    "master-data": "基础资料对象",
    configuration: "配置对象",
    "integration-endpoint": "集成接口对象",
    report: "报表对象",
    metric: "指标对象",
    "batch-job": "批处理对象",
    "audit-log": "审计日志对象",
    "work-item": "业务工作项",
    unknown: "业务对象",
  }[category] || "业务对象";
}

function hasDefaultDomainLeak(value, allowedEvidenceText = "") {
  const text = compactString(value);
  const allowed = compactString(allowedEvidenceText);
  return DOMAIN_LEAK_PATTERNS.some((pattern) => pattern.test(text) && !pattern.test(allowed));
}

function collectEvidenceText(items = []) {
  return uniqueStrings(items).join(" ");
}

module.exports = {
  DOMAIN_LEAK_PATTERNS,
  STATUS_WORDS,
  PROCESS_ROLES,
  OBJECT_CATEGORIES,
  categoryLabel,
  classifyObjectCategory,
  classifyProcessRole,
  collectEvidenceText,
  compactString,
  hasDefaultDomainLeak,
  isStateSignal,
  roleLabel,
  uniqueStrings,
};
