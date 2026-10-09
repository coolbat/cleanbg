import { createFileRoute } from '@tanstack/react-router';

import { intentRoute } from '@/features/intent/page';

export const Route = createFileRoute('/passport-photo')(intentRoute('passport-photo'));
