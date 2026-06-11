#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const {
  parseArgs,
  parseSystemsConfig,
  normalizeAuthPaths,
  readOptionalJsonObject,
  readRequiredJsonObject,
} = require("./system-whitepaper-lib");
const {
  assertValidOperationGuideGateArtifact,
  assertValidOperationSpecArtifact,
} = require("./operation-spec/lib");

function loadContext(args) {
  const configPath = path.resolve(args.config || "config/systems.local.yaml");
  const config = parseSystemsConfig(fs.readFileSync(configPath, "utf8"));
  normalizeAuthPaths(config, path.dirname(configPath));
  const systemCode = args.system || args.systemCode;
  const system = (config.systems || []).find((item) => item.code === systemCode);
  if (!system) throw new Error(`System not found: ${systemCode}`);
  const outputRoot = path.resolve(path.dirname(configPath), config.runtime?.outputDir || "outputs");
  const systemOutput = args.input ? path.resolve(String(args.input)) : path.join(outputRoot, system.code);
  return { system, systemOutput };
}

function renderFieldTable(fields = []) {
  if (!fields.length) return "- 本轮未采集到字段明细。\n";
  const lines = ["| 字段 | 必填 | 控件 | 说明 |", "| --- | --- | --- | --- |"];
  for (const field of fields) {
    lines.push(
      `| ${field.label || "-"} | ${field.required ? "是" : "否"} | ${field.control || "-"} | ${field.note || field.optionsSource || ""} |`,
    );
  }
  return `${lines.join("\n")}\n`;
}

