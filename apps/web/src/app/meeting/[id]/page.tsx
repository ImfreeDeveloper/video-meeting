'use client';

import { Alert, Button, Card, Label, ProgressBar, Spinner } from '@heroui/react';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useRef, useState } from 'react';
import {
  ArrowLeftIcon,
  DownloadIcon,
  PaperclipIcon,
  TrashIcon,
  UploadIcon,
} from '@/components/icons';
import { ApiError } from '@/lib/api-error';
import { fetchMeeting, type Meeting } from '@/lib/meeting-api';
import {
  deleteMeetingFile,
  downloadMeetingFile,
  listMeetingFiles,
  MeetingFileApiError,
  uploadMeetingFile,
  type MeetingFile,
} from '@/lib/meeting-file-api';
import { clearAccessToken, readSession, type Session } from '@/lib/session';

const ACCEPTED_FILE_TYPES = ['.mp3', '.wav', '.m4a', '.mp4', '.mov', '.pdf', '.docx', '.txt'];
const ACCEPTED_FILE_TYPES_ATTR = ACCEPTED_FILE_TYPES.join(',');

const dateTimeFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatMeetingTime(meeting: Meeting): string {
  return `${dateTimeFormatter.format(new Date(meeting.startTime))} – ${dateTimeFormatter.format(new Date(meeting.endTime))}`;
}

