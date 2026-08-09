// 朗读文本清洗：去掉 mood 块、代码块、链接、markdown 符号，压缩空白。
export function cleanText(raw, maxLen = 600) {
  let t = String(raw || "");

  // 去掉 <mood>...</mood> 内心戏
  t = t.replace(/<mood>[\s\S]*?<\/mood>/gi, " ");
  // 去掉 HTML 标签
  t = t.replace(/<[^>]+>/g, " ");
  // 去掉代码块
  t = t.replace(/```[\s\S]*?```/g, " ");
  // 去掉行内代码
  t = t.replace(/`[^`]*`/g, (m) => m.slice(1, -1));
  // 链接 [文字](url) -> 文字
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
  // 裸 URL
  t = t.replace(/https?:\/\/\S+/g, " ");
  // markdown 标题/列表/引用符号
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/^>\s?/gm, "");
  t = t.replace(/^\s*[-*+]\s+/gm, "");
  t = t.replace(/^\s*\d+[.、)]\s+/gm, "");
  // 表格分隔线
  t = t.replace(/^\s*\|?[\s:|-]+\|?\s*$/gm, " ");
  t = t.replace(/\|/g, " ");
  // 加粗/斜体符号
  t = t.replace(/\*\*|__|\*|_/g, "");
  // 折叠空白
  t = t.replace(/\s+/g, " ").trim();

  if (!t) return "";
  if (t.length > (maxLen || 600)) {
    t = t.slice(0, maxLen) + "。";
  }
  return t;
}
