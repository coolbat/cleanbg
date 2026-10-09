import { createFileRoute } from '@tanstack/react-router';

import { intentRoute } from '@/features/intent/page';

export const Route = createFileRoute('/white-background')(intentRoute('white-background'));
