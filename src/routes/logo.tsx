import { createFileRoute } from '@tanstack/react-router';

import { intentRoute } from '@/features/intent/page';

export const Route = createFileRoute('/logo')(intentRoute('logo'));
