/**
 * Convert Claude's markdown output to Slack-compatible mrkdwn.
 *
 * Slack mrkdwn supports: *bold*, _italic_, ~strikethrough~, `code`, ```code blocks```,
 * >blockquotes, bullet lists, numbered lists, <url|text> links.
 *
 * Slack does NOT support: # headers, ## headers, tables, images, HTML.
 */

function markdownToSlack(text) {
  if (!text) return '';

  let result = text;

  // Headers → bold text
  // ### Header → *Header*
  // ## Header → *Header*
  // # Header → *Header*
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*');

  // Bold: **text** → *text*
  result = result.replace(/\*\*(.+?)\*\*/g, '*$1*');

  // Italic: _text_ stays the same (Slack uses _italic_ too)

  // Images: ![alt](url) → <url|alt>
  result = result.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<$2|$1>');

  // Links: [text](url) → <url|text>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<$2|$1>');

  // Tables → simplified list format
  // Detect table rows (lines with |) and convert
  const lines = result.split('\n');
  const output = [];
  let inTable = false;
  let tableHeaders = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Table separator row (|---|---|)
    if (/^\|[\s\-:]+\|/.test(line)) {
      inTable = true;
      continue;
    }

    // Table data row
    if (line.startsWith('|') && line.endsWith('|') && line.includes('|')) {
      const cells = line.split('|').filter(c => c.trim()).map(c => c.trim());

      if (!inTable) {
        // This is the header row
        tableHeaders = cells;
        inTable = true;
        continue;
      }

      // Data row → format as "header: value" pairs
      if (tableHeaders.length > 0 && cells.length === tableHeaders.length) {
        const pairs = cells.map((cell, idx) => `${tableHeaders[idx]}: ${cell}`).join(' | ');
        output.push(`• ${pairs}`);
      } else {
        output.push(`• ${cells.join(' | ')}`);
      }
      continue;
    }

    // Not a table row — reset table state
    if (inTable && !line.startsWith('|')) {
      inTable = false;
      tableHeaders = [];
    }

    // Horizontal rules: --- or *** → ───
    if (/^[-*_]{3,}\s*$/.test(line)) {
      output.push('───');
      continue;
    }

    output.push(lines[i]); // preserve original indentation
  }

  result = output.join('\n');

  // Clean up excessive newlines (max 2 consecutive)
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

module.exports = { markdownToSlack };
