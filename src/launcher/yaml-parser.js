/**
 * Hand-rolled flat-YAML parser for the catalogue.
 *
 * Scope (sufficient for tier-2 + tier-3 manifests):
 *   - top-level scalar: `key: value`
 *   - top-level folded scalar: `key: >` followed by indented continuation lines
 *   - top-level list of scalars: `key:` followed by `  - item` lines
 *   - one-level nested map: `key:` followed by `  inner: value` and `  inner:` + nested list
 *   - inline empty flow list: `key: []`
 *
 * Known limits (documented; swap in js-yaml when an entry needs richer YAML):
 *   - no support for nested-nested maps (>1 level)
 *   - no inline comments stripped from value lines
 *   - tabs not detected as indentation (spaces only)
 *
 * Used by:
 *   - src/launcher/catalogue.js (loadCatalogue)
 *   - test/library/tier2-services-schema.test.js
 *   - test/library/tier3-patterns-schema.test.js
 */

'use strict';

function parseFlatYaml(text) {
  const out = {};
  const lines = text.split('\n');
  let currentList = null;
  let currentMap = null;
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) { i++; continue; }

    const topScalar = /^([a-z_][a-z0-9_]*):\s*(.*)$/.exec(line);
    if (topScalar && !raw.startsWith(' ') && !raw.startsWith('\t')) {
      const [, key, rest] = topScalar;
      currentList = null;
      currentMap = null;

      if (rest === '' || rest === undefined) {
        const next = lines[i + 1] || '';
        if (/^\s+-\s*/.test(next)) {
          currentList = [];
          out[key] = currentList;
        } else if (/^\s+[a-zA-Z_]/.test(next)) {
          currentMap = {};
          out[key] = currentMap;
        } else {
          out[key] = null;
        }
      } else if (rest === '>') {
        const folded = [];
        i++;
        while (i < lines.length && /^\s/.test(lines[i])) {
          folded.push(lines[i].trim());
          i++;
        }
        out[key] = folded.join(' ');
        continue;
      } else {
        out[key] = stripQuotes(rest);
      }
      i++;
      continue;
    }

    const listItem = /^\s+-\s*(.*)$/.exec(line);
    if (listItem && currentList !== null) {
      currentList.push(stripQuotes(listItem[1]));
      i++;
      continue;
    }

    const nestedScalar = /^\s+([a-z_][a-z0-9_]*):\s*(.*)$/.exec(line);
    if (nestedScalar && currentMap !== null) {
      const [, nkey, nrest] = nestedScalar;
      if (nrest === '' || nrest === undefined) {
        const inner = [];
        let j = i + 1;
        while (j < lines.length && /^\s+-\s*/.test(lines[j])) {
          inner.push(stripQuotes(/^\s+-\s*(.*)$/.exec(lines[j])[1]));
          j++;
        }
        currentMap[nkey] = inner;
        i = j;
        continue;
      }
      if (nrest.trim() === '[]') {
        currentMap[nkey] = [];
        i++;
        continue;
      }
      currentMap[nkey] = stripQuotes(nrest);
    }
    i++;
  }
  return out;
}

function stripQuotes(s) {
  if (typeof s !== 'string') return s;
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

module.exports = { parseFlatYaml, stripQuotes };
