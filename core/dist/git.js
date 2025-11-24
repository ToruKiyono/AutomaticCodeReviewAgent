import { execSync } from 'node:child_process';

export function getDiffChunks({ commitRange, staged = false, repoRoot }) {
  const args = ['diff'];
  if (staged) {
    args.push('--cached');
  }
  if (commitRange) {
    args.push(commitRange);
  }
  args.push('--unified=0');

  let diffOutput = '';
  const execOptions = { encoding: 'utf8', cwd: repoRoot ?? undefined };
  try {
    diffOutput = execSync(`git ${args.join(' ')}`, execOptions);
  } catch (error) {
    const stderr = error?.stderr?.toString() ?? error.message;
    throw new Error(`Failed to collect git diff: ${stderr}`);
  }

  const files = [];
  let current = null;

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

export function getFileContent(repoRoot, relativePath) {
  try {
    return execSync(`git -C ${repoRoot} show HEAD:${relativePath}`, { encoding: 'utf8' });
  } catch {
    return null;
  }
}
