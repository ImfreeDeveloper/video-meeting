const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Хук запускается не обязательно из корня проекта — резолвим пути явно.
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const configFile = path.join(projectDir, '.claude/ralph.config.json');
const counterFile = path.join(projectDir, '.claude/ralph.iterations.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeCount(count) {
  fs.writeFileSync(counterFile, JSON.stringify({ count }));
}

// Сломанный или отсутствующий конфиг не должен блокировать агента.
const config = readJson(configFile, null);
if (!config || !config.active) {
  process.exit(0);
}

// Счётчик итераций
const counter = readJson(counterFile, {});
const count = Number.isInteger(counter.count) ? counter.count : 0;

// Проверяем лимит
if (count >= config.maxIterations) {
  console.log(`⛔ Достигнут лимит итераций (${config.maxIterations}). Ralph останавливается.`);
  writeCount(0);
  process.exit(0);
}

let issues;
try {
  const output = execFileSync(
    'gh',
    ['issue', 'list', '--milestone', config.milestone, '--state', 'open', '--json', 'number,title'],
    { cwd: projectDir, encoding: 'utf8' },
  );
  issues = JSON.parse(output);
} catch (err) {
  console.error(`⚠️ Не удалось получить список issue: ${err.message}`);
  process.exit(0);
}

if (issues.length > 0) {
  // Увеличиваем счётчик
  writeCount(count + 1);

  const next = issues[0];
  console.log(`🔄 Итерация ${count + 1}/${config.maxIterations} - Issue #${next.number}`);

  const prompt = config.prompt
    .replaceAll('{milestone}', config.milestone)
    .replaceAll('{branch}', config.branch);
  execFileSync('claude', ['-p', prompt, '--max-turns', String(config.maxTurns)], {
    cwd: projectDir,
    stdio: 'inherit',
  });
} else {
  // Milestone закрыт — сбрасываем счётчик и создаём PR
  console.log(`✅ Milestone завершён. Создаём PR.`);
  writeCount(0);

  let prUrl;
  try {
    prUrl = execFileSync(
      'gh',
      [
        'pr',
        'create',
        '--title',
        `feat: ${config.milestone}`,
        '--body',
        `Closes all issues in milestone: ${config.milestone}`,
        '--base',
        'main',
        '--head',
        config.branch,
      ],
      { cwd: projectDir, encoding: 'utf8' },
    ).trim();
  } catch {
    // PR для этой ветки уже существует — переиспользуем его.
    try {
      prUrl = execFileSync('gh', ['pr', 'view', config.branch, '--json', 'url', '--jq', '.url'], {
        cwd: projectDir,
        encoding: 'utf8',
      }).trim();
    } catch (err) {
      console.error(`⚠️ Не удалось создать или найти PR: ${err.message}`);
      process.exit(0);
    }
  }

  console.log('🔍 Запускаем финальное ревью через Opus 5.5...');
  execFileSync(
    'claude',
    [
      '-p',
      `Сделай детальное code review PR ${prUrl}. Проверь архитектуру, безопасность, производительность и соответствие PRD. Оставь комментарии прямо в PR через gh cli.`,
      '--model',
      'claude-opus-5-5',
    ],
    { cwd: projectDir, stdio: 'inherit' },
  );
}
