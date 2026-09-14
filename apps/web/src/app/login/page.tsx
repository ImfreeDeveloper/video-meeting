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
import { useRef, useState, type FormEvent } from 'react';
import { EyeIcon, EyeOffIcon, VideoCameraIcon } from '@/components/icons';
import { AuthApiError, loginUser } from '@/lib/auth-api';
import { setAccessToken } from '@/lib/session';

const EMAIL_PATTERN = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);

  const isEmailFormatValid = EMAIL_PATTERN.test(email);
  const isPasswordFilled = password.length > 0;

  const isEmailInvalid = submitted && !isEmailFormatValid;
  const isPasswordInvalid = submitted && !isPasswordFilled;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitted(true);
    setServerError(null);

    if (!isEmailFormatValid || !isPasswordFilled) {
      if (!isEmailFormatValid) {
        emailInputRef.current?.focus();
      } else {
        passwordInputRef.current?.focus();
      }
      return;
    }

    setIsSubmitting(true);
    try {
      const { accessToken } = await loginUser(email, password);
      setAccessToken(accessToken);
      router.push('/');
    } catch (error) {
      if (error instanceof AuthApiError && error.status === 401) {
        setServerError('Неверный email или пароль');
      } else if (error instanceof AuthApiError) {
        setServerError(error.message);
      } else {
        setServerError('Что-то пошло не так. Попробуйте ещё раз.');
      }
      passwordInputRef.current?.focus();
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
            <Card.Title>Вход в аккаунт</Card.Title>
            <Card.Description>Введите email и пароль, чтобы продолжить</Card.Description>
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
                  onChange={setEmail}
                >
                  <Label>Email</Label>
                  <Input
                    ref={emailInputRef}
                    placeholder="you@example.com"
                    variant="secondary"
                    autoComplete="email"
                    inputMode="email"
                  />
                  <FieldError>Введите корректный email адрес</FieldError>
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
                      placeholder="Введите пароль"
                      variant="secondary"
                      autoComplete="current-password"
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
                  <FieldError>Введите пароль</FieldError>
                </TextField>

                {serverError ? (
                  <Alert status="danger">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Не удалось войти</Alert.Title>
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
                    {isPending ? 'Выполняется вход…' : 'Войти'}
                  </>
                )}
              </Button>
              <p className="text-center text-sm text-muted">
                Ещё нет аккаунта?{' '}
                <NextLink className={linkVariants().base()} href="/register">
                  Зарегистрироваться
                </NextLink>
              </p>
            </Card.Footer>
          </Form>
        </Card>
      </div>
    </div>
  );
}
