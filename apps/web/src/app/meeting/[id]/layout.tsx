import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Встреча',
};

export default function MeetingLayout({ children }: LayoutProps<'/meeting/[id]'>) {
  return children;
}
