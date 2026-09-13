import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Регистрация',
};

export default function RegisterLayout({ children }: LayoutProps<'/register'>) {
  return children;
}
