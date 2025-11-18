import { execSync } from 'node:child_process';
import { DiffChunk } from './types.js';

export interface DiffOptions {
  commitRange: string;
  staged?: boolean;
}

export function getDiffChunks(options: DiffOptions): DiffChunk[] {
  const args = ['diff'];
  if (options.staged) {
    args.push('--cached');
  }
  if (options.commitRange) {
    args.push(options.commitRange);
  }
  args.push('--unified=0');

  const diffOutput = execSync(`git ${args.join(' ')}`, {
    encoding: 'utf8'
  });
  const files: DiffChunk[] = [];
  let current: DiffChunk | null = null;

  for (const line of diffOutput.split('\n')) {
    if (line.startsWith('diff --git')) {
      if (current) {
        files.push(current);
      }
      const parts = / a\/(.*) b\/(.*)$/.exec(line);
      const filePath = parts ? parts[2] : line;
      current = { filePath, hunks: [] };
    } else if (line.startsWith('@@')) {
      current?.hunks.push(line);
    } else if (line.startsWith('+') || line.startsWith('-')) {
      current?.hunks.push(line);
    }
  }

  if (current) {
    files.push(current);
  }

  return files;
}

export function getFileContent(repoRoot: string, relativePath: string): string | null {
  try {
    return execSync(`git -C ${repoRoot} show HEAD:${relativePath}`, { encoding: 'utf8' });
  } catch (error) {
    return null;
  }
}
