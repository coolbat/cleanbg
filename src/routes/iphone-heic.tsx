import { createFileRoute } from '@tanstack/react-router';

import { intentRoute } from '@/features/intent/page';

export const Route = createFileRoute('/iphone-heic')(intentRoute('iphone-heic'));
