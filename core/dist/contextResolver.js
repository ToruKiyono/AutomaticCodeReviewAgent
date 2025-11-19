import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const STRUCT_OR_FUNC_REGEX = /(class|struct|interface|function|fn)\s+([\w$]+)/g;

function escapeRegex(str) {
  return str.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function globToRegExp(glob) {
  const normalised = glob.split('\\').join('/');
  const escaped = escapeRegex(normalised)
    .replace(/\\\*\\\*/g, '(?:.*)')
    .replace(/\\\*/g, '[^/]*')
    .replace(/\\\?/g, '[^/]');
  return new RegExp(`^${escaped}$`);
}

async function walkDirectory(root) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkDirectory(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

export async function collectContext(repoRoot, config, diffFiles) {
  const supplementaryFiles = {};
  const patterns = config.additionalContextGlobs.map(globToRegExp);
  const diffSet = new Set(diffFiles);
  const allFiles = await walkDirectory(repoRoot);

  for (const absolutePath of allFiles) {
    const relativePath = relative(repoRoot, absolutePath).split('\\').join('/');
    if (diffSet.has(relativePath)) continue;
    if (!patterns.some((regex) => regex.test(relativePath))) continue;

    try {
      const content = await readFile(absolutePath, 'utf8');
      STRUCT_OR_FUNC_REGEX.lastIndex = 0;
      if (STRUCT_OR_FUNC_REGEX.test(content)) {
        supplementaryFiles[relativePath] = content;
      }
    } catch {
      // ignore unreadable files
    }
  }

  return supplementaryFiles;
}

export function renderReviewContext(context) {
  const sections = [];
  sections.push(`# Diff for ${context.commitRange}`);
  for (const chunk of context.diff) {
    sections.push(`## ${chunk.filePath}`);
    sections.push('```diff');
    sections.push(chunk.hunks.join('\n'));
    sections.push('```');
  }

  const entries = Object.entries(context.supplementaryFiles);
  if (entries.length > 0) {
    sections.push('# Supplementary Context');
    for (const [file, content] of entries) {
      sections.push(`## ${file}`);
      sections.push('```');
      sections.push(content);
      sections.push('```');
    }
  }

  return sections.join('\n');
}
