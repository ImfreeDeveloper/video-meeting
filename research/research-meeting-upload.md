# Research: технологическая реализация загрузки файлов встреч

**План:** plans/plan-meeting-file-upload-storage-and-display.md
**PRD:** docs/prd-meeting-file-upload-storage-and-display.md
**Дата:** 2026-09-20

## Резюме

Стек проекта уже даёт всё необходимое без новых сервисов: `@nestjs/platform-express`
тянет `multer@2.2.0` транзитивно, так что backend-часть — это `FileInterceptor` +
`diskStorage` + собственная CQRS-команда/запрос, без объектных хранилищ (PRD explicitly
исключает S3). Единственная нетривиальная развилка — **как фронтенд скачивает файл**,
раз токен лежит в `localStorage`, а не в cookie (см. [§8](#8-скачивание-на-фронтенде-и-авторизация-открытый-вопрос)).
Ниже — по одному конкретному решению на каждый узел, с обоснованием под существующие
конвенции (`apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`).

## 1. Хранение на диске: Multer + `diskStorage`, не `memoryStorage`

Список форматов из PRD включает видео (`mp4`, `mov`) — потенциально сотни МБ.
`multer.memoryStorage()` буферизует весь файл в RAM до записи, что при нескольких
параллельных загрузках видео убивает процесс api. Нужен `multer.diskStorage()` —
он пишет входящий multipart-стрим на диск чанками через busboy, не держа файл целиком
в памяти.

```ts
// meeting-file/interceptors/... или inline в контроллере
FileInterceptor('file', {
  storage: diskStorage({
    destination: (req, file, cb) => cb(null, resolveUploadDir(req.params.meetingId)),
    filename: (req, file, cb) => cb(null, `${randomUUID()}${extname(file.originalname)}`),
  }),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: 1 },
  fileFilter: mimeAllowlistFilter,
});
```

Ключевые решения:

- **Имя файла на диске ≠ оригинальное имя.** Генерировать `randomUUID()` (или `cuid()`,
  уже используется в Prisma-схеме для id) + расширение из allowlist. Оригинальное имя
  сохраняется только как метаданные (`filename` в БД) для отображения и
  `Content-Disposition` при скачивании. Это убирает path traversal (`../../etc/passwd`)
  и коллизии/спецсимволы одним ходом — не нужно отдельно "санитайзить" имя.
- **Директория конфигурируется через env**, не хардкодится: `FILE_STORAGE_DIR`
  (по аналогии с существующими `PORT`/`DATABASE_URL` в `apps/api/.env.example`),
  дефолт — `./storage/uploads` относительно `apps/api` (вне `src/` и `dist/`, чтобы
  `nest build`/`clean` его не трогали). Добавить в `.gitignore` app'а.
- **Раскладка — по встрече:** `storage/uploads/<meetingId>/<uuid><ext>`, не плоский
  список. Это (a) упрощает ручную дефрагментацию/дебаг, (b) даёт дешёвый путь для
  будущего каскадного удаления файлов встречи (`fs.rm(dir, { recursive: true })`),
  даже если сейчас у `Meeting` нет `DELETE`-эндпоинта.
- **Не использовать `ServeStaticModule`/статическую раздачу директории** — это в обход
  `JwtAuthGuard` и проверки `ownerId`. Файлы отдаются только через собственный
  контроллируемый эндпоинт (§5).

## 2. Валидация MIME-типа и размера — до записи на диск

Фаза 1 плана явно требует: "Валидация MIME-типа ... и максимального размера файла
**до записи на диск**". Это отсекает `ParseFilePipe` + `FileTypeValidator`/
`MaxFileSizeValidator` из `@nestjs/common` как основной механизм — те валидаторы
выполняются в Pipe **после** того, как Multer уже полностью записал файл на диск и
передал `Express.Multer.File` в контроллер. Годится как дополнительный defence-in-depth
слой, но не как единственная защита.

Правильное место — конфигурация самого `FileInterceptor`:

- **`fileFilter`** — вызывается при открытии multipart-поля, до начала записи байтов.
  Проверяет `file.mimetype` (из заголовка part'а) и расширение имени файла против
  allowlist из PRD:

  | Категория | Расширения              | MIME                                                                                                       |
  | --------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
  | Аудио     | `.mp3`, `.wav`, `.m4a`  | `audio/mpeg`, `audio/wav`/`audio/x-wav`, `audio/mp4`/`audio/x-m4a`                                         |
  | Видео     | `.mp4`, `.mov`          | `video/mp4`, `video/quicktime`                                                                             |
  | Документы | `.pdf`, `.docx`, `.txt` | `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `text/plain` |

  Проверять **и расширение, и mimetype** (оба должны совпасть по одной строке
  allowlist) — чуть надёжнее, чем полагаться на одно поле, при этом не требует
  дополнительных зависимостей. `cb(null, false)` + выставление кода ошибки на `req`
  (или бросок `UnsupportedMediaTypeException` — Nest подхватывает исключения из
  `fileFilter`) останавливает Multer до открытия файлового дескриптора на запись.

- **`limits.fileSize`** — Multer/busboy обрывает стрим, как только превышен лимит, и
  штатно вызывает `storage._removeFile` у `diskStorage`, удаляя частично записанный
  файл. Технически несколько байт успевают попасть на диск до срабатывания лимита, но
  наружу (в БД, в ответе API) незавершённый файл не попадает — что и требует критерий
  готовности. Ошибка `LIMIT_FILE_SIZE` перехватывается общим exception filter'ом Nest
  и превращается в `413 Payload Too Large` с понятным телом ответа.

- **Магические байты (сниффинг по содержимому, а не по заголовку) — сознательно не
  берём в MVP.** PRD прямо исключает антивирусную проверку и допускает доверие к
  расширению/MIME из запроса; добавление, например, пакета `file-type` — дешёвое
  улучшение на будущее (гарантирует, что `.mp4` реально MP4), но не блокер сейчас.
  Стоит зафиксировать как техдолг в PR-описании, а не решать implicit.

## 3. Схема данных: модель `File` в Prisma

Расширение `apps/api/prisma/schema.prisma` (по образцу `Meeting`, `cuid()` id,
явные `@@index`):

```prisma
model MeetingFile {
  id           String   @id @default(cuid())
  meetingId    String
  meeting      Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  filename     String   // оригинальное имя, для отображения и Content-Disposition
  mimeType     String
  size         Int      // байты
  storagePath  String   // путь относительно FILE_STORAGE_DIR, не абсолютный
  uploadedById String
  uploadedBy   User     @relation(fields: [uploadedById], references: [id])
  createdAt    DateTime @default(now())

  @@index([meetingId])
}
```

Заметки:

- `onDelete: Cascade` на `meetingId` — чтобы будущий `DELETE /meeting/:id` (если
  появится) не оставлял осиротевшие строки; сами файлы на диске каскад по FK не
  тронет, это отдельная забота на будущее.
- `storagePath` хранить **относительным** (`<meetingId>/<uuid>.<ext>`), не абсолютным —
  переносимость между окружениями, `FILE_STORAGE_DIR` разрешается в момент чтения.
- `uploadedById` отдельно от `Meeting.ownerId` — в PRD это разные поля метаданных;
  сейчас они всегда совпадают (нет соавторов встречи), но заложить это в схему дешевле,
  чем потом мигрировать.
- Имя модели `MeetingFile`, а не просто `File` — избегает коллизии с generated Prisma
  namespace/типами и явно называет связь.

## 4. Структура backend-модуля — по конвенции CQRS проекта

`apps/api/CLAUDE.md` фиксирует: контроллер только диспатчит, вся логика — в одном
хендлере на команду/запрос, кросс-модульные обращения — через `CommandBus`/`QueryBus`,
не через прямой импорт модуля. Новый модуль `meeting-file/` (не `file/` — файлы всегда
в контексте встречи) должен выглядеть симметрично `meeting/`:

```
meeting-file/
  meeting-file.module.ts   импортирует CqrsModule, AuthModule; НЕ импортирует MeetingModule
  meeting-file.controller.ts
  dto/
  commands/
    upload-meeting-file.command.ts     (ownerId, meetingId, file: Express.Multer.File)
    handlers/upload-meeting-file.handler.ts
    delete-meeting-file.command.ts     (ownerId, meetingId, fileId)
    handlers/delete-meeting-file.handler.ts
  queries/
    list-meeting-files.query.ts        (ownerId, meetingId)
    handlers/list-meeting-files.handler.ts
    get-meeting-file.query.ts          (ownerId, meetingId, fileId)  -- для скачивания
    handlers/get-meeting-file.handler.ts
```

**Проверка владения встречей переиспекает существующий `GetMeetingQuery`** из
`meeting/` через `QueryBus` внутри каждого хендлера — ровно тот паттерн, который
`auth/` уже использует против `users/` (см. `apps/api/CLAUDE.md` §CQRS). Это даёт
одинаковое поведение 404 (не 403) для чужой/несуществующей встречи, без дублирования
Prisma-запроса `where: { id, ownerId }`.

Маршруты (REST, вложенные под встречу — соответствует "привязка по `meetingId`" из
плана):

- `POST /meeting/:meetingId/files` — `FileInterceptor` + `UploadMeetingFileCommand`
- `GET /meeting/:meetingId/files` — `ListMeetingFilesQuery`
- `GET /meeting/:meetingId/files/:fileId` — стрим скачивания, `GetMeetingFileQuery`
- `DELETE /meeting/:meetingId/files/:fileId` — `DeleteMeetingFileCommand`

`@UseGuards(JwtAuthGuard)` на контроллере, как в `MeetingController`.

## 5. Скачивание — стрим, не буфер в памяти

Возвращать `StreamableFile` (встроен в `@nestjs/common`) поверх `fs.createReadStream`,
не читать файл в `Buffer` целиком — та же причина, что и при загрузке (видео может
быть большим):

```ts
@Get(':fileId')
async download(
  @Req() req: AuthenticatedRequest,
  @Param('meetingId') meetingId: string,
  @Param('fileId') fileId: string,
  @Res({ passthrough: true }) res: Response,
): Promise<StreamableFile> {
  const file = await this.queryBus.execute(new GetMeetingFileQuery(req.user.userId, meetingId, fileId));
  res.set({
    'Content-Type': file.mimeType,
    'Content-Disposition': `attachment; filename="${encodeURIComponent(file.filename)}"`,
  });
  return new StreamableFile(createReadStream(resolveStoragePath(file.storagePath)));
}
```

`GetMeetingFileQuery`-хендлер сам решает 404 vs доступ: не найдена запись в БД **или**
встреча не принадлежит пользователю → `NotFoundException`, тем же способом, что
`GetMeetingHandler` уже делает для встреч — не течёт информация о существовании чужого
файла.

## 6. Удаление — сначала диск, потом БД, идемпотентно к ENOENT

`DeleteMeetingFileHandler`:

1. Загрузить запись (с проверкой владения через `GetMeetingQuery`, как выше) — если её
   нет, 404.
2. `fs.promises.unlink(path)`, поймать и молча проигнорировать `ENOENT` (файл уже
   отсутствует на диске — не должно блокировать очистку БД).
3. Удалить строку `MeetingFile` в Prisma.

Порядок специально "диск → БД": если шаг 2 упадёт по не-ENOENT ошибке (права доступа,
диск недоступен), операция прерывается до удаления записи в БД — лучше временно
недоступный "удалить" файл с валидной ссылкой, чем осиротевшая БД-запись, указывающая
в никуда.

## 7. Загрузка на фронтенде: прогресс требует `XMLHttpRequest`, не `fetch`

`apps/web/src/lib/{auth,meeting}-api.ts` сейчас построены на голом `fetch`. Для
индикатора прогресса загрузки (Фаза 3 плана) это не годится: `fetch` не даёт события
прогресса _отправки_ тела запроса ни в одном стабильном браузерном API — только
`XMLHttpRequest.upload.onprogress` даёт это надёжно кросс-браузерно.

Решение: точечно завести `uploadMeetingFile()` на XHR, обёрнутый в Promise, оставив
остальные функции на `fetch` — не тащить `axios` как новую зависимость ради одного
вызова:

```ts
export function uploadMeetingFile(
  accessToken: string,
  meetingId: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<MeetingFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}/meeting/${meetingId}/files`);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new MeetingApiError(parseErrorMessage(xhr), xhr.status));
    };
    xhr.onerror = () => reject(new MeetingApiError('Network error', 0));
    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}
```

Важно **не** ставить `Content-Type` вручную — `FormData` + XHR сами выставляют
`multipart/form-data; boundary=...`; ручной заголовок ломает парсинг на стороне Nest.

Ошибки формата/размера/сети (Фаза 3, критерий готовности) различаются по `status`:
`415`/`400` (или тот код, что вернёт `fileFilter`/`ValidationPipe`) → "неверный
формат"; `413` → "превышен размер"; `xhr.onerror`/`status === 0` → "ошибка сети".

## 8. Скачивание на фронтенде и авторизация — открытый вопрос

Это единственное место без однозначного "как у всех". `JwtAuthGuard` проверяет
`Authorization: Bearer <token>`; токен лежит в `localStorage`, не в cookie. Обычная
ссылка `<a href={downloadUrl}>` не может добавить заголовок — браузер просто откроет
URL без токена → `401`.

Два реалистичных варианта:

- **Fetch-as-blob (рекомендую по умолчанию).** Кнопка "скачать" делает
  `fetch(url, { headers: { Authorization }})`, читает `response.blob()`, создаёт
  `URL.createObjectURL(blob)` и триггерит скачивание через временный `<a>`. Не требует
  изменений на бэкенде, согласуется с текущей моделью авторизации 1-в-1. Минус: весь
  файл временно живёт в памяти вкладки — для документов/аудио не проблема, для
  крупных `.mp4` заметно, но PRD explicitly не просит плеер/стриминг воспроизведения
  — только скачивание, так что для MVP это приемлемо.
- **Query-параметр с токеном** (`GET .../files/:id?token=...`), гвард читает токен из
  query, если нет заголовка. Даёт "настоящую" прямую ссылку (открывается в новой
  вкладке без JS), но раздувает `JwtAuthGuard` веткой логики и на секунду кладёт JWT
  в URL (логи прокси/браузера, referrer) — хуже с точки зрения security-гигиены ради
  UX-выгоды, которая тут не нужна (PRD не просит "открыть в новой вкладке").

Рекомендация: **fetch-as-blob**, без изменений в `JwtAuthGuard`. Если позже понадобится
превью видео/аудио в браузере (сейчас explicitly вне скоупа), тогда стоит вернуться к
этому решению — стриминг с `Range`-заголовками через blob не работает.

## 9. Тестирование

`apps/api` уже имеет паттерн для этого: `test/*.e2e-spec.ts` на supertest поверх
поднятого `AppModule` (см. `apps/api/CLAUDE.md#running-tests`). Supertest умеет
multipart из коробки: `.attach('file', Buffer.from(...), 'clip.mp3')` +
`.field(...)` при необходимости. Новый `test/meeting-file.e2e-spec.ts` покрывает
ровно критерии готовности фаз 1–2 плана (успешная загрузка, отклонение по
формату/размеру/чужой встрече, список, скачивание, удаление) — без моков файловой
системы, реальный временный `FILE_STORAGE_DIR` per test run (например
`os.tmpdir()`/уникальная поддиректория), очищаемый в `afterAll`.

## 10. Что нужно будет добавить/поменять при реализации (для трекинга, не сейчас)

- `apps/api/package.json`: явная зависимость `multer` + `@types/multer` в
  `devDependencies` (сейчас транзитивная через `@nestjs/platform-express` — работает,
  но неявная зависимость на чужой транзитив хрупкая при апдейтах Nest).
- `apps/api/.env.example`: `FILE_STORAGE_DIR`, `MAX_FILE_SIZE_BYTES` (или константа в
  коде, если не планируется различаться по окружениям).
- `apps/api/.gitignore`: директория хранения (например `storage/`).
- Prisma migration для `MeetingFile`.
- `apps/api/CLAUDE.md`: новый модуль `meeting-file/`, новый env var — по правилу
  "Keep the docs current" из корневого `CLAUDE.md`.
- `apps/web/CLAUDE.md`/`.env.example`: обычно без изменений — новый функционал не
  меняет структуру `src/app/` на уровне, который требует правки доков (кроме факта
  появления страницы/секции встречи с файлами, если она пойдёт под новый route).

## 11. Ограничения, которые план уже фиксирует и с которыми ресерч согласен

- Локальный диск = отсутствие горизонтального масштабирования api (PRD, техограничения)
  — не пытаться "исправить" это NFS/S3 в рамках этой фичи, это explicitly вне скоупа.
  Указывать актуальный инстанс через sticky routing — забота инфраструктуры, не кода.
- Без антивируса и без глубокой валидации содержимого (magic bytes) — принято как
  осознанный компромисс MVP, см. §2.
