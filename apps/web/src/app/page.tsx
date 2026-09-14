'use client';

import { Alert, Button, Card, Spinner } from '@heroui/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { VideoCameraIcon } from '@/components/icons';
import { fetchMeetings, MeetingApiError, type Meeting } from '@/lib/meeting-api';
import { clearAccessToken, decodeSessionUser, getAccessToken } from '@/lib/session';

const RECENT_MEETINGS_LIMIT = 3;

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

interface Session {
  token: string;
  email: string;
}

function readSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const token = getAccessToken();
  if (!token) return null;
  const sessionUser = decodeSessionUser(token);
  if (!sessionUser) return null;
  return { token, email: sessionUser.email };
}

type PageStatus = 'loading' | 'ready' | 'error';

export default function Home() {
  const router = useRouter();
  const [session] = useState<Session | null>(readSession);
  const [status, setStatus] = useState<PageStatus>('loading');
  const [meetings, setMeetings] = useState<Meeting[]>([]);

  useEffect(() => {
    if (!session) {
      router.replace('/login');
      return;
    }

    fetchMeetings(session.token)
      .then((data) => {
        setMeetings(data);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (error instanceof MeetingApiError && error.status === 401) {
          clearAccessToken();
          router.replace('/login');
          return;
        }
        setStatus('error');
      });
  }, [session, router]);

  if (!session || status === 'loading') {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  const handleLogout = () => {
    clearAccessToken();
    router.replace('/login');
  };

  const sortedMeetings = [...meetings].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );
  const recentMeetings = [...meetings]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, RECENT_MEETINGS_LIMIT);

  return (
    <div className="min-h-screen w-full bg-background px-4 py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
              <VideoCameraIcon className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted">Вы вошли как</p>
              <p className="truncate font-medium text-foreground">{session.email}</p>
            </div>
          </div>
          <Button className="shrink-0" variant="secondary" onPress={handleLogout}>
            Выйти
          </Button>
        </header>

        {status === 'error' ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Не удалось загрузить встречи</Alert.Title>
              <Alert.Description>Попробуйте обновить страницу.</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : null}

        {status === 'ready' ? (
          <>
            {recentMeetings.length > 0 ? (
              <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold text-foreground">Последние встречи</h2>
                <div className="grid gap-3 sm:grid-cols-3">
                  {recentMeetings.map((meeting) => (
                    <Card key={meeting.id} variant="secondary">
                      <Card.Content className="flex flex-col gap-1">
                        <p className="font-medium text-foreground">{meeting.title}</p>
                        <p className="text-sm text-muted">{formatMeetingTime(meeting)}</p>
                      </Card.Content>
                    </Card>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-semibold text-foreground">Мои встречи</h2>
              {sortedMeetings.length === 0 ? (
                <Card>
                  <Card.Content className="items-center py-8 text-center text-muted">
                    У вас пока нет созданных встреч
                  </Card.Content>
                </Card>
              ) : (
                <div className="flex flex-col gap-2">
                  {sortedMeetings.map((meeting) => (
                    <Card key={meeting.id}>
                      <Card.Content className="flex flex-row items-center justify-between gap-4">
                        <p className="font-medium text-foreground">{meeting.title}</p>
                        <p className="text-sm text-muted">{formatMeetingTime(meeting)}</p>
                      </Card.Content>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
