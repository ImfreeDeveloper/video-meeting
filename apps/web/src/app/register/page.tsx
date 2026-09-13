'use client';

import {
  Alert,
  Button,
  Card,
  FieldError,
  Form,
  Input,
  Label,
  Spinner,
  TextField,
} from '@heroui/react';
import { linkVariants } from '@heroui/styles';
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type FormEvent, type SVGProps } from 'react';
import { AuthApiError, registerUser } from '@/lib/auth-api';

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PASSWORD_MIN_LENGTH = 6;

function VideoCameraIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="m16 10 6-3v10l-6-3" />
    </svg>
  );
}

function EyeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 19.5C5 19.5 1.5 12 1.5 12a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4.5c7 0 10.5 7.5 10.5 7.5a20.29 20.29 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
      <path d="M1.5 1.5 22.5 22.5" />
    </svg>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEmailTaken, setIsEmailTaken] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const isEmailFormatValid = EMAIL_PATTERN.test(email);
  const isPasswordLongEnough = password.length >= PASSWORD_MIN_LENGTH;

  const isEmailInvalid = submitted && (!isEmailFormatValid || isEmailTaken);
  const isPasswordInvalid = submitted && !isPasswordLongEnough;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setIsEmailTaken(false);
    setServerError(null);

    if (!isEmailFormatValid || !isPasswordLongEnough) {
      if (!isEmailFormatValid) {
        emailInputRef.current?.focus();
      } else {
        passwordInputRef.current?.focus();
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const { accessToken } = await registerUser(email, password);
      localStorage.setItem('accessToken', accessToken);
      router.push('/');
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 409) {
        setIsEmailTaken(true);
        emailInputRef.current?.focus();
      } else if (error instanceof AuthApiError) {
        setServerError(error.message);
      } else {
        setServerError('Что-то пошло не так. Попробуйте ещё раз.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-linear-to-br from-accent/10 via-background to-background px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
            <VideoCameraIcon className="size-6" />
          </div>
          <div>
            <p className="text-lg font-semibold text-foreground">Meeting</p>
            <p className="text-sm text-muted">Видеовстречи для вашей команды</p>
          </div>
        </div>

        <Card className="w-full">
          <Card.Header>
            <Card.Title>Создать аккаунт</Card.Title>
            <Card.Description>Укажите email и пароль, чтобы начать</Card.Description>
          </Card.Header>

          <Form validationBehavior="aria" onSubmit={(event) => void handleSubmit(event)}>
            <Card.Content>
              <div className="flex flex-col gap-4">
                <TextField
                  isRequired
                  isInvalid={isEmailInvalid}
                  name="email"
                  type="email"
                  value={email}
                  onChange={(value) => {
                    setEmail(value);
                    setIsEmailTaken(false);
                  }}
                >
                  <Label>Email</Label>
                  <Input
                    ref={emailInputRef}
                    placeholder="you@example.com"
                    variant="secondary"
                    autoComplete="email"
                    inputMode="email"
                  />
                  <FieldError>
                    {isEmailTaken
                      ? 'Этот email уже зарегистрирован'
                      : 'Введите корректный email адрес'}
                  </FieldError>
                </TextField>

                <TextField
                  isRequired
                  isInvalid={isPasswordInvalid}
                  name="password"
                  value={password}
                  onChange={setPassword}
                >
                  <Label>Пароль</Label>
                  <div className="relative">
                    <Input
                      ref={passwordInputRef}
                      type={isPasswordVisible ? 'text' : 'password'}
                      placeholder="Минимум 6 символов"
                      variant="secondary"
                      autoComplete="new-password"
                      className="w-full pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setIsPasswordVisible((visible) => !visible)}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted hover:text-foreground"
                      aria-label={isPasswordVisible ? 'Скрыть пароль' : 'Показать пароль'}
                    >
                      {isPasswordVisible ? (
                        <EyeOffIcon className="size-4" />
                      ) : (
                        <EyeIcon className="size-4" />
                      )}
                    </button>
                  </div>
                  <FieldError>Пароль должен содержать минимум 6 символов</FieldError>
                </TextField>

                {serverError ? (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Не удалось создать аккаунт</Alert.Title>
                      <Alert.Description>{serverError}</Alert.Description>
                    </Alert.Content>
                  </Alert>
                ) : null}
              </div>
            </Card.Content>

            <Card.Footer className="mt-4 flex flex-col gap-3">
              <Button className="w-full" size="lg" isPending={isSubmitting} type="submit">
                {({ isPending }) => (
                  <>
                    {isPending ? <Spinner color="current" size="sm" /> : null}
                    {isPending ? 'Создание аккаунта…' : 'Создать аккаунт'}
                  </>
                )}
              </Button>
              <p className="text-center text-sm text-muted">
                Уже есть аккаунт?{' '}
                <NextLink className={linkVariants().base()} href="/login">
                  Войти
                </NextLink>
              </p>
            </Card.Footer>
          </Form>
        </Card>
      </div>
    </div>
  );
}