function renderFlowSection(flow) {
  const lines = [`#### ${flow.name}`, ""];
  if (flow.trigger) lines.push(`- **入口**：${flow.trigger}`);
  if (flow.status) lines.push(`- **试业务操作状态**：${flow.status}${flow.reason ? `（${flow.reason}）` : ""}`);
  lines.push("");
  for (const step of flow.steps || []) {
    lines.push(`##### ${step.title || "步骤"}`);
    if (step.buttons?.length) {
      lines.push(`- **按钮**：${step.buttons.join(" / ")}`);
    }
    lines.push("");
    lines.push(renderFieldTable(step.fields));
    if (step.screenshots?.length) {
      lines.push("- **截图**：");
      for (const shot of step.screenshots) {
        lines.push(`  - \`${shot}\``);
      }
      lines.push("");
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderModuleSection(module, index) {
  const sectionNumber = index + 2;
  const lines = [
    `## ${["二", "三", "四", "五", "六", "七", "八", "九"][index] || sectionNumber}、${module.name}`,
    "",
    `- **入口**：${module.entry || module.name}`,
  ];
  if (module.businessHint) {
    lines.push(`- **说明**：${module.businessHint}`);
  }
  lines.push("");

  if (module.list?.columns?.length) {
    lines.push("### 列表");
    lines.push("");
    lines.push(`- **列**：${module.list.columns.join("、")}`);
    if (module.list.queryFields?.length) {
      lines.push(`- **查询条件**：${module.list.queryFields.join("、")}`);
    }
    if (module.list.rowActions?.length) {
      lines.push(`- **行操作**：${module.list.rowActions.join(" / ")}`);
    }
    lines.push("");
  } else if (module.list?.note) {
    lines.push(`> ${module.list.note}`);
    lines.push("");
  }

  if (module.flows?.length) {
    lines.push("### 主流程");
    lines.push("");
    for (const flow of module.flows) {
      lines.push(renderFlowSection(flow));
    }
  }

  if (module.tabs?.length) {
    lines.push("### 子 Tab");
    lines.push("");
    lines.push(module.tabs.map((tab) => `- ${tab}`).join("\n"));
    lines.push("");
  }

  if (module.screenshots?.length) {
    lines.push("### 截图索引");
    lines.push("");
    for (const shot of module.screenshots.slice(0, 6)) {
      lines.push(`- \`${shot}\``);
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

function renderQuickLookup(spec) {
  const rows = [["功能", "入口"]];
  for (const item of spec.navigation || []) {
    rows.push([item.menuPath, item.entry]);
  }
  for (const module of spec.modules || []) {
    for (const flow of module.flows || []) {
      rows.push([flow.name, `${module.name} → ${flow.trigger || flow.name}`]);
    }
  }
  const lines = ["| 功能 | 入口 |", "| --- | --- |"];
  for (const row of rows.slice(1, 16)) {
    lines.push(`| ${row[0]} | ${row[1]} |`);
  }
  return `${lines.join("\n")}\n`;
}

function generateOperationGuideMarkdown(spec, options = {}) {
  const draftMark = options.draft ? "（草稿，待补采集）" : "";
  const positioning = spec.positioning || {};
  const confidenceNote =
    positioning.confidence === "low"
      ? "（定位置信度较低，待业务确认）"
      : positioning.confidence === "medium"
        ? "（依据页面结构归纳，非官方口径）"
        : "";

  const lines = [
    `# ${spec.systemName || "系统"} — 操作指引${draftMark}`,
    "",
    "> 本文档由自动化取证与 operation-spec 模板生成；字段与流程以页面采集为准。",
    "",
    "## 一、平台简介与访问",
    "",
    "### 1.1 平台定位",
    "",
    positioning.text ? `${positioning.text}${confidenceNote}` : "待补充系统定位。",
    "",
    "### 1.2 访问方式",
    "",
    `- **测试环境**：${spec.testUrl || "见系统配置"}`,
    `- **界面结构**：左侧导航 + 右侧内容区（依据已采集菜单归纳）。`,
    "",
  ];

  const contentModules = (spec.modules || []).filter((module) => module.name !== "首页");
  const homeModule = (spec.modules || []).find((module) => module.name === "首页");
  if (homeModule) {
    lines.push("## 二、首页", "");
    lines.push("- **入口**：左侧「首页」。");
    lines.push("- **说明**：展示平台概览与功能入口。");
    if (homeModule.screenshots?.length) {
      lines.push(`- **截图**：\`${homeModule.screenshots[0]}\``);
    }
    lines.push("");
  }

  contentModules.forEach((module, index) => {
    lines.push(renderModuleSection(module, homeModule ? index + 1 : index));
  });

  lines.push("## 常见问题与待确认", "");
  if (spec.pending?.length) {
    for (const item of spec.pending.slice(0, 12)) {
      lines.push(`- **${item.topic}**：${item.reason}`);
    }
  } else {
    lines.push("- 本轮暂无待确认项。");
  }
  lines.push("");
  lines.push("## 功能与入口速查", "");
  lines.push(renderQuickLookup(spec));
  lines.push("");
  lines.push("*文档版本与平台界面一致；若界面有增改，以实际页面为准。*");
  return `${lines.join("\n")}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { system, systemOutput } = loadContext(args);
  const specPath = path.join(systemOutput, "operation-spec.json");
  const gatePath = path.join(systemOutput, "operation-guide-gate.json");
  if (!fs.existsSync(specPath)) {
    throw new Error(`operation-spec.json not found: ${specPath}. Run build-operation-spec first.`);
  }
  const spec = readRequiredJsonObject(specPath, { label: "operation-spec.json" });
  try {
    assertValidOperationSpecArtifact(spec);
  } catch (error) {
    throw new Error(`operation-spec.json is not a valid operation spec artifact: ${error.message}`);
  }
  const gate = readOptionalJsonObject(gatePath, spec.gate || { canComposeGuide: false });
  if (gate && gate.artifactType) {
    try {
      assertValidOperationGuideGateArtifact(gate, spec);
    } catch (error) {
      throw new Error(`operation-guide-gate.json is not a valid operation guide gate artifact: ${error.message}`);
    }
  }

  const allowDraft = Boolean(args["allow-draft"] || system.operationGuideAllowDraft);
  if (!gate.canComposeGuide && !allowDraft && !spec.gate?.canComposeGuide) {
    throw new Error(
      `Operation guide gate not passed. Run build-operation-spec or use --allow-draft. Failures: ${(gate.failures || []).join("; ")}`,
    );
  }

  const markdown = generateOperationGuideMarkdown(spec, {
    draft: !gate.canComposeGuide && allowDraft,
  });
  const outputPath = path.join(systemOutput, "operation-guide.md");
  fs.writeFileSync(outputPath, markdown, "utf8");
  console.log(`Operation guide written: ${outputPath}`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  generateOperationGuideMarkdown,
  main,
  readOptionalJsonObject,
};
