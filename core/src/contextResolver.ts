import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { glob } from 'glob';
import { AgentConfig, ReviewContext } from './types.js';

const STRUCT_OR_FUNC_REGEX = /(class|struct|interface|function|fn)\s+([\w$]+)/g;

export async function collectContext(
  repoRoot: string,
  config: AgentConfig,
  diffFiles: string[]
): Promise<Record<string, string>> {
  const supplementaryFiles: Record<string, string> = {};
  const matchedFiles = await glob(config.additionalContextGlobs, { cwd: repoRoot, absolute: false });

  for (const file of matchedFiles) {
    if (diffFiles.includes(file)) continue;
    try {
      const content = await readFile(join(repoRoot, file), 'utf8');
      STRUCT_OR_FUNC_REGEX.lastIndex = 0;
      if (STRUCT_OR_FUNC_REGEX.test(content)) {
        supplementaryFiles[file] = content;
      }
    } catch (error) {
      // ignore errors
    }
  }

  return supplementaryFiles;
}

export function renderReviewContext(context: ReviewContext): string {
  const sections: string[] = [];
  sections.push(`# Diff for ${context.commitRange}`);
  for (const chunk of context.diff) {
    sections.push(`## ${chunk.filePath}`);
    sections.push('```diff');
    sections.push(chunk.hunks.join('\n'));
    sections.push('```');
  }

  if (Object.keys(context.supplementaryFiles).length > 0) {
    sections.push('# Supplementary Context');
    for (const [file, content] of Object.entries(context.supplementaryFiles)) {
      sections.push(`## ${file}`);
      sections.push('```');
      sections.push(content);
      sections.push('```');
    }
  }

  return sections.join('\n');
}