const FILE_SIZE_UNITS = ['КБ', 'МБ', 'ГБ'];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < FILE_SIZE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${FILE_SIZE_UNITS[unitIndex]}`;
}

function fileTypeLabel(file: MeetingFile): string {
  const extension = file.filename.split('.').pop();
  return extension && extension !== file.filename ? extension.toUpperCase() : file.mimeType;
}

type PageStatus = 'loading' | 'ready' | 'not-found' | 'error';

type UploadState =
  | { phase: 'idle' }
  | { phase: 'uploading'; filename: string; percent: number }
  | { phase: 'error'; message: string };

function uploadErrorMessage(error: unknown): string {
  if (error instanceof MeetingFileApiError) {
    if (error.status === 415) {
      return 'Формат файла не поддерживается. Разрешены: mp3, wav, m4a, mp4, mov, pdf, docx, txt.';
    }
    if (error.status === 413) {
      return 'Файл слишком большой.';
    }
    if (error.status === 0) {
      return 'Ошибка сети. Проверьте подключение и попробуйте снова.';
    }
    return error.message || 'Не удалось загрузить файл.';
  }
  return 'Не удалось загрузить файл.';
}

type FileAction = 'download' | 'delete';

type FileActionState =
  | { action: FileAction; status: 'pending' }
  | { action: FileAction; status: 'error'; message: string };

function fileActionErrorMessage(error: unknown, action: FileAction): string {
  const fallback = action === 'download' ? 'Не удалось скачать файл.' : 'Не удалось удалить файл.';
  if (error instanceof MeetingFileApiError) {
    if (error.status === 404) {
      return 'Файл больше не существует. Обновите страницу.';
    }
    if (error.status === 0) {
      return 'Ошибка сети. Проверьте подключение и попробуйте снова.';
    }
    return error.message || fallback;
  }
  return fallback;
}

export default function MeetingPage(props: PageProps<'/meeting/[id]'>) {
  const { id } = use(props.params);
  const router = useRouter();
  const [session] = useState<Session | null>(readSession);
  const [status, setStatus] = useState<PageStatus>('loading');
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [files, setFiles] = useState<MeetingFile[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>({ phase: 'idle' });
  const [fileActions, setFileActions] = useState<Record<string, FileActionState>>({});
  const [loadedId, setLoadedId] = useState(id);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Next.js reuses this component across client-side navigations between
  // different /meeting/[id] URLs (e.g. browser back/forward) — reset to a
  // loading state for the new id during render, per React's guidance for
  // resetting state on a prop change, rather than in the effect below
  // (which would cause an extra render / trip the set-state-in-effect lint).
  if (id !== loadedId) {
    setLoadedId(id);
    setStatus('loading');
    setUploadState({ phase: 'idle' });
    setFileActions({});
  }

  useEffect(() => {
    if (!session) {
      router.replace('/login');
      return;
    }

    Promise.all([fetchMeeting(session.token, id), listMeetingFiles(session.token, id)])
      .then(([meetingData, filesData]) => {
        setMeeting(meetingData);
        setFiles(filesData);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        // Both fetchMeeting (MeetingApiError) and listMeetingFiles
        // (MeetingFileApiError) can reject here — check the shared base
        // class, not either concrete subclass, or one of the two calls
        // failing silently falls through to the generic error state below.
        if (error instanceof ApiError && error.status === 401) {
          clearAccessToken();
          router.replace('/login');
          return;
        }
        if (error instanceof ApiError && error.status === 404) {
          setStatus('not-found');
          return;
        }
        setStatus('error');
      });
  }, [session, router, id]);

  if (!session || status === 'loading') {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  const handleFileSelect = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    setUploadState({ phase: 'uploading', filename: file.name, percent: 0 });

    uploadMeetingFile(session.token, id, file, (percent) => {
      setUploadState({ phase: 'uploading', filename: file.name, percent });
    })
      .then((uploaded) => {
        setFiles((current) => [...current, uploaded]);
        setUploadState({ phase: 'idle' });
      })
      .catch((error: unknown) => {
        setUploadState({ phase: 'error', message: uploadErrorMessage(error) });
      });
  };

  const clearFileAction = (fileId: string) => {
    setFileActions((current) => {
      const next = { ...current };
      delete next[fileId];
      return next;
    });
  };

  const handleDownload = (file: MeetingFile) => {
    setFileActions((current) => ({
      ...current,
      [file.id]: { action: 'download', status: 'pending' },
    }));

    downloadMeetingFile(session.token, id, file)
      .then(() => clearFileAction(file.id))
      .catch((error: unknown) => {
        setFileActions((current) => ({
          ...current,
          [file.id]: {
            action: 'download',
            status: 'error',
            message: fileActionErrorMessage(error, 'download'),
          },
        }));
      });
  };

  const handleDelete = (file: MeetingFile) => {
    if (!window.confirm(`Удалить файл «${file.filename}»?`)) return;

    setFileActions((current) => ({
      ...current,
      [file.id]: { action: 'delete', status: 'pending' },
    }));

    deleteMeetingFile(session.token, id, file.id)
      .then(() => {
        setFiles((current) => current.filter((f) => f.id !== file.id));
        clearFileAction(file.id);
      })
      .catch((error: unknown) => {
        setFileActions((current) => ({
          ...current,
          [file.id]: {
            action: 'delete',
            status: 'error',
            message: fileActionErrorMessage(error, 'delete'),
          },
        }));
      });
  };

  const isUploading = uploadState.phase === 'uploading';
  const sortedFiles = [...files].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  return (
    <div className="min-h-screen w-full bg-background px-4 py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <NextLink
          href="/"
          className="-my-2 flex w-fit items-center gap-2 py-2 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeftIcon className="size-4" />
          Ко всем встречам
        </NextLink>

        {status === 'not-found' ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Встреча не найдена</Alert.Title>
              <Alert.Description>
                Она не существует или принадлежит другому пользователю.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        {status === 'error' ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Не удалось загрузить встречу</Alert.Title>
              <Alert.Description>Попробуйте обновить страницу.</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        {status === 'ready' && meeting ? (
          <>
            <header className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold text-foreground">{meeting.title}</h1>
              <p className="text-sm text-muted">{formatMeetingTime(meeting)}</p>
            </header>

            <Card>
              <Card.Header>
                <Card.Title>Файлы встречи</Card.Title>
                <Card.Description>
                  Запись встречи или сопутствующие документы: mp3, wav, m4a, mp4, mov, pdf, docx,
                  txt
                </Card.Description>
              </Card.Header>
              <Card.Content className="flex flex-col gap-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_FILE_TYPES_ATTR}
                  className="hidden"
                  onChange={(event) => {
                    handleFileSelect(event.target.files);
                    event.target.value = '';
                  }}
                />
                <Button
                  variant="secondary"
                  isDisabled={isUploading}
                  onPress={() => fileInputRef.current?.click()}
                >
                  <UploadIcon className="size-4" />
                  Загрузить файл
                </Button>

                {uploadState.phase === 'uploading' ? (
                  <ProgressBar aria-label="Загрузка файла" value={uploadState.percent}>
                    <Label>Загрузка «{uploadState.filename}»</Label>
                    <ProgressBar.Output />
                    <ProgressBar.Track>
                      <ProgressBar.Fill />
                    </ProgressBar.Track>
                  </ProgressBar>
                ) : null}

                {uploadState.phase === 'error' ? (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Не удалось загрузить файл</Alert.Title>
                      <Alert.Description>{uploadState.message}</Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}

                {sortedFiles.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted">
                    К этой встрече пока не прикреплено ни одного файла
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {sortedFiles.map((file) => {
                      const action = fileActions[file.id];
                      const isPending = action?.status === 'pending';

                      return (
                        <div
                          key={file.id}
                          className="flex flex-col gap-2 rounded-xl border border-default px-4 py-3"
                        >
                          <div className="flex items-center gap-3">
                            <PaperclipIcon className="size-4 shrink-0 text-muted" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium text-foreground">
                                {file.filename}
                              </p>
                              <p className="text-xs text-muted">
                                {fileTypeLabel(file)} · {formatFileSize(file.size)} ·{' '}
                                {dateTimeFormatter.format(new Date(file.createdAt))}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                isIconOnly
                                aria-label="Скачать файл"
                                variant="ghost"
                                size="sm"
                                isDisabled={isPending}
                                onPress={() => handleDownload(file)}
                              >
                                {isPending && action.action === 'download' ? (
                                  <Spinner size="sm" />
                                ) : (
                                  <DownloadIcon className="size-4" />
                                )}
                              </Button>
                              <Button
                                isIconOnly
                                aria-label="Удалить файл"
                                variant="danger"
                                size="sm"
                                isDisabled={isPending}
                                onPress={() => handleDelete(file)}
                              >
                                {isPending && action.action === 'delete' ? (
                                  <Spinner size="sm" color="current" />
                                ) : (
                                  <TrashIcon className="size-4" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {action?.status === 'error' ? (
                            <Alert status="danger">
                              <Alert.Indicator />
                              <Alert.Content>
                                <Alert.Description>{action.message}</Alert.Description>
                              </Alert.Content>
                            </Alert>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
              </Card.Content>
            </Card>
          </>
        ) : null}
      </div>
    </div>
  );
}
